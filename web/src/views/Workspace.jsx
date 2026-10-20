import { useMemo, useState } from "react";
import { Icon, Meter, Notice, Panel, Tag, Empty } from "../ui.jsx";

function AiBadge({ llm, compact }) {
  const live = llm?.mode === "ai" && llm?.ok;
  const title = live
    ? `Live model analysis via ${llm.provider} (${llm.model})`
    : `Deterministic output - no model was used${
        llm?.message ? `: ${llm.message}` : ""
      }`;

  return (
    <span
      className={`tag ${live ? "tag--strong" : "tag--plain"}`}
      title={title}
      style={{ cursor: "help" }}
    >
      <Icon name={live ? "check" : "lock"} size={11} />
      {compact
        ? live
          ? "AI assisted"
          : "Verified sources only"
        : live
          ? `Live AI analysis - ${llm.provider} / ${llm.model}`
          : "Deterministic - corpus only"}
    </span>
  );
}

function AiBlock({ llm }) {
  const r = llm?.result;
  if (!r) return null;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {r.caseSummary ? (
        <Panel
          title="Case summary, written from your account"
          icon="doc"
          sub="Generated from your narrative plus the retrieved sources"
          right={<AiBadge llm={llm} compact />}
        >
          <p style={{ fontSize: "0.92rem", lineHeight: 1.68, color: "var(--ink)", margin: 0 }}>
            {r.caseSummary}
          </p>
        </Panel>
      ) : null}

      <div className="grid-2">
        <Panel title="Issues identified" icon="layers" right={<AiBadge llm={llm} compact />}>
          {r.keyIssues?.length ? (
            <ul className="gaps">
              {r.keyIssues.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.86rem", color: "var(--ink-faint)", margin: 0 }}>
              The model did not return any.
            </p>
          )}
        </Panel>

        <Panel title="What we still need to know" icon="search" right={<AiBadge llm={llm} compact />}>
          {r.missingInformation?.length ? (
            <ul className="gaps">
              {r.missingInformation.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.86rem", color: "var(--ink-faint)", margin: 0 }}>
              The model did not identify anything missing.
            </p>
          )}
        </Panel>
      </div>

      {r.actionSuggestions?.length ? (
        <Panel title="Suggested next steps" icon="route" right={<AiBadge llm={llm} compact />}>
          {r.actionSuggestions.map((a, i) => (
            <div
              key={i}
              style={{ padding: "12px 0", borderBottom: i < r.actionSuggestions.length - 1 ? "1px solid var(--ivory-200)" : 0 }}
            >
              <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: "0.89rem", color: "var(--navy-800)" }}>
                {a.step}
              </p>
              {a.why ? (
                <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--ink-soft)", lineHeight: 1.55 }}>
                  {a.why}
                </p>
              ) : null}
            </div>
          ))}
          <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 12, marginBottom: 0 }}>
            These sit alongside the Action Plan, which is the version to follow because every step in
            it is tied to a source record.
          </p>
        </Panel>
      ) : null}

      {r.evidenceToGather?.length ? (
        <Panel title="Additional evidence worth keeping" icon="doc" right={<AiBadge llm={llm} compact />}>
          <ul className="gaps">
            {r.evidenceToGather.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {r.uncertainty ? (
        <Notice tone="warn" title="What the model could not confirm">
          <p>{r.uncertainty}</p>
        </Notice>
      ) : null}

      <Notice tone="info" title="How to read this section">
        <p>
          The model was given only the provisions and decisions retrieved for your narrative, and was
          instructed to use nothing else. Anything it produced that referenced a statute not in that
          list was stripped out. Identity, wording and deadlines still come from the corpus, never
          from the model. It has not been checked by a lawyer.
        </p>
      </Notice>
    </div>
  );
}

/* ==========================================================================
   Tab 1 — Overview
   ========================================================================== */

function Overview({ data }) {
  const { summary, classification, facts, uncertainty, applicability, stats, language, llm } = data;

  return (
    <div className="grid-2">
      <div>
        <Panel title="Case summary" icon="doc" sub="Assembled from your own words only">
          <p style={{ fontSize: "0.94rem", lineHeight: 1.66, color: "var(--ink)" }}>
            {summary.aiSummary || summary.opening}
          </p>

          {summary.aiSummary ? (
            <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 0 }}>
              <Tag tone="strong">Machine paraphrase</Tag>{" "}
              {llm?.notices?.[0] ||
                "Restates the facts you entered. No section, citation or deadline is taken from this text."}
            </p>
          ) : null}

          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 14,
              margin: "16px 0 0",
              padding: "14px 16px",
              background: "var(--ivory-100)",
              borderRadius: "var(--radius)",
            }}
          >
            {[
              ["Issue type", summary.issueType],
              ["Language", language.label],
              ["Narrative", `${stats.words} words, ${stats.sentences} sentences`],
              [
                "Dated events",
                `${data.timeline.total} found${data.timeline.uncertainCount ? `, ${data.timeline.uncertainCount} uncertain` : ""}`,
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt
                  style={{
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.09em",
                    color: "var(--ink-faint)",
                    marginBottom: 2,
                  }}
                >
                  {k}
                </dt>
                <dd style={{ margin: 0, fontSize: "0.855rem", color: "var(--navy-800)", fontWeight: 500 }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          title="Important facts identified"
          icon="layers"
          sub="Every line below is a sentence from your narrative. Nothing has been added to your account."
          right={<Tag tone="plain">{facts.length} of {stats.sentences} sentences</Tag>}
          flush
        >
          {facts.length ? (
            <div>
              {facts.map((f, i) => (
                <div className="fact" key={i}>
                  <span className="fact__rank">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="fact__text">{f.text}</p>
                    <p className="fact__why">
                      {f.why} · relevance {Math.round(f.relevance * 100)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No facts could be extracted">
              The narrative was too short or too general. Add what was done, by whom, and when.
            </Empty>
          )}
        </Panel>

        <Panel title="How this issue was classified" icon="search" sub="Issue types matched against your narrative">
          {classification.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "13px 0",
                borderBottom: "1px solid var(--ivory-200)",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--navy-800)", fontSize: "0.9rem" }}>
                  {c.label} <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>{c.labelHi}</span>
                </p>
                <p style={{ margin: "3px 0 0", fontSize: "0.79rem", color: "var(--ink-soft)" }}>
                  {c.reason}
                  {c.matchedSignals?.length ? ` — matched: ${c.matchedSignals.join(", ")}` : ""}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: "0.77rem", color: "var(--ink-faint)" }}>
                  Forum: {c.forum}
                </p>
              </div>
              {c.score !== null && c.score !== undefined ? (
                <Tag tone={c.score >= 4 ? "strong" : "moderate"}>score {c.score}</Tag>
              ) : (
                <Tag tone="core">your choice</Tag>
              )}
            </div>
          ))}
        </Panel>
      </div>

      <div>
        <Panel title="How well we could cover this" icon="clock" sub="Our own assessment, not a guarantee">
          <Meter
            score={uncertainty.reliability.score}
            band={uncertainty.reliability.band}
            label={uncertainty.reliability.label}
          />
          <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: 12, marginBottom: 8 }}>
            {uncertainty.reliability.explanation}
          </p>
          <ul className="factors">
            {uncertainty.reliability.factors.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Panel>

        {data.hiddenFacts?.length ? (
          <Panel
            title="What your account implies, and what it leaves out"
            icon="alert"
            sub="Each item is tied to words you wrote, or to something we could not find"
          >
            <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Courts turn on details that people leave out of their own account. These are the ones your
              narrative points at, and the ones it does not. Nothing here is asserted that you did not
              write.
            </p>
            <ul className="hiddenfacts">
              {data.hiddenFacts.map((h) => (
                <li key={h.id} className={`hiddenfact hiddenfact--${h.kind}`}>
                  <div className="hiddenfact__head">
                    <Tag tone={h.kind === "implied" ? "strong" : "moderate"}>
                      {h.kind === "implied" ? "implied" : "missing"}
                    </Tag>
                    <b>{h.label}</b>
                  </div>
                  <p className="hiddenfact__detail">{h.detail}</p>
                  <p className="hiddenfact__basis">{h.basis}</p>
                  {h.evidence ? <q className="hiddenfact__quote">{h.evidence}</q> : null}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="What we could not establish" icon="alert">
          {uncertainty.gaps.length ? (
            <ul className="gaps">
              {uncertainty.gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.86rem", color: "var(--ink-soft)", margin: 0 }}>
              Nothing material was missing from the narrative.
            </p>
          )}
        </Panel>

        {applicability?.note ? (
          <Panel title="Which law applies" icon="scale">
            <p style={{ fontSize: "0.865rem", color: "var(--ink-soft)", margin: 0, lineHeight: 1.62 }}>
              {applicability.note}
            </p>
          </Panel>
        ) : null}

        <Panel title="Where to go" icon="route">
          {classification.slice(0, 2).map((c) => (
            <div key={c.id} style={{ marginBottom: 14 }}>
              <p style={{ margin: "0 0 3px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brass-600)", fontWeight: 600 }}>
                {c.label}
              </p>
              <p style={{ margin: 0, fontSize: "0.865rem", color: "var(--ink-soft)" }}>{c.forum}</p>
              {c.emergency ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--clay-600)" }}>
                  {c.emergency}
                </p>
              ) : null}
            </div>
          ))}
        </Panel>

        {data.uncertainty.aiUncertainty ? (
          <Notice tone="warn" title="Additional uncertainty flagged by the model">
            <p>{data.uncertainty.aiUncertainty}</p>
          </Notice>
        ) : null}

        <Notice tone="info" title="Before you use this">
          <p>
            A match between a provision and your facts is a starting point, not a conclusion. Courts
            decide these questions on evidence, and a lawyer has to weigh what we have not read.
          </p>
        </Notice>
      </div>
    </div>
  );
}

/* ==========================================================================
   Tab 2 — Timeline and evidence
   ========================================================================== */

function TimelineEvidence({ data, checked, onToggleEvidence }) {
  const [filter, setFilter] = useState("all");
  const events = data.timeline.events;
  const shown = filter === "all" ? events : events.filter((e) => !e.needsReview !== (filter === "certain"));
  const held = data.evidence.filter((e) => checked.has(e.item) || e.suggestedHeld).length;

  return (
    <div className="grid-2">
      <div>
        <Panel
          title="Chronological timeline"
          icon="clock"
          sub={`${events.length} dated event${events.length === 1 ? "" : "s"} read from your narrative`}
          right={
            events.length > 1 ? (
              <div className="langbar">
                <button type="button" data-on={filter === "all"} onClick={() => setFilter("all")}>
                  All
                </button>
                <button
                  type="button"
                  data-on={filter === "certain"}
                  onClick={() => setFilter("certain")}
                >
                  Certain
                </button>
                <button
                  type="button"
                  data-on={filter === "check"}
                  onClick={() => setFilter("check")}
                >
                  Check these
                </button>
              </div>
            ) : null
          }
          flush
        >
          {shown.length ? (
            <div className="tl">
              {shown.map((e, i) => (
                <div className="tl__item" key={`${e.date}-${i}`}>
                  <div className="tl__date">
                    {new Date(e.date + "T00:00:00Z")
                      .toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                      .replace(/^(\d+)/, "$1")}
                    <small>{e.dateText}</small>
                    {e.needsReview ? (
                      <small style={{ color: "var(--clay-600)", marginTop: 3 }}>
                        check this date
                      </small>
                    ) : null}
                  </div>
                  <div className="tl__node">
                    <span className="tl__line" />
                    <span className={`tl__dot${e.needsReview ? " tl__dot--uncertain" : ""}`} />
                  </div>
                  <p className="tl__text">{e.event}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No dates were found" icon="clock">
              The workspace could not build a timeline. Add dates to the narrative — even approximate
              ones help, and anything uncertain is marked.
            </Empty>
          )}
        </Panel>

        {data.timeline.uncertainCount > 0 ? (
          <Notice tone="warn" title="Some dates are ambiguous">
            <p>
              {data.timeline.uncertainCount} entr{data.timeline.uncertainCount === 1 ? "y is" : "ies are"}{" "}
              based on a bare year or on a numeric date that could be read two ways, such as 03/04/2026.
              Confirm them before relying on the order of events.
            </p>
          </Notice>
        ) : null}
      </div>

      <div>
        <Panel
          title="Evidence you can gather"
          icon="doc"
          sub="Tick what you already have. Suggested items are ones your narrative mentions."
          right={
            <Tag tone={held === data.evidence.length ? "strong" : "moderate"}>
              {held}/{data.evidence.length}
            </Tag>
          }
          flush
        >
          {data.evidence.length ? (
            <div>
              {data.evidence.map((e) => {
                const id = checked.has(e.item) || e.suggestedHeld;
                return (
                  <label className="ev" key={e.item} data-held={String(id)}>
                    <input
                      type="checkbox"
                      checked={id}
                      onChange={() => onToggleEvidence(e.item)}
                    />
                    <div className="ev__body">
                      <p className="ev__item">{e.item}</p>
                      <p className="ev__meta">
                        <b>Where from:</b> {e.source}
                        {e.suggestedHeld ? (
                          <span className="ev__suggest"> · your narrative mentions this</span>
                        ) : null}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <Empty title="No evidence list for this issue type yet">
              The checklist is derived from the issue category. Choose a different category in intake
              if this does not fit.
            </Empty>
          )}
        </Panel>

        <Panel title="Questions that would change the answer" icon="search" sub="Answering these is the fastest way to get a better result">
          <ul className="gaps">
            {data.followUps.slice(0, 6).map((q, i) => (
              <li key={i}>
                {q.question}
                <span style={{ display: "block", fontSize: "0.73rem", color: "var(--ink-faint)" }}>
                  {q.forIssue}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/* ==========================================================================
   Tab 3 — Legal research
   ========================================================================== */

function ProvisionCard({ p }) {
  const tone =
    p.relevance === "strong"
      ? "strong"
      : p.relevance === "core-for-this-issue"
        ? "core"
        : p.relevance === "moderate"
          ? "moderate"
          : "weak";

  const label =
    p.relevance === "core-for-this-issue"
      ? "core for this issue"
      : p.relevance;

  return (
    <article className="prov">
      <div className="prov__top">
        <span className="prov__num">s. {p.section}</span>
        <div className="prov__head">
          <p className="prov__act">{p.actShortTitle || p.act}</p>
          <h4 className="prov__title">{p.heading}</h4>
          <p className="prov__summary">{p.summary}</p>
          {p.whyItMatters ? (
            <p className="prov__why">
              <b>Why it matters. </b>
              {p.whyItMatters}
            </p>
          ) : null}

          {p.aiWhy ? (
            <p
              className="prov__why"
              style={{ background: "var(--ivory-100)", borderLeftColor: "var(--navy-600)", color: "var(--ink-soft)" }}
            >
              <b style={{ color: "var(--navy-700)" }}>Why this may apply to your facts. </b>
              {p.aiWhy}
              <span style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-faint)", marginTop: 5 }}>
                Machine-generated explanation, not checked by a lawyer.
              </span>
            </p>
          ) : null}
          {p.repealedAct ? (
            <p style={{ fontSize: "0.76rem", color: "var(--ink-faint)", margin: "0 0 9px" }}>
              Replaced the {p.repealedAct} section numbering from 1 July 2024.
            </p>
          ) : null}

          <div className="prov__foot">
            {p.sourceUrl ? (
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                {p.sourceLabel || "Official text"} ↗
              </a>
            ) : null}
            {p.fromIssueCategory ? <span>Matched via: {p.fromIssueCategory}</span> : null}
          </div>

          {p.matchedTerms?.length ? (
            <div className="prov__terms">
              {p.matchedTerms.slice(0, 8).map((t) => (
                <span className="prov__term" key={t}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="prov__side">
          <Tag tone={tone} title="Strength of the textual match">
            {label}
          </Tag>
          {p.score !== null && p.score !== undefined ? (
            <span className="prov__score">{p.score.toFixed(3)}</span>
          ) : (
            <span className="prov__score">by rule</span>
          )}
        </div>
      </div>
    </article>
  );
}

const EDGE_LABELS = {
  "same-filing-step": "cited in one filing",
  "same-issue-cross-statute": "same issue, two statutes",
  "shared-legal-vocabulary": "same conduct, two enactments",
  curated: "linked in the knowledge base",
};

/**
 * The cross-statute graph: which section of one Act connects to which section of
 * another, and why. Every link carries the reason it exists rather than asking
 * the reader to take the connection on trust.
 */
function CrossStatuteGraph({ graph }) {
  const [openEdge, setOpenEdge] = useState(null);
  if (!graph?.nodes?.length || !graph?.edges?.length) return null;

  const labelOf = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return id;
    return `s. ${n.section}`;
  };
  const shortAct = (id) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return "";
    return (n.actShortTitle || n.act || "").split(",")[0].replace("The ", "");
  };

  return (
    <Panel
      title="How these sections connect"
      icon="route"
      sub={`${graph.stats.edges} link${graph.stats.edges === 1 ? "" : "s"} across ${graph.stats.statuteCount} statutes`}
    >
      <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginTop: 0 }}>
        {graph.note}
      </p>

      <div className="graphstatutes">
        {graph.stats.statutes.map((a) => (
          <span key={a}>{a}</span>
        ))}
      </div>

      <ul className="graphedges">
        {graph.edges.map((e, i) => {
          const isOpen = openEdge === i;
          return (
            <li key={`${e.source}-${e.target}-${e.kind}`}>
              <button type="button" onClick={() => setOpenEdge(isOpen ? null : i)}>
                <span className="graphedges__pair">
                  <b>{labelOf(e.source)}</b>
                  <span className="graphedges__acts">
                    {shortAct(e.source)} &rarr; {shortAct(e.target)}
                  </span>
                </span>
                <span className="graphedges__why">
                  {isOpen ? e.why : (EDGE_LABELS[e.kind] || e.kind)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="graphnote">
        A link is not an argument. It means two sections were found to address the same conduct, were
        cited in the same step, or share distinctive legal vocabulary — and the reason is shown so you
        can disagree with it.
      </p>
    </Panel>
  );
}

/** The written applications a self-represented person actually files. */
function FormsPanel({ forms, meta }) {
  if (!forms?.length) return null;
  return (
    <Panel
      title="Forms and written applications"
      icon="doc"
      sub={`${forms.length} paper${forms.length === 1 ? "" : "s"} to file or ask for`}
    >
      {forms.map((f) => (
        <div key={f.id} className="formcard">
          <div className="formcard__head">
            <h4>{f.name}</h4>
            {f.section ? (
              <span className="formcard__sec">
                {f.statute}
                {f.section ? `, s. ${f.section}` : ""}
              </span>
            ) : (
              <span className="formcard__sec">{f.statute}</span>
            )}
          </div>

          <dl className="formcard__rows">
            <div>
              <dt>Where</dt>
              <dd>{f.forum}</dd>
            </div>
            <div>
              <dt>How to get it</dt>
              <dd>{f.howToGet}</dd>
            </div>
            {f.canAskTogether?.length ? (
              <div>
                <dt>Ask together</dt>
                <dd>{f.canAskTogether.join(" · ")}</dd>
              </div>
            ) : null}
            {f.whatToAttach?.length ? (
              <div>
                <dt>Take with you</dt>
                <dd>{f.whatToAttach.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>

          {f.note ? <p className="formcard__note">{f.note}</p> : null}
          {f.verifyWith ? (
            <p className="formcard__verify">Confirm with: {f.verifyWith}</p>
          ) : null}
          {f.forIssue ? (
            <p className="formcard__verify">Also applies to: {f.forIssue}</p>
          ) : null}
        </div>
      ))}
      <p className="graphnote">
        These describe the application and where it goes. The prescribed form is set by each State and
        changes — ask the court or the legal aid desk for the current one before you file.
      </p>
    </Panel>
  );
}

function LegalResearch({ data, meta }) {
  const [filter, setFilter] = useState("all");
  const actsUsed = useMemo(() => {
    const set = new Set(data.provisions.map((p) => p.act));
    return [...set];
  }, [data.provisions]);

  const shown =
    filter === "all" ? data.provisions : data.provisions.filter((p) => p.act === filter);

  return (
    <>
      {data.retrievalNote ? (
        <Notice tone="warn" title="Retrieval engine unavailable">
          <p>{data.retrievalNote}</p>
        </Notice>
      ) : null}

      <Notice tone="info" title="How these were matched">
        <p>
          Two retrievers run over the same bundled corpus and their scores are blended. The first is
          sparse TF-IDF, which is exact about statutory wording. The second is a 384-dimension
          multilingual sentence-embedding model, which scores meaning — so a narrative that never uses
          the word &ldquo;cruelty&rdquo; can still reach the section about cruelty. Neither reads your case and
          decides what applies; both are matching over a fixed corpus. A weak match is labelled weak,
          and a provision central to the issue type is marked as such even if the wording barely
          overlaps.
        </p>
      </Notice>

      <div className="grid-2">
        <div>
          <Panel
            title="Potentially applicable provisions"
            icon="scale"
            sub={`${data.provisions.length} sections across ${actsUsed.length} statute${actsUsed.length === 1 ? "" : "s"}`}
            right={
              actsUsed.length > 1 ? (
                <div className="langbar">
                  <button type="button" data-on={filter === "all"} onClick={() => setFilter("all")}>
                    All
                  </button>
                  {actsUsed.map((a) => (
                    <button key={a} type="button" data-on={filter === a} onClick={() => setFilter(a)}>
                      {(meta?.acts?.[a]?.shortTitle || a).split(",")[0].replace("The ", "")}
                    </button>
                  ))}
                </div>
              ) : null
            }
            flush
          >
            {shown.length ? (
              shown.map((p) => <ProvisionCard key={p.id} p={p} />)
            ) : (
              <Empty title="No provision could be matched" icon="book">
                Nothing in the bundled corpus matched this narrative on the legal families involved.
                We would rather show nothing than show a provision that does not apply.
              </Empty>
            )}
          </Panel>
        </div>

        <div>
          <Panel
            title="Judgments that may help"
            icon="book"
            sub="Real reported decisions, with the citation. Verify before you rely on any of them."
            flush
          >
            {data.judgments.length ? (
              data.judgments.map((j) => (
                <article className="judg" key={j.id}>
                  <h4 className="judg__cite">{j.title}</h4>
                  <p className="judg__court">
                    <span>{j.citation}</span>
                    <span>{j.court}</span>
                    <span>{j.year}</span>
                    {j.bench ? <span>{j.bench}</span> : null}
                  </p>

                  <div className="judg__block">
                    <b>Facts it turned on</b>
                    <p>{j.factsPattern}</p>
                  </div>
                  {j.ratio ? (
                    <div className="judg__block judg__block--ratio">
                      <b>The principle it stands for</b>
                      <p>{j.ratio}</p>
                      <span className="judg__ratio-note">
                        Distilled from the holding recorded in our corpus. Read the full judgment before
                        you put this in front of a court.
                      </span>
                    </div>
                  ) : null}
                  <div className="judg__block">
                    <b>What the Court held — our paraphrase, not its words</b>
                    <p>{j.holding}</p>
                  </div>
                  <div className="judg__block">
                    <b>Why we surfaced it</b>
                    <p>{j.relevance}</p>
                  </div>
                  {j.aiWhy ? (
                    <div className="judg__block">
                      <b>How this may relate to your facts — machine-generated</b>
                      <p>{j.aiWhy}</p>
                    </div>
                  ) : null}

                  <div className="judg__foot">
                    <Tag tone={j.relevance === "strong" ? "strong" : j.relevance === "moderate" ? "moderate" : "weak"}>
                      {j.relevance} match
                    </Tag>
                    <a href={j.verifyUrl} target="_blank" rel="noreferrer">
                      Verify this citation ↗
                    </a>
                    <span style={{ color: "var(--ink-faint)" }}>
                      match {j.score?.toFixed(3)}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="No decision in our corpus matched" icon="book">
                The corpus holds 14 well-known decisions. None matched your fact pattern. We do not
                substitute an unrelated case to fill the space — search Indian Kanoon yourself, or
                ask a lawyer to run a proper citation search.
              </Empty>
            )}
          </Panel>

          {data.forms?.length ? <FormsPanel forms={data.forms} meta={meta} /> : null}

          {data.crossForms?.length ? <FormsPanel forms={data.crossForms} meta={meta} /> : null}

          <CrossStatuteGraph graph={data.graph} />

          <Panel title="Our knowledge base" icon="info">
            <p style={{ fontSize: "0.84rem", color: "var(--ink-soft)", marginBottom: 10 }}>
              {meta?.provisionsMeta?.description}
            </p>
            <ul className="gaps">
              <li>{meta?.provisionsMeta?.verificationNote}</li>
              <li>{meta?.judgmentsMeta?.limitation}</li>
            </ul>
            <p style={{ fontSize: "0.78rem", color: "var(--ink-faint)", marginTop: 10, marginBottom: 0 }}>
              Retrieval engine: {data.uncertainty.engine}
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ==========================================================================
   Tab 4 — Action plan
   ========================================================================== */

function Step({ step, done, onToggle, isCross }) {
  return (
    <article className="step" data-done={String(done)}>
      <div className="step__rail">
        <span className="step__n">{done ? <Icon name="check" size={12} /> : step.order}</span>
        <input
          className="step__tick"
          type="checkbox"
          checked={done}
          onChange={() => onToggle(step.title)}
          aria-label={`Mark step ${step.order} complete`}
        />
      </div>
      <div className="step__body">
        <h4 className="step__title">{step.title}</h4>
        {isCross ? (
          <p style={{ fontSize: "0.74rem", color: "var(--brass-600)", fontWeight: 600, margin: "0 0 7px" }}>
            Also relevant if this is also a {step.forIssue?.toLowerCase()} matter
          </p>
        ) : null}

        <p className="step__why">{step.why}</p>

        {step.deadline ? (
          <p className={`deadline${step.deadlineKind === "advisory" ? " deadline--advisory" : ""}`}>
            <b>
              {step.deadlineKind === "from-source" ? "Time limit from the statute" : "On timing"}
            </b>
            {step.deadline}
          </p>
        ) : null}

        {step.steps ? <p className="step__sub">{step.steps}</p> : null}

        <dl className="step__dl">
          <div>
            <dt>Documents</dt>
            <dd>{step.evidenceNeeded}</dd>
          </div>
        </dl>

        {step.provisionRefs?.length || step.channelRefs?.length ? (
          <div className="step__refs">
            {step.provisionRefs?.map((r) => (
              <a
                key={r.id}
                className="tag tag--plain"
                href={r.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title={r.heading}
                style={{ textDecoration: "none" }}
              >
                {r.label}
              </a>
            ))}
            {step.channelRefs?.map((c) => (
              <a
                key={c.id}
                className="tag tag--moderate"
                href={c.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "none" }}
                title={c.when}
              >
                {c.name}: {c.value}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActionPlan({ data, done, onToggle }) {
  const completed = data.actionPlan.filter((s) => done.has(s.title)).length;
  const pct = data.actionPlan.length ? Math.round((completed / data.actionPlan.length) * 100) : 0;

  const urgent = data.referrals.filter((r) => ["police-112", "cyber-1930", "childline"].includes(r.id));

  return (
    <div className="grid-2">
      <div>
        <Panel
          title="Your pro se roadmap"
          icon="route"
          sub={`${completed} of ${data.actionPlan.length} steps marked done`}
          right={
            <div className="meter" style={{ minWidth: 150 }}>
              <div className="meter__bar">
                <div className="meter__fill meter__fill--good" style={{ width: `${pct}%` }} />
              </div>
              <span className="meter__val">{pct}%</span>
            </div>
          }
          flush
        >
          {data.actionPlan.length ? (
            data.actionPlan.map((s) => (
              <Step key={s.order} step={s} done={done.has(s.title)} onToggle={onToggle} />
            ))
          ) : (
            <Empty title="No action plan for this issue type yet">
              Choose a category at intake and a plan will be produced from the corpus.
            </Empty>
          )}
        </Panel>

        {data.crossStatute?.length ? (
          <Panel
            title="If this is also another kind of problem"
            icon="layers"
            sub="Because more than one issue type matched your narrative"
            flush
          >
            {data.crossStatute.map((s) => (
              <Step key={s.title} step={s} done={done.has(s.title)} onToggle={onToggle} isCross />
            ))}
          </Panel>
        ) : null}
      </div>

      <div>
        <Panel title="Where to get help" icon="phone" sub="Free, and available to anyone entitled under the Legal Services Authorities Act, 1987">
          <div className="refs" style={{ margin: "-20px -20px -20px" }}>
            {urgent.map((r) => (
              <div className="ref ref--urgent" key={r.id}>
                <div>
                  <p className="ref__name">{r.name}</p>
                  <p className="ref__when">{r.when}</p>
                  <p className="ref__note">{r.note}</p>
                </div>
                <a className="ref__value" href={r.sourceUrl} target="_blank" rel="noreferrer">
                  {r.value}
                </a>
              </div>
            ))}
            {data.referrals
              .filter((r) => !["police-112", "cyber-1930", "childline"].includes(r.id))
              .map((r) => (
                <div className="ref" key={r.id}>
                  <div>
                    <p className="ref__name">
                      {r.name} {!r.verified ? <Tag tone="warn">confirm</Tag> : null}
                    </p>
                    <p className="ref__when">{r.when}</p>
                    <p className="ref__note">{r.note}</p>
                  </div>
                  <a className="ref__value" href={r.sourceUrl} target="_blank" rel="noreferrer">
                    {r.value}
                  </a>
                </div>
              ))}
          </div>
        </Panel>

        <Notice tone="warn" title="One thing we will not do">
          <p>
            We will not print a deadline that no source states. Where a period matters and our corpus
            does not fix one, the step says so and tells you who to ask. A wrong date printed
            confidently is worse than an honest gap.
          </p>
        </Notice>

        <Notice tone="info" title="Take this with you">
          <p>
            Print this page and take it to a lawyer or a Legal Services Authority volunteer. The
            printed dossier includes the provisions, the decisions and the evidence list, with the
            source links written out in full.
          </p>
        </Notice>
      </div>
    </div>
  );
}

/* ==========================================================================
   Export
   ========================================================================== */

export function buildPrintDocument(data, form) {
  const L = [];
  const push = (s = "") => L.push(s);

  push("NyayaPath — preliminary case dossier");
  push("=".repeat(64));
  push("");
  push(`Matter:            ${data.summary.headline}`);
  push(`Issue type:        ${data.summary.issueType}`);
  if (data.input.location) push(`Place:             ${data.input.location}`);
  if (data.input.startDate) push(`First incident:    ${data.input.startDate}`);
  push(`Language:          ${data.language.label}`);
  push(`Generated:         ${new Date(data.generatedAt).toLocaleString("en-IN")}`);
  push("");
  push(
    "This dossier was produced by an automated research prototype from a bundled corpus of",
  );
  push(
    "Indian statute. It is legal information, not legal advice, and it is not a conclusion",
  );
  push(
    "about your case. Provision numbers and citations were checked against official sources,",
  );
  push(
    "but the application of the law to your facts has to be assessed by a qualified lawyer.",
  );
  push("");
  push(`Coverage assessment: ${data.uncertainty.reliability.label} (${Math.round(data.uncertainty.reliability.score * 100)}%)`);
  for (const g of data.uncertainty.gaps) push(`  - ${g}`);
  push("");

  push("1. ACCOUNT AS RECORDED");
  push("-".repeat(64));
  push(data.input.narrative);
  push("");

  push("2. FACTS IDENTIFIED (sentences from the account above)");
  push("-".repeat(64));
  data.facts.forEach((f, i) => push(`${i + 1}. ${f.text}`));
  push("");

  push("3. TIMELINE");
  push("-".repeat(64));
  if (data.timeline.events.length) {
    data.timeline.events.forEach((e) =>
      push(`  ${e.date}  [${e.dateText}]${e.needsReview ? "  (CHECK DATE)" : ""}\n      ${e.event}`),
    );
  } else {
    push("  No dates could be read from the account.");
  }
  push("");

  push("4. PROVISIONS THAT MAY APPLY");
  push("-".repeat(64));
  data.provisions.forEach((p) => {
    push(`  ${p.actShortTitle || p.act}, s. ${p.section} — ${p.heading}`);
    push(`      Match: ${p.relevance}${p.score != null ? ` (${p.score.toFixed(3)})` : ""}`);
    push(`      ${p.summary}`);
    if (p.sourceUrl) push(`      Source: ${p.sourceUrl}`);
    push("");
  });

  push("5. JUDGMENTS");
  push("-".repeat(64));
  if (data.judgments.length) {
    data.judgments.forEach((j) => {
      push(`  ${j.title}, ${j.citation} (${j.court}, ${j.year})`);
      push(`      Facts: ${j.factsPattern}`);
      push(`      Held (paraphrase): ${j.holding}`);
      push(`      Verify: ${j.verifyUrl}`);
      push("");
    });
  } else {
    push("  No decision in the bundled corpus matched this fact pattern.");
  }

  push("6. EVIDENCE TO GATHER");
  push("-".repeat(64));
  data.evidence.forEach((e) => push(`  [ ] ${e.item}\n      Source: ${e.source}`));
  push("");

  push("7. ACTION PLAN");
  push("-".repeat(64));
  data.actionPlan.forEach((s) => {
    push(`  Step ${s.order}. ${s.title}`);
    push(`      Why: ${s.why}`);
    if (s.steps) push(`      How: ${s.steps}`);
    push(`      Documents: ${s.evidenceNeeded}`);
    if (s.deadline) push(`      TIMING: ${s.deadline}`);
    if (s.provisionRefs?.length)
      push(`      Basis: ${s.provisionRefs.map((r) => r.label).join("; ")}`);
    push("");
  });

  push("8. WHERE TO GET HELP");
  push("-".repeat(64));
  data.referrals.forEach((r) => {
    push(`  ${r.name} — ${r.value}`);
    push(`      ${r.when}`);
    if (r.sourceUrl) push(`      ${r.sourceUrl}`);
  });
  push("");
  push("-".repeat(64));
  push("Generated by NyayaPath. Verify every citation before relying on it.");

  return L.join("\n");
}

export { Overview, TimelineEvidence, LegalResearch, ActionPlan, AiBlock, AiBadge };