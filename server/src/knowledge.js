/**
 * Access layer for the curated legal corpus.
 *
 * Records are read straight from JSON in data/knowledge and never merged with
 * anything generated at runtime. Anything the UI shows as law came from one of
 * these files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "data", "knowledge");

const cache = new Map();

function load(name) {
  if (!cache.has(name)) {
    const raw = readFileSync(path.join(DATA_DIR, name), "utf8");
    cache.set(name, JSON.parse(raw));
  }
  return cache.get(name);
}

export const provisions_doc = () => load("provisions.json");
export const judgments_doc = () => load("judgments.json");
export const playbook_doc = () => load("caseplaybook.json");
export const actionplans_doc = () => load("actionplans.json");
export const samples_doc = () => load("samplecases.json");
export const forms_doc = () => load("forms.json");

export const forms = () => forms_doc().forms || [];
export const forms_for_category = (id) => forms().filter((f) => f.category === id);
export const form_by_id = (id) => forms().find((f) => f.id === id) || null;

export const acts = () => provisions_doc().acts || {};
export const provisions = () => provisions_doc().provisions || [];
export const provision_by_id = (id) => provisions().find((p) => p.id === id) || null;

export const judgments = () => judgments_doc().judgments || [];
export const judgment_by_id = (id) => judgments().find((j) => j.id === id) || null;

export const categories = () => playbook_doc().categories || [];
export const category_by_id = (id) => categories().find((c) => c.id === id) || null;

export const evidence_library = () => playbook_doc().evidenceLibrary || {};
export const follow_ups = () => playbook_doc().followUps || {};
export const referral_channels = () => playbook_doc().referralChannels || [];
export const date_cues = () => playbook_doc().dateCues || [];

export const action_template = (id) =>
  (actionplans_doc().templates || {})[id] || [];

export const sample_cases = () => samples_doc().sampleCases || [];
export const sample_case = (id) => sample_cases().find((s) => s.id === id) || null;

/** Act metadata for a provision record, or an empty object. */
export function act_for(provision) {
  return acts()[provision?.act] || {};
}

/** Search URL that lets a reader verify a citation themselves. */
export function citation_verify_url(judgment) {
  return `https://indiankanoon.org/search/?formInput=${encodeURIComponent(judgment.citation)}`;
}

export function disclaimer() {
  return {
    headline: "Legal information, not legal advice.",
    body:
      "NyayaPath organises publicly available law and produces a preliminary map of your problem. " +
      "It is not a lawyer, it does not represent you, and nothing here is a conclusion about your case. " +
      "Every section, decision and deadline shown is traceable to a bundled source record, but " +
      "whether that law applies to your facts is something a qualified lawyer has to assess.",
    noHallucinationClaim:
      "We do not claim zero hallucination. The narrower claim we do make is checkable: nothing is " +
      "displayed unless a record for it exists in the bundled corpus, and anything that could not be " +
      "verified is labelled rather than filled in.",
    notAdvice:
      "If your matter involves a risk to life, an ongoing crime, a child, or a hearing already listed, " +
      "speak to a lawyer before you file anything.",
  };
}