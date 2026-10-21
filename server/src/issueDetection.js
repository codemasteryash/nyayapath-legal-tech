import * as kb from "./knowledge.js";

const CUES = {
  robbery: /\b(?:robbery|robbed|robbing)\b/i,
  theft: /\b(?:theft|stole|stolen|stealing|steal)\b/i,
  assault: /\b(?:assault(?:ed)?)\b/i,
  intimidation: /\b(?:criminal intimidation|intimidat(?:e|ed|ing|ion))\b/i,
  cyber: /\b(?:otp|upi|phishing|cyber|scam(?:med|ming)?|online fraud|fake (?:bank )?call|net banking|hack(?:ed|ing)?|identity theft|credit card fraud|debit card fraud)\b/i,
  landlord: /\b(?:landlord|tenant|rent(?:ed|al)?|evict(?:ed|ion)?|lease|security deposit|possession|flat|apartment)\b/i,
  domestic: /\b(?:husband|wife|spouse|in[- ]laws?|dowry|domestic|saas|pati|sasural|मारपीट|घरेलू हिंसा|पति|सास)\b/i,
  harassment: /\b(?:stalk(?:ed|ing|er)?|harass(?:ed|ment)?|molest(?:ed|ation)?|lewd|obscene|follow(?:ed|ing)? me)\b/i,
  child: /\b(?:child|children|minor|daughter|son|under 18|बच्चा|बच्ची|बालिका)\b/i,
  confinement: /\b(?:detain(?:ed|tion)?|confine(?:d|ment)?|locked (?:me )?(?:in|up)|kidnap(?:ped)?|abduct(?:ed)?|held (?:me )?against)\b/i,
  taking: /\b(?:took|taken|taking|snatch(?:ed|ing)?|loot(?:ed|ing)?)\b/i,
  property: /\b(?:phone|mobile|wallet|purse|bag|chain|jewell?ery|money|cash|watch|vehicle|scooter|bicycle|cycle|bike|car|property|belongings)\b/i,
  threat: /\b(?:threat(?:en(?:ed|ing|s)?)?|dhamki|धमकी|धमकाया|scared me|warned me|kill me|hurt me)\b/i,
  weapon: /\b(?:weapon|knife|knifepoint|gun|gunpoint|pistol|blade|rod)\b/i,
  force: /\b(?:force(?:d|ful)?|grabb(?:ed|ing)|pinned|held me|shov(?:ed)?)\b/i,
  violentContact: /\b(?:hit|beat(?:en)?|punch(?:ed)?|slap(?:ped)?|kick(?:ed)?|attack(?:ed)?|push(?:ed)?|shov(?:ed)?|grab(?:bed)?|chok(?:ed|ing)?)\b/i,
  harm: /\b(?:injur(?:ed|y|ies)?|wound(?:ed)?|bleed(?:ing)?|fracture(?:d)?|broken bone|चोट|मारपीट)\b/i,
};

