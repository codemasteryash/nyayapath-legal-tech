import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { detectIssues } from "../server/src/issueDetection.js";
import { analyse } from "../server/src/analysis.js";
import { shutdown } from "../server/src/retrievalClient.js";
import * as kb from "../server/src/knowledge.js";

process.env.LLM_ENABLED = "false";

after(() => shutdown());

const provisionIds = new Set(kb.provisions().map((p) => p.id));
const judgmentIds = new Set(kb.judgments().map((j) => j.id));

function caseInput(overrides) {
  return {
    title: "Test matter",
    category: "civil-other",
    narrative: "",
    location: "Delhi",
    startDate: "",
    language: "en",
    ...overrides,
  };
}

function ids(results = []) {
  return results.map((r) => r.id);
}

test("candidate issues are always marked tentative", () => {
  const issues = detectIssues(
    "Two people threatened me and took my phone. One of them pushed me and I was injured.",
  );
  assert.ok(issues.length > 0);
  for (const issue of issues) {
    assert.equal(issue.tentative, true);
    assert.match(issue.reason, /not a legal determination/i);
  }
});

test("robbery-like narrative with a mismatched category retrieves from the narrative", async () => {
  const result = await analyse(
    caseInput({
      title: "Phone and wallet taken",
      category: "cyber",
      startDate: "2026-05-12",
      narrative:
        "On 12 May 2026, two people threatened me on the street and took my phone and wallet. One of them pushed me and said he would hurt me if I shouted.",
    }),
  );

  assert.equal(result.input.category, "cyber");
  const issues = ids(result.detectedIssues);
  assert.ok(issues.includes("robbery"), `expected robbery candidate, got ${issues}`);
  assert.ok(issues.includes("theft"), `expected theft candidate, got ${issues}`);
  assert.ok(ids(result.provisions).includes("BNS-315"));
  assert.ok(ids(result.provisions).includes("BNS-351"));
  assert.ok(
    result.provisions.some((p) => p.retrievalSources?.includes("narrative")),
    "at least one provision should come from the narrative query",
  );
  assert.match(result.retrievalWarning || "", /robbery/i);
});

test("theft narrative without an exact predefined issue is detected", async () => {
  const result = await analyse(
    caseInput({
      title: "Bicycle stolen",
      category: "civil-other",
      startDate: "2026-06-03",
      narrative:
        "Someone stole my bicycle from outside my office on 3 June 2026. I did not see who took it and there were no cameras.",
    }),
  );

  assert.ok(ids(result.detectedIssues).includes("theft"));
  assert.ok(ids(result.provisions).includes("BNS-315"));
  assert.equal(result.input.category, "civil-other");
});

test("laptop-taking under Other civil matter uses theft research and a theft action plan", async () => {
  const result = await analyse(
    caseInput({
      title: "Robbery",
      category: "civil-other",
      startDate: "2026-09-14",
      narrative:
        "On 14 September 2026 my friend entered my house and took my personal computer without my permission. I did not say he could take it and I want it back.",
    }),
  );

  const issueIds = ids(result.detectedIssues);
  assert.ok(issueIds.includes("theft"), `expected theft candidate, got ${issueIds}`);
  assert.ok(!issueIds.includes("robbery"));
  assert.ok(!issueIds.includes("domestic-violence"));
  assert.equal(result.input.category, "civil-other");
  assert.ok(!result.classification.some((c) => c.id === "domestic-violence"));
  assert.ok(ids(result.provisions).includes("BNS-315"));
  assert.ok(ids(result.provisions).includes("BNS-329"));
  assert.ok(!result.provisions.some((p) => p.act === "DVA"), "DVA material is not relevant here");
  assert.ok(!ids(result.provisions).includes("BNS-351"));
  assert.ok(!ids(result.judgments).includes("sr-batra-2007"));
  assert.match(result.retrievalWarning || "", /title mentions robbery/i);

  assert.equal(result.actionPlanSourceId, "theft");
  assert.ok(result.actionPlan.length > 0);
  assert.ok(result.actionPlan.some((step) => step.authorityRefs.includes("BNS-315")));
  assert.ok(result.actionPlan.some((step) => step.authorityRefs.includes("BNS-329")));
  assert.ok(
    !result.actionPlan.some((step) =>
      (step.authorityRefs || []).some((id) => id === "BNS-318" || id.startsWith("CPA-")),
    ),
    "contract and consumer steps must not be substituted",
  );
  assert.ok(result.forms.some((form) => form.id === "police-complaint"));
  assert.ok(result.referrals.some((referral) => referral.id === "police-112"));
});

