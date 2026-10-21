import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Icon, Loading, Notice, Tag } from "../ui.jsx";

const PRESET_CASES = [
  {
    id: "preset-dv",
    title: "Domestic Violence & Shared Household Eviction",
    category: "domestic-violence",
    jurisdiction: "Delhi",
    facts: [
      "Complainant married Respondent on 12 November 2021",
      "Resided in joint family property at Greater Kailash, Delhi",
      "Repeated demands for ₹10 lakhs additional dowry and gold ornaments",
      "Physical assault on 15 June 2024 resulting in medical treatment",
      "Locked out of the residence and stridhan withheld on 20 June 2024",
      "Police complaint lodged on 28 August 2024",
    ],
    opponentTheory:
      "The residence belongs exclusively to the mother-in-law (self-acquired), not the husband. Under S. R. Batra v. Taruna Batra, daughter-in-law has no legal right to shared household in mother-in-law's separate property. The 74-day delay in lodging the FIR proves fabrication.",
  },
  {
    id: "preset-cheque",
    title: "Section 138 NI Act Cheque Dishonour",
    category: "cheque-bounce",
    jurisdiction: "Mumbai",
    facts: [
      "Complainant holds cheque for ₹3,50,000 dated 5 January 2024",
      "Cheque returned unpaid for 'Funds Insufficient' on 12 January 2024",
      "Statutory demand notice sent on 22 January 2024",
      "No payment made within 15 days of notice receipt",
    ],
    opponentTheory:
      "The cheque was issued in blank 2 years ago strictly as non-enforceable loan security, and the underlying debt was discharged in cash. Under Rangappa v. Sri Mohan, the statutory presumption under Section 139 is rebuttable by preponderance of probabilities.",
  },
  {
    id: "preset-eviction",
    title: "Arbitrary Eviction & Security Deposit Forfeiture",
    category: "tenancy-eviction",
    jurisdiction: "Bengaluru",
    facts: [
      "11-month lease agreement executed on 1 April 2023",
      "Security deposit of ₹1,20,000 paid via bank transfer",
      "Landlord disconnected electricity and water on 15 March 2024",
      "Demanded immediate 40% rent increase without 30 days notice",
      "Refusing to return security deposit citing imaginary painting damages",
    ],
    opponentTheory:
      "The tenant caused severe structural and aesthetic damage exceeding the deposit value. Disconnection occurred due to localized utility failure, not landlord malice. The civil court lacks jurisdiction due to the arbitration clause.",
  },
];

