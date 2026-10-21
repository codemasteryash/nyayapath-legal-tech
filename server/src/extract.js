/**
 * Deterministic fact, date and timeline extraction.
 *
 * Nothing here is generated. Every output item is a literal substring of the
 * text the user typed or of the PDF they uploaded, so a person can always check
 * the workspace against their own words.
 */

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12,
  december: 12,
};

const HINDI_MONTHS = {
  जनवरी: 1, फ़रवरी: 2, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6, जुलाई: 7,
  अगस्त: 8, सितंबर: 9, सितम्बर: 9, अक्टूबर: 10, अक्तूबर: 10, नवंबर: 11, नवम्बर: 11,
  दिसंबर: 12, दिसम्बर: 12,
};

const DEVANAGARI_RANGE = /[\u0900-\u097F]/;

/** Fraction of Devanagari code points, used to label the input language. */
export function devanagariRatio(text) {
  if (!text) return 0;
  let dev = 0;
  let total = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total += 1;
    if (DEVANAGARI_RANGE.test(ch)) dev += 1;
  }
  return total === 0 ? 0 : dev / total;
}

export function detectLanguage(text, declared) {
  const ratio = devanagariRatio(text);
  if (ratio > 0.25) {
    return {
      code: "hi",
      label: "Hindi",
      labelLocal: "हिन्दी",
      script: "Devanagari",
      confidence: Math.min(0.99, 0.55 + ratio / 2),
      detectedFrom: "Devanagari script in the narrative",
    };
  }
  if (declared === "hinglish" || declared === "hi-en") {
    return {
      code: declared,
      label: declared === "hinglish" ? "Hindi (romanised) mixed with English" : "Hindi and English",
      labelLocal: "हिन्दी / English",
      script: "Mixed",
      confidence: 0.6,
      detectedFrom: "Selected at intake",
    };
  }
  return {
    code: "en",
    label: "English",
    labelLocal: "English",
    script: "Latin",
    confidence: 0.9,
    detectedFrom: "Latin script in the narrative",
  };
}

/**
 * Split into sentences. Works for Latin and Devanagari text; Devanagari danda
 * and full stop are both treated as terminators.
 */
