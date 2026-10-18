"""
NyayaPath retrieval engine
==========================

A small, dependency-free lexical retrieval service over the curated legal corpus
in ``data/knowledge``.

What this actually is
---------------------
A sparse TF-IDF vector space with cosine similarity. It builds a term-frequency /
inverse-document-frequency vector for every provision record and every judgment
record in the corpus, then scores a case narrative against those vectors.

What this is NOT
----------------
It is not a neural model, not a language model and not an embedding service.
A term that does not appear in the corpus cannot be matched, because there is no
learned semantic generalisation behind the score. We say so rather than implying
otherwise.

Protocol
--------
Line-delimited JSON over stdin/stdout so the Node API can keep one warm process:

    -> {"op": "health"}
    <- {"ok": true, ...}

    -> {"op": "retrieve", "collection": "provisions", "query": "...", "topK": 6,
        "boostIds": ["BNS-74"], "filterCategory": "cyber"}
    <- {"ok": true, "results": [{...record, "score": 0.41, "matchedTerms": [...]}]}

    -> {"op": "explain", "text": "..."}
    <- {"ok": true, "tokens": [...], "categories": [...]}

Only the standard library is used, so the engine starts without an install step.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_DIR = REPO_ROOT / "data" / "knowledge"

# ---------------------------------------------------------------------------
# Tokenisation
# ---------------------------------------------------------------------------

# Devanagari codepoints used by Hindi text in the corpus and in user narratives.
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")

_WORD_RE = re.compile(r"[A-Za-z]+|[ऀ-ॿ]+")

# Romanised Hindi words that show up constantly in Hinglish input and should
# still land on the same concepts as their Devanagari counterparts.
HINGLISH_MAP = {
    "poti": "पति", "pati": "पति", "saas": "सास", "bahu": "बाहू", "ghar": "घर",
    "marr": "marriage", "marrki": "marriage", "shaadi": "marriage", "shaadi": "marriage",
    "mara": "मारपीट", "peet": "मारपीट", "mara": "मारपीट", "maran": "मारपीट",
    "dhamki": "धमकी", "dhamki": "धमकी", "daman": "धमकी",
    "paisa": "पैसा", "rupaye": "पैसा", "paisa": "पैसा", "paisa": "पैसा",
    "dhan": "दहेज", "dhan": "दहेज", "dhan": "दहेज",
    "utpeedan": "उत्पीड़न", "chhed": "उत्पीड़न", "utp": "उत्पीड़न",
    "balatkaar": "बलात्कार", "balakaar": "बलात्कार", "sambhog": "सहमति",
    "dhokha": "धोखा", "dhokha": "धोखा", "thag": "ठगी", "thagi": "ठगी",
    "kripan": "क्रूरता", "kroorata": "क्रूरता",
    "chitthi": "चेक", "cheque": "चेक", "bank": "बैंक",
    "ghera": "अभीरोध", "qaid": "हिरासत", "banda": "बंद",
    "nirvas": "निवास", "nivas": "निवास", "makaan": "मकान", "zameen": "जमीन",
    "kripan": "क्रूरता", "sakhi": "सखी", "parivar": "परिवार",
    "vakeel": "वकील", "kanuni": "कानूनी", "madad": "सहायता",
    "aadat": "रिवाज", "riwaj": "रिवाज", "parampara": "परंपरा",
    "photo": "तस्वीर", "video": "वीडियो", "fraud": "धोखा",
    "police": "पुलिस", "thana": "थाना", " FIR": "एफआईआर",
    "kursi": "कुर्सी", "jail": "जेल",
}

STOPWORDS = {
    # English
    "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for",
    "with", "at", "by", "from", "as", "is", "was", "were", "are", "be", "been",
    "it", "its", "this", "that", "these", "those", "i", "my", "me", "we", "our",
    "you", "your", "he", "she", "his", "her", "they", "them", "their", "have",
    "has", "had", "do", "does", "did", "not", "no", "so", "then", "than", "there",
    "here", "what", "when", "where", "who", "whom", "which", "how", "why",
    "can", "could", "should", "would", "will", "may", "might", "must", "am",
    "about", "after", "before", "into", "over", "under", "again", "also", "any",
    "some", "such", "only", "own", "same", "too", "very", "just", "because",
    "please", "help", "tell", "give", "need", "want", "know", "made", "make",
    "take", "get", "got", "went", "said", "say", "does", "did", "does",
    # Hindi / Devanagari function-ish tokens
    "है", "हैं", "हो", "था", "थी", "को", "से", "का", "की", "के", "में", "पर",
    "और", "या", "लेकिन", "कि", "जो", "यह", "वह", "मैं", "मुझे", "मेरे", "हम",
    "आप", "गया", "गई", "किया", "किया", "कर", "होता", "गया", "करता", "कई",
    "बहुत", "कुछ", "भी", "ही", "नहीं", "तो", "फिर", "अब", "जब", "तब",
}

# Very short latin tokens carry no retrieval signal and inflate scores.
MIN_LATIN_LEN = 3


def normalise(text: str) -> str:
    """NFKC fold so that decomposed Devanagari and full-width text compare equal."""
    return unicodedata.normalize("NFKC", text or "").lower()


def tokenize(text: str) -> list[str]:
    """Split into comparable terms.

    Devanagari is analysed with a light n-gram window rather than a morphological
    analyser: unigrams, plus bigrams for adjacent Devanagari word runs. That is
    enough to distinguish e.g. "धोखाधड़ी" from "धमकी" without pulling in a
    stemming library that would need to be installed.
    """
    text = normalise(text)
    tokens: list[str] = []
    devanagari_runs: list[str] = []

    def flush_devanagari() -> None:
        if not devanagari_runs:
            return
        for run in devanagari_runs:
            words = run.split()
            for w in words:
                if w not in STOPWORDS:
                    tokens.append(w)
            for a, b in zip(words, words[1:]):
                if a not in STOPWORDS and b not in STOPWORDS:
                    tokens.append(a + " " + b)
        devanagari_runs.clear()

    for match in _WORD_RE.finditer(text):
        chunk = match.group(0)
        if DEVANAGARI.match(chunk):
            devanagari_runs.append(chunk)
            continue
        flush_devanagari()
        if not LATIN.match(chunk):
            continue
        if len(chunk) < MIN_LATIN_LEN:
            continue
        if chunk in STOPWORDS:
            continue
        tokens.append(chunk)
        mapped = HINGLISH_MAP.get(chunk)
        if mapped:
            if DEVANAGARI.match(mapped):
                devanagari_runs.append(mapped)
            else:
                tokens.append(mapped)
    flush_devanagari()
    return tokens


def display_terms(tokens: list[str]) -> list[str]:
    """Unigrams only, for showing the user what actually matched."""
    return [t for t in tokens if " " not in t]


# ---------------------------------------------------------------------------
# Sparse vector space
# ---------------------------------------------------------------------------


class TfidfIndex:
    def __init__(self, records: list[dict], id_field: str = "id"):
        self.id_field = id_field
        self.records = records
        self.doc_tokens: list[Counter] = []
        self.doc_tf: list[Counter] = []
        self.df: Counter = Counter()
        self.by_id: dict[str, dict] = {}

        for rec in records:
            text = self._record_text(rec)
            toks = tokenize(text)
            tf = Counter(toks)
            self.doc_tokens.append(toks)
            self.doc_tf.append(tf)
            for term in tf:
                self.df[term] += 1
            self.by_id[rec[id_field]] = rec

        self.n_docs = max(1, len(records))
        self.avg_len = sum(len(t) for t in self.doc_tokens) / self.n_docs or 1.0

    @staticmethod
    def _record_text(rec: dict) -> str:
        parts = [
            str(rec.get("title", "")),
            str(rec.get("heading", "")),
            str(rec.get("summary", "")),
            str(rec.get("whyItMatters", "")),
            str(rec.get("factsPattern", "")),
            str(rec.get("holding", "")),
            str(rec.get("relevance", "")),
            str(rec.get("narrativeCues", "")),
            str(rec.get("_augmented", "")),
            " ".join(rec.get("keywords", []) or []),
            " ".join(rec.get("signalTerms", []) or []),
            " ".join(rec.get("categories", []) or []),
        ]
        return " ".join(p for p in parts if p)

    def _idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        if df == 0:
            return 0.0
        return math.log((self.n_docs + 1) / (df + 1)) + 1.0

    def vector(self, tokens: list[str]) -> dict[str, float]:
        """L2-normalised TF-IDF weights."""
        tf = Counter(tokens)
        vec = {}
        for term, count in tf.items():
            idf = self._idf(term)
            if idf <= 0:
                continue
            w = (1.0 + math.log(count)) * idf
            vec[term] = w
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm == 0:
            return vec
        return {k: v / norm for k, v in vec.items()}

    def search(
        self,
        query: str,
        top_k: int = 6,
        boost_ids: list[str] | None = None,
        filter_category: str | None = None,
        filter_categories: list[str] | None = None,
        min_score: float = 0.02,
    ) -> list[dict]:
        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        q_vec = self.vector(q_tokens)
        if not q_vec:
            return []
        q_set = set(q_tokens)
        boosts = {b for b in (boost_ids or []) if b in self.by_id}
        allow = set(filter_categories or [])

        out: list[dict] = []
        for idx, rec in enumerate(self.records):
            if allow:
                cats = rec.get("categories") or ([rec["category"]] if rec.get("category") else [])
                if not (set(cats) & allow):
                    continue
            elif filter_category:
                cats = rec.get("categories")
                if cats and filter_category not in cats:
                    continue
            d_vec = self.vector(self.doc_tokens[idx])
            if not d_vec:
                continue
            # Cosine similarity over sparse vectors.
            if len(q_vec) <= len(d_vec):
                score = sum(v * d_vec.get(k, 0.0) for k, v in q_vec.items())
            else:
                score = sum(v * d_vec.get(k, 0.0) for k, v in d_vec.items())
            rid = rec[self.id_field]
            if rid in boosts:
                # Category-level boosts come from the playbook, so they are a
                # prior the caller already justified; they tilt the order without
                # being able to surface a record that does not mention the facts.
                score *= 1.35
            if score < min_score:
                continue
            doc_set = set(self.doc_tokens[idx])
            matched = sorted(q_set & doc_set, key=lambda t: -q_vec.get(t, 0.0))
            item = {k: v for k, v in rec.items() if not k.startswith("_")}
            item["score"] = round(score, 4)
            item["matchedTerms"] = display_terms(matched)[:12]
            out.append(item)

        out.sort(key=lambda r: (-r["score"], r[self.id_field]))
        return out[:top_k]


# ---------------------------------------------------------------------------
# Corpus loading
# ---------------------------------------------------------------------------


def _read_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


class Corpus:
    def __init__(self) -> None:
        self.provisions_doc = _read_json(KNOWLEDGE_DIR / "provisions.json")
        self.judgments_doc = _read_json(KNOWLEDGE_DIR / "judgments.json")
        self.playbook_doc = _read_json(KNOWLEDGE_DIR / "caseplaybook.json")
        self.plans_doc = _read_json(KNOWLEDGE_DIR / "actionplans.json")
        self.samples_doc = _read_json(KNOWLEDGE_DIR / "samplecases.json")

        self.acts = self.provisions_doc.get("acts", {})
        self.provisions = self.provisions_doc.get("provisions", [])
        self.judgments = self.judgments_doc.get("judgments", [])
        self.categories = self.playbook_doc.get("categories", [])

        # A provision record only names its own issue category ("domestic-violence"),
        # not the words a person would actually use. Borrow the category's label,
        # blurb and keyword list so the narrative and the statute share a vocabulary
        # without inventing new legal content.
        cat_vocab = {}
        for c in self.categories:
            cat_vocab[c["id"]] = " ".join(
                [c.get("label", ""), c.get("blurb", ""), c.get("forum", "")]
                + list(c.get("keywords", []) or [])
            )

        def augment(rec: dict) -> dict:
            extra = [cat_vocab.get(rec.get("category", ""), "")]
            act = self.acts.get(rec.get("act"), {})
            extra.append(str(act.get("shortTitle", "")))
            # Store on a copy used for indexing only; the record served to the API
            # is read straight out of the JSON.
            return {**rec, "_augmented": " ".join(e for e in extra if e)}

        self._prov_index_docs = [augment(r) for r in self.provisions]
        self.prov_index = TfidfIndex(self._prov_index_docs)
        self.judg_index = TfidfIndex(self.judgments)

    def category_by_id(self, cid: str) -> dict | None:
        for c in self.categories:
            if c["id"] == cid:
                return c
        return None


_CORPUS: Corpus | None = None


def corpus() -> Corpus:
    global _CORPUS
    if _CORPUS is None:
        _CORPUS = Corpus()
    return _CORPUS


# ---------------------------------------------------------------------------
# Category inference from a narrative
# ---------------------------------------------------------------------------

# Signals deliberately carry a weight. A single ambiguous word should not
# outrank an unambiguous statutory cue, so strong cues score higher.
STRONG_SIGNALS = {
    "cyber": ["cyber", "otp", "upi", "phishing", "hdfc", "net banking", "fraud call",
              "crypto", "वरगिरा", "साइबर", "otp", "upi"],
    "child-safety": ["my child", "my daughter", "my son", "minor", "बच्चा", "बच्ची",
                     "बालक", "बालिका", "under 18", "school teacher"],
    "workplace-harassment": ["office", "workplace", "my manager", "internal committee",
                             "my boss", "employer", "कार्यस्थल", "ऑफिस", "नौकरी"],
    "consumer": ["warranty", "refund", "defective product", "consumer forum",
                 "seller", "उपभोक्ता", "वारंटी", "वापसी"],
    "dowry": ["dowry", "dowry death", "दहेज", "दहेज उत्पीड़न", "mang", "dhan"],
    "liberty": ["detained", "detention", "kidnapped", "arrested and not", "habeas",
                "गिरफ्तार", "हिरासत", "बंदी"],
    "property": ["evicted", "possession", "landlord", "tenant", "boundary", "plot",
                 "कब्ज़ा", "कब्जा", "जमीन", "मकान मालिक"],
    "financial": ["cheque", "bounced", "dishonour", "emi", "guarantor", "loan",
                  "recover", "चेक", "ऋण", "गारंटर"],
    "sexual-violence": ["rape", "raped", "molested", "molest", "gang rape", "बलात्कार"],
    "harassment": ["stalking", "stalker", "following me", "modesty", "molestation",
                   "उत्पीड़न", "मॉडेस्टी", "छूना"],
    "domestic-violence": ["husband", "wife", "my spouse", "in-law", "in law", "matrimonial",
                          "beat me", "beating", "married", "घरेलू हिंसा", "पति", "सास", "बाहू"],
}

WEAK_SIGNALS = {
    "domestic-violence": ["home", "family", "house", "throw me out", "मेरा घर", "परिवार", "फेंक दो"],
    "harassment": ["messages", "calls", "disturbing", "तंग", "मैसेज", "कॉल"],
    "cyber": ["online", "phone", "internet", "ऑनलाइन", "इंटरनेट", "फोन"],
    "property": ["flat", "house", "premises", "मकान", "घर"],
    "financial": ["money", "पैसा", "पैसे", "रुपये"],
    "consumer": ["service", "company", "सेवा", "कंपनी"],
    "workplace-harassment": ["work", "job", "काम"],
}


def infer_categories(text: str, explicit: str | None = None) -> list[dict]:
    """Return category records with an explainable score for each."""
    norm = normalise(text)
    words = set(tokenize(text))
    scored: list[tuple[float, str, list[str]]] = []

    for cid, cues in STRONG_SIGNALS.items():
        hits = [c for c in cues if c in norm]
        if hits:
            scored.append((3.0 * len(hits), cid, hits))
    for cid, cues in WEAK_SIGNALS.items():
        hits = [c for c in cues if c in norm]
        if hits:
            scored.append((1.0 * len(hits), cid, hits))
    for w in words:
        if w in ("domestic", "violence", "abuse"):
            scored.append((1.5, "domestic-violence", [w]))

    if explicit:
        scored.append((100.0, explicit, ["selected by the user"]))

    merged: dict[str, dict] = {}
    for score, cid, hits in scored:
        row = merged.setdefault(cid, {"score": 0.0, "hits": []})
        row["score"] += score
        for h in hits:
            if h not in row["hits"]:
                row["hits"].append(h)

    ranked = sorted(merged.items(), key=lambda kv: -kv[1]["score"])
    out = []
    for cid, row in ranked[:3]:
        rec = corpus().category_by_id(cid)
        if not rec:
            continue
        out.append({
            "id": cid,
            "label": rec["label"],
            "score": round(row["score"], 2),
            "matchedSignals": row["hits"][:8],
            "reason": "Explicitly selected" if cid == explicit else
                      ("Matched %d signal term(s) in the narrative" % len(row["hits"])),
        })
    return out


# ---------------------------------------------------------------------------
# Operation handlers
# ---------------------------------------------------------------------------


def op_health() -> dict:
    c = corpus()
    return {
        "ok": True,
        "engine": "sparse-tfidf-cosine",
        "isNeuralModel": False,
        "note": "Lexical TF-IDF retrieval over a curated corpus. No learned semantics: "
                "a query term absent from the corpus cannot match.",
        "counts": {
            "provisions": len(c.provisions),
            "judgments": len(c.judgments),
            "categories": len(c.categories),
        },
        "vocabularySize": len(c.prov_index.df) + len(c.judg_index.df),
    }


def op_retrieve(payload: dict) -> dict:
    c = corpus()
    collection = payload.get("collection", "provisions")
    query = payload.get("query", "")
    top_k = int(payload.get("topK", 6))
    boost = payload.get("boostIds") or []
    fcat = payload.get("filterCategory")
    fcats = payload.get("filterCategories")
    min_score = float(payload.get("minScore", 0.02))

    if collection == "judgments":
        index = c.judg_index
        results = index.search(query, top_k=top_k, boost_ids=boost,
                               filter_category=fcat, filter_categories=fcats,
                               min_score=min_score)
    else:
        index = c.prov_index
        results = index.search(query, top_k=top_k, boost_ids=boost,
                               filter_categories=fcats, min_score=min_score)

    return {
        "ok": True,
        "collection": collection,
        "results": results,
        "engine": "sparse-tfidf-cosine",
    }


def op_categorise(payload: dict) -> dict:
    return {
        "ok": True,
        "categories": infer_categories(payload.get("text", ""), payload.get("explicit")),
    }


def op_provision_record(payload: dict) -> dict:
    c = corpus()
    rec = c.prov_index.by_id.get(payload.get("id"))
    if not rec:
        return {"ok": False, "error": "provision_not_found", "id": payload.get("id")}
    act = c.acts.get(rec.get("act"), {})
    out = dict(rec)
    out["actShortTitle"] = act.get("shortTitle")
    out["actNumber"] = act.get("actNo")
    out["actKind"] = act.get("kind")
    out["repealedAct"] = act.get("repealed")
    out["inForceFrom"] = act.get("inForceFrom")
    out["sourceUrl"] = act.get("sourceUrl")
    out["sourceLabel"] = act.get("sourceLabel")
    return {"ok": True, "provision": out}


def handle(payload: dict) -> dict:
    op = payload.get("op")
    if op == "health":
        return op_health()
    if op == "retrieve":
        return op_retrieve(payload)
    if op == "categorise":
        return op_categorise(payload)
    if op == "provision_record":
        return op_provision_record(payload)
    return {"ok": False, "error": "unknown_op", "op": op}


def main() -> None:
    # Windows consoles default to a legacy code page, which cannot encode
    # Devanagari. The corpus contains Hindi keywords, so force UTF-8 on the
    # protocol pipes before the first read or write.
    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    try:
        corpus()
    except Exception as exc:  # pragma: no cover - startup diagnostics
        sys.stderr.write("nyaya-retrieval: corpus failed to load: %r\n" % (exc,))
        sys.exit(1)

    sys.stderr.write("nyaya-retrieval: ready (pid %d)\n" % os.getpid())
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.stdout.write(json.dumps({"ok": False, "error": "bad_json",
                                         "detail": str(exc)}) + "\n")
            sys.stdout.flush()
            continue
        try:
            response = handle(payload)
        except Exception as exc:  # pragma: no cover - defensive
            response = {"ok": False, "error": "handler_failed", "detail": repr(exc)}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()