test("domestic violence still retrieves DVA material and a domestic action plan", async () => {
  const result = await analyse(
    caseInput({
      title: "Domestic abuse and shared household",
      category: "property",
      startDate: "2026-08-11",
      narrative:
        "On 11 August 2026 my husband beat me and threatened me at home. He told me to leave the shared household and said he would hurt me if I returned. I have no money and I am staying at my parents house.",
    }),
  );

  assert.ok(ids(result.detectedIssues).includes("domestic-violence"));
  assert.ok(ids(result.provisions).includes("DVA-3"));
  assert.ok(ids(result.provisions).includes("DVA-17"));
  assert.ok(ids(result.judgments).includes("sr-batra-2007"));
  assert.equal(result.actionPlanSourceId, "domestic-violence");
  assert.ok(result.actionPlan.some((step) => step.authorityRefs.includes("DVA-12")));
  assert.ok(result.actionPlan.some((step) => step.authorityRefs.includes("DVA-18")));
  assert.ok(result.referrals.some((referral) => referral.id === "women-helpline"));
});

test("assault and threats described without legal terminology are detected", async () => {
  const result = await analyse(
    caseInput({
      title: "Pushed and threatened",
      category: "consumer",
      startDate: "2026-06-20",
      narrative:
        "On 20 June 2026 a man threatened to hurt me near the market and pushed me hard. I was scared and did not go to the police.",
    }),
  );

  const issues = ids(result.detectedIssues);
  assert.ok(issues.includes("assault"), `expected assault candidate, got ${issues}`);
  assert.ok(issues.includes("criminal-intimidation"));
  assert.ok(ids(result.provisions).includes("BNS-115"));
  assert.ok(ids(result.provisions).includes("BNS-351"));
});

test("cybercrime narrative works with an unrelated selected category", async () => {
  const result = await analyse(
    caseInput({
      title: "OTP fraud",
      category: "property",
      startDate: "2026-07-02",
      narrative:
        "On 2 July 2026 I got an OTP call and 50000 rupees was taken from my bank account. The caller said he would leak my photos if I complained.",
    }),
  );

  assert.ok(ids(result.detectedIssues).includes("cyber-fraud"));
  assert.ok(ids(result.provisions).includes("ITACT-43"));
  assert.equal(result.input.category, "property");
});

test("a vague narrative reports insufficient material", async () => {
  const result = await analyse(
    caseInput({
      title: "Something happened",
      category: "civil-other",
      narrative:
        "Something bad happened to me last month and I do not know what to do about it. I am worried and cannot sleep.",
    }),
  );

  assert.equal(result.detectedIssues.length, 0);
  assert.equal(result.retrievalCoverage.status, "insufficient");
  assert.match(result.retrievalWarning || "", /no candidate legal issue/i);
  assert.equal(result.actionPlan.length, 0);
  assert.equal(result.actionPlanSourceId, null);
  assert.match(result.actionPlanNote || "", /no fact-specific action steps/i);
});