export function splitSentences(text) {
  if (!text) return [];
  const normalised = String(text)
    .replace(/\r/g, "\n")
    .replace(/([।!?])\s*/g, "$1\n")
    .replace(/([.।])\s+/g, "$1\n");
  return normalised
    .split(/\n+/)
    .map((s) => s.replace(/^[•\-*\s]+/, "").trim())
    .filter((s) => s.length > 2);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function isoFromParts(year, month, day) {
  const y = year > 100 ? year : 2000 + year;
  if (!y || y < 1900 || y > 2100) return null;
  if (!month || month < 1 || month > 12) return null;
  if (day && (day < 1 || day > 31)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(month)}-${pad(day || 1)}`;
}

/**
 * Find every date-like expression. Each hit keeps the exact matched text so the
 * UI can show what was detected and the user can correct it.
 */
export function extractDates(text) {
  if (!text) return [];
  const hits = [];
  const push = (raw, iso, kind, needsReview) => {
    if (!iso) return;
    hits.push({ text: raw.trim(), iso, kind, needsReview });
  };

  // Character ranges already claimed by a full date. A bare year inside one of
  // these belongs to that date rather than standing on its own, so "12 May 2023"
  // yields 2023-05-12 and not a second, phantom event on 1 January 2023.
  const fullDateSpans = [];
  const claimSpan = (match, iso) => {
    if (iso) fullDateSpans.push([match.index, match.index + match[0].length]);
  };

  // 12 April 2026 / 12th April 2026
  const reMonthFirst = new RegExp(
    "\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + Object.keys(MONTHS).join("|") +
    ")[a-z]*\\s+(\\d{4})\\b", "gi");
  let m;
  while ((m = reMonthFirst.exec(text))) {
    const iso = isoFromParts(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    push(m[0], iso, "day-month-year", false);
    claimSpan(m, iso);
  }

  // April 12, 2026
  const reDayFirst = new RegExp(
    "\\b(" + Object.keys(MONTHS).join("|") + ")[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", "gi");
  while ((m = reDayFirst.exec(text))) {
    const iso = isoFromParts(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    push(m[0], iso, "month-day-year", false);
    claimSpan(m, iso);
  }

  // 2026-04-12 - ISO 8601. The year is written first, so there is no day/month
  // ambiguity to flag. This is the format an <input type="date"> control and most
  // document systems emit, so it has to be readable even though it is not how a
  // person types a date in a sentence.
  const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = reIso.exec(text))) {
    const iso = isoFromParts(+m[1], +m[2], +m[3]);
    push(m[0], iso, "iso", false);
    claimSpan(m, iso);
  }

  // 12/04/2026 or 12-04-2026 - ambiguous day/month order in Indian usage.
  const reNumeric = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g;
  while ((m = reNumeric.exec(text))) {
    const a = +m[1];
    const b = +m[2];
    let iso = null;
    if (a > 12 && b <= 12) iso = isoFromParts(+m[3], b, a);
    else if (b > 12 && a <= 12) iso = isoFromParts(+m[3], a, b);
    else iso = isoFromParts(+m[3], b, a);
    push(m[0], iso, "numeric", a <= 12 && b <= 12);
    claimSpan(m, iso);
  }

  // 12 नवंबर 2025
  const reHi = new RegExp(
    "\\b(\\d{1,2})(?:वीं|वां|वा)?\\s+(" + Object.keys(HINDI_MONTHS).join("|") +
    ")\\s+(\\d{4})\\b", "g");
  while ((m = reHi.exec(text))) {
    const iso = isoFromParts(+m[3], HINDI_MONTHS[m[2]], +m[1]);
    push(m[0], iso, "hindi", false);
    claimSpan(m, iso);
  }

  const reHiMonthFirst = new RegExp(
    "\\b(" + Object.keys(HINDI_MONTHS).join("|") + ")\\s+(\\d{1,2})(?:वीं|वां|वा)?,?\\s+(\\d{4})\\b", "g");
  while ((m = reHiMonthFirst.exec(text))) {
    const iso = isoFromParts(+m[3], HINDI_MONTHS[m[1]], +m[2]);
    push(m[0], iso, "hindi", false);
    claimSpan(m, iso);
  }

  // Bare year, only when it reads like a reference to an event year.
  const reYear = /(?<![\d/-])((?:19|20)\d{2})(?![\d/-])/g;
  while ((m = reYear.exec(text))) {
    const year = +m[1];
    if (year < 1990 || year > 2100) continue;
    // Skip a year that is part of a fuller date already recorded, so a month-name
    // date does not also register as an event on 1 January.
    if (fullDateSpans.some(([s, e]) => m.index >= s && m.index < e)) continue;
    const start = Math.max(0, m.index - 40);
    const end = Math.min(text.length, m.index + m[0].length + 40);
    const context = text.slice(start, end);
    if (/(born|birth|age|वर्ष|साल)/i.test(context) && year > new Date().getFullYear() - 2) continue;
    push(m[0], isoFromParts(year, 1, 1), "year-only", true);
  }

  // De-duplicate on the exact matched string and offset.
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const key = `${hit.text}@${hit.iso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/**
 * Build a chronological timeline. Each entry keeps the sentence it came from so
 * the person can see the extraction is not inventing anything.
 */
export function buildTimeline(text, { limit = 20 } = {}) {
  const sentences = splitSentences(text);
  const events = [];

  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i];
    const dates = extractDates(s);
    for (const d of dates) {
      events.push({
        date: d.iso,
        dateText: d.text,
        precision: d.kind,
        needsReview: d.needsReview,
        event: s.length > 260 ? s.slice(0, 257) + "..." : s,
        source: "narrative",
      });
    }
  }

  events.sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date < b.date ? -1 : 1;
  });

  const deduped = [];
  const seen = new Set();
  for (const e of events) {
    const key = e.date + "|" + e.event.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  return {
    events: deduped.slice(0, limit),
    total: deduped.length,
    uncertainCount: deduped.filter((e) => e.needsReview).length,
  };
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

const ACTION_VERBS = [
  "hit", "beat", "beaten", "struck", "pushed", "kicked", "grabbed", "held", "took",
  "refused", "demanded", "asked", "threatened", "said", "called", "deleted",
  "circulated", "posted", "shared", "sent", "received", "withheld", "stopped",
  "locked", "threw", "paid", "took my", "kept", "left", "met", "visited",
  "agreed", "signed", "refuse", "tried", "attempted", "knew", "found",
  "मारा", "पीटा", "धक्का", "मारने", "पीटने", "रोकने", "बंद", "ले", "दिया", "मांग",
  "कहा", "फोन", "भेजा", "किया", "खा", "पैसा", "दहेज", "डराना", "निकाल",
];

const NEGATION = /\b(not|no|never|didn't|does not|did not|does not|wasn't|was not|नहीं|नही|न)\b/i;

/**
 * Rank narrative sentences as candidate facts. The score is explainable: how
 * many category keywords, whether there is a date, whether it describes an act,
 * and a mild penalty for very short or very long sentences.
 */
export function extractFacts(text, categoryKeywords = [], { limit = 10 } = {}) {
  const sentences = splitSentences(text);
  const kw = categoryKeywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2);
  const dates = extractDates(text);
  const dateStrings = dates.map((d) => d.text.toLowerCase());

  const scored = sentences.map((s) => {
    const lower = s.toLowerCase();
    let score = 0;
    const reasons = [];

    const kwHits = kw.filter((k) => lower.includes(k)).length;
    if (kwHits) {
      score += Math.min(4, kwHits) * 1.5;
      reasons.push(`matches ${kwHits} term(s) for this issue type`);
    }

    if (dateStrings.some((d) => lower.includes(d))) {
      score += 2.5;
      reasons.push("contains a date");
    }

    const verbHits = ACTION_VERBS.filter((v) => lower.includes(v)).length;
    if (verbHits) {
      score += Math.min(3, verbHits) * 1.1;
      reasons.push("describes something that was done");
    }

    if (/\b(i|my|me|we|our|मैं|मेरा|मुझे)\b/.test(lower)) score += 0.6;

    if (NEGATION.test(lower)) {
      score -= 0.8;
      reasons.push("contains a negation, so the sense may be reversed");
    }

    const words = s.split(/\s+/).length;
    if (words < 5) score -= 1.5;
    if (words > 55) score -= 0.8;

    return { text: s, score: Math.max(0, score), reasons, words };
  });

  const above = scored.filter((f) => f.score > 1.2).sort((a, b) => b.score - a.score);
  const chosen = (above.length ? above : scored.sort((a, b) => b.score - a.score)).slice(0, limit);

  return {
    facts: chosen.map((f) => ({
      text: f.text,
      relevance: Math.round(Math.min(1, f.score / 9) * 100) / 100,
      why: f.reasons.length ? f.reasons.join("; ") : "Part of the narrative you entered",
      verbatim: true,
    })),
    sentenceCount: sentences.length,
    wordCount: (text || "").split(/\s+/).filter(Boolean).length,
  };
}

