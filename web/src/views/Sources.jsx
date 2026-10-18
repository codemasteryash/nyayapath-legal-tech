import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Empty, Icon, Notice, Panel, Tag, Loading } from "../ui.jsx";
import { Footer } from "./Landing.jsx";

/** Browsable view of the bundled corpus, so the legal data is inspectable. */
export default function Sources({ meta, health, onBack }) {
  const [tab, setTab] = useState("provisions");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState({ provisions: [], judgments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openProv, setOpenProv] = useState(null);
  const [openJudg, setOpenJudg] = useState(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [searchRes, judgRes] = await Promise.all([
          query ? api.search(query) : Promise.resolve({ provisions: [], judgments: [] }),
          api.judgments(category || undefined),
        ]);
        if (!alive) return;
        const provisions = query ? searchRes.provisions : searchRes.provisions;
        setData({
          provisions: provisions.length
            ? provisions
            : query
              ? []
              : (await api.provisions(category ? { category } : {})).provisions,
          judgments: query && searchRes.judgments.length ? searchRes.judgments : judgRes.judgments,
        });
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [query, category]);

  const acts = meta?.acts || {};

  return (
    <>
      <main className="section">
        <div className="shell">
          <div style={{ marginBottom: 24 }}>
            <button className="btn btn--quiet btn--sm" onClick={onBack} type="button">
              ← Back
            </button>
            <h1 style={{ marginTop: 12, marginBottom: 8 }}>The legal sources</h1>
            <p style={{ maxWidth: "64ch", color: "var(--ink-soft)" }}>
              Everything NyayaPath can show lives here. {meta?.provisionsMeta?.description}{" "}
              {meta?.provisionsMeta?.scope}
            </p>
          </div>

          <Panel
            title="Search the corpus"
            icon="search"
            sub="Keyword search across provision text and decision text using sparse TF-IDF retrieval"
            right={
              <div className="langbar">
                <button type="button" data-on={tab === "provisions"} onClick={() => setTab("provisions")}>
                  Provisions
                </button>
                <button type="button" data-on={tab === "judgments"} onClick={() => setTab("judgments")}>
                  Judgments
                </button>
              </div>
            }
          >
            <div className="row" style={{ marginBottom: 0 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="q">Search terms</label>
                <input
                  id="q"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. shared household, bounced cheque, sexual harassment"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="cat">Filter by issue type</label>
                <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All issue types</option>
                  {(meta?.categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>

          {error ? (
            <Notice tone="warn" title="Could not load the corpus">
              {error.message}
            </Notice>
          ) : null}

          {loading ? (
            <Loading label="Searching the corpus…" />
          ) : tab === "provisions" ? (
            <Panel title={`Provisions (${data.provisions.length})`} icon="scale" flush>
              {data.provisions.length ? (
                data.provisions.map((p) => (
                  <article className="prov" key={p.id}>
                    <div className="prov__top">
                      <span className="prov__num">s. {p.section}</span>
                      <div className="prov__head">
                        <p className="prov__act">{acts[p.act]?.shortTitle || p.act}</p>
                        <h4 className="prov__title">{p.heading}</h4>
                        <p className="prov__summary">{p.summary}</p>
                        <div className="prov__foot">
                          {acts[p.act]?.sourceUrl ? (
                            <a href={acts[p.act].sourceUrl} target="_blank" rel="noreferrer">
                              Official text ↗
                            </a>
                          ) : null}
                          {p.repealedAct ? <span>Replaced part of the {p.repealedAct}</span> : null}
                          <span>In force from {acts[p.act]?.inForceFrom || "—"}</span>
                        </div>
                        {openProv === p.id ? (
                          <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginTop: 9, marginBottom: 0 }}>
                            <b>Why it matters. </b>
                            {p.whyItMatters}
                          </p>
                        ) : null}
                      </div>
                      <div className="prov__side">
                        <button
                          className="btn btn--quiet btn--sm"
                          type="button"
                          onClick={() => setOpenProv(openProv === p.id ? null : p.id)}
                        >
                          {openProv === p.id ? "Less" : "Why?"}
                        </button>
                        {p.score != null ? (
                          <span className="prov__score">{p.score.toFixed(3)}</span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty title="Nothing matched">
                  No provision in the corpus contains those terms. Try a broader word, or clear the
                  issue-type filter.
                </Empty>
              )}
            </Panel>
          ) : (
            <Panel title={`Judgments (${data.judgments.length})`} icon="book" flush>
              {data.judgments.length ? (
                data.judgments.map((j) => (
                  <article className="judg" key={j.id}>
                    <h4 className="judg__cite">{j.title}</h4>
                    <p className="judg__court">
                      <span>{j.citation}</span>
                      <span>{j.court}</span>
                      <span>{j.year}</span>
                    </p>
                    <div className="judg__block">
                      <b>What it turned on</b>
                      <p>{j.factsPattern}</p>
                    </div>
                    {openJudg === j.id ? (
                      <div className="judg__block">
                        <b>What the Court held — our paraphrase</b>
                        <p>{j.holding}</p>
                      </div>
                    ) : null}
                    <div className="judg__foot">
                      <a
                        href={`https://indiankanoon.org/search/?formInput=${encodeURIComponent(j.citation)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Verify the citation ↗
                      </a>
                      <button
                        className="btn btn--quiet btn--sm"
                        type="button"
                        onClick={() => setOpenJudg(openJudg === j.id ? null : j.id)}
                      >
                        {openJudg === j.id ? "Less" : "Holding"}
                      </button>
                      {(j.categories || []).slice(0, 3).map((c) => (
                        <Tag key={c} tone="plain">
                          {c}
                        </Tag>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <Empty title="No decision matched" icon="book">
                  The corpus holds 14 well-known decisions. We would rather show nothing than show a
                  case that does not support what you are arguing.
                </Empty>
              )}
            </Panel>
          )}

          <div className="grid-3" style={{ marginTop: 22 }}>
            {Object.entries(acts).map(([key, a]) => (
              <div className="panel" key={key} style={{ padding: 16 }}>
                <p style={{ margin: "0 0 4px", fontFamily: "var(--serif)", fontSize: "0.95rem", color: "var(--navy-800)", fontWeight: 600 }}>
                  {a.shortTitle}
                </p>
                <p style={{ margin: "0 0 8px", fontSize: "0.76rem", color: "var(--ink-faint)" }}>
                  {a.actNo} · {a.kind} · in force {a.inForceFrom}
                </p>
                {a.repealed ? (
                  <p style={{ margin: "0 0 8px", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                    Repealed the {a.repealed}
                  </p>
                ) : null}
                <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem" }}>
                  {a.sourceLabel} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}