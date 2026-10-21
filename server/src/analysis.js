/**
 * Case analysis pipeline.
 *
 * Orchestrates: intake validation -> language detection -> issue
 * classification -> fact and timeline extraction -> evidence map -> cross-statute
 * provision retrieval -> precedent retrieval -> action plan -> referral routing.
 *
 * Design rules that are not negotiable:
 *  1. Nothing is displayed unless a record for it exists in the bundled corpus.
 *  2. No deadline is emitted unless a corpus record states it.
 *  3. A weak match is shown as a weak match, never dressed up as a conclusion.
 */
import * as kb from "./knowledge.js";
import * as retrieval from "./retrievalClient.js";
import * as extract from "./extract.js";
import * as llm from "./llm.js";

const NEW_CRIMINAL_LAW_FROM = "2024-07-01";

const CATEGORY_ALIASES = {
  harassment: "harassment",
  "sexual harassment": "harassment",
  molestation: "harassment",
  "sexual violence": "sexual-violence",
  rape: "sexual-violence",
  "domestic violence": "domestic-violence",
  "domestic abuse": "domestic-violence",
  dowry: "dowry",
  "dowry harassment": "dowry",
  cybercrime: "cyber",
  cyber: "cyber",
  "online fraud": "cyber",
  "workplace harassment": "workplace-harassment",
  "child safety": "child-safety",
  posco: "child-safety",
  property: "property",
  "property dispute": "property",
  financial: "financial",
  consumer: "consumer",
  liberty: "liberty",
  "civil-other": "civil-other",
  civil: "civil-other",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateIntake(input = {}) {
  const errors = {};
  const title = String(input.title ?? "").trim();
  const narrative = String(input.narrative ?? "").trim();
  const category = String(input.category ?? "").trim();
  const location = String(input.location ?? "").trim();
  const startDate = String(input.startDate ?? "").trim();

  if (title.length < 3) {
    errors.title = "Give the matter a short name of at least 3 characters, for example 'Repeat abuse after separation'.";
  } else if (title.length > 140) {
    errors.title = "Keep the name under 140 characters.";
  }

  if (narrative.length < 60) {
    errors.narrative =
      "Describe what happened in at least a couple of sentences. The more specific you are about what was done, when, and who was present, the more useful the result.";
  } else if (narrative.length > 20000) {
    errors.narrative = "Please shorten the narrative to 20,000 characters.";
  }

  if (!category) {
    errors.category = "Choose the kind of problem this is.";
  } else if (!kb.category_by_id(category)) {
    errors.category = "That issue type is not one we support yet.";
  }

  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    errors.startDate = "Use the date picker, or leave this blank.";
  } else if (startDate) {
    const d = new Date(startDate + "T00:00:00Z");
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980 || d.getFullYear() > new Date().getFullYear() + 1) {
      errors.startDate = "That date looks wrong. It should be between 1980 and next year.";
    }
  }

  if (location && location.length > 120) {
    errors.location = "Keep the place name under 120 characters.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { title, narrative, category, location, startDate, language: input.language || null },
  };
}

// ---------------------------------------------------------------------------
// Jurisdiction and date applicability
// ---------------------------------------------------------------------------

/**
 * The 2023 criminal statutes came into force on 1 July 2024. Which set of
 * sections applies depends on when the conduct happened, so we state this rather
 * than silently showing the current sections.
 */