/** Plain-language restatement of the case, assembled only from user words. */
export function buildCaseSummary(title, category, facts, timeline, meta) {
  const bits = [];
  if (meta.languageLabel) bits.push(meta.languageLabel);
  if (meta.location) bits.push(`in ${meta.location}`);
  if (meta.startDate) bits.push(`first incident recorded around ${meta.startDate}`);
  if (timeline.events.length) {
    bits.push(`earliest dated event ${timeline.events[0].dateText}`);
    bits.push(`latest dated event ${timeline.events[timeline.events.length - 1].dateText}`);
  } else {
    bits.push("no dates were detected in the narrative");
  }
  bits.push(`${timeline.total} dated event${timeline.total === 1 ? "" : "s"}`);

  const lead = facts[0]?.text || "No narrative was provided.";

  return {
    headline: title || "Untitled case",
    issueType: category ? category.label : "Not classified",
    opening: lead,
    metadataLine: bits.join(" \u00b7 "),
    note:
      "This summary is assembled from your own words. Nothing has been added to your account of events.",
  };
}

// ---------------------------------------------------------------------------
// Hidden facts
// ---------------------------------------------------------------------------
//
// A person describing their own trouble leaves out the things a court actually
// turns on: that they went to a hospital, that the threat was repeated, that
// somebody saw it. Those are not inferred and presented as fact - each one below
// is triggered by words the user actually typed, and the words are quoted back
// so the person can check the reasoning rather than trust it.

