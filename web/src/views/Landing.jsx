import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Icon, Tag } from "../ui.jsx";

const CAPABILITIES = [
  {
    icon: "doc",
    title: "Reads your account, and your documents",
    body:
      "Type what happened in Hindi or English, or upload a PDF. The workspace pulls out the facts, the dates and the order of events, then shows you the sentences it used so you can check them.",
    note: "Text-layer PDFs only. Scanned pages need OCR, which this build does not have.",
  },
  {
    icon: "layers",
    title: "Links the facts across statutes",
    body:
      "A domestic violence matter is rarely only one statute. The engine maps what you described onto provisions in the criminal law, the special law and the procedure at the same time, so overlapping claims are not missed.",
    note: "54 provisions across 9 statutes, curated from India Code.",
  },
  {
    icon: "book",
    title: "Shows the decisions, with the citation",
    body:
      "Where a decision in the corpus matches your fact pattern, it appears with its reported citation and a plain-language note on what it held. One click verifies it on a free judgment database.",
    note: "14 well-known decisions. We would rather show nothing than show an invented case.",
  },
  {
    icon: "route",
    title: "Turns it into a step-by-step plan",
    body:
      "Not a summary of law, but an ordered list of what to do, why it matters, what to bring, and where to go. You can tick steps off and print the result as a dossier for a lawyer or a Legal Services Authority.",
    note: "Deadlines appear only where a source record states one.",
  },
];

