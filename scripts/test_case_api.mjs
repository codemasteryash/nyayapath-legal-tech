import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Start a test server on a dedicated random/free port
let server;
let baseUrl;

test.before(async () => {
  process.env.PORT = "0"; // free port
  const appModule = await import("../server/src/index.js");
  const app = appModule.default;
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    server.closeAllConnections?.();
    server.close();
  }
  const retrieval = await import("../server/src/retrievalClient.js");
  retrieval.shutdown();
  setTimeout(() => process.exit(0), 100).unref();
});

async function api(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "test_advocate_user",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test("1. Case creation with conversational intake and auto-classification", async () => {
  const res = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      narrative: "My husband beat me and demanded ten lakh rupees in dowry on 15 May 2026 in Jaipur.",
    }),
  });

  assert.equal(res.status, 201);
  assert.ok(res.data.case.id);
  assert.ok(["dowry", "domestic-violence"].includes(res.data.case.category));
  assert.ok(res.data.nextIntakeStep.question);
});

test("2. Conversational turns, adaptive questioning, and skips", async () => {
  // Create case
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Cyber banking scam",
      category: "cyber",
    }),
  });
  const caseId = createRes.data.case.id;

  // Turn 1: User message with transaction details
  const msg1 = await api(`/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "I received a phishing SMS and lost Rs 85,000 on 2026-09-28.",
    }),
  });
  assert.equal(msg1.status, 200);
  assert.ok(msg1.data.activeFacts.length >= 1);
  assert.ok(msg1.data.nextIntakeStep.question);

  // Turn 2: User skips
  const msg2 = await api(`/api/cases/${caseId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "I don't know",
    }),
  });
  assert.equal(msg2.status, 200);
  assert.equal(msg2.data.turnResult.type, "skip");

  // Get full state
  const state = await api(`/api/cases/${caseId}`);
  assert.equal(state.status, 200);
  assert.equal(state.data.case.id, caseId);
  assert.ok(state.data.facts.length >= 1);
});

test("3. Case legal analysis and procedural action plan generation", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Domestic abuse and maintenance claim",
      category: "domestic-violence",
      narrative: "My spouse locked me out of our shared flat in Jaipur on 10 April 2026 without any maintenance.",
    }),
  });
  const caseId = createRes.data.case.id;

  const analysisRes = await api(`/api/cases/${caseId}/analysis`, {
    method: "POST",
  });

  assert.equal(analysisRes.status, 200);
  assert.ok(analysisRes.data.analysis.provisions.length > 0);
  assert.ok(analysisRes.data.actionPlan.items.length > 0);
  assert.ok(analysisRes.data.analysis.applicability.criminalLawTransition);
});

test("4. Courtroom Opponent Simulation Agent", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Cyber fraud defense test",
      category: "cyber",
      narrative: "An unauthorized transaction occurred from my bank account after an SMS prompt.",
    }),
  });
  const caseId = createRes.data.case.id;

  const oppRes = await api(`/api/cases/${caseId}/opponent-simulation`, {
    method: "POST",
    body: JSON.stringify({
      customScenario: "What if the bank produces logs claiming the customer entered the OTP twice?",
    }),
  });

  assert.equal(oppRes.status, 200);
  assert.ok(oppRes.data.simulation.report.opposingTheory);
  assert.ok(oppRes.data.simulation.report.crossExaminationQuestions.length > 0);
  assert.ok(oppRes.data.simulation.report.rebuttalStrategies.length > 0);
});

test("5. Dynamic Legal Research Agent", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Shared household rights query",
      category: "domestic-violence",
    }),
  });
  const caseId = createRes.data.case.id;

  const res = await api(`/api/cases/${caseId}/research`, {
    method: "POST",
    body: JSON.stringify({
      query: "Can a wife claim residence order in property owned by in-laws under Domestic Violence Act?",
    }),
  });

  assert.equal(res.status, 200);
  assert.ok(res.data.research.synthesis);
  assert.ok(res.data.research.findings.provisions.length > 0 || res.data.research.findings.judgments.length > 0);
});

test("6. Fact correction with downstream invalidation", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Landlord dispute",
      category: "property",
      narrative: "Landlord illegally locked the flat on 1 March 2026.",
    }),
  });
  const caseId = createRes.data.case.id;

  // Generate initial plan
  await api(`/api/cases/${caseId}/analysis`, { method: "POST" });
  let plan = await api(`/api/cases/${caseId}/action-plan`);
  assert.equal(plan.data.actionPlan.status, "active");

  const state = await api(`/api/cases/${caseId}`);
  const factId = state.data.facts[0].id;

  // Correct the fact
  const corr = await api(`/api/cases/${caseId}/facts/${factId}/corrections`, {
    method: "POST",
    body: JSON.stringify({
      correctedStatement: "Landlord illegally locked the flat on 10 March 2026 (not 1 March).",
    }),
  });
  assert.equal(corr.status, 200);

  // Case version should increment
  const updatedState = await api(`/api/cases/${caseId}`);
  assert.equal(updatedState.data.case.case_version, 2);
});

test("7. LangGraph Agent workflow execution", async () => {
  const createRes = await api("/api/cases", {
    method: "POST",
    body: JSON.stringify({
      title: "Workplace harassment complaint",
      category: "workplace-harassment",
      narrative: "Manager demanded sexual favors under threat of termination in Mumbai.",
    }),
  });
  const caseId = createRes.data.case.id;

  const wf = await api(`/api/cases/${caseId}/workflow`, {
    method: "POST",
  });
  assert.equal(wf.status, 200);
  assert.ok(wf.data.workflowResult);
  assert.equal(wf.data.workflowResult.category, "workplace-harassment");
  assert.ok(wf.data.workflowResult.action_plan.length > 0);
});