test("a narrative with no relevant corpus provision reports a coverage gap", async () => {
  const result = await analyse(
    caseInput({
      title: "Neighbour goat dispute",
      category: "civil-other",
      startDate: "2026-01-10",
      narrative:
        "My neighbour's goat ate my prize-winning roses and the village panchayat will not listen to me. I want compensation for the flowers.",
    }),
  );

  assert.equal(result.retrievalCoverage.status, "insufficient");
  assert.ok(result.retrievalWarning);
  for (const p of result.provisions) assert.ok(provisionIds.has(p.id), `unknown provision ${p.id}`);
  for (const j of result.judgments) assert.ok(judgmentIds.has(j.id), `unknown judgment ${j.id}`);
});

test("an incident date before 1 July 2024 flags the criminal-law transition", async () => {
  const result = await analyse(
    caseInput({
      title: "Old assault",
      category: "harassment",
      startDate: "2023-05-12",
      narrative:
        "On 12 May 2023 a group threatened me and hit me near the bus stand. I was injured and went to hospital the next day.",
    }),
  );

  assert.equal(result.applicability.criminalLawTransition, true);
  assert.match(result.applicability.note, /before 1 July 2024/);
  assert.match(result.retrievalWarning || "", /repealed/i);
  const bns = result.provisions.find((p) => p.act === "BNS");
  assert.ok(bns?.applicabilityWarning, "current BNS sections should carry an applicability warning");
});

test("an ordinary rental dispute still retrieves property material", async () => {
  const result = await analyse(
    caseInput({
      title: "Deposit and eviction",
      category: "property",
      startDate: "2026-04-01",
      narrative:
        "My landlord is trying to evict me without notice and refuses to return my security deposit. I have lived in the flat for six years and have a rent agreement.",
    }),
  );

  assert.ok(ids(result.detectedIssues).includes("rental-property"));
  assert.ok(ids(result.provisions).includes("BNS-329"));
  assert.equal(result.input.category, "property");
});

test("category and narrative retrieval are merged without duplicates", async () => {
  const result = await analyse(
    caseInput({
      title: "Phone and wallet taken",
      category: "property",
      startDate: "2026-05-12",
      narrative:
        "On 12 May 2026, two men threatened me and took my phone and wallet near the market. I shouted and one of them pushed me.",
    }),
  );

  const pids = ids(result.provisions);
  const jids = ids(result.judgments);
  assert.equal(new Set(pids).size, pids.length);
  assert.equal(new Set(jids).size, jids.length);
  assert.ok(
    result.provisions.some(
      (p) =>
        p.retrievalSources?.includes("narrative") &&
        p.retrievalSources?.includes("selected-or-detected-category"),
    ),
    "expected at least one provision found by both retrieval paths",
  );
});

test("a disabled or unavailable model does not block deterministic retrieval", async () => {
  process.env.LLM_ENABLED = "false";
  const disabled = await analyse(
    caseInput({
      title: "Threat at the market",
      category: "civil-other",
      startDate: "2026-05-12",
      narrative:
        "On 12 May 2026 a man threatened to hurt me near the market and pushed me. I was scared and left the place.",
    }),
  );
  assert.equal(disabled.llm.mode, "deterministic");
  assert.equal(disabled.llm.ok, false);
  assert.ok(disabled.provisions.length > 0);

  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  process.env.LLM_ENABLED = "true";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_TIMEOUT_MS = "100";
  process.env.LLM_MAX_ATTEMPTS = "1";

  try {
    const timedOut = await analyse(
      caseInput({
        title: "Threat at the market",
        category: "civil-other",
        startDate: "2026-05-12",
        narrative:
          "On 12 May 2026 a man threatened to hurt me near the market and pushed me. I was scared and left the place.",
      }),
    );
    assert.equal(timedOut.llm.mode, "deterministic");
    assert.equal(timedOut.llm.ok, false);
    assert.ok(timedOut.provisions.length > 0);
    assert.ok(["timeout", "network_error", "budget_exhausted"].includes(timedOut.llm.reason));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    process.env.LLM_ENABLED = "false";
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TIMEOUT_MS;
    delete process.env.LLM_MAX_ATTEMPTS;
  }
});