export default function Landing({ onStart, onOpenSample, meta, health, samples, onBrowse }) {
  const [trusted, setTrusted] = useState([]);

  useEffect(() => {
    if (!meta?.sources) return;
    setTrusted(meta.sources.slice(0, 3));
  }, [meta]);

  const featured = samples?.[0];
  const rest = (samples || []).slice(1);

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      <header className="masthead">
        <div className="masthead__inner">
          <div>
            <p className="eyebrow">Legal information for people who cannot afford a lawyer</p>
            <h1>
              Know your rights in <em>ten minutes</em>, not ten months.
            </h1>
            <p className="lede">
              Most people facing a legal problem do not know which provision applies, which office to
              go to, or what proof they need. NyayaPath reads your own account, maps it against
              verified Indian statute, and hands back a timeline, the evidence you still need, the
              decisions that matter, and the next step to take this week.
            </p>

            <div className="masthead__cta">
              <button className="btn btn--brass" onClick={onStart} type="button">
                Start Your Case
                <Icon name="arrow" size={15} />
              </button>
              {featured ? (
                <button
                  className="btn btn--ghost"
                  onClick={() => onOpenSample(featured.id)}
                  type="button"
                  style={{ background: "transparent", color: "#cfdae5", borderColor: "#3a5673" }}
                >
                  Open the sample case
                </button>
              ) : null}
            </div>

            <div className="trustline">
              <span>
                <Icon name="lock" size={13} /> Nothing is written to disk
              </span>
              <span>
                <Icon name="book" size={13} /> Sources from India Code
              </span>
              <span>
                <Icon name="scale" size={13} /> Not a substitute for a lawyer
              </span>
            </div>
          </div>

          {/* Provenance panel: states up front what this can and cannot do. */}
          <aside className="provenance" aria-label="What NyayaPath does and does not do">
            <div className="provenance__head">
              <h3>What you are looking at</h3>
              <span>Read this first</span>
            </div>

            <div className="provenance__row">
              <span className="mark">✓</span>
              <span>
                <b>Every section is a real record</b>
                Section numbers were checked against the official gazette text of each Act. Each one
                links to its source.
              </span>
            </div>

            <div className="provenance__row">
              <span className="mark">✓</span>
              <span>
                <b>Judgments carry their citation</b>
                The decisions shown are reported cases. We link to a search that lets you read the
                full text before you rely on it.
              </span>
            </div>

            <div className="provenance__row">
              <span className="mark mark--no">!</span>
              <span>
                <b>We do not invent a deadline</b>
                Where no source fixes a period, the workspace says so rather than printing a number
                you might act on.
              </span>
            </div>

            <div className="provenance__row">
              <span className="mark mark--no">!</span>
              <span>
                <b>This is not legal advice</b>
                The match between the law and your facts is something only a qualified lawyer can
                assess. In an emergency, call 112 first.
              </span>
            </div>
          </aside>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      <main>
        {/* Process */}
        <section className="section">
          <div className="shell">
            <div className="section__head">
              <p className="kicker">How it works</p>
              <h2>Four steps, and you can stop after any of them</h2>
              <p>
                Nothing is filed on your behalf and nothing is sent anywhere. You keep every decision
                about what to do with what this produces.
              </p>
            </div>

            <div className="process">
              <div className="process__step">
                <h3>Describe what happened</h3>
                <p>
                  In Hindi or English, or mixed. Specific detail about what was done and when helps
                  more than a summary does.
                </p>
              </div>
              <div className="process__step">
                <h3>Check what was read out</h3>
                <p>
                  We show the facts, the timeline and the evidence list. Anything we are unsure about
                  is marked, so you can correct it.
                </p>
              </div>
              <div className="process__step">
                <h3>Read the law and the cases</h3>
                <p>
                  Cross-referenced provisions with an explanation and a link, plus any decision in
                  the corpus that matches your facts.
                </p>
              </div>
              <div className="process__step">
                <h3>Work the plan</h3>
                <p>
                  An ordered list with the documents to gather. Tick items off, then print the whole
                  thing to take to a lawyer or a Legal Services Authority.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="section section--ivory">
          <div className="shell">
            <div className="section__head">
              <p className="kicker">What it does</p>
              <h2>Four capabilities, each with a stated limit</h2>
              <p>
                A tool that hides its limits is worse than no tool. Each capability below carries the
                restriction we know about.
              </p>
            </div>

            <div className="caps">
              {CAPABILITIES.map((c) => (
                <article className="cap" key={c.title}>
                  <span className="cap__icon">
                    <Icon name={c.icon} size={16} />
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <p className="cap__note">{c.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Samples */}
        <section className="section">
          <div className="shell">
            <div className="section__head" style={{ display: "flex", justifyContent: "space-between", gap: 20, maxWidth: "none", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ maxWidth: "58ch" }}>
                <p className="kicker">Try it without typing anything</p>
                <h2>Open a prepared case</h2>
                <p>
                  Three fictional composites written for demonstration. They are not real people and
                  no real case is described.
                </p>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={onBrowse} type="button">
                Browse the legal sources
              </button>
            </div>

            <div className="samples">
              {(featured ? [featured, ...rest] : rest).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="sample"
                  onClick={() => onOpenSample(s.id)}
                >
                  <span className={`sample__badge${s.badgeTone === "sage" ? " sample__badge--sage" : ""}`}>
                    {s.badge}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.narrative.slice(0, 190)}…</p>
                  <span className="sample__cta">
                    Open this case
                    <Icon name="arrow" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="section section--tight section--ivory">
          <div className="shell">
            <div className="privacy">
              <div>
                <p className="kicker">Privacy</p>
                <h3>Your case stays in your browser</h3>
              </div>
              <ul>
                <li>
                  <b>No account, no history</b>
                  Your narrative is posted to the local API to be analysed, and is held in memory for
                  that request only. Nothing is written to a database.
                </li>
                <li>
                  <b>Nothing is saved to disk</b>
                  There is no user store, no log of case content, and no third party receives your
                  text. Closing the tab discards it.
                </li>
                <li>
                  <b>No tracking, no analytics</b>
                  This build makes no outbound request except to its own API.
                </li>
                <li>
                  <b>Use dummy details at a demonstration</b>
                  The demo is designed to be run without anyone entering real personal information.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      <Footer meta={meta} health={health} trusted={trusted} />
    </>
  );
}

export function Footer({ meta, health, trusted }) {
  const cats = meta?.categories || [];
  const urgent = (meta?.referrals || []).filter((r) => ["police-112", "cyber-1930", "childline"].includes(r.id));

  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer__grid">
          <div>
            <h4>NyayaPath</h4>
            <p style={{ maxWidth: "38ch", lineHeight: 1.6 }}>
              A research prototype for access to justice in India. Built by Chaos Engineers. It
              provides legal information, not legal advice.
            </p>
          </div>

          <div>
            <h4>If you need help now</h4>
            {urgent.map((r) => (
              <a key={r.id} href={r.sourceUrl} target="_blank" rel="noreferrer">
                {r.name} — {r.value}
              </a>
            ))}
            <a href="https://nalsa.gov.in/" target="_blank" rel="noreferrer">
              Free legal aid — NALSA
            </a>
          </div>

          <div>
            <h4>Sources</h4>
            {(trusted || []).map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            ))}
            <a href="https://indiankanoon.org/" target="_blank" rel="noreferrer">
              Indian Kanoon — verify a citation
            </a>
          </div>
        </div>

        <div className="footer__legal">
          <p>
            <strong>Not legal advice.</strong> NyayaPath is a demonstration prototype. It does not
            provide legal advice, it is not a law firm, and it does not act for anyone. Its output
            has not been reviewed by a qualified lawyer and must not be relied on as a conclusion
            about your case. Law changes, facts matter, and only a lawyer who has read your documents
            can advise you.
          </p>
          <p style={{ marginTop: 10 }}>
            Every provision shown is traceable to a bundled source record, but the corpus is small and
            selective. Absence of a provision or a decision from this tool does not mean the law does
            not apply to you.
          </p>
          {health ? (
            <p style={{ marginTop: 10, opacity: 0.72 }}>
              Status: corpus {health?.corpus?.provisions} provisions /{" "}
              {health?.corpus?.judgments} judgments · retrieval engine{" "}
              {health?.engine?.ok ? "ready" : "unavailable"} · model{" "}
              {health?.llm?.enabled ? "enabled" : "off (deterministic)"}
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

export { Tag };