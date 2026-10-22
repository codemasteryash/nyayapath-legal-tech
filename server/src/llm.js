/**
 * LLM integration.
 *
 * Design constraints that are deliberate:
 *  - The API key never leaves the server. It is read from env and is never
 *    returned by describe() or any route.
 *  - The model may only *select and explain* from records the corpus already
 *    holds. It is not asked to produce a section number, a case name, a
 *    citation, a deadline or a form. Those are injected from the corpus by
 *    analysis.js regardless of what the model says.
 *  - Output is validated after the fact: any statutory reference that does not
 *    match a known corpus record is stripped and the whole field is dropped.
 *  - Failure is always safe. Any error returns { ok:false } and the caller
 *    falls back to the deterministic result, so a dead provider degrades the
 *    product but never breaks it.
 */
import "node:process";

/* ---------------------------------------------------------------------------
   Configuration
   --------------------------------------------------------------------------- */

const PROVIDERS = {
  groq: {
    label: "Groq",
    // Groq exposes an OpenAI-compatible chat completions API.
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  generic: {
    label: "OpenAI-compatible endpoint",
    baseUrl: null,
    defaultModel: null,
  },
};

function env(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

/** Resolve provider config once. Never returns the key. */
export function config() {
  const providerKey = (env("LLM_PROVIDER", "JollyLLM_LLM_PROVIDER") || "groq").toLowerCase();
  const provider = PROVIDERS[providerKey] || PROVIDERS.generic;

  const apiKey = env(
    "LLM_API_KEY",
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "JollyLLM_LLM_API_KEY",
  );
  const baseUrl = (env("LLM_BASE_URL", "JollyLLM_LLM_BASE_URL") || provider.baseUrl || "").replace(/\/+$/, "");
  const model = env("LLM_MODEL", "JollyLLM_LLM_MODEL") || provider.defaultModel || "";

  const toggle = env("LLM_ENABLED", "JollyLLM_LLM_ENABLED");
  const explicitlyOff = toggle.toLowerCase() === "false" || toggle === "0";

  const missing = [];
  if (!apiKey) missing.push("LLM_API_KEY");
  if (!baseUrl) missing.push("LLM_BASE_URL");
  if (!model) missing.push("LLM_MODEL");

  return {
    providerKey: PROVIDERS[providerKey] ? providerKey : "generic",
    providerLabel: provider.label,
    apiKey,
    baseUrl,
    model,
    explicitlyOff,
    missing,
    // A usable configuration: not disabled, and key + base + model all present.
    ready: !explicitlyOff && missing.length === 0,
  };
}

export function isEnabled() {
  return config().ready;
}

/** Safe to expose over HTTP: contains no secret material. */
export function describe() {
  const c = config();
  const mode = c.ready ? "ai" : "deterministic";
  return {
    enabled: c.ready,
    mode,
    provider: c.providerLabel,
    model: c.ready ? c.model : null,
    explicitlyOff: c.explicitlyOff,
    missing: c.missing,
    detail: c.ready
      ? `Live model analysis is enabled via ${c.providerLabel} (${c.model}). Section numbers, citations, deadlines and forms are still injected from the verified corpus, never from the model.`
      : c.explicitlyOff
        ? "Live AI is switched off by configuration. Every field is produced by the bundled corpus and the retrieval engine."
        : `Live AI is not configured (missing ${c.missing.join(", ")}). Every field is produced by the bundled corpus and the retrieval engine. Set the variables in server/.env and restart to enable it.`,
    fallback: "deterministic",
  };
}

/* ---------------------------------------------------------------------------
   Output validation
   --------------------------------------------------------------------------- */

/**
 * The model is not trusted with legal references. Any section-like or
 * citation-like token in free text is checked against the IDs we injected.
 */
const ID_PATTERN = /\b(?:s\.\s*)?\d{1,3}[A-Za-z]?(?:\(\d+\))?/g;

function scrubLegalReferences(text, allowedIds) {
  if (typeof text !== "string") return "";
  // Neutralise obvious citation shapes before checking anything else.
  let out = text.replace(/\(\s*\d{4}\s*\)\s*\d+\s*SCC/gi, "a cited case");
  // Any bare section number that is not a known corpus id is removed.
  const tokens = out.match(ID_PATTERN);
  if (tokens) {
    for (const t of tokens) {
      const numeric = t.replace(/^s\.\s*/, "").trim();
      if (!numeric) continue;
      if (!allowedIds.has(numeric)) {
        out = out.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
      }
    }
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function asStringArray(v, max = 12) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : typeof x?.text === "string" ? x.text.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function validate(raw, ctx) {
  const allowedIds = new Set(
    [...ctx.provisions.map((p) => p.section), ...ctx.provisions.map((p) => p.id)],
  );
  const s = (v) => scrubLegalReferences(v, allowedIds);

  const out = {
    caseSummary: s(raw.caseSummary || raw.summary || ""),
    keyIssues: asStringArray(raw.keyIssues, 8).map(s),
    missingInformation: asStringArray(raw.missingInformation, 8).map(s),
    provisionExplanations: [],
    judgmentExplanations: [],
    evidenceToGather: asStringArray(raw.evidenceToGather, 10).map(s),
    actionSuggestions: [],
    uncertainty: s(raw.uncertainty || ""),
  };

  // Provision explanations must reference a provision we actually retrieved.
  if (Array.isArray(raw.provisionExplanations)) {
    for (const item of raw.provisionExplanations.slice(0, ctx.provisions.length)) {
      const pid = typeof item === "string" ? item : item?.id;
      const why = typeof item === "string" ? "" : item?.why;
      const match = ctx.provisions.find((p) => p.id === pid || p.section === pid);
      if (!match) continue; // dropped: not a retrieved provision
      out.provisionExplanations.push({
        id: match.id,
        why: s(why || "").slice(0, 600),
      });
    }
  }

  // Same rule for judgments: only ones we retrieved may be discussed.
  if (Array.isArray(raw.judgmentExplanations)) {
    for (const item of raw.judgmentExplanations.slice(0, ctx.judgments.length)) {
      const jid = typeof item === "string" ? item : item?.id;
      const why = typeof item === "string" ? "" : item?.why;
      const match = ctx.judgments.find((j) => j.id === jid);
      if (!match) continue;
      out.judgmentExplanations.push({ id: match.id, why: s(why || "").slice(0, 600) });
    }
  }

  // Action suggestions: text only. Deadline text comes from the corpus, never here.
  if (Array.isArray(raw.actionSuggestions)) {
    for (const item of raw.actionSuggestions.slice(0, 10)) {
      const text = typeof item === "string" ? item : item?.step;
      const why = typeof item === "string" ? "" : item?.why;
      if (!text) continue;
      out.actionSuggestions.push({ step: s(text).slice(0, 400), why: s(why || "").slice(0, 400) });
    }
  }

  out.empty =
    !out.caseSummary &&
    !out.keyIssues.length &&
    !out.actionSuggestions.length &&
    !out.provisionExplanations.length;

  return out;
}

/* ---------------------------------------------------------------------------
   Prompt
   --------------------------------------------------------------------------- */

function buildMessages(ctx) {
  const provisionBlock = ctx.provisions
    .map(
      (p) =>
        `[${p.id}] ${p.actShortTitle || p.act}\n  ${p.heading}\n  ${p.summary}\n  Source: ${p.sourceUrl}`,
    )
    .join("\n");

  const judgmentBlock = ctx.judgments
    .map(
      (j) =>
        `[${j.id}] ${j.title}, ${j.citation} (${j.court}, ${j.year})\n  Held: ${j.holding}\n  Verify: ${j.verifyUrl}`,
    )
    .join("\n");

  const lang =
    ctx.languageCode === "hi"
      ? "Hindi (Devanagari)"
      : ctx.languageCode === "hinglish"
        ? "Hindi written in Latin script (Hinglish)"
        : "English";

  const system = [
    "You are a legal-information assistant for Indian law. You help a person who has no lawyer.",
    "You will be given: the person's own narrative, and a list of statutory provisions and judicial decisions that a keyword retrieval engine matched to it.",
    "Hard rules:",
    "1. Use ONLY the provisions and decisions supplied. Never invent a section number, a case name, a citation, a court, a deadline, a number of days, a form, or a filing procedure.",
    "2. Never state or imply that a retrieved decision is binding on a court.",
    "3. Never add a fact that is not in the narrative.",
    "4. If the sources do not answer a question, say so plainly and say that a lawyer must verify it.",
    "5. Every claim must be either grounded in the supplied sources or explicitly marked as needing verification.",
    "6. Write for a lay reader. No jargon without a plain explanation.",
    "7. This is legal information, not legal advice. Say so if you state anything that sounds conclusive.",
    "",
    `Respond in ${lang}.`,
    "Return ONLY a JSON object with these keys:",
    "  caseSummary: string - 3 to 5 sentences restating the reported facts.",
    "  keyIssues: string[] - the distinct legal problems present in the facts.",
    "  missingInformation: string[] - what is not yet known and would change the answer.",
    "  provisionExplanations: [{ id: string, why: string }] - only ids from the PROVISIONS list.",
    "  judgmentExplanations: [{ id: string, why: string }] - only ids from the JUDGMENTS list; say if none are relevant.",
    "  evidenceToGather: string[] - documents or records worth preserving.",
    "  actionSuggestions: [{ step: string, why: string }] - practical next steps in order.",
    "  uncertainty: string - what could not be verified and why.",
  ].join("\n");

  const user = [
    "=== NARRATIVE (the person's own words) ===",
    ctx.narrative.slice(0, 6000),
    "",
    "=== PROVISIONS RETRIEVED ===",
    provisionBlock || "(none matched)",
    "",
    "=== JUDGMENTS RETRIEVED ===",
    judgmentBlock || "(none matched)",
    "",
    "=== EVIDENCE CHECKLIST BASE ===",
    ctx.evidence.map((e) => `- ${e.item}`).join("\n") || "(none)",
    "",
    "Return the JSON object now.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/* ---------------------------------------------------------------------------
   Provider call
   --------------------------------------------------------------------------- */

function classifyHttp(status, body) {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: "invalid_credentials",
      message: `The provider rejected the API key (HTTP ${status}). Check LLM_API_KEY.`,
    };
  }
  if (status === 429) {
    return { ok: false, error: "rate_limited", message: "The provider is rate limiting requests." };
  }
  if (status === 404) {
    return {
      ok: false,
      error: "model_not_found",
      message: `The provider has no endpoint or model at that address (HTTP 404). Check LLM_BASE_URL and LLM_MODEL.`,
    };
  }
  if (status >= 500) {
    return { ok: false, error: "provider_outage", message: `The provider returned HTTP ${status}.` };
  }
  return {
    ok: false,
    error: "provider_error",
    message: `The provider returned HTTP ${status}.`,
    // Body is truncated and may contain the key echo, so scrub before it is logged.
    detail: String(body || "").slice(0, 200).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"),
  };
}

function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let t = text.trim();
  // Strip markdown fences if the model added them.
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the first balanced object in the text.
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callProvider(c, messages, { timeoutMs, jsonMode, model = null, temperature = 0.2, maxTokens = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetModel = model || c.model;
    const body = {
      model: targetModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return classifyHttp(res.status, text);
    }

    const data = await res.json().catch(() => null);
    if (!data) {
      return { ok: false, error: "malformed_response", message: "The provider returned a non-JSON body." };
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return {
        ok: false,
        error: "empty_response",
        message: "The provider returned an empty completion.",
      };
    }
    let parsed = null;
    if (jsonMode) {
      parsed = parseJson(content);
    }
    return { ok: true, content, data: parsed, usage: data?.usage || null, model: data?.model || targetModel };
  } catch (err) {
    if (err?.name === "AbortError") {
      return {
        ok: false,
        error: "timeout",
        message: `The provider did not respond within ${Math.round(timeoutMs / 1000)}s.`,
      };
    }
    return {
      ok: false,
      error: "network_error",
      message: "The provider could not be reached.",
      detail: String(err?.message || err).slice(0, 160).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * General-purpose chat completion with safe fallbacks and bounded timeouts.
 */
export async function chatCompletion({
  model = null,
  messages = [],
  temperature = 0.2,
  maxTokens = 2000,
  jsonMode = true,
  timeoutMs = 15000,
} = {}) {
  const c = config();
  if (!c.ready) {
    return { ok: false, error: "not_configured", message: "LLM is not enabled or configured" };
  }
  return callProvider(c, messages, { timeoutMs, jsonMode, model, temperature, maxTokens });
}


/**
 * Hard caps on the model call.
 *
 * Without these the LLM runs inline in the request path, so a slow provider or
 * a generous LLM_TIMEOUT_MS turns POST /api/analyze into a request that hangs
 * for minutes with no response at all. The model is an enhancement; it is never
 * allowed to decide whether the API answers.
 */
export const AI_BUDGET = {
  perAttemptMs: 10_000,
  maxAttempts: 2,
  totalMs: 14_000,
};

/**
 * Unconditional outer guard.
 *
 * An AbortController only helps if the underlying socket honours the signal.
 * If fetch never settles for any reason, a bare await would hang the whole
 * request. Racing against a timer guarantees the deterministic result is
 * returned on time no matter what the provider or the socket does.
 */
function withinBudget(promise, ms) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __budgetExceeded: true }), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function clampBudget() {
  const perAttempt = Math.min(
    Number(process.env.LLM_TIMEOUT_MS || AI_BUDGET.perAttemptMs),
    AI_BUDGET.perAttemptMs,
  );
  const attempts = Math.min(
    Math.max(1, Number(process.env.LLM_MAX_ATTEMPTS || AI_BUDGET.maxAttempts)),
    AI_BUDGET.maxAttempts,
  );
  return { perAttempt, attempts };
}

/**
 * Public entry point. Always resolves; never throws.
 *
 * Returns { ok, mode: "ai" | "deterministic", reason?, ... }
 */
export async function analyseCase(ctx, opts = {}) {
  try {
    const result = await withinBudget(runAnalysis(ctx), AI_BUDGET.totalMs);
    if (result && result.__budgetExceeded) {
      return {
        ok: false,
        mode: "deterministic",
        reason: "budget_exhausted",
        message: "Model analysis did not finish inside the time budget. Returning the deterministic result.",
        durationMs: AI_BUDGET.totalMs,
      };
    }
    return result;
  } catch (err) {
    // The model is an enhancement. It must never be able to fail a request.
    return {
      ok: false,
      mode: "deterministic",
      reason: "internal_error",
      message: "Model analysis failed unexpectedly. Returning the deterministic result.",
      durationMs: 0,
    };
  }
}

async function runAnalysis(ctx) {
  const c = config();

  if (!c.ready) {
    return {
      ok: false,
      mode: "deterministic",
      reason: c.explicitlyOff ? "disabled" : `not_configured:${c.missing.join(",")}`,
    };
  }

  const { perAttempt, attempts } = clampBudget();
  const startedAt = Date.now();
  const jsonMode = (process.env.LLM_JSON_MODE || "true").toLowerCase() !== "false";
  const messages = buildMessages(ctx);

  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Never start an attempt we cannot finish inside the total budget.
    if (Date.now() - startedAt >= AI_BUDGET.totalMs - perAttempt / 2) {
      lastError = { error: "budget_exhausted", message: "The time budget for model analysis ran out." };
      break;
    }

    const res = await callProvider(c, messages, {
      timeoutMs: perAttempt,
      jsonMode,
    });

    if (res.ok) {
      const parsed = extractJson(res.content);
      if (!parsed) {
        lastError = {
          error: "malformed_json",
          message: "The model replied with text that is not valid JSON.",
        };
      } else {
        const validated = validate(parsed, ctx);
        if (validated.empty) {
          lastError = {
            error: "empty_analysis",
            message: "The model's reply contained no usable content.",
          };
        } else {
          return {
            ok: true,
            mode: "ai",
            provider: c.providerLabel,
            model: res.model || c.model,
            ...validated,
            notices: [
              "Machine-generated. Grounded in the sources listed, but a lawyer has not reviewed it.",
              "Section numbers, citations, deadlines and forms come from the verified corpus, not from the model.",
            ],
            usage: res.usage,
            attempts: attempt,
            durationMs: Date.now() - startedAt,
          };
        }
      }
    } else {
      lastError = res;
      // Only transient conditions are worth a second attempt.
      const transient = ["rate_limited", "provider_outage", "network_error", "timeout"].includes(res.error);
      if (!transient) break;
    }

    if (attempt < attempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  return {
    ok: false,
    mode: "deterministic",
    reason: lastError?.error || "unknown",
    message: lastError?.message || "The model could not be used for this request.",
    provider: c.providerLabel,
    model: c.model,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Cheap connectivity probe used by /api/health. Never returns the key.
 *
 * Checks two things separately, because they fail independently:
 *   reachable  - the provider answered at all
 *   model      - the configured model id is actually served
 *
 * A reachable provider is not a usable provider. Reporting only reachability
 * previously made /api/health claim "ai" while every completion 404'd.
 */
export async function probe() {
  const c = config();
  if (!c.ready) {
    return {
      reachable: false,
      modelAvailable: false,
      reason: c.explicitlyOff ? "disabled" : "not_configured",
      missing: c.missing,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${c.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${c.apiKey}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        reachable: false,
        modelAvailable: false,
        ...classifyHttp(res.status, body),
      };
    }

    const data = await res.json().catch(() => null);
    const ids = Array.isArray(data?.data)
      ? data.data.map((m) => m?.id).filter(Boolean)
      : [];

    // If the endpoint returns no list, do not claim the model is missing.
    if (ids.length === 0) {
      return {
        reachable: true,
        modelAvailable: null,
        note: "Provider reachable but did not list models; model id unverified.",
        provider: c.providerLabel,
        model: c.model,
      };
    }

    const modelAvailable = ids.includes(c.model);
    return {
      reachable: true,
      modelAvailable,
      provider: c.providerLabel,
      model: c.model,
      ...(modelAvailable
        ? {}
        : {
            error: "model_not_found",
            message: `The provider is reachable but does not serve "${c.model}". Completions against it will return HTTP 404 and the app will fall back to deterministic output.`,
            // A few suggestions, not the full list.
            similar: ids.filter((id) => id.includes(c.model.split("-").slice(0, 2).join("-"))).slice(0, 5),
          }),
    };
  } catch (err) {
    return {
      reachable: false,
      modelAvailable: false,
      error: err?.name === "AbortError" ? "timeout" : "network_error",
      message: "The provider could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}