const IMPLICATION_RULES = [
  {
    id: "medical-attention",
    label: "Injuries were treated",
    categories: ["domestic-violence", "dowry", "harassment", "sexual-violence"],
    pattern: /\b(hospital|doctor|clinic|medical|medicine|prescription|stitch|bruise|bleeding|injur)/i,
    detail:
      "You mention medical attention. A medical record is the kind of corroboration that most often carries a case of physical abuse, because it is dated and it is not the person's own account of what happened.",
  },
  {
    id: "repeat-conduct",
    label: "This is a repeated course of conduct",
    categories: null,
    pattern: /\b(again|keeps?|kept|every|repeated|often|always|continues?|still)\b/i,
    detail:
      "You describe something that kept happening. Most of these provisions turn on a course of conduct rather than a single incident, so the repetition is itself the relevant fact.",
  },
  {
    id: "witnesses-present",
    label: "Somebody may have witnessed it",
    categories: null,
    pattern: /\b(witness|witnesses|neighbou?r|present|was there|saw|heard)\b/i,
    detail:
      "You mention another person being present or aware. A witness who can speak to what was said or done is often more useful than a document.",
  },
  {
    id: "messages-record",
    label: "There is a written record of the threats",
    categories: null,
    pattern: /\b(screenshot|message|sms|whatsapp|call log|chat|recorded?|recording|video|photo)\b/i,
    detail:
      "The threats exist in writing or on a recording. Keep the original device and the original messages, with their dates; a screenshot without the conversation around it proves very little.",
  },
  {
    id: "family-member-offender",
    label: "A wider family member may be involved",
    categories: ["domestic-violence", "dowry"],
    pattern: /\b(in-law|in law|sister-in-law|mother-in-law|father-in-law|bahu|saas|jiji|nanad|devar|family)\b/i,
    detail:
      "You mention a relative of your husband. Several offences in this area can be committed by a relative of the husband, not only by the husband himself, so who did it changes which section applies.",
  },
  {
    id: "money-demand",
    label: "There is a money demand behind this",
    categories: ["dowry", "domestic-violence"],
    pattern: /\b(dowry|dahej|dhan|maang|mand|mang|demand|paise|paisa|rupees|lakh|money|cash)\b/i,
    detail:
      "A money demand appears in what you describe. Where a demand for money is tied to ill-treatment, it changes the section that applies and can carry a separate compensation.",
  },
  {
    id: "transferred-money-online",
    label: "Money moved out of your account",
    categories: ["cyber", "financial"],
    pattern: /\b(otp|password|net ?banking|upi|account|wallet|transferred|debited|credited|bank)\b/i,
    detail:
      "There is a financial transaction. Keep the bank statement and the transaction reference: a transfer record establishes the loss far more directly than an account of it.",
  },
  {
    id: "employer-involved",
    label: "The workplace is involved",
    categories: ["workplace-harassment"],
    pattern: /\b(office|workplace|employer|company|manager|boss|colleague)\b/i,
    detail:
      "The conduct happened at or through work. That route to the Internal Complaints Committee depends on the employment relationship, so who your employer is matters.",
  },
  {
    id: "child-present",
    label: "A child is caught in it",
    categories: null,
    pattern: /\b(child|children|daughter|son|bacha|bachchi|bete|minor|school)\b/i,
    detail:
      "A child appears in what you describe. Custody, child maintenance and protection are decided separately, and they are decided in the child's own interest.",
  },
  {
    id: "safety-first",
    label: "Safety may be the immediate question",
    categories: ["domestic-violence", "dowry", "harassment", "sexual-violence", "liberty"],
    pattern: /\b(safer|scared|afraid|fear|danger|risk|chase|follow|threaten|kill|dhamki|dhaamki)\b/i,
    detail:
      "You describe fear or risk. Safety comes before anything else on this list, and an emergency step that does not depend on winning a case always comes first.",
  },
];