function applicability(categoryId, startDate, detectedDates) {
  const all = [startDate, ...detectedDates].filter(Boolean).sort();
  const earliest = all[0] || null;

  const criminalFamilies = {
    harassment: ["BNS", "BNSS", "POSH"],
    "sexual-violence": ["BNS", "BNSS", "POCSO"],
    "domestic-violence": ["DVA", "BNS", "BNSS"],
    dowry: ["BNS", "DVA", "BNSS"],
    cyber: ["ITACT", "BNSS", "BNS"],
    "workplace-harassment": ["POSH", "BNS", "BNSS"],
    "child-safety": ["POCSO", "BNSS"],
    property: ["BNS"],
    liberty: ["BNS", "BNSS"],
    financial: ["NI", "BNS", "CPA"],
    consumer: ["CPA"],
    "civil-other": ["CPA"],
  }[categoryId] || [];

  const criminalInvolved = criminalFamilies.some((a) => a === "BNS" || a === "BNSS");
  const before = earliest ? earliest < NEW_CRIMINAL_LAW_FROM : null;

  if (!criminalInvolved) {
    return {
      appliesFrom: null,
      note: "This matter does not turn on the criminal statutes, so the date of the incident does not change which provisions apply.",
      criminalLawTransition: false,
    };
  }

  if (before === true) {
    return {
      appliesFrom: NEW_CRIMINAL_LAW_FROM,
      earliestEvent: earliest,
      criminalLawTransition: true,
      note: `The earliest event you gave is ${earliest}, which is before 1 July 2024. The Bharatiya Nyaya Sanhita 2023, the Bharatiya Nagarik Suraksha Sanhita 2023 and the Bharatiya Sakshya Adhiniyam 2023 came into force on that date and repealed the Indian Penal Code, the Code of Criminal Procedure and the Indian Evidence Act. We are showing the current sections because they are the ones in force now, but conduct dating from before that date is ordinarily dealt with under the repealed law. A lawyer should confirm which applies.`,
    };
  }

  if (before === false) {
    return {
      appliesFrom: NEW_CRIMINAL_LAW_FROM,
      earliestEvent: earliest,
      criminalLawTransition: true,
      note: `Your earliest dated event is ${earliest}, which is on or after 1 July 2024, so the current criminal statutes apply throughout.`,
    };
  }

  return {
    appliesFrom: NEW_CRIMINAL_LAW_FROM,
    criminalLawTransition: true,
    note: "No date could be established from the narrative, so we cannot tell which criminal statute applies. The Bharatiya Nyaya Sanhita and the Bharatiya Nagarik Suraksha Sanhita replaced the Indian Penal Code and the Code of Criminal Procedure on 1 July 2024. Add a date to the narrative if you know one.",
  };
}

// ---------------------------------------------------------------------------
// Evidence mapping
// ---------------------------------------------------------------------------

/**
 * Mark evidence items the narrative suggests the person already holds, so the
 * checklist is useful rather than a generic list. Matching is on explicit
 * phrases, never on inference.
 */
function mapEvidence(categories) {
  const library = kb.evidence_library();
  const seen = new Set();
  const items = [];

  for (const cat of categories) {
    const list = library[cat.id] || [];
    for (const entry of list) {
      if (seen.has(entry.item)) continue;
      seen.add(entry.item);
      items.push({ ...entry, forIssue: cat.label });
    }
  }
  return items;
}

