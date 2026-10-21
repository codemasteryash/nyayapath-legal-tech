import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetDbForTesting,
  usersRepo,
  casesRepo,
  messagesRepo,
  factsRepo,
  timelineRepo,
  opponentRepo,
  actionPlanRepo,
  auditRepo,
} from "../server/src/db.js";

test("Database initialization and user/case creation", () => {
  resetDbForTesting();
  const user = usersRepo.getOrCreate("user_test_1");
  assert.equal(user.id, "user_test_1");

  const myCase = casesRepo.create({
    userId: user.id,
    title: "Unlawful termination and withholding of salary",
    category: "employment",
    jurisdiction: "Delhi",
  });

  assert.ok(myCase.id);
  assert.equal(myCase.title, "Unlawful termination and withholding of salary");
  assert.equal(myCase.case_version, 1);
  assert.ok(myCase.conversationId);
});

test("Messages and conversation history persistence", () => {
  const myCase = casesRepo.create({
    userId: "user_test_2",
    title: "Consumer refund refusal",
    category: "consumer",
  });

  const msg1 = messagesRepo.add({
    conversationId: myCase.conversationId,
    caseId: myCase.id,
    sender: "user",
    content: "I bought a laptop from an electronics retailer in Mumbai and it was dead on arrival.",
  });

  const msg2 = messagesRepo.add({
    conversationId: myCase.conversationId,
    caseId: myCase.id,
    sender: "assistant",
    content: "Did the seller offer a replacement or did you receive a written refusal?",
  });

  const list = messagesRepo.list(myCase.conversationId);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, msg1.id);
  assert.equal(list[1].id, msg2.id);
});

test("Structured facts with provenance and downstream invalidation on correction", () => {
  const myCase = casesRepo.create({
    userId: "user_test_3",
    title: "Tenant eviction threat",
    category: "property",
  });

  const fact1 = factsRepo.add({
    caseId: myCase.id,
    statement: "Landlord locked the premises on 15 March 2026 without court order",
    eventDate: "2026-03-15",
    sourceType: "user_statement",
  });

  assert.ok(fact1.id);
  let activeFacts = factsRepo.list(myCase.id);
  assert.equal(activeFacts.length, 1);
  assert.equal(activeFacts[0].statement, "Landlord locked the premises on 15 March 2026 without court order");

  // Save an action plan
  actionPlanRepo.save(myCase.id, 1, [
    { title: "File police report for wrongful restraint", urgency: "urgent" },
  ]);
  let activePlan = actionPlanRepo.getActive(myCase.id);
  assert.equal(activePlan.status, "active");

  // User corrects the date: it was actually 20 March 2026
  const correction = factsRepo.correctFact({
    caseId: myCase.id,
    factId: fact1.id,
    correctedStatement: "Landlord locked the premises on 20 March 2026 (not 15 March)",
    reason: "date_correction",
  });

  assert.ok(correction);
  assert.equal(correction.oldFactId, fact1.id);

  // Check active facts now only shows the corrected one
  activeFacts = factsRepo.list(myCase.id);
  assert.equal(activeFacts.length, 1);
  assert.equal(activeFacts[0].statement, "Landlord locked the premises on 20 March 2026 (not 15 March)");

  // Prior plan should now be marked 'stale'
  const stalePlan = actionPlanRepo.getActive(myCase.id);
  assert.equal(stalePlan, null, "Active plan should be invalidated after material fact correction");

  // Case version should have incremented
  const updatedCase = casesRepo.get(myCase.id);
  assert.equal(updatedCase.case_version, 2);

  // Check audit trail
  const audits = auditRepo.list(myCase.id);
  assert.ok(audits.some((a) => a.event_type === "fact_corrected"));
});

test("Opponent simulation storage and retrieval", () => {
  const myCase = casesRepo.create({
    userId: "user_test_4",
    title: "Cyber fraud dispute",
    category: "cyber",
  });

  const sim = opponentRepo.save(myCase.id, 1, "The opponent will claim voluntary OTP sharing and gross negligence", {
    vulnerabilities: ["OTP was voluntarily submitted"],
    crossExamQuestions: ["Why did you disclose your credentials after the explicit bank SMS warning?"],
    counterarguments: ["Bank failed to halt transactions within the golden hour under RBI circular"],
  });

  assert.ok(sim.id);
  const latest = opponentRepo.getLatest(myCase.id);
  assert.ok(latest);
  assert.equal(latest.opposing_theory, "The opponent will claim voluntary OTP sharing and gross negligence");
  assert.equal(latest.report.vulnerabilities.length, 1);
});
