/**
 * Optional LLM enrichment.
 *
 * The core demo never calls a model. This module is only reachable when both
 * NYAYAPATH_LLM_API_KEY and NYAYAPATH_LLM_BASE_URL are set, and even then it is
 * restricted to rewriting the plain-language case summary in the user's own
 * language. It is never allowed to emit a section number, a citation, a deadline
 * or a form name - those always come from the corpus, never from a model.
 *
 * Any output from here is labelled in the UI as machine paraphrasing that has
 * not been verified against a source.
 */
import * as kb from "./knowledge.js";

const MODEL = process.env.NYAYAPATH_LLM_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 12000;

export function isEnabled() {
  return Boolean(process.env.NYAYAPATH_LLM_API_KEY && process.env.NYAYAPATH_LLM_BASE_URL);
}

/** Fields a model is not permitted to produce. */
const FORBIDDEN = /\b(sec\.?\s*\d|section\s+\d|धारा\s*\d|\(\d{4}\)\s*\d+\s*SCC|\d+\s*days?\b|\d+\s*माह|\bform\s+[IVX]+\b|\bdeadline\b)/i;

function buildPrompt(summary, language) {
  const facts = summary.facts.map((f, i) => `${i + 1}. ${f.text}`).join("\n");
  return [
    "You rewrite a lay person's own account of their legal problem into a short, plain summary.",
    "Rules:",
    "- Use only the facts given. Never add a fact.",
    "- Never name a law, a section number, a court, a citation, a form, a deadline or a number of days.",
    "- Do not give advice. Describe what happened and what the person says they want.",
    `- Write in ${language === "en" ? "clear English" : "Hindi (Devanagari), in 4 short sentences"}.`,
    "Return JSON: {\"summary\": \"...\"}",
    "",
    "Facts from the user:",
    facts,
  ].join("\n");
}

export async function paraphrase({ facts, issueType, languageCode }) {
  if (!isEnabled()) return null;
  const base = process.env.NYAYAPATH_LLM_BASE_URL.replace(/\/+$/, "");
  const url = /\/chat\/completions$/.test(base)
    ? base
    : `${base}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NYAYAPATH_LLM_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You are a careful editor. You never introduce legal references and you never add facts.",
          },
          { role: "user", content: buildPrompt({ facts }, languageCode) },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `model_http_${res.status}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: text.trim() };
    }
    const summary = String(parsed.summary || "").trim();

    if (!summary) return { ok: false, error: "empty_model_output" };

    // Belt and braces: if the model produced a legal reference, discard it.
    if (FORBIDDEN.test(summary)) {
      return { ok: false, error: "model_output_contained_legal_references" };
    }

    return {
      ok: true,
      summary,
      issueType,
      model: MODEL,
      verified: false,
      notice:
        "Machine paraphrase. It restates the facts you entered and has not been checked against any source. " +
        "No section, citation or deadline is taken from this text.",
    };
  } catch (err) {
    const reason = err?.name === "AbortError" ? "model_timeout" : "model_unreachable";
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

export function describe() {
  if (!isEnabled()) {
    return {
      enabled: false,
      mode: "deterministic",
      detail:
        "No language model is configured, so every field in this workspace is produced by the " +
        "bundled corpus and the retrieval engine.",
    };
  }
  return {
    enabled: true,
    mode: "hybrid",
    model: MODEL,
    detail:
      "A language model is configured for plain-language paraphrasing only. Section numbers, " +
      "citations, deadlines and forms always come from the verified corpus, never from the model.",
    corpusSize: {
      provisions: kb.provisions().length,
      judgments: kb.judgments().length,
    },
  };
}