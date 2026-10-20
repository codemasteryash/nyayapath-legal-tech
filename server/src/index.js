import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load server/.env before anything reads process.env. Built into Node 22, so
// this adds no dependency. Values already present in the environment win, which
// means CI and a shell override always take precedence over the file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn(
      `  Could not read ${envPath}: ${err.message}. Continuing with the current environment.`,
    );
  }
}

import * as kb from "./knowledge.js";
import * as retrieval from "./retrievalClient.js";
import * as analysis from "./analysis.js";
import * as pdf from "./pdf.js";
import * as llm from "./llm.js";
import { extractDates, extractFacts, buildTimeline, detectLanguage, splitSentences } from "./extract.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: pdf.MAX_PDF_BYTES, files: 1 },
});

// ---------------------------------------------------------------------------
// Health / meta
// ---------------------------------------------------------------------------

/* ---------------------------------------------------------------------------
   Request logging
   Metadata only. The narrative, uploaded files and the API key are never
   logged - only route, method, id, status and duration.
   --------------------------------------------------------------------------- */

const SENSITIVE_ENV = /api[-_]?key|authorization|secret|token/i;

app.use((req, res, next) => {
  req.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req.startedAt = Date.now();
  res.setHeader("X-Request-Id", req.id);

  res.on("finish", () => {
    const ms = Date.now() - req.startedAt;
    // Health polling is noisy and useless in a log.
    if (req.path === "/api/health") return;
    console.log(
      `  [${req.id}] ${req.method} ${req.path} -> ${res.statusCode} ${ms}ms` +
        (res.locals.note ? ` (${res.locals.note})` : ""),
    );
  });

  if (process.env.LOG_REQUEST_BODIES === "true" && req.path === "/api/analyze") {
    const clone = { ...req.body };
    for (const k of Object.keys(clone)) {
      if (SENSITIVE_ENV.test(k)) clone[k] = "[redacted]";
      else if (k === "narrative") clone[k] = `[${String(clone[k] ?? "").length} chars omitted]`;
    }
    console.log(`  [${req.id}] body keys: ${Object.keys(clone).join(", ")}`);
  }

  next();
});
function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __deadline: true, label }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ---------------------------------------------------------------------------
   Health / meta
   --------------------------------------------------------------------------- */