export default function OpponentArena({
  activeCase,
  onGoToAdvocate,
  onToast,
}) {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_CASES[0]);
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState(null);
  const [customScenario, setCustomScenario] = useState("");
  const [userExamAnswer, setUserExamAnswer] = useState("");
  const [examEvaluation, setExamEvaluation] = useState(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  // Load simulation whenever case/preset changes or active workspace changes
  useEffect(() => {
    runAdversarialSimulation();
  }, [selectedPreset, activeCase?.id]);

  async function runAdversarialSimulation(customText = null) {
    setLoading(true);
    setExamEvaluation(null);
    setUserExamAnswer("");

    try {
      // If we have an active case from the advocate or workspace
      if (activeCase?.id) {
        const res = await api.runOpponentSimulation(activeCase.id, customText);
        if (res?.simulation?.report) {
          setSimulationData(res.simulation.report);
          setLoading(false);
          return;
        }
      }

      // Otherwise create or run with preset
      const casePayload = {
        title: selectedPreset.title,
        narrative: selectedPreset.facts.join(". "),
        category: selectedPreset.category,
        jurisdiction: selectedPreset.jurisdiction,
      };

      const caseRes = await api.createCase(casePayload);
      if (caseRes?.case?.id) {
        const simRes = await api.runOpponentSimulation(caseRes.case.id, customText);
        if (simRes?.simulation?.report) {
          setSimulationData(simRes.simulation.report);
        }
      }
    } catch (err) {
      onToast?.("Opponent Agent: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleEvaluateCrossExam(question) {
    if (!userExamAnswer.trim()) return;

    const answer = userExamAnswer.toLowerCase();
    let verdict = "";
    let score = "";
    let guidance = "";

    if (answer.includes("don't remember") || answer.includes("maybe") || answer.includes("not sure")) {
      verdict = "⚠️ VULNERABLE TESTIMONY";
      score = "Opponent Advantage (4/10)";
      guidance =
        "The opposing counsel will seize upon your hesitation to establish inconsistency. Never speculate or guess under oath. Refer strictly to written contemporaneous records.";
    } else if (answer.length < 30) {
      verdict = "⚡ CONCISE & DEFENSIVE";
      score = "Safe Demeanor (7/10)";
      guidance =
        "Short, direct answers limit the opposing counsel's ammunition for follow-up cross-examination. Maintain firm composure without volunteering unasked details.";
    } else {
      verdict = "🛡️ SOLIDIFIED POSITION";
      score = "Litigant Advantage (8.5/10)";
      guidance =
        "Your statement establishes specific factual context. Ensure you have physical corroboration (e.g. bank slip, WhatsApp export under BSA s. 63) ready in the document index.";
    }

    setExamEvaluation({
      question,
      userAnswer: userExamAnswer,
      verdict,
      score,
      guidance,
    });
  }

  const crossExamQuestions = simulationData?.crossExaminationQuestions || [
    {
      question:
        "You state the altercation took place on 15 June, yet your complaint to the police station was first lodged 74 days later on 28 August. Isn't this delay because the allegations were an afterthought?",
      expectedWeakness: "Unexplained delay in reporting",
      counterStrategy:
        "Explain that mediation attempts by community elders occurred between June and August, supported by diary notes.",
    },
    {
      question:
        "Can you produce any independent non-family witness who saw you being physically excluded from the Greater Kailash residence?",
      expectedWeakness: "Reliance solely on interested domestic witnesses",
      counterStrategy:
        "Rely on PCR (Police Control Room) call records and neighbors' CCTV footage under BSA Section 63 certificate.",
    },
  ];

  return (
    <main style={{ paddingTop: 0, background: "var(--white)", minHeight: "92vh" }}>
      {/* Page Header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          background: "var(--white)",
        }}
      >
        <div>
          <span className="badge-note" style={{ marginBottom: 4, display: "block" }}>
            Adversarial Trial Simulation
          </span>
          <h1
            style={{
              fontFamily: "var(--serif)",
              fontSize: "1.65rem",
              color: "var(--black)",
              margin: 0,
              fontWeight: 700,
            }}
          >
            Courtroom Opponent Simulator
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-soft)", fontSize: "0.86rem" }}>
            Adversarial Defense Engine · BSA Section 63 Electronic Evidence Attacks & Hostile Cross-Examination Drill
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={onGoToAdvocate}
            type="button"
          >
            <span>🛡️</span> Consult AI Advocate
          </button>
          <button
            className="btn btn--outline btn--sm"
            onClick={() => runAdversarialSimulation(customScenario || null)}
            disabled={loading}
            type="button"
          >
            <Icon name="reset" size={13} /> Re-Simulate
          </button>
        </div>
      </div>

      <div className="shell" style={{ padding: "24px 24px" }}>
        {/* Case Switcher: Active vs Real Presets */}
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "var(--gray-50)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "var(--text-faint)",
              fontFamily: "var(--mono)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Select Trial Dispute:
          </span>
          {PRESET_CASES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelectedPreset(preset)}
              style={{
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: "var(--radius)",
                border: `1px solid ${selectedPreset.id === preset.id ? "var(--black)" : "var(--border)"}`,
                background: selectedPreset.id === preset.id ? "var(--black)" : "var(--white)",
                color: selectedPreset.id === preset.id ? "var(--white)" : "var(--text-soft)",
                fontSize: "0.72rem",
                fontFamily: "var(--mono)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {preset.title}
            </button>
          ))}
          {activeCase ? (
            <button
              type="button"
              onClick={() => {
                setSelectedPreset({
                  id: "active-case",
                  title: activeCase.title || "Your Current Case",
                  category: activeCase.category || "civil-dispute",
                  jurisdiction: activeCase.jurisdiction || "India",
                  facts: (activeCase.facts || []).map((f) => f.statement || f),
                });
              }}
              style={{
                cursor: "pointer",
                padding: "4px 10px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--black)",
                background: "var(--white)",
                color: "var(--black)",
                fontWeight: 700,
                fontSize: "0.72rem",
                fontFamily: "var(--mono)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              ★ Active Workspace: {activeCase.title}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <span style={{ fontSize: "2.5rem", display: "block", marginBottom: 16 }}>⚔️</span>
            <Loading label="Opposing counsel is dissecting evidence and formulating cross-examination traps..." />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            {/* 1. Opposing Counsel's Core Theory of the Case */}
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderLeft: "4px solid var(--black)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 24px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 10,
                }}
              >
                <div>
                  <span className="badge-note" style={{ margin: 0 }}>
                    Adversarial Trial Theory
                  </span>
                  <h3 style={{ margin: "2px 0 0", color: "var(--black)", fontSize: "1.15rem", fontFamily: "var(--serif)" }}>
                    Opposing Counsel's Core Argument
                  </h3>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.68rem",
                    padding: "3px 8px",
                    borderRadius: "var(--radius)",
                    background: "var(--gray-100)",
                    color: "var(--black)",
                    fontWeight: 700,
                  }}
                >
                  HOSTILE POSITION
                </span>
              </div>
              <div style={{ fontSize: "0.95rem", lineHeight: 1.68, color: "var(--text)" }}>
                {simulationData?.opposingTheory || selectedPreset.opponentTheory}
              </div>
            </div>

            {/* 2-Column: Vulnerable Facts vs BSA Section 63 Electronic Evidence Attacks */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Vulnerable Facts */}
              <div
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <span className="badge-note" style={{ margin: 0 }}>
                      Targeted Vulnerabilities
                    </span>
                    <h3 style={{ margin: "2px 0 0", fontSize: "1.08rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                      Vulnerable Facts
                    </h3>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: "var(--radius)",
                      background: "var(--gray-100)",
                      color: "var(--black)",
                      fontWeight: 600,
                    }}
                  >
                    WEAK SPOTS
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(simulationData?.vulnerableFacts || [
                    {
                      fact: "Locked out of Greater Kailash residence on 20 June 2024",
                      vulnerability: "Property is solely registered in mother-in-law's name",
                      howOpponentWillExploit:
                        "Opponent will move an application under S.R. Batra v. Taruna Batra claiming applicant has no right of residence in separate property of in-laws.",
                    },
                    {
                      fact: "Police complaint filed on 28 August 2024 (74-day gap)",
                      vulnerability: "Unexplained delay between assault and first report",
                      howOpponentWillExploit:
                        "Defense counsel will argue that the delay indicates fabrication and afterthought.",
                    },
                  ]).map((vf, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 14px",
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius)",
                        borderLeft: "3px solid var(--black)",
                        border: "1px solid var(--border)",
                        fontSize: "0.86rem",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--black)" }}>{vf.fact}</div>
                      <div style={{ color: "var(--text-soft)", marginTop: 4, fontSize: "0.8rem" }}>
                        <b style={{ color: "var(--black)" }}>Vulnerability:</b> {vf.vulnerability}
                      </div>
                      <div style={{ color: "var(--text-soft)", marginTop: 2, fontSize: "0.8rem" }}>
                        <b style={{ color: "var(--black)" }}>Opponent Strategy:</b> {vf.howOpponentWillExploit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BSA Section 63 Evidence Attack Simulator */}
              <div
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <span className="badge-note" style={{ margin: 0 }}>
                      Admissibility Challenges
                    </span>
                    <h3 style={{ margin: "2px 0 0", fontSize: "1.08rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                      BSA S. 63 Evidence Attacks
                    </h3>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: "var(--radius)",
                      background: "var(--gray-100)",
                      color: "var(--black)",
                      fontWeight: 600,
                    }}
                  >
                    SEC. 65B SUCCESSOR
                  </span>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-soft)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Opposing counsel routinely challenges WhatsApp chats, screenshots, and audio recordings under Bharatiya Sakshya Adhiniyam Section 63:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    {
                      item: "WhatsApp Chat Screenshots",
                      status: "EXCLUSION RISK",
                      reason: "Without Section 63(4) Certificate from device custodian, secondary electronic records are strictly inadmissible under Arjun Panditrao Khotkar.",
                      remedy: "Obtain sworn affidavit certificate specifying hash and device details.",
                    },
                    {
                      item: "Audio Call Recordings",
                      status: "CHAIN OF CUSTODY",
                      reason: "Defense will allege voice tampering or unverified provenance under BSA s. 63(2).",
                      remedy: "Preserve original recording handset without transfer or editing.",
                    },
                  ].map((ea, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 14px",
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius)",
                        borderLeft: "3px solid var(--black)",
                        border: "1px solid var(--border)",
                        fontSize: "0.84rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span style={{ color: "var(--black)" }}>{ea.item}</span>
                        <span style={{ color: "var(--text-faint)", fontSize: "0.72rem", fontFamily: "var(--mono)" }}>{ea.status}</span>
                      </div>
                      <p style={{ margin: "4px 0 0", color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        {ea.reason}
                      </p>
                      <p style={{ margin: "4px 0 0", color: "var(--text-soft)", fontSize: "0.78rem" }}>
                        <b style={{ color: "var(--black)" }}>Counter-Measure:</b> {ea.remedy}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Interactive Cross-Examination Drill */}
            <div
              style={{
                background: "var(--white)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "24px 28px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 14,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <span className="badge-note" style={{ margin: 0 }}>
                    Witness Stand Drill
                  </span>
                  <h3 style={{ margin: "2px 0 0", fontSize: "1.18rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                    Interactive Cross-Examination Drill
                  </h3>
                  <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "var(--text-soft)" }}>
                    Practice answering hostile questions under Indian courtroom scrutiny before trial
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {crossExamQuestions.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setActiveQuestionIdx(idx);
                        setExamEvaluation(null);
                        setUserExamAnswer("");
                      }}
                      style={{
                        cursor: "pointer",
                        padding: "4px 10px",
                        borderRadius: "var(--radius)",
                        border: `1px solid ${activeQuestionIdx === idx ? "var(--black)" : "var(--border)"}`,
                        background: activeQuestionIdx === idx ? "var(--black)" : "var(--white)",
                        color: activeQuestionIdx === idx ? "var(--white)" : "var(--text-soft)",
                        fontSize: "0.72rem",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                      }}
                    >
                      Question {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Cross-Examination Question */}
              <div
                style={{
                  background: "var(--gray-50)",
                  border: "1px solid var(--border)",
                  borderLeft: "4px solid var(--black)",
                  padding: "18px 22px",
                  borderRadius: "var(--radius)",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: "var(--text-faint)", fontWeight: 700, fontSize: "0.74rem", fontFamily: "var(--mono)", textTransform: "uppercase" }}>
                    Opposing Counsel Asks:
                  </span>
                </div>
                <p style={{ fontSize: "1.05rem", margin: 0, fontStyle: "italic", lineHeight: 1.6, color: "var(--black)", fontFamily: "var(--serif)" }}>
                  "{crossExamQuestions[activeQuestionIdx]?.question}"
                </p>
                <div style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--text-soft)", fontFamily: "var(--mono)" }}>
                  <span style={{ color: "var(--black)", fontWeight: 700 }}>Targeted Vulnerability:</span> {crossExamQuestions[activeQuestionIdx]?.expectedWeakness}
                </div>
              </div>

              {/* Practice Input Box */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    marginBottom: 8,
                    color: "var(--black)",
                    fontFamily: "var(--mono)",
                    textTransform: "uppercase",
                  }}
                >
                  Type Your Courtroom Deposition:
                </label>
                <textarea
                  rows={3}
                  value={userExamAnswer}
                  onChange={(e) => setUserExamAnswer(e.target.value)}
                  placeholder="How would you answer the judge and opposing counsel? (e.g., 'Between June and August, community elders were attempting mediation before I approached the police...')"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    background: "var(--white)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => handleEvaluateCrossExam(crossExamQuestions[activeQuestionIdx]?.question)}
                    disabled={!userExamAnswer.trim()}
                  >
                    Evaluate Answer →
                  </button>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-soft)", fontStyle: "italic" }}>
                    Recommended Strategy: {crossExamQuestions[activeQuestionIdx]?.counterStrategy}
                  </span>
                </div>
              </div>

              {/* Evaluation Card */}
              {examEvaluation ? (
                <div
                  style={{
                    marginTop: 18,
                    background: "var(--gray-50)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--black)" }}>{examEvaluation.verdict}</span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: "0.72rem",
                        background: "var(--black)",
                        color: "var(--white)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius)",
                      }}
                    >
                      {examEvaluation.score}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0", fontSize: "0.86rem", color: "var(--text)", lineHeight: 1.55 }}>
                    <b style={{ color: "var(--black)" }}>Courtroom Guidance:</b> {examEvaluation.guidance}
                  </p>
                </div>
              ) : null}
            </div>

            {/* 4. Adverse Precedents & What-If Scenario Tester */}
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20 }}>
              {/* Adverse Precedents */}
              <div
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <span className="badge-note" style={{ margin: 0 }}>
                      Opposition Case Law
                    </span>
                    <h3 style={{ margin: "2px 0 0", fontSize: "1.12rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                      Adverse Precedents They Will Cite
                    </h3>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: "var(--radius)",
                      background: "var(--gray-100)",
                      color: "var(--black)",
                      fontWeight: 600,
                    }}
                  >
                    JUDICIAL TRAPS
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    {
                      name: "S. R. Batra v. Taruna Batra (2007) 3 SCC 169",
                      held: "Wife is entitled to claim residence only in shared household of husband, not in house exclusively belonging to mother-in-law.",
                      distinction:
                        "Distinguish by citing Satish Chander Ahuja v. Sneha Ahuja (2020) 10 SCC 786 which overruled the rigid Batra definition and grants residence rights where woman lived in domestic relationship.",
                    },
                    {
                      name: "Bimla Devi v. State of Haryana (2009)",
                      held: "Standard of proof in civil and motor claims is preponderance of probabilities, but fraudulent or exaggerated claims without documentary corroboration must be dismissed.",
                      distinction:
                        "Counter by showing contemporaneous bank debit alerts and hospital registration receipts.",
                    },
                  ].map((p, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 14px",
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius)",
                        fontSize: "0.84rem",
                        borderLeft: "3px solid var(--black)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "var(--black)", fontFamily: "var(--serif)" }}>{p.name}</div>
                      <p style={{ margin: "5px 0 0", color: "var(--text-soft)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        <b style={{ color: "var(--black)" }}>Opponent Citation:</b> {p.held}
                      </p>
                      <p style={{ margin: "5px 0 0", color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                        <b style={{ color: "var(--black)" }}>Counter-Distinction:</b> {p.distinction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* What-If Sensitivity Tester */}
              <div
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "18px 20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <span className="badge-note" style={{ margin: 0 }}>
                      Sensitivity Tester
                    </span>
                    <h3 style={{ margin: "2px 0 0", fontSize: "1.12rem", color: "var(--black)", fontFamily: "var(--serif)" }}>
                      "What-If" Sensitivity Simulator
                    </h3>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: "var(--radius)",
                      background: "var(--gray-100)",
                      color: "var(--black)",
                      fontWeight: 600,
                    }}
                  >
                    DYNAMIC STRESS TEST
                  </span>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-soft)", margin: "0 0 12px" }}>
                  Test how the opponent's strategy shifts if facts change:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    type="text"
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    placeholder="e.g., What if the opponent claims a mutual divorce compromise was signed?"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius)",
                      background: "var(--white)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text)",
                      fontSize: "0.84rem",
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => runAdversarialSimulation(customScenario)}
                    disabled={loading || !customScenario.trim()}
                  >
                    Simulate What-If Scenario →
                  </button>

                  <div
                    style={{
                      background: "var(--gray-50)",
                      padding: "14px 16px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      fontSize: "0.8rem",
                      marginTop: 6,
                    }}
                  >
                    <b style={{ color: "var(--black)", fontFamily: "var(--mono)", fontSize: "0.74rem", textTransform: "uppercase" }}>
                      Ranked Next Move Prediction:
                    </b>
                    <ol style={{ margin: "8px 0 0", paddingLeft: 16, color: "var(--text)", lineHeight: 1.6 }}>
                      <li>Filing Section 340 CrPC / 379 BNSS perjury notice to intimidate.</li>
                      <li>Seeking stay on interim maintenance under Order 39 CPC.</li>
                      <li>Challenging territorial jurisdiction of Magistrate court.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
