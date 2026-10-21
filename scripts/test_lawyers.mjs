import { test } from "node:test";
import assert from "node:assert/strict";
import { findLawyer, lawyerCounts, listLawyers } from "../server/src/lawyers.js";

function withoutDemo(fn) {
  delete process.env.LAWYER_DIRECTORY_DEMO;
  try {
    return fn();
  } finally {
    delete process.env.LAWYER_DIRECTORY_DEMO;
  }
}

function withDemo(fn) {
  process.env.LAWYER_DIRECTORY_DEMO = "true";
  try {
    return fn();
  } finally {
    delete process.env.LAWYER_DIRECTORY_DEMO;
  }
}

test("production results exclude fictional demo lawyers by default", () => {
  withoutDemo(() => {
    const result = listLawyers({});
    assert.equal(result.ok, true);
    assert.equal(result.total, 0);
    assert.deepEqual(result.lawyers, []);
    assert.equal(result.hasListings, false);
    assert.equal(result.source, "none");
    assert.equal(result.demoOnly, false);
    assert.equal(result.counts.real, 0);
    assert.equal(result.counts.demo, 0);
    assert.equal(result.counts.demoAvailable, 15);
    assert.match(result.notice, /No authorised lawyer listings/i);
    assert.match(result.notice, /intentionally empty/i);

    assert.equal(findLawyer("demo-01"), null);
  });
});

test("demo records require explicit opt-in and are never presented as real", () => {
  withDemo(() => {
    const result = listLawyers({});
    assert.equal(result.total, 15);
    assert.equal(result.demoOnly, true);
    assert.equal(result.source, "demo");
    assert.equal(result.counts.real, 0);
    assert.equal(result.counts.demo, 15);
    assert.match(result.notice, /Demo data — not real lawyers/i);
    for (const lawyer of result.lawyers) {
      assert.equal(lawyer.isDemo, true);
      assert.equal(lawyer.verificationStatus, "demo");
      assert.equal(lawyer.contactDetails, null);
      assert.equal(lawyer.bookingUrl, null);
    }
  });
});

test("search, category, city, budget and mode filter the demo fixture", () => {
  withDemo(() => {
    const byQuery = listLawyers({ q: "Kavya" });
    assert.equal(byQuery.total, 1);
    assert.equal(byQuery.lawyers[0].id, "demo-02");

    const byCategory = listLawyers({ category: "cyber" });
    assert.equal(byCategory.total, 2);
    assert.ok(
      byCategory.lawyers.every((l) => l.practiceAreas.some((p) => p.id === "cyber")),
    );

    const byCity = listLawyers({ city: "Mumbai" });
    assert.equal(byCity.total, 3);
    assert.ok(byCity.lawyers.every((l) => l.city === "Mumbai"));

    const byBudget = listLawyers({ maxFee: "800" });
    assert.equal(byBudget.total, 3);
    assert.ok(byBudget.lawyers.every((l) => l.consultationFee <= 800));

    const byMode = listLawyers({ mode: "in-person" });
    assert.equal(byMode.total, 9);
    assert.ok(byMode.lawyers.every((l) => l.consultationModes.includes("in-person")));

    const combined = listLawyers({
      category: "property",
      city: "Pune",
      mode: "in-person",
      maxFee: "1600",
    });
    assert.equal(combined.total, 1);
    assert.equal(combined.lawyers[0].id, "demo-04");
  });
});

test("sorting is applied after filtering", () => {
  withDemo(() => {
    const result = listLawyers({ sort: "fee-asc" });
    const fees = result.lawyers.map((l) => l.consultationFee);
    assert.deepEqual(fees, [...fees].sort((a, b) => a - b));
  });
});

test("invalid filters fail instead of returning an unfiltered list", () => {
  withDemo(() => {
    const result = listLawyers({ maxFee: "-1" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.ok(result.errors.some((e) => e.field === "maxFee"));

    const unknownCategory = listLawyers({ category: "not-a-category" });
    assert.equal(unknownCategory.ok, false);
    assert.equal(unknownCategory.status, 400);
  });
});

test("counts distinguish active demo records from available demo fixtures", () => {
  withoutDemo(() => {
    assert.deepEqual(lawyerCounts(), {
      real: 0,
      demo: 0,
      demoAvailable: 15,
      total: 0,
    });
  });
  withDemo(() => {
    assert.deepEqual(lawyerCounts(), {
      real: 0,
      demo: 15,
      demoAvailable: 15,
      total: 15,
    });
  });
});
