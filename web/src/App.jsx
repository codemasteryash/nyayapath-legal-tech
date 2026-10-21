import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Icon, Loading, Notice, Tag, Toast } from "./ui.jsx";
import Landing from "./views/Landing.jsx";
import Intake from "./views/Intake.jsx";
import Sources from "./views/Sources.jsx";
import PdfPanel from "./views/PdfPanel.jsx";
import FindLawyer from "./views/FindLawyer.jsx";
import {
  ActionPlan,
  AiBadge,
  AiBlock,
  LegalResearch,
  Overview,
  TimelineEvidence,
  buildPrintDocument,
} from "./views/Workspace.jsx";

/* -------------------------------------------------------------------------
   Routing. A three-view hash router is enough here and avoids pulling in a
   routing library for what is, in the end, a three-screen prototype.
   ------------------------------------------------------------------------- */

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "home");

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "home");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next) => {
    window.location.hash = next;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return [route, go];
}

/* -------------------------------------------------------------------------
   Top bar
   ------------------------------------------------------------------------- */

function TopBar({ route, go, health, hasCase, onReset }) {
  const state = !health ? "wait" : health.engine?.ok ? "on" : "off";
  const dense = health?.engine?.dense;
  // The embedding model takes a minute or two to load on a cold start. Until it
  // is ready the engine silently falls back to sparse-only matching, which is a
  // worse result rather than an error - so say so instead of letting it look
  // like everything is working.
  const densePending = Boolean(dense && dense.state === "loading");
  const denseDead = Boolean(dense && dense.state === "unavailable");

  const label = !health
    ? "connecting"
    : !health.engine?.ok
      ? "service unavailable"
      : densePending
        ? "warming semantic index"
        : denseDead
          ? "semantic index unavailable"
          : `${health.corpus.provisions} provisions · ${health.corpus.judgments} decisions`;

  return (
    <header className="topbar no-print">
      {densePending ? (
        <div className="topbar__warming no-print">
          Loading the semantic model. Matching works now on exact statutory wording, and switches to
          meaning-based matching as soon as it is ready — usually within a minute or two of starting
          the service.
        </div>
      ) : null}
      {denseDead ? (
        <div className="topbar__warming topbar__warming--warn no-print">
          The semantic model could not be loaded, so matching is running on exact statutory wording
          only. Everything else works.
        </div>
      ) : null}
      <div className="topbar__inner">
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand__mark">न</span>
          <span className="brand__text">
            <span className="brand__name">NyayaPath</span>
            <span className="brand__tag">Legal information · India</span>
          </span>
        </a>

        <nav className="topbar__nav">
          <span className="topbar__status">
            <span
              className={`dot${state === "on" && !densePending ? "" : state === "off" ? " dot--off" : " dot--wait"}`}
            />
            {label}
          </span>
          <a
            className="btn btn--quiet btn--sm"
            href="#lawyers"
            onClick={(e) => {
              e.preventDefault();
              go("lawyers");
            }}
          >
            Find a Lawyer
          </a>
          <a
            className="btn btn--quiet btn--sm"
            href="#intake"
            onClick={(e) => {
              e.preventDefault();
              go("intake");
            }}
          >
            Start a case
          </a>
          <a
            className="btn btn--quiet btn--sm"
            href="#sources"
            onClick={(e) => {
              e.preventDefault();
              go("sources");
            }}
          >
            Sources
          </a>
          {hasCase ? (
            <button className="btn btn--ghost btn--sm" type="button" onClick={onReset}>
              <Icon name="reset" size={13} /> Clear case
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------
   Workspace screen
   ------------------------------------------------------------------------- */

function Workspace({ data, form, meta, samples, go, onReset, onToast }) {
  const [tab, setTab] = useState("overview");
  const [evidence, setEvidence] = useState(() => new Set());
  const [done, setDone] = useState(() => new Set());
  const [researchGroup, setResearchGroup] = useState("core");
  const [researchAct, setResearchAct] = useState("all");
  const [planStage, setPlanStage] = useState(0);
  const [planStep, setPlanStep] = useState(null);

  const toggleIn = (setter) => (key) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleEvidence = toggleIn(setEvidence);
  const toggleDone = toggleIn(setDone);

  function copy() {
    const text = buildPrintDocument(data, form);
    navigator.clipboard
      ?.writeText(text)
      .then(() => onToast("Case dossier copied to the clipboard"))
      .catch(() => onToast("Copying is blocked in this browser — use Print instead"));
  }

  function download() {
    const text = buildPrintDocument(data, form);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nyayapath-${(data.summary.headline || "case").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("Dossier downloaded");
  }

  const doneCount = data.actionPlan.filter((s) => done.has(s.title)).length;
  const heldCount = data.evidence.filter((e) => evidence.has(e.item) || e.suggestedHeld).length;

  const tabs = [
    { id: "overview", label: "Overview", count: null, icon: "doc" },
    { id: "timeline", label: "Timeline & Evidence", count: data.timeline.total, icon: "clock" },
    { id: "research", label: "Legal Research", count: data.provisions.length + data.judgments.length, icon: "scale" },
    { id: "plan", label: "Action Plan", count: data.actionPlan.length, icon: "route" },
    { id: "documents", label: "Documents", count: null, icon: "upload" },
    { id: "ai", label: "AI Reading", count: null, icon: "info" },
  ];

  return (
    <>
      <section className="ws-bar no-print">
        <div className="shell">
          <div className="ws-bar__top">
            <div>
              <h1>{data.summary.headline}</h1>
              <div className="ws-bar__meta">
                <span>
                  <b>{data.summary.issueType}</b>
                </span>
                {data.input.location ? <span>{data.input.location}</span> : null}
                {data.input.startDate ? <span>from {data.input.startDate}</span> : null}
                <span>{data.language.label}</span>
                <span>
                  coverage <b>{data.uncertainty.reliability.label.toLowerCase()}</b>
                </span>
                <span>
                  {heldCount}/{data.evidence.length} evidence · {doneCount}/{data.actionPlan.length} steps
                </span>
                <AiBadge llm={data.llm} />
              </div>
            </div>

            <div className="ws-bar__actions">
              <button className="btn btn--brass btn--sm" onClick={() => window.print()} type="button">
                <Icon name="print" size={14} /> Print dossier
              </button>
              <button className="btn btn--ghost btn--sm" onClick={copy} type="button">
                <Icon name="copy" size={14} /> Copy
              </button>
              <button className="btn btn--ghost btn--sm" onClick={download} type="button">
                Download
              </button>
              <button className="btn btn--quiet btn--sm" onClick={onReset} type="button">
                <Icon name="reset" size={13} /> Clear
              </button>
            </div>
          </div>

          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className="tab"
                data-on={tab === t.id}
                onClick={() => setTab(t.id)}
                type="button"
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                {t.count !== null ? <span className="tab__count">{t.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="ws-body">
        <div className="shell">
          {tab === "overview" ? <Overview data={data} meta={meta} onOpenTab={setTab} /> : null}
          {tab === "timeline" ? (
            <TimelineEvidence data={data} checked={evidence} onToggleEvidence={toggleEvidence} />
          ) : null}
          {tab === "research" ? (
            <LegalResearch
              data={data}
              meta={meta}
              group={researchGroup}
              onGroupChange={setResearchGroup}
              act={researchAct}
              onActChange={setResearchAct}
            />
          ) : null}
          {tab === "plan" ? (
            <ActionPlan
              data={data}
              done={done}
              onToggle={toggleDone}
              stage={planStage}
              onStageChange={setPlanStage}
              stepKey={planStep}
              onStepSelect={setPlanStep}
            />
          ) : null}
          {tab === "documents" ? (
            <>
              <Notice tone="info" title="Bring your own documents">
                <p>
                  Nothing you upload is stored. The file is read in memory to pull out text and dates,
                  then discarded. If a document will not read, type what it says into the narrative
                  instead.
                </p>
              </Notice>
              <PdfPanel />
              <div className="panel" style={{ marginTop: 22 }}>
                <div className="panel__head">
                  <div>
                    <h3>
                      <Icon name="route" size={15} /> Questions to answer before you go
                    </h3>
                    <p>These are the gaps that most often change the advice</p>
                  </div>
                </div>
                <div className="qs">
                  {data.followUps.map((q, i) => (
                    <div className="q" key={i}>
                      <div style={{ gridColumn: "2" }}>
                        <p className="q__text">{q.question}</p>
                        <span className="q__for">{q.forIssue}</span>
                      </div>
                      <div style={{ gridColumn: "3" }}>
                        <input type="text" placeholder="Your answer" aria-label={`Answer: ${q.question}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        {tab === "ai" ? (
            data.llm?.ok ? (
              <AiBlock llm={data.llm} />
            ) : (
              <div className="grid-2">
                <Notice tone="info" title="No model was used for this case">
                  <p>
                    {data.llm?.message ||
                      "Live AI is not configured, so every field in this workspace came from the bundled corpus and the retrieval engine."}
                  </p>
                  {data.llm?.reason ? (
                    <p style={{ marginTop: 8 }}>
                      Reason: <code>{data.llm.reason}</code>
                    </p>
                  ) : null}
                  <p style={{ marginTop: 10 }}>
                    To turn it on, copy <code>server/.env.example</code> to{" "}
                    <code>server/.env</code>, put a real provider key in it, and restart the API. The
                    key stays on the server and is never sent to the browser.
                  </p>
                </Notice>
                <Panel title="What you are looking at instead" icon="book">
                  <p style={{ fontSize: "0.86rem", color: "var(--ink-soft)", margin: 0 }}>
                    This is the deterministic path and it is complete on its own: the facts, timeline
                    and evidence are extracted by rule, the provisions and decisions come from the
                    verified corpus through the retrieval engine, and the action plan is read straight
                    from corpus records. Nothing is generated, so nothing can be hallucinated — at the
                    cost of being keyword-level rather than reading comprehension.
                  </p>
                </Panel>
              </div>
            )
          ) : null}
        </div>
      </main>
    </>
  );
}

/* -------------------------------------------------------------------------
   App
   ------------------------------------------------------------------------- */

export default function App() {
  const [routeWithQuery, go] = useHashRoute();
  // Query strings stay in the hash so a link can prefill directory filters
  // without adding a routing dependency.
  const route = routeWithQuery.split("?")[0];

  const [meta, setMeta] = useState(null);
  const [health, setHealth] = useState(null);
  const [samples, setSamples] = useState([]);
  const [bootError, setBootError] = useState(null);
  const [booting, setBooting] = useState(true);

  const [analysis, setAnalysis] = useState(null);
  const [form, setForm] = useState(null);
  const [intakePrefill, setIntakePrefill] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  /* --- boot ---------------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, m, s] = await Promise.all([api.health(), api.meta(), api.samples()]);
        if (!alive) return;
        setHealth(h);
        setMeta(m);
        setSamples(s.samples || []);
      } catch (err) {
        if (alive) setBootError(err);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* --- poll while the semantic model is warming ------------------------- */
  useEffect(() => {
    if (!health?.engine?.dense || health.engine.dense.state !== "loading") return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const h = await api.health();
        if (alive) setHealth(h);
      } catch {
        /* keep the last known state; the next tick retries */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [health?.engine?.dense?.state]);

  /* --- routing ------------------------------------------------------- */
  useEffect(() => {
    if (route === "case" && !analysis) go("intake");
  }, [route, analysis, go]);

  /* --- actions ------------------------------------------------------- */
  function openSample(id) {
    const s = samples.find((x) => x.id === id);
    if (!s) return;
    setIntakePrefill({
      title: s.title,
      category: s.category,
      narrative: s.narrative,
      location: s.location || "",
      startDate: s.startDate || "",
      language: s.language || "en",
    });
    go("intake");
  }

  function onSubmitted(result, submittedForm) {
    setAnalysis(result);
    setForm(submittedForm);
    go("case");
    showToast("Workspace ready");
  }

  function reset() {
    setAnalysis(null);
    setForm(null);
    setIntakePrefill(null);
    setPdfDoc(null);
    go("intake");
    showToast("Case cleared from this browser session");
  }

  function usePdfText(doc) {
    setIntakePrefill((p) => ({
      ...(p || { category: "", language: "en" }),
      narrative: `${p?.narrative ? p.narrative + "\n\n" : ""}${doc.text.slice(0, 8000)}`,
    }));
    showToast("Extracted text placed into the narrative");
  }

  /* --- boot states --------------------------------------------------- */
  if (booting) {
    return (
      <>
        <TopBar route={route} go={go} health={health} hasCase={false} onReset={reset} />
        <Loading label="Starting NyayaPath…" />
      </>
    );
  }

  if (bootError) {
    return (
      <>
        <TopBar route={route} go={go} health={null} hasCase={false} onReset={reset} />
        <main className="section">
          <div className="shell shell--narrow">
            <Notice tone="warn" title="The NyayaPath service is not reachable">
              <p>{bootError.message}</p>
              <p style={{ marginTop: 10 }}>
                Start it with <code>npm start</code> in the <code>server</code> folder, then reload
                this page. The API listens on port 8787.
              </p>
            </Notice>
          </div>
        </main>
      </>
    );
  }

  const hasCase = Boolean(analysis);

  return (
    <>
      <TopBar route={route} go={go} health={health} hasCase={hasCase} onReset={reset} />

      {route === "home" ? (
        <Landing
          meta={meta}
          health={health}
          samples={samples}
          onStart={() => go("intake")}
          onOpenSample={openSample}
          onBrowse={() => go("sources")}
        />
      ) : null}

      {route === "intake" ? (
        <Intake
          categories={meta?.categories || []}
          meta={meta}
          health={health}
          prefill={intakePrefill}
          pdfDoc={pdfDoc}
          onUsePdfText={usePdfText}
          onSubmitted={onSubmitted}
          onBack={() => go("home")}
        />
      ) : null}

      {route === "case" && analysis ? (
        <Workspace
          data={analysis}
          form={form}
          meta={meta}
          samples={samples}
          go={go}
          onReset={reset}
          onToast={showToast}
        />
      ) : null}

      {route === "lawyers" ? <FindLawyer meta={meta} /> : null}

      {route === "sources" ? (
        <Sources meta={meta} health={health} onBack={() => go("home")} />
      ) : null}

      <Toast message={toast} />
    </>
  );
}