app.get("/api/health", async (_req, res) => {
  const engine = await retrieval.health();
  const provider = await llm.probe();
  const llmInfo = llm.describe();

  // `configured` only means a key is present. `liveReady` additionally requires
  // that the provider answered AND actually serves the configured model. Only
  // liveReady may ever be reported as mode "ai".
  const liveReady = Boolean(llmInfo.enabled && provider.reachable && provider.modelAvailable !== false);

  res.json({
    ok: true,
    service: "nyayapath-api",
    version: "1.1.1",
    engine,
    llm: {
      ...llmInfo,
      configured: llmInfo.enabled,
      liveReady,
      // Demoted to deterministic unless a real completion could succeed.
      mode: liveReady ? "ai" : "deterministic",
      providerReachable: provider.reachable,
      modelAvailable: provider.modelAvailable ?? null,
      providerCheck: provider,
    },
    corpus: {
      provisions: kb.provisions().length,
      judgments: kb.judgments().length,
      categories: kb.categories().length,
      actionPlanCategories: Object.keys(kb.actionplans_doc().templates || {}).length,
    },
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("/api/meta", (_req, res) => {
  res.json({
    acts: kb.acts(),
    categories: kb.categories().map((c) => ({
      id: c.id,
      label: c.label,
      labelHi: c.labelHi,
      blurb: c.blurb,
      forum: c.forum,
      emergency: c.emergency,
    })),
    referrals: kb.referral_channels(),
    disclaimer: kb.disclaimer(),
    provisionsMeta: kb.provisions_doc().meta,
    judgmentsMeta: kb.judgments_doc().meta,
    llm: llm.describe(),
    sources: [
      { name: "India Code", url: "https://www.indiacode.nic.in/", note: "Official consolidated text of central statutes." },
      { name: "Department of Consumer Affairs", url: "https://consumeraffairs.gov.in/", note: "Consumer Protection Act, 2019." },
      { name: "National Legal Services Authority", url: "https://nalsa.gov.in/", note: "Legal aid information and DLSA directories." },
      { name: "Indian Kanoon", url: "https://indiankanoon.org/", note: "Free full-text judgment search, used only to verify a citation." },
      { name: "National Cybercrime Reporting Portal", url: "https://cybercrime.gov.in/", note: "Official cybercrime complaint portal." },
    ],
  });
});

app.get("/api/samples", (_req, res) => {
  res.json({ samples: kb.sample_cases() });
});

app.get("/api/samples/:id", (req, res) => {
  const sample = kb.sample_case(req.params.id);
  if (!sample) return res.status(404).json({ error: "sample_not_found" });
  res.json({ sample });
});

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const ANALYZE_DEADLINE_MS = Number(process.env.ANALYZE_DEADLINE_MS || 15000);

app.post("/api/analyze", async (req, res, next) => {
  try {
    const result = await withDeadline(analysis.analyse(req.body || {}), ANALYZE_DEADLINE_MS, "analyze");
    res.locals.note = `llm:${result?.llm?.mode || "none"}`;

    if (result?.__deadline) {
      // Extremely defensive: analysis() is already bounded internally, so this
      // only fires if something outside it wedges. Say so plainly instead of
      // leaving the client waiting.
      res.locals.note = "deadline";
      return res.status(504).json({
        error: "analysis_timeout",
        detail: `The analysis did not complete within ${ANALYZE_DEADLINE_MS / 1000}s and was stopped.`,
        hint: "Retry, or continue with the deterministic view.",
      });
    }

    // Never let a partially-computed analysis reach the client.
    if (!result || !Array.isArray(result.provisions)) {
      res.locals.note = "incomplete";
      return res.status(500).json({
        error: "analysis_incomplete",
        detail: "The analysis did not produce a complete result.",
        hint: "Retry the request.",
      });
    }

    if (result.llm?.mode !== "ai") {
      res.locals.note = `deterministic:${result.llm?.reason || "unknown"}`;
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Validate without running the whole pipeline, used by the intake form. */
app.post("/api/validate", (req, res) => {
  const result = analysis.validateIntake(req.body || {});
  res.json(result);
});

// ---------------------------------------------------------------------------
// Legal source lookup
// ---------------------------------------------------------------------------

app.get("/api/provisions", (req, res) => {
  const { category, act, q } = req.query;
  let list = kb.provisions();
  if (category) list = list.filter((p) => p.category === category);
  if (act) list = list.filter((p) => p.act === act);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((p) =>
      [p.heading, p.summary, p.whyItMatters, ...(p.keywords || [])]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }
  const acts = kb.acts();
  res.json({
    total: list.length,
    provisions: list.map((p) => {
      const a = acts[p.act] || {};
      return { ...p, actShortTitle: a.shortTitle, sourceUrl: a.sourceUrl };
    }),
  });
});

app.get("/api/provisions/:id", async (req, res) => {
  const res1 = await retrieval.provisionRecord(req.params.id);
  if (res1.ok) return res.json(res1.provision);
  const rec = kb.provision_by_id(req.params.id);
  if (!rec) return res.status(404).json({ error: "provision_not_found" });
  const a = kb.acts()[rec.act] || {};
  res.json({ ...rec, actShortTitle: a.shortTitle, sourceUrl: a.sourceUrl });
});

app.get("/api/judgments", (req, res) => {
  const { category } = req.query;
  let list = kb.judgments();
  if (category) list = list.filter((j) => (j.categories || []).includes(category));
  res.json({ total: list.length, judgments: list });
});

app.get("/api/judgments/:id", (req, res) => {
  const rec = kb.judgment_by_id(req.params.id);
  if (!rec) return res.status(404).json({ error: "judgment_not_found" });
  res.json({
    ...rec,
    verifyUrl: `https://indiankanoon.org/search/?formInput=${encodeURIComponent(rec.citation)}`,
  });
});

/**
 * Cross-statute graph. Either the whole graph, or the subgraph around a set of
 * provisions. Every edge carries the reason it exists so the user can judge it.
 */
app.get("/api/graph", async (req, res) => {
  const ids = String(req.query.provisions || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
  const category = req.query.category ? String(req.query.category) : null;

  const result = await retrieval.graph({ provisionIds: ids, category });
  if (!result.ok) {
    return res.status(503).json({
      error: "graph_unavailable",
      detail: result.error || "The graph engine did not respond.",
    });
  }
  res.json({
    ...result,
    scope: ids.length ? { provisions: ids } : category ? { category } : { provisions: [] },
  });
});

/** Forms and written applications, grouped by issue category. */
app.get("/api/forms", (req, res) => {
  const { category } = req.query;
  const list = category ? kb.forms_for_category(String(category)) : kb.forms();
  res.json({
    total: list.length,
    meta: kb.forms_doc().meta,
    forms: list,
  });
});

/**
 * Free-text search across provisions and judgments using the retrieval engine.
 */
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "q_required" });
  const mode = req.query.mode === "sparse" ? "sparse" : req.query.mode === "dense" ? "dense" : "hybrid";
  const [p, j] = await Promise.all([
    retrieval.retrieve({ collection: "provisions", query: q, topK: 8, mode }),
    retrieval.retrieve({ collection: "judgments", query: q, topK: 5, minScore: 0.03, mode }),
  ]);
  const acts = kb.acts();
  res.json({
    query: q,
    engine: "hybrid retrieval - sparse TF-IDF plus multilingual sentence embeddings",
    mode,
    denseAvailable: Boolean(p.denseAvailable),
    provisions: p.ok
      ? p.results.map((r) => ({ ...r, actShortTitle: acts[r.act]?.shortTitle }))
      : [],
    judgments: j.ok ? j.results : [],
    degraded: !(p.ok && j.ok),
  });
});

// ---------------------------------------------------------------------------
// Action plan
// ---------------------------------------------------------------------------

app.post("/api/action-plan", (req, res) => {
  const categoryId = String(req.body?.category || "");
  const rec = kb.category_by_id(categoryId);
  if (!rec) return res.status(422).json({ error: "unknown_category", category: categoryId });

  const steps = kb.action_template(categoryId) || [];
  const channels = kb.referral_channels();
  const acts = kb.acts();
  const forms = kb.forms_for_category(categoryId);

  res.json({
    category: { id: rec.id, label: rec.label, forum: rec.forum },
    forms,
    steps: steps.map((step) => ({
      ...step,
      deadlineKind: step.deadline
        ? /\b(statute|statutory)\b/i.test(step.deadline)
          ? "from-source"
          : "advisory"
        : null,
      provisionRefs: (step.authorityRefs || [])
        .map((id) => kb.provision_by_id(id))
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          label: `${acts[p.act]?.shortTitle || p.act}, s. ${p.section}`,
          heading: p.heading,
          sourceUrl: acts[p.act]?.sourceUrl,
        })),
      channelRefs: (step.authorityRefs || [])
        .map((id) => channels.find((c) => c.id === id))
        .filter(Boolean),
    })),
    notice:
      "Deadlines are shown only where a bundled source record states one. Where no source fixes a period, this list says so rather than inventing a date.",
  });
});

// ---------------------------------------------------------------------------
// PDF extraction
// ---------------------------------------------------------------------------

app.post("/api/pdf/extract", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      code: "no_file",
      title: "No file was received",
      detail: "Choose a PDF before uploading.",
    });
  }

  const result = await pdf.extractPdf(req.file.buffer, req.file.originalname);
  if (!result.ok) {
    return res.status(result.code === "not_a_pdf" ? 415 : 422).json(result);
  }

  // Run the same cue extraction we use on the intake narrative, so a document
  // contributes the same kind of structured output.
  const dates = extractDates(result.text);
  const timeline = buildTimeline(result.text, { limit: 25 });
  const facts = extractFacts(result.text, kb.categories().flatMap((c) => c.keywords), { limit: 8 });

  res.json({
    ...result,
    language: detectLanguage(result.text),
    dates,
    timeline,
    facts: facts.facts,
    sentenceCount: splitSentences(result.text).length,
  });
});