const ISSUES = [
  {
    id: "robbery",
    label: "Robbery",
    criminal: true,
    anchorTerms: ["robbery"],
    categoryIds: ["property", "assault", "harassment"],
    searchTerms: ["robbery", "theft", "stolen property", "criminal force", "assault", "hurt", "criminal intimidation"],
    cueNames: ["robbery", "taking", "property", "threat", "weapon", "force"],
    clarify: "Was force or a threat used before the property was taken, and was a weapon shown?",
    evaluate(m) {
      if (m.robbery) return 4;
      if (m.taking && (m.threat || m.weapon)) return 3.5;
      if (m.taking && m.force) return 3;
      return 0;
    },
  },
  {
    id: "theft",
    label: "Theft or dishonest taking of property",
    criminal: true,
    anchorTerms: ["theft", "stolen", "misappropriat"],
    categoryIds: ["property"],
    searchTerms: ["theft", "stolen property", "dishonestly misappropriating property", "took property"],
    cueNames: ["theft", "taking", "property"],
    clarify: "What exactly was taken, from where, and did anyone see it happen?",
    evaluate(m) {
      if (m.theft) return 4;
      if (m.taking && m.property) return 3;
      return 0;
    },
  },
  {
    id: "assault",
    label: "Assault, hurt or physical attack",
    criminal: true,
    anchorTerms: ["assault", "hurt"],
    categoryIds: ["assault"],
    searchTerms: ["assault", "criminal force", "voluntarily causing hurt", "grievous hurt", "injury"],
    cueNames: ["assault", "violentContact", "harm", "weapon"],
    clarify: "Were you injured, and did you see a doctor or get any medical record?",
    evaluate(m) {
      if (m.assault) return 4;
      if (m.violentContact && (m.harm || m.weapon)) return 3.5;
      if (m.violentContact) return 2.5;
      if (m.harm) return 2.5;
      return 0;
    },
  },
  {
    id: "criminal-intimidation",
    label: "Threats or criminal intimidation",
    criminal: true,
    anchorTerms: ["criminal intimidation", "threat"],
    categoryIds: ["harassment", "liberty"],
    searchTerms: ["criminal intimidation", "threat", "danger"],
    cueNames: ["intimidation", "threat"],
    clarify: "What exactly was said in the threat, and was it in person, on a call or in writing?",
    evaluate(m) {
      if (m.intimidation) return 4;
      if (m.threat) return 3;
      return 0;
    },
  },
  {
    id: "cyber-fraud",
    label: "Cybercrime or online fraud",
    criminal: true,
    anchorTerms: ["online fraud", "phishing", "cheating", "cyber"],
    categoryIds: ["cyber"],
    searchTerms: ["online fraud", "cheating", "phishing", "otp", "identity theft", "obscene electronic communication"],
    cueNames: ["cyber"],
    clarify: "Which account or number was used, and has the bank or the cybercrime portal been informed?",
    evaluate(m) {
      return m.cyber ? 3.5 : 0;
    },
  },
  {
    id: "rental-property",
    label: "Rental, tenancy or property dispute",
    criminal: false,
    anchorTerms: ["trespass", "possession", "evict"],
    categoryIds: ["property"],
    searchTerms: ["criminal trespass", "possession", "eviction", "shared household", "property"],
    cueNames: ["landlord"],
    clarify: "Is there a written rent agreement, and what notice or written demand have you received?",
    evaluate(m) {
      return m.landlord ? 3 : 0;
    },
  },
  {
    id: "domestic-violence",
    label: "Domestic violence or abuse at home",
    criminal: true,
    anchorTerms: ["domestic violence", "cruelty"],
    categoryIds: ["domestic-violence"],
    searchTerms: ["domestic violence", "cruelty", "protection order", "shared household"],
    cueNames: ["domestic"],
    clarify: "Do you share a household with the person, and is there a risk of violence right now?",
    evaluate(m) {
      return m.domestic ? 3 : 0;
    },
  },
  {
    id: "harassment",
    label: "Harassment or stalking",
    criminal: true,
    anchorTerms: ["harassment", "stalking", "molestation"],
    categoryIds: ["harassment"],
    searchTerms: ["harassment", "stalking", "criminal intimidation", "modesty"],
    cueNames: ["harassment"],
    clarify: "Are the contacts from one person or number, and do you have screenshots or call records?",
    evaluate(m) {
      return m.harassment ? 3 : 0;
    },
  },
  {
    id: "child-safety",
    label: "Child safety",
    criminal: true,
    anchorTerms: ["child", "pocso"],
    categoryIds: ["child-safety"],
    searchTerms: ["child", "mandatory reporting", "special juvenile police unit"],
    cueNames: ["child", "harm", "threat", "harassment"],
    clarify: "Is the person a child, what is their age, and is there an adult who can stay with them?",
    evaluate(m) {
      return m.child && (m.harm || m.threat || m.harassment) ? 3.5 : 0;
    },
  },
  {
    id: "confinement",
    label: "Wrongful restraint, confinement or kidnapping",
    criminal: true,
    anchorTerms: ["wrongful restraint", "wrongful confinement", "kidnapping"],
    categoryIds: ["liberty"],
    searchTerms: ["wrongful restraint", "wrongful confinement", "kidnapping", "arrest"],
    cueNames: ["confinement"],
    clarify: "Where was the person held, for how long, and was anyone prevented from leaving?",
    evaluate(m) {
      return m.confinement ? 3.5 : 0;
    },
  },
];

