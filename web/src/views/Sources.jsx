import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Empty, Icon, Notice, Tag, Loading } from "../ui.jsx";
import { Footer } from "./Landing.jsx";

/** Browsable view of the bundled corpus, styled in the luxury dark editorial aesthetic. */
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
      <main className="section" style={{ paddingTop: 24, background: "var(--noir-950)", minHeight: "92vh" }}>
        <div className="shell">
          {/* Header */}
          <div
            style={{
              marginBottom: 24,
              paddingBottom: 20,
              borderBottom: "1px solid var(--noir-700)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <span className="badge-note" style={{ marginBottom: 6 }}>
                [ ENCLAVE IV: CANONICAL STATUTORY REGISTRY ]
              </span>
              <h1
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: "2.1rem",
                  color: "#fff",
                  margin: "4px 0 8px",
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                }}
              >
                The Statutory Core &amp; <em>Judicial Ratio</em>
              </h1>
              <p style={{ maxWidth: "68ch", color: "var(--linen-300)", margin: 0, fontSize: "0.92rem", lineHeight: 1.6 }}>
                Verified primary enactments under India Code and authoritative Supreme Court decisions. Grounding legal
                strategy in canonical authority without hallucination.
              </p>
            </div>
            {onBack ? (
              <button className="btn btn--outline btn--sm" onClick={onBack} type="button">
                ← BACK
              </button>
            ) : null}
          </div>

          {/* Search & Filter Enclave */}
          <div
            className="card-enclave"
            style={{
              padding: "20px 24px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                borderBottom: "1px solid var(--noir-700)",
                paddingBottom: 12,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <span className="badge-note" style={{ margin: 0 }}>
                  [ SPARSE RETRIEVAL INDEX ]
                </span>
                <div style={{ color: "#fff", fontFamily: "var(--serif)", fontSize: "1.05rem", marginTop: 2 }}>
                  Search Corpus by Keyword or Legal Principle
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="tech-pill"
                  onClick={() => setTab("provisions")}
                  style={{
                    cursor: "pointer",
                    background: tab === "provisions" ? "rgba(197, 160, 89, 0.2)" : "transparent",
                    borderColor: tab === "provisions" ? "var(--brass-400)" : "var(--noir-700)",
                    color: tab === "provisions" ? "var(--brass-300)" : "var(--linen-400)",
                  }}
                >
                  PROVISIONS ({data.provisions.length})
                </button>
                <button
                  type="button"
                  className="tech-pill"
                  onClick={() => setTab("judgments")}
                  style={{
                    cursor: "pointer",
                    background: tab === "judgments" ? "rgba(197, 160, 89, 0.2)" : "transparent",
                    borderColor: tab === "judgments" ? "var(--brass-400)" : "var(--noir-700)",
                    color: tab === "judgments" ? "var(--brass-300)" : "var(--linen-400)",
                  }}
                >
                  JUDGMENTS ({data.judgments.length})
                </button>
              </div>
            </div>

            <div className="row" style={{ marginBottom: 0, gap: 16 }}>
              <div className="field" style={{ marginBottom: 0, flex: 2 }}>
                <label
                  htmlFor="q"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.74rem",
                    color: "var(--brass-300)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Search Terms:
                </label>
                <input
                  id="q"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. shared household, section 63 electronic evidence, dishonour cheque"
                  style={{
                    background: "var(--noir-950)",
                    border: "1px solid var(--noir-700)",
                    color: "var(--linen-100)",
                    borderRadius: 3,
                    padding: "10px 14px",
                    fontSize: "0.92rem",
                  }}
                />
              </div>
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label
                  htmlFor="cat"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "0.74rem",
                    color: "var(--brass-300)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Filter Issue Domain:
                </label>
                <select
                  id="cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    background: "var(--noir-950)",
                    border: "1px solid var(--noir-700)",
                    color: "var(--linen-100)",
                    borderRadius: 3,
                    padding: "10px 14px",
                    fontSize: "0.92rem",
                  }}
                >
                  <option value="">All Issue Domains</option>
                  {(meta?.categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <Notice tone="warn" title="Could not load the corpus">
              {error.message}
            </Notice>
          ) : null}

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <Loading label="Searching the canonical corpus..." />
            </div>
          ) : tab === "provisions" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.provisions.length ? (
                data.provisions.map((p) => (
                  <article
                    className="card-enclave"
                    key={p.id}
                    style={{
                      padding: "20px 24px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: "0.88rem",
                              fontWeight: 700,
                              color: "var(--brass-300)",
                              background: "rgba(197, 160, 89, 0.12)",
                              border: "1px solid rgba(197, 160, 89, 0.3)",
                              padding: "2px 8px",
                              borderRadius: 2,
                            }}
                          >
                            Sec. {p.section}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: "0.76rem",
                              color: "var(--linen-400)",
                              textTransform: "uppercase",
                            }}
                          >
                            {acts[p.act]?.shortTitle || p.act}
                          </span>
                          {p.repealedAct ? (
                            <span className="tech-pill" style={{ fontSize: "0.7rem", color: "var(--brass-400)" }}>
                              Replaced {p.repealedAct}
                            </span>
                          ) : null}
                        </div>

                        <h3
                          style={{
                            fontFamily: "var(--serif)",
                            fontSize: "1.2rem",
                            color: "#fff",
                            margin: "4px 0 8px",
                            fontWeight: 500,
                          }}
                        >
                          {p.heading}
                        </h3>

                        <p style={{ margin: "0 0 12px", color: "var(--linen-200)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                          {p.summary}
                        </p>

                        {openProv === p.id ? (
                          <div
                            style={{
                              background: "var(--noir-950)",
                              borderLeft: "3px solid var(--brass-400)",
                              padding: "12px 16px",
                              marginBottom: 12,
                              borderRadius: 2,
                              fontSize: "0.85rem",
                              color: "var(--linen-100)",
                              lineHeight: 1.6,
                            }}
                          >
                            <b style={{ color: "var(--brass-300)", fontFamily: "var(--mono)", fontSize: "0.74rem", textTransform: "uppercase" }}>
                              Strategic Impact in Litigation:
                            </b>{" "}
                            {p.whyItMatters}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: "0.8rem", color: "var(--linen-400)" }}>
                          {acts[p.act]?.sourceUrl ? (
                            <a
                              href={acts[p.act].sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--brass-300)", fontFamily: "var(--mono)" }}
                            >
                              Official Gazette Text ↗
                            </a>
                          ) : null}
                          <span>In force: {acts[p.act]?.inForceFrom || "Active"}</span>
                          {p.score != null ? (
                            <span style={{ fontFamily: "var(--mono)", color: "var(--linen-400)" }}>
                              Sparse Score: {p.score.toFixed(3)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <button
                          className="btn btn--outline btn--sm"
                          type="button"
                          onClick={() => setOpenProv(openProv === p.id ? null : p.id)}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {openProv === p.id ? "COLLAPSE" : "WHY IT MATTERS"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty title="Nothing matched">
                  No provision in the corpus contains those terms. Try a broader word, or clear the issue domain filter.
                </Empty>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.judgments.length ? (
                data.judgments.map((j) => (
                  <article
                    className="card-enclave"
                    key={j.id}
                    style={{
                      padding: "20px 24px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <h3
                          style={{
                            fontFamily: "var(--serif)",
                            fontSize: "1.2rem",
                            color: "#fff",
                            margin: "0 0 6px",
                            fontWeight: 500,
                          }}
                        >
                          {j.title}
                        </h3>
                        <p style={{ margin: "0 0 12px", fontFamily: "var(--mono)", fontSize: "0.8rem", color: "var(--brass-300)" }}>
                          <span>{j.citation}</span> · <span>{j.court}</span> · <span>{j.year}</span>
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(j.categories || []).slice(0, 3).map((c) => (
                          <span key={c} className="tech-pill">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        background: "var(--noir-950)",
                        padding: "14px 18px",
                        borderRadius: 3,
                        marginBottom: 12,
                        border: "1px solid var(--noir-700)",
                      }}
                    >
                      <b style={{ color: "var(--brass-300)", fontFamily: "var(--mono)", fontSize: "0.74rem", textTransform: "uppercase" }}>
                        Factual &amp; Legal Turning Point:
                      </b>
                      <p style={{ margin: "4px 0 0", color: "var(--linen-100)", fontSize: "0.88rem", lineHeight: 1.6 }}>
                        {j.factsPattern}
                      </p>
                    </div>

                    {openJudg === j.id ? (
                      <div
                        style={{
                          background: "var(--noir-950)",
                          borderLeft: "3px solid var(--brass-400)",
                          padding: "14px 18px",
                          marginBottom: 12,
                          borderRadius: 2,
                          fontSize: "0.88rem",
                          color: "var(--linen-100)",
                          lineHeight: 1.6,
                        }}
                      >
                        <b style={{ color: "var(--brass-300)", fontFamily: "var(--mono)", fontSize: "0.74rem", textTransform: "uppercase" }}>
                          Supreme Court Holding (Ratio Decidendi):
                        </b>
                        <p style={{ margin: "4px 0 0" }}>{j.holding}</p>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                      <a
                        href={`https://indiankanoon.org/search/?formInput=${encodeURIComponent(j.citation)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn--cream btn--sm"
                      >
                        VERIFY ON INDIAN KANOON ↗
                      </a>
                      <button
                        className="btn btn--outline btn--sm"
                        type="button"
                        onClick={() => setOpenJudg(openJudg === j.id ? null : j.id)}
                      >
                        {openJudg === j.id ? "HIDE RATIO" : "FULL RATIO DECIDENDI"}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <Empty title="No decision matched" icon="book">
                  The corpus holds canonical Supreme Court decisions. Try a different search phrase.
                </Empty>
              )}
            </div>
          )}

          {/* Primary Acts Enclave Grid */}
          <div style={{ marginTop: 32 }}>
            <span className="badge-note">[ CANONICAL CODES &amp; STATUTES IN FORCE ]</span>
            <div className="grid-3" style={{ marginTop: 12, gap: 16 }}>
              {Object.entries(acts).map(([key, a]) => (
                <div className="card-enclave" key={key} style={{ padding: 18 }}>
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontFamily: "var(--serif)",
                      fontSize: "1.05rem",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    {a.shortTitle}
                  </p>
                  <p style={{ margin: "0 0 8px", fontSize: "0.74rem", color: "var(--brass-300)", fontFamily: "var(--mono)" }}>
                    {a.actNo} · {a.kind} · in force {a.inForceFrom}
                  </p>
                  {a.repealed ? (
                    <p style={{ margin: "0 0 8px", fontSize: "0.78rem", color: "var(--linen-300)" }}>
                      Replaced: {a.repealed}
                    </p>
                  ) : null}
                  <a
                    href={a.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "0.78rem", color: "var(--brass-300)", fontFamily: "var(--mono)" }}
                  >
                    {a.sourceLabel} ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}