// multer's own errors (size, field name) surface as 500 by default.
// This MUST call next(err) for anything it does not handle: a 4-argument
// Express error handler that returns without responding leaves the request
// hanging forever with no status and no body.
app.use((err, _req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      ok: false,
      code: "pdf_too_large",
      title: "That PDF is too large",
      detail: `The limit is ${pdf.MAX_PDF_BYTES / 1024 / 1024} MB.`,
    });
  }
  return next(err);
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

app.use((err, req, res, _next) => {
  const msg = err?.message || String(err);
  // Never log the narrative or the key. Route + message only.
  console.error(`  [${req?.id || "-"}] ERROR ${req?.path || ""}: ${msg}`);

  if (res.headersSent) {
    // Response already started; the only safe move is to end it.
    return res.end();
  }
  if (err?.payload) {
    return res.status(err.status || 422).json(err.payload);
  }
  return res.status(500).json({
    error: "internal_error",
    detail:
      "The request could not be completed. This is a bug in the NyayaPath prototype, not a problem with your case.",
    hint: "Retry. If it keeps failing, restart the API service.",
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`\n  NyayaPath API listening on http://localhost:${PORT}`);
  console.log(`  Corpus: ${kb.provisions().length} provisions, ${kb.judgments().length} judgments`);
  console.log(`  Language model: ${llm.isEnabled() ? llm.describe().model : "not configured (deterministic mode)"}\n`);
  // Warm the retrieval engine so the first user request is not the slow one.
  retrieval.health().then((h) => {
    console.log(`  Retrieval engine: ${h.ok ? `ready (${h.counts.provisions} provisions, ${h.counts.judgments} judgments)` : "unavailable - " + h.detail}\n`);
  });
});

function shutdown(signal) {
  console.log(`\n  ${signal} received, shutting down.`);
  retrieval.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;