let provisionIndex = null;

function provisionsWithText() {
  if (provisionIndex) return provisionIndex;
  provisionIndex = kb.provisions().map((rec) => ({
    rec,
    text: [
      rec.id,
      rec.heading,
      rec.summary,
      rec.whyItMatters,
      rec.narrativeCues,
      ...(rec.keywords || []),
      ...(rec.signalTerms || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));
  return provisionIndex;
}

function matchingProvisions(terms) {
  const needles = (terms || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  if (!needles.length) return [];
  return provisionsWithText()
    .filter(({ text }) => needles.some((term) => text.includes(term)))
    .map(({ rec }) => rec);
}

function categoriesOf(rec) {
  if (Array.isArray(rec.categories) && rec.categories.length) return rec.categories;
  return rec.category ? [rec.category] : [];
}

function collectHits(text) {
  const hits = {};
  for (const [name, pattern] of Object.entries(CUES)) {
    const match = text.match(pattern);
    if (match) hits[name] = match[0];
  }
  return hits;
}

function confidenceFromScore(score) {
  return Math.round(Math.min(0.85, 0.35 + score * 0.1) * 100) / 100;
}

function buildCorpusSupport(issue) {
  const direct = matchingProvisions(issue.anchorTerms);
  const related = matchingProvisions(issue.searchTerms);
  const directIds = new Set(direct.map((r) => r.id));
  const relatedOnly = related.filter((r) => !directIds.has(r.id));
  const all = [...direct, ...relatedOnly];

  let status = "none";
  let note = null;
  if (direct.length) {
    status = "direct";
  } else if (related.length) {
    status = "related-only";
    note = `The bundled corpus has no provision matching ${issue.anchorTerms.join(" or ")}. Related material from the corpus is shown, but the specific provision is not in this corpus.`;
  } else {
    note = `The bundled corpus contains no provision on ${issue.label.toLowerCase()}. No section has been invented to fill the gap.`;
  }

  return {
    status,
    provisionIds: all.slice(0, 12).map((r) => r.id),
    categoryIds: issue.categoryIds || categoriesOf(all[0] || {}),
    note,
  };
}

export function detectIssues(text) {
  const normalised = String(text || "").toLowerCase();
  if (!normalised.trim()) return [];
  const hits = collectHits(normalised);
  const found = [];

  for (const issue of ISSUES) {
    const score = issue.evaluate(hits);
    if (score < 2.5) continue;
    const matchedTerms = [...new Set(issue.cueNames.map((name) => hits[name]).filter(Boolean))];
    const corpusSupport = buildCorpusSupport(issue);
    found.push({
      id: issue.id,
      label: issue.label,
      tentative: true,
      criminal: Boolean(issue.criminal),
      score,
      confidence: confidenceFromScore(score),
      reason: `Your description mentions ${matchedTerms.join(", ")}. This is a candidate issue only, not a legal determination.`,
      matchedTerms,
      searchTerms: issue.searchTerms,
      clarifyingQuestion: issue.clarify,
      categoryIds: corpusSupport.categoryIds,
      corpusSupport: {
        status: corpusSupport.status,
        provisionIds: corpusSupport.provisionIds,
        note: corpusSupport.note,
      },
    });
  }

  return found
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 5);
}

export function retrievalTerms(detectedIssues) {
  return [...new Set((detectedIssues || []).flatMap((i) => i.searchTerms || []))];
}

export function categoryIdsFor(detectedIssues) {
  return [...new Set((detectedIssues || []).flatMap((i) => i.categoryIds || []))];
}
