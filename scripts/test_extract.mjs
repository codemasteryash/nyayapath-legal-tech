/**
 * Regression test for deterministic date/fact extraction.
 *
 * Dependency-free, like scripts/test_retrieval.py. Run with:
 *     node --test scripts/test_extract.mjs
 * or from the server folder:
 *     npm test
 *
 * These cases exist because the workspace silently produced an empty Timeline
 * for any narrative written in ISO 8601 - the exact format an <input type="date">
 * control emits and the only format validateIntake accepts for startDate. The
 * timelines looked empty and the report claimed "no date could be read", when in
 * fact the extractor could not read the one format the product itself produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDates, buildTimeline, detectLanguage } from "../server/src/extract.js";

/** Every ISO date in a string, in order. */
const isos = (s) => extractDates(s).map((d) => d.iso);
/** One hit, or throw with the actual result so the failure is readable. */
function only(s) {
  const d = extractDates(s);
  assert.equal(d.length, 1, `expected exactly 1 date in ${JSON.stringify(s)}, got ${JSON.stringify(d)}`);
  return d[0];
}

// --- ISO 8601, the regression that mattered --------------------------------

test("reads an ISO 8601 date", () => {
  const hit = only("My husband beat me on 2023-05-14.");
  assert.equal(hit.iso, "2023-05-14");
  assert.equal(hit.kind, "iso");
  assert.equal(hit.text, "2023-05-14");
});

test("an ISO date is unambiguous, so it is not flagged for review", () => {
  assert.equal(only("incident on 2024-03-15").needsReview, false);
});

test("reads several ISO dates from one sentence", () => {
  assert.deepEqual(
    isos("He hit me on 2023-05-14 and again on 2024-02-02."),
    ["2023-05-14", "2024-02-02"],
  );
});

test("rejects an ISO date with an impossible month or day", () => {
  assert.deepEqual(isos("2023-13-45"), []);
  assert.deepEqual(isos("2023-00-10"), []);
});

test("does not mistake numeric DD-MM-YYYY for ISO", () => {
  assert.deepEqual(isos("12-05-2023"), ["2023-05-12"]);
});

// --- A full date must not also register as 1 January -----------------------

test("a month-name date does not also produce a phantom year-only entry", () => {
  assert.deepEqual(isos("12 May 2023"), ["2023-05-12"]);
  assert.deepEqual(isos("May 12, 2023"), ["2023-05-12"]);
});

test("an ISO date does not also produce a phantom year-only entry", () => {
  assert.deepEqual(isos("on 2023-05-14"), ["2023-05-14"]);
});

test("a Hindi date does not also produce a phantom year-only entry", () => {
  assert.deepEqual(isos("2 नवंबर 2025"), ["2025-11-02"]);
});

// --- Bare years still work, including alongside a distinct full date --------

test("a bare year on its own is still read", () => {
  assert.deepEqual(isos("we married in 2023"), ["2023-01-01"]);
});

test("a bare year beside a different full date is kept as its own event", () => {
  assert.deepEqual(
    isos("married in 2023 and on 12 May 2024 he hit me").sort(),
    ["2023-01-01", "2024-05-12"],
  );
});

test("a bare year is marked as needing review", () => {
  assert.equal(only("we married in 2023").needsReview, true);
});

// --- Formats that worked before must keep working ---------------------------

test("numeric dates still resolve in Indian day/month order", () => {
  assert.deepEqual(isos("05/12/2023"), ["2023-12-05"]);
});

test("Hindi month dates still resolve", () => {
  assert.deepEqual(isos("12 अप्रैल 2026"), ["2026-04-12"]);
});

// --- Timeline --------------------------------------------------------------

test("the timeline is populated from ISO dates", () => {
  const tl = buildTimeline("He hit me on 2023-05-14 and again on 2024-02-02.");
  assert.equal(tl.total, 2);
  assert.deepEqual(tl.events.map((e) => e.date), ["2023-05-14", "2024-02-02"]);
  assert.equal(tl.uncertainCount, 0, "ISO dates should not be counted as uncertain");
});

test("the timeline is chronological and free of duplicates", () => {
  const tl = buildTimeline(
    "On 2023-05-14 he hit me. On 2024-02-02 he hit me again. On 2023-05-14 he hit me.",
  );
  assert.equal(tl.total, 2);
  assert.deepEqual(tl.events.map((e) => e.date), ["2023-05-14", "2024-02-02"]);
});

test("a timeline with no dates reports zero rather than inventing one", () => {
  const tl = buildTimeline("He keeps threatening me and I do not know what to do.");
  assert.equal(tl.total, 0);
  assert.equal(tl.events.length, 0);
});

// --- Language detection is unaffected --------------------------------------

test("language detection still separates scripts", () => {
  assert.equal(detectLanguage("He hit me on 2023-05-14").code, "en");
  assert.equal(detectLanguage("उसने मुझे 2023-05-14 को मारा").code, "hi");
});