/** Absences that change the answer, rather than merely making it shorter. */
const MATERIAL_ABSENCES = [
  {
    id: "no-date",
    label: "No date for what happened",
    matters:
      "The date decides which criminal statute applies. The Bharatiya Nyaya Sanhita and the Bharatiya Nagarik Suraksha Sanhita replaced the Indian Penal Code and the Code of Criminal Procedure on 1 July 2024, and conduct before that date is ordinarily dealt with under the old law.",
    when: (text, dates) => dates.length === 0 && !/(19|20)\d{2}/.test(text),
  },
  {
    id: "no-witness-or-record",
    label: "Nothing that records what happened",
    matters:
      "Nothing in the account points to a witness or a document. That does not mean the case fails, but it changes what you should gather before you go.",
    when: (text) =>
      !/\b(witness|neighbou?r|present|saw|seen|photo|screenshot|message|sms|chat|hospital|doctor|medical|record|call log|video)\b/i.test(text),
  },
  {
    id: "no-timeline",
    label: "Only one event described",
    matters:
      "Most of these provisions turn on a course of conduct over time. A single dated incident tells a court much less than a sequence.",
    when: (text) => (text.match(/[.!?\u0964]/g) || []).length < 2,
  },
];

function quote(text, match) {
  if (!match || typeof match.index !== "number") return null;
  const start = Math.max(0, match.index - 45);
  const end = Math.min(text.length, match.index + match[0].length + 45);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "..." : "") + slice + (end < text.length ? "..." : "");
}

/**
 * Facts the law turns on that the narrative implies, plus the absences that
 * change the answer. Everything is tied to a literal span of the user's own
 * words; nothing is asserted that they did not write.
 */
export function extractHiddenFacts(text, { categories = [], dates = [] } = {}) {
  const out = [];
  if (!text) return out;
  const ids = new Set(
    categories.map((c) => (typeof c === "string" ? c : c && c.id)).filter(Boolean),
  );

  for (const rule of IMPLICATION_RULES) {
    if (rule.categories && !rule.categories.some((c) => ids.has(c))) continue;
    const m = text.match(rule.pattern);
    if (!m) continue;
    out.push({
      kind: "implied",
      id: rule.id,
      label: rule.label,
      detail: rule.detail,
      evidence: quote(text, m),
      basis: `Your account contains "${m[0].trim()}".`,
    });
  }

  for (const gap of MATERIAL_ABSENCES) {
    let applies = false;
    try {
      applies = Boolean(gap.when(text, dates));
    } catch {
      applies = false;
    }
    if (!applies) continue;
    out.push({
      kind: "absent",
      id: gap.id,
      label: gap.label,
      detail: gap.matters,
      evidence: null,
      basis: "Not found anywhere in the narrative you entered.",
    });
  }

  return out;
}