function evidenceHintsFromNarrative(text, evidenceItems) {
  const lower = text.toLowerCase();
  const hints = [
    { pattern: /\b(screenshot|screen shot|photo|photograph|picture|image)\b/i, item: /screenshot|photograph|picture|dated photographs|image/i },
    { pattern: /\b(hospital|doctor|clinic|medical|medicines?|prescription|test report|reports?)\b/i, item: /medical|hospital|doctor/i },
    { pattern: /\b(message|sms|whatsapp|call log|chat|mail|email)\b/i, item: /message|sms|whatsapp|call log|chat|email/i },
    { pattern: /\b(witness|neighbour|neighbor|witnesses|present)\b/i, item: /witness/i },
    { pattern: /\b(invoice|bill|receipt|rent|account|bank statement)\b/i, item: /invoice|bill|receipt|rent|bank statement|proof of residence/i },
    { pattern: /\b(fir|police station|complaint|copy)\b/i, item: /acknowledgment|copy of the recorded information|complaint reference|ticket number/i },
  ];

  const likelyHeld = new Set();
  for (const h of hints) {
    if (h.pattern.test(text)) {
      for (const it of evidenceItems) {
        if (h.item.test(it.item)) likelyHeld.add(it.item);
      }
    }
  }
  return likelyHeld;
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

const REFERRAL_MAP = {
  "sexual-violence": ["police-112", "nalsa", "dlsa", "women-helpline"],
  "child-safety": ["police-112", "childline", "nalsa", "ncw"],
  domestic: ["police-112", "nalsa", "dlsa", "women-helpline", "ncw"],
  dowry: ["police-112", "nalsa", "dlsa", "women-helpline"],
  cyber: ["cyber-1930", "cyber-portal", "police-112", "nalsa"],
  workplace: ["police-112", "nalsa", "women-helpline"],
  property: ["police-112", "nalsa", "dlsa"],
  financial: ["police-112", "nalsa", "dlsa"],
  consumer: ["ncpc", "edupal", "nalsa"],
  liberty: ["police-112", "nalsa", "dlsa"],
  "civil-other": ["nalsa", "dlsa"],
};

function referralsFor(categories, emergencyFlag) {
  const channels = kb.referral_channels();
  const byId = new Map(channels.map((c) => [c.id, c]));
  const wanted = new Set();
  for (const cat of categories) {
    let list = [];
    for (const [key, ids] of Object.entries(REFERRAL_MAP)) {
      if (cat.id.includes(key)) list = ids;
    }
    for (const id of list) wanted.add(id);
  }
  // Legal aid is always available and always worth surfacing.
  wanted.add("nalsa");
  wanted.add("dlsa");
  if (emergencyFlag) wanted.add("police-112");

  const out = [];
  for (const id of wanted) {
    const c = byId.get(id);
    if (c) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function analyse(rawInput) {
  const check = validateIntake(rawInput);
  if (!check.valid) {
    const err = new Error("validation_failed");
    err.status = 422;
    err.payload = { error: "validation_failed", fields: check.errors };
    throw err;
  }
  const input = check.value;

  const text = input.narrative;
  const language = extract.detectLanguage(text, input.language);
  const timeline = extract.buildTimeline(text);
  const dates = extract.extractDates(text);

  // --- Classification -------------------------------------------------------
  let detected = [];
  if (retrieval.health) {
    const res = await retrieval.categorise(text, input.category);
    if (res.ok && Array.isArray(res.categories)) {
      detected = res.categories;
    }
  }

  const primaryId = input.category;
  const primary = kb.category_by_id(primaryId);
  const resolved = [];
  for (const d of detected) {
    const rec = kb.category_by_id(d.id);
    if (rec) resolved.push({ ...d, record: rec });
  }
  if (!resolved.some((r) => r.id === primaryId)) {
    const d = resolved.find((r) => r.id === primaryId);
    resolved.unshift({
      id: primaryId,
      label: primary.label,
      score: null,
      matchedSignals: [],
      reason: "Selected at intake",
      record: primary,
      ...(d || {}),
    });
  }

  // --- Facts ---------------------------------------------------------------
  const categoryKeywords = resolved.flatMap((r) => r.record?.keywords || []);
  const facts = extract.extractFacts(text, categoryKeywords);

  // --- Evidence ------------------------------------------------------------
  const evidence = mapEvidence(resolved);
  const likelyHeld = evidenceHintsFromNarrative(text, evidence);
  for (const item of evidence) {
    item.suggestedHeld = likelyHeld.has(item.item);
  }

  // --- Legal research ------------------------------------------------------
  const issueIds = resolved.map((r) => r.id);
  const defaultProvisionIds = new Set(
    resolved.flatMap((r) => r.record?.defaultProvisionIds || []),
  );

  const applicabilityInfo = applicability(primaryId, input.startDate, dates.map((d) => d.iso));

  const provQuery = [text, resolved.map((r) => r.record?.label).join(" ")].join(" ");
  let provisions = [];
  let retrievalNote = null;
  const provRes = await retrieval.retrieve({
    collection: "provisions",
    query: provQuery,
    topK: 10,
    boostIds: [...defaultProvisionIds],
    filterCategories: issueIds,
  });
  if (provRes.ok && Array.isArray(provRes.results)) {
    provisions = provRes.results;
    // Act metadata for each hit, straight from the corpus.
    const acts = kb.acts();
    provisions = provisions.map((p) => {
      const act = acts[p.act] || {};
      return {
        ...p,
        actShortTitle: act.shortTitle,
        actNumber: act.actNo,
        actKind: act.kind,
        repealedAct: act.repealed,
        inForceFrom: act.inForceFrom,
        sourceUrl: act.sourceUrl,
        sourceLabel: act.sourceLabel,
        fromIssueCategory:
          p.category && issueIds.includes(p.category)
            ? kb.category_by_id(p.category)?.label || null
            : null,
        relevance:
          p.score >= 0.12 ? "strong" : p.score >= 0.05 ? "moderate" : "weak",
      };
    });
  } else {
    retrievalNote =
      "The retrieval engine did not respond, so no provisions could be matched automatically. The action plan below is still available because it is read directly from the corpus.";
  }

  // Prepend provisions the playbook treats as core for the selected issue, so a
  // weak textual match never hides an obviously applicable section.
  const core = [];
  for (const pid of defaultProvisionIds) {
    if (provisions.some((p) => p.id === pid)) continue;
    const rec = kb.provision_by_id(pid);
    if (rec) core.push(rec);
  }
  if (core.length) {
    const acts = kb.acts();
    provisions = [
      ...core.map((rec) => {
        const act = acts[rec.act] || {};
        return {
          ...rec,
          score: null,
          matchedTerms: [],
          actShortTitle: act.shortTitle,
          actNumber: act.actNo,
          actKind: act.kind,
          repealedAct: act.repealed,
          inForceFrom: act.inForceFrom,
          sourceUrl: act.sourceUrl,
          sourceLabel: act.sourceLabel,
          fromIssueCategory:
            rec.category && issueIds.includes(rec.category)
              ? kb.category_by_id(rec.category)?.label || null
              : null,
          relevance: "core-for-this-issue",
        };
      }),
      ...provisions,
    ];
  }

  // --- Precedents ----------------------------------------------------------
  const judgQuery = [text, resolved.map((r) => r.record?.label).join(" ")].join(" ");
  let judgments = [];
  const judgRes = await retrieval.retrieve({
    collection: "judgments",
    query: judgQuery,
    topK: 5,
    filterCategory: primaryId,
    minScore: 0.03,
  });
  if (judgRes.ok && Array.isArray(judgRes.results)) {
    judgments = judgRes.results.map((j) => ({
      ...j,
      relevance: j.score >= 0.12 ? "strong" : j.score >= 0.05 ? "moderate" : "weak",
      verifyUrl: `https://indiankanoon.org/search/?formInput=${encodeURIComponent(j.citation)}`,
    }));
  }

  // --- Cross-statute graph -------------------------------------------------
  // The abstract asks for an indexed graph across penal, civil and special law.
  // We ask the engine for the subgraph around the sections actually matched, so
  // the user sees what connects to what in this case rather than the whole graph.
  let graph = { nodes: [], edges: [], stats: { nodes: 0, edges: 0, statuteCount: 0, statutes: [], crossStatuteEdges: 0 }, note: "The graph engine did not respond, so cross-statute links are not shown." };
  const graphIds = provisions.map((p) => p.id).slice(0, 12);
  if (graphIds.length) {
    const gRes = await retrieval.graph({ provisionIds: graphIds });
    if (gRes.ok && Array.isArray(gRes.nodes)) {
      const matched = new Set(graphIds);
      graph = {
        ...gRes,
        nodes: (gRes.nodes || []).map((n) => ({ ...n, matched: matched.has(n.id) })),
        stats: gRes.stats || {},
        note:
          "Every link below is derived from the knowledge base and shows the reason it exists. " +
          "Sections that matched your account are marked.",
      };
    }
  }

  // --- Forms ---------------------------------------------------------------
  // A pro se person needs to know what paper to file, not just which section
  // applies, so the actual applications are surfaced alongside the plan.
  const forms = kb.forms_for_category(primaryId);
  const crossForms = resolved
    .slice(1)
    .flatMap((r) => kb.forms_for_category(r.id).map((f) => ({ ...f, forIssue: r.record.label })));

  // --- Hidden facts --------------------------------------------------------
  const hiddenFacts = extract.extractHiddenFacts(text, {
    categories: resolved.map((r) => r.id),
    dates: dates.map((d) => d.iso),
  });

  // --- Action plan ---------------------------------------------------------
  const primaryTemplate = kb.action_template(primaryId) || [];
  const actionPlan = primaryTemplate.map((step) => {
    const provRefs = (step.authorityRefs || [])
      .map((id) => kb.provision_by_id(id))
      .filter(Boolean)
      .map((rec) => {
        const act = kb.acts()[rec.act] || {};
        return {
          id: rec.id,
          label: `${act.shortTitle || rec.act}, s. ${rec.section}`,
          heading: rec.heading,
          sourceUrl: act.sourceUrl,
        };
      });
    const channelRefs = (step.authorityRefs || [])
      .map((id) => kb.referral_channels().find((c) => c.id === id))
      .filter(Boolean);
    return {
      ...step,
      provisionRefs: provRefs,
      channelRefs: channelRefs,
      deadlineKind: step.deadline ? (/\b(statute|statutory)\b/i.test(step.deadline) ? "from-source" : "advisory") : null,
    };
  });

  // Cross-statute steps: if a second issue type was detected, its first step is
  // worth surfacing, but only if it does not duplicate what is already shown.
  const crossStatute = [];
  for (const r of resolved.slice(1)) {
    const steps = kb.action_template(r.id) || [];
    const first = steps.find((s) => !crossStatute.some((c) => c.title === s.title));
    if (first) crossStatute.push({ ...first, forIssue: r.record.label });
  }

  // --- Summary and uncertainty --------------------------------------------
  const summary = extract.buildCaseSummary(input.title, primary, facts.facts, timeline, {
    languageLabel: language.label,
    location: input.location,
    startDate: input.startDate,
  });

  const emergency = /immediate|right now|in danger|abuse|violence|risk|hurt me|hit me|threaten/i.test(text) &&
    /now|danger|afraid|scared|fear|hurt|violence|threat/i.test(text);

  const followUps = resolved.flatMap((r) =>
    (kb.follow_ups()[r.id] || []).map((q) => ({ question: q, forIssue: r.record.label })),
  );

  const gaps = [];
  if (!timeline.events.length) {
    gaps.push("No date could be read from the narrative. Dates decide the order of events and can decide which statute applies.");
  } else if (timeline.uncertainCount) {
    gaps.push(`${timeline.uncertainCount} timeline entr${timeline.uncertainCount === 1 ? "y is" : "ies are"} based on a bare year or an ambiguous numeric date. Check them before you rely on the order of events.`);
  }
  if (!input.location) {
    gaps.push("No place was given. Jurisdiction and which court you approach depend on it.");
  }
  if (facts.wordCount < 120) {
    gaps.push("The narrative is short. Sections turn on specific details such as what was said or done, and who was present.");
  }
  if (!judgments.length) {
    gaps.push("No decision in our small corpus matched this narrative. We do not substitute an unrelated case.");
  }
  if (!provisions.length) {
    gaps.push("No provision in the bundled corpus could be matched to this narrative.");
  }

  // --- Optional live model pass -------------------------------------------
  // The deterministic result above is already complete. The model may only
  // enrich it. If the model is disabled, misconfigured, slow or wrong, the
  // deterministic result is returned untouched and `llm.mode` says so.
  // Declared here, before the optional model pass, so the model can append to
  // `gaps` without referencing a binding that does not exist yet.
  const uncertainty = {
    gaps,
    reliability: buildReliability({
      facts, timeline, provisions, judgments, evidence, retrievalNote, language,
    }),
    engine: "hybrid retrieval - sparse TF-IDF for exact statutory wording, plus a 384-dimension multilingual embedding model for meaning, over a curated corpus",
  };

  let ai = { ok: false, mode: "deterministic", reason: "not_attempted" };
  if (llm.isEnabled()) {
    ai = await llm.analyseCase({
      narrative: text,
      languageCode: language.code,
      languageLabel: language.label,
      categoryLabel: primary.label,
      provisions: provisions.slice(0, 12).map((p) => ({
        id: p.id,
        section: p.section,
        heading: p.heading,
        summary: p.summary,
        actShortTitle: p.actShortTitle,
        sourceUrl: p.sourceUrl,
      })),
      judgments: judgments.map((j) => ({
        id: j.id,
        title: j.title,
        citation: j.citation,
        court: j.court,
        year: j.year,
        holding: j.holding,
        verifyUrl: j.verifyUrl,
      })),
      evidence: evidence.slice(0, 12),
    });

    // Merge the explanations back onto the deterministic records. Only the
    // "why" text is taken from the model; identity and text stay from corpus.
    if (ai.ok) {
      for (const ex of ai.provisionExplanations || []) {
        const target = provisions.find((p) => p.id === ex.id);
        if (target && ex.why) target.aiWhy = ex.why;
      }
      for (const ex of ai.judgmentExplanations || []) {
        const target = judgments.find((j) => j.id === ex.id);
        if (target && ex.why) target.aiWhy = ex.why;
      }
      if (ai.uncertainty) {
        uncertainty.aiUncertainty = ai.uncertainty;
      }
      if ((ai.missingInformation || []).length) {
        uncertainty.gaps.push(...ai.missingInformation);
      }
      if (ai.caseSummary) {
        summary.aiSummary = ai.caseSummary;
        summary.language = language;
      }
    }
  }

  return {
    input: { ...input, narrativeLength: text.length },
    language,
    summary: { ...summary, language },
    classification: resolved.map((r) => ({
      id: r.id,
      label: r.record.label,
      labelHi: r.record.labelHi,
      score: r.score,
      reason: r.reason,
      matchedSignals: r.matchedSignals,
      forum: r.record.forum,
      emergency: r.record.emergency,
      defaultProvisionIds: r.record.defaultProvisionIds,
    })),
    facts: facts.facts,
    hiddenFacts,
    stats: { sentences: facts.sentenceCount, words: facts.wordCount },
    timeline,
    datesFound: dates,
    evidence,
    provisions,
    judgments,
    graph,
    forms,
    crossForms,
    actionPlan,
    crossStatute,
    followUps,
    applicability: applicabilityInfo,
    referrals: referralsFor(resolved, emergency),
    uncertainty,
    retrievalNote,
    disclaimer: kb.disclaimer(),
    generatedAt: new Date().toISOString(),
    llm: {
      // mode is the single source of truth for the UI badge.
      mode: ai.ok ? "ai" : "deterministic",
      ok: ai.ok,
      provider: ai.provider || llm.describe().provider,
      model: ai.ok ? ai.model : null,
      reason: ai.ok ? null : ai.reason,
      message: ai.ok ? null : ai.message,
      durationMs: ai.durationMs ?? null,
      notices: ai.ok ? ai.notices : [],
      result: ai.ok
        ? {
            caseSummary: ai.caseSummary,
            keyIssues: ai.keyIssues,
            missingInformation: ai.missingInformation,
            evidenceToGather: ai.evidenceToGather,
            actionSuggestions: ai.actionSuggestions,
            uncertainty: ai.uncertainty,
            provisionExplanations: ai.provisionExplanations,
            judgmentExplanations: ai.judgmentExplanations,
          }
        : null,
    },
  };
}

/**
 * A deliberately conservative self-assessment. High confidence requires
 * everything; anything missing caps the score.
 */
function buildReliability({ facts, timeline, provisions, judgments, evidence, retrievalNote, language }) {
  const factors = [];
  let score = 0.4;

  const strongProvs = provisions.filter((p) => p.relevance === "strong" || p.relevance === "core-for-this-issue").length;
  if (strongProvs >= 4) { score += 0.18; factors.push("Several provisions match the issue type directly."); }
  else if (strongProvs >= 2) { score += 0.1; factors.push("Some provisions match directly."); }
  else { score -= 0.1; factors.push("Few provisions matched directly; the matches below are weak."); }

  if (timeline.events.length >= 3) { score += 0.14; factors.push("The narrative contains several dated events."); }
  else if (timeline.events.length >= 1) { score += 0.06; factors.push("At least one date could be read from the narrative."); }
  else { score -= 0.12; factors.push("No date could be read from the narrative."); }

  if (facts.wordCount >= 180) { score += 0.12; factors.push("The narrative is detailed enough to draw facts from."); }
  else { score -= 0.05; factors.push("The narrative is short, so the fact extraction has little to work with."); }

  if (judgments.length) { score += 0.08; factors.push("Decisions in the corpus matched the fact pattern."); }
  else { factors.push("No decision in the corpus matched; no precedent is shown rather than a weak one."); }

  if (evidence.length) { score += 0.06; factors.push("An evidence checklist can be produced for this issue type."); }

  if (language.confidence < 0.7) {
    score -= 0.04;
    factors.push("The language could not be identified with confidence, so some keywords may not have matched.");
  }

  if (retrievalNote) {
    score -= 0.2;
    factors.push("The retrieval engine did not respond, so part of this output is missing.");
  }

  score = Math.max(0.05, Math.min(0.95, score));
  const band = score >= 0.7 ? "good" : score >= 0.45 ? "partial" : "thin";

  return {
    score: Math.round(score * 100) / 100,
    band,
    label:
      band === "good"
        ? "Reasonable coverage"
        : band === "partial"
          ? "Partial coverage"
          : "Thin coverage",
    explanation:
      band === "good"
        ? "Enough of your account could be matched to the corpus to be useful. It is still a preliminary map, not a conclusion."
        : band === "partial"
          ? "Some of your account could be matched and some could not. Treat the gaps listed below as part of the result."
          : "Very little of your account could be matched to the corpus. Add dates and specific detail, and consider speaking to a lawyer or a legal aid volunteer.",
    factors,
  };
}

export { CATEGORY_ALIASES };