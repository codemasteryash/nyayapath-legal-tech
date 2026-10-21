/**
 * Dependency-Aware Legal Action Planner & Procedural Guidance Engine
 *
 * Constructs a stage-by-stage procedural roadmap for pro se litigants:
 *  - Distinguishes statutory limitation deadlines (from-source) from practical advisory advice
 *  - Links actions to prerequisite documents and legal authorities
 *  - Integrates required court application forms from forms.json
 *  - Invalidates stale plans when facts or categories change
 */

import * as kb from "./knowledge.js";
import { casesRepo, factsRepo, timelineRepo, actionPlanRepo, documentsRepo } from "./db.js";

export function generateActionPlan(caseId) {
  const caseObj = casesRepo.get(caseId);
  if (!caseObj) throw new Error("Case not found");

  const categoryId = caseObj.category || "civil-other";
  const templateSteps = kb.action_template(categoryId) || [];
  const forms = kb.forms_for_category(categoryId);
  const acts = kb.acts();
  const channels = kb.referral_channels();
  const documents = documentsRepo.list(caseId);
  const activeFacts = factsRepo.list(caseId);

  const planItems = templateSteps.map((step, idx) => {
    // Check if prerequisite documents are already held
    const requiredEvidence = step.evidence || [];
    const heldEvidence = requiredEvidence.filter((req) =>
      documents.some((d) => d.filename.toLowerCase().includes(req.toLowerCase())) ||
      activeFacts.some((f) => f.statement.toLowerCase().includes(req.toLowerCase())),
    );

    const isStatutoryDeadline = step.deadline && /\b(statute|statutory|limitation)\b/i.test(step.deadline);

    const relevantForms = forms.filter((f) =>
      step.title.toLowerCase().includes("application") ||
      step.title.toLowerCase().includes("complaint") ||
      f.name.toLowerCase().includes(step.title.toLowerCase()),
    );

    const authorityRefs = (step.authorityRefs || [])
      .map((id) => {
        const prov = kb.provision_by_id(id);
        if (prov) {
          const act = acts[prov.act] || {};
          return {
            id: prov.id,
            label: `${act.shortTitle || prov.act}, s. ${prov.section}`,
            heading: prov.heading,
            sourceUrl: act.sourceUrl,
          };
        }
        const chan = channels.find((c) => c.id === id);
        if (chan) {
          return { id: chan.id, label: chan.name, contact: chan.contact };
        }
        return null;
      })
      .filter(Boolean);

    return {
      title: step.title,
      description: step.detail || step.description || "",
      step_order: idx + 1,
      urgency: step.urgent || idx === 0 ? "urgent" : "normal",
      deadline: step.deadline || "Take action promptly once evidence is assembled.",
      deadlineKind: isStatutoryDeadline ? "from-source" : "advisory",
      forum: step.forum || caseObj.jurisdiction || "Competent Court / Authority",
      prerequisites: requiredEvidence.filter((r) => !heldEvidence.includes(r)),
      heldPrerequisites: heldEvidence,
      forms: relevantForms,
      authorityRefs,
    };
  });

  return actionPlanRepo.save(caseId, caseObj.case_version, planItems);
}
