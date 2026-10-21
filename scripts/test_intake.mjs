import { test } from "node:test";
import assert from "node:assert/strict";
import { resetDbForTesting, casesRepo, factsRepo, timelineRepo } from "../server/src/db.js";
import { classifyIntake, processUserTurn, getNextIntakeStep } from "../server/src/intakeAgent.js";

test("Intake classification for English, Hindi, and Hinglish", async () => {
  const en = await classifyIntake("My husband beat me and demanded 5 lakh rupees dowry");
  assert.ok(["domestic-violence", "dowry"].includes(en.primaryCategory));

  const hi = await classifyIntake("ससुराल वालों ने दहेज की मांग की और मारपीट की");
  assert.ok(["dowry", "domestic-violence"].includes(hi.primaryCategory));

  const hinglish = await classifyIntake("mera bank se otp chori karke 50000 rupees fraud kar diya");
  assert.equal(hinglish.primaryCategory, "cyber");
});

test("Adaptive intake questioning, skip handling, and sufficiency progression", async () => {
  resetDbForTesting();
  const myCase = casesRepo.create({
    userId: "intake_user_1",
    title: "Cyber banking fraud",
    category: "cyber",
  });

  // Turn 1: Initial question
  let step = await getNextIntakeStep(myCase.id);
  assert.equal(step.status, "in_progress");
  assert.ok(step.question);

  // User answers turn 1
  processUserTurn(myCase.id, "On 15 August 2026, I received a fake SMS from a sender claiming to be SBI.");
  const facts = factsRepo.list(myCase.id);
  assert.equal(facts.length, 1);

  const timeline = timelineRepo.list(myCase.id);
  assert.ok(timeline.some((t) => t.event_date === "2026-08-15"));

  // Turn 2: Next question
  step = await getNextIntakeStep(myCase.id);
  assert.equal(step.status, "in_progress");

  // User skips Turn 2 ("I don't know")
  const skipResult = processUserTurn(myCase.id, "I don't know");
  assert.equal(skipResult.type, "skip");

  // Facts count should still be 1 (skip did not pollute facts)
  assert.equal(factsRepo.list(myCase.id).length, 1);

  // User provides second material fact
  processUserTurn(myCase.id, "The fraudster stole Rs 85,000 via unauthorized UPI transfer.");
  assert.equal(factsRepo.list(myCase.id).length, 2);

  // Now the system should recognise preliminary sufficiency
  step = await getNextIntakeStep(myCase.id);
  assert.equal(step.readyForAnalysis, true);
});

test("Contradiction and correction handling during intake", async () => {
  resetDbForTesting();
  const myCase = casesRepo.create({
    userId: "intake_user_2",
    title: "Domestic incident",
    category: "domestic-violence",
  });

  // User provides an initial fact
  processUserTurn(myCase.id, "The incident happened on 10 January 2026");
  assert.equal(factsRepo.list(myCase.id).length, 1);

  // User corrects the date
  const corr = processUserTurn(myCase.id, "Actually, I made a mistake, it was 12 February 2026, not January.");
  assert.equal(corr.type, "correction");

  // Active facts should have the corrected version
  const activeFacts = factsRepo.list(myCase.id);
  assert.equal(activeFacts.length, 1);
  assert.ok(activeFacts[0].statement.includes("12 February 2026"));

  // Clean shutdown of child retrieval engine
  const retrieval = await import("../server/src/retrievalClient.js");
  retrieval.shutdown();
});
