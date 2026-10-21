import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Icon, Notice, Tag } from "../ui.jsx";
import PdfPanel from "./PdfPanel.jsx";
import { Footer } from "./Landing.jsx";

const EMPTY = {
  title: "",
  category: "",
  narrative: "",
  location: "",
  startDate: "",
  language: "en",
};

const LANGUAGES = [
  { id: "en", label: "English", local: "English" },
  { id: "hi", label: "Hindi", local: "हिन्दी" },
  { id: "hinglish", label: "Hinglish", local: "Hinglish" },
];

const NARRATIVE_HINT_EN =
  "Say what was done, by whom, and when. If you are not sure of a date, write what you remember. Mention anything you want to protect: a shared home, children, a bank account.";

const NARRATIVE_HINT_HI =
  "बताइए क्या हुआ, किसने किया और कब। यदि तारीख याद न हो तो जो याद हो वही लिखिए। जिस चीज़ को सुरक्षित रखना है उसका भी उल्लेख कीजिए।";

const INTAKE_STEPS = [
  { label: "The matter", hint: "Name, type, place and date" },
  { label: "Your account", hint: "Language, narrative and document" },
  { label: "Review & build", hint: "Check and generate the workspace" },
];

const MATTER_ERROR_KEYS = ["title", "category", "location", "startDate"];

export default function Intake({
  categories,
  meta,
  health,
  onSubmitted,
  onBack,
  prefill,
  pdfDoc,
  onUsePdfText,
}) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [touched, setTouched] = useState(false);
  const [localPdf, setLocalPdf] = useState(null);
  const [step, setStep] = useState(0);
  const firstErrorRef = useRef(null);
  const formRef = useRef(null);
  // Monotonic id. A response from an abandoned submission can never overwrite
  // a newer one, and React StrictMode double-invocation cannot double-submit.
  const submitIdRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (prefill) {
      setForm({ ...EMPTY, ...prefill });
      setStep(0);
    }
  }, [prefill]);

  // A document produced on the workspace Documents tab can be carried back here.
  useEffect(() => {
    if (pdfDoc?.ok) setLocalPdf(pdfDoc);
  }, [pdfDoc]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    if (touched) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const charCount = form.narrative.trim().length;

  function goToStep(next) {
    setStep(next);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function stepForErrors(fields) {
    if (MATTER_ERROR_KEYS.some((key) => fields?.[key])) return 0;
    if (fields?.narrative) return 1;
    return 2;
  }

async function submit(e) {
  e?.preventDefault?.();
  if (inFlightRef.current) return; // hard guard against duplicate submission

  setTouched(true);
  setSubmitError(null);

  const myId = ++submitIdRef.current;

  let check;
  try {
    check = await api.validate(form);
  } catch {
    check = null; // server-side validation unreachable; let /analyze be the judge
  }

  if (myId !== submitIdRef.current) return; // superseded while validating

  if (check && !check.valid) {
    setErrors(check.errors);
    setBusy(false);
    setStep(stepForErrors(check.errors));
    window.requestAnimationFrame(() => {
      const firstKey = MATTER_ERROR_KEYS.concat("narrative").find(
        (key) => check.errors[key],
      );
      if (firstKey) document.getElementById(firstKey)?.focus();
      else firstErrorRef.current?.focus();
    });
    return;
  }

  inFlightRef.current = true;
  setBusy(true);

  try {
    const result = await api.analyze(form);
    if (myId !== submitIdRef.current) return; // a newer submit won
    if (!result || !Array.isArray(result.provisions)) {
      throw new Error("The service returned an incomplete workspace. Please retry.");
    }
    onSubmitted(result, form);
  } catch (err) {
    if (myId !== submitIdRef.current) return;
    setSubmitError(err);
    if (err.payload?.fields) {
      setErrors(err.payload.fields);
      setStep(stepForErrors(err.payload.fields));
    }
  } finally {
    // Always leaves the loading state, on success and on failure alike.
    inFlightRef.current = false;
    if (myId === submitIdRef.current) setBusy(false);
  }
}

  const selected = categories.find((c) => c.id === form.category);
  const hints = meta?.referrals || [];
  const urgent = hints.filter((r) =>
    ["police-112", "cyber-1930", "childline", "women-helpline"].includes(r.id),
  );

  return (
    <>
      <main className="section" style={{ paddingTop: 24, background: "var(--noir-950)", minHeight: "92vh" }}>
        <div className="shell">
          <div
            style={{
              marginBottom: 26,
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
                [ ENCLAVE FORM: STATUTORY INTAKE &amp; SYNTHESIS ]
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
                Deposition &amp; <em>Case Intake</em>
              </h1>
              <p style={{ maxWidth: "64ch", color: "var(--linen-300)", margin: 0, fontSize: "0.92rem", lineHeight: 1.6 }}>
                Structured chronological intake. Grounded in primary enactments without legal hallucination.
              </p>
            </div>
            {onBack ? (
              <button className="btn btn--outline btn--sm" onClick={onBack} type="button">
                ← BACK
              </button>
            ) : null}
          </div>

          <div className="intake">
            <form className="form-card" onSubmit={submit} noValidate ref={formRef} style={{ background: "var(--noir-900)", border: "1px solid var(--noir-700)", color: "var(--linen-100)" }}>
              <div className="form-card__head" style={{ borderBottom: "1px solid var(--noir-700)", background: "var(--noir-950)" }}>
                <h2 style={{ fontFamily: "var(--serif)", color: "#fff", fontSize: "1.25rem", margin: 0 }}>Statutory Deposition Steps</h2>
                <p style={{ color: "var(--linen-400)", fontSize: "0.82rem", margin: "4px 0 0" }}>Three concise steps to initialize your canonical legal workspace.</p>
              </div>

              <div className="form-body">
                {submitError ? (
                  <Notice tone="warn" title="The workspace could not be generated">
                    <p>{submitError.message}</p>
                    <p style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn btn--primary btn--sm"
                        type="button"
                        onClick={() => submit()}
                        disabled={busy}
                      >
                        {busy ? "Retrying..." : "Retry"}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => setSubmitError(null)}
                      >
                        Dismiss
                      </button>
                    </p>
                    {submitError.timedOut || submitError.code === "analysis_timeout" ? (
                      <p style={{ marginTop: 10 }}>
                        If this keeps happening, the API is not running. Start it with{" "}
                        <code>npm start</code> in the <code>server</code> folder and reload this page.
                      </p>
                    ) : null}
                  </Notice>
                ) : null}

                <nav className="intake-steps" aria-label="Case intake steps">
                  {INTAKE_STEPS.map((item, i) => (
                    <button
                      key={item.label}
                      className="intake-step-tab"
                      type="button"
                      data-on={step === i}
                      data-done={step > i}
                      aria-current={step === i ? "step" : undefined}
                      disabled={busy}
                      onClick={() => goToStep(i)}
                    >
                      <span className="intake-step-tab__n">
                        {step > i ? <Icon name="check" size={12} /> : i + 1}
                      </span>
                      <span className="intake-step-tab__text">
                        <b>{item.label}</b>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  ))}
                </nav>

                {step === 0 ? (
                  <div className="intake-step">
                    <div className="intake-fields">
                      <div className={errors.title ? "field field--error" : "field"}>
                        <label htmlFor="title">
                          Short name for this matter<span className="field__req">*</span>
                        </label>
                        <input
                          id="title"
                          ref={firstErrorRef}
                          type="text"
                          value={form.title}
                          onChange={set("title")}
                          placeholder="e.g. Repeat abuse and threats after separation"
                          aria-invalid={Boolean(errors.title)}
                        />
                        {errors.title ? (
                          <p className="field__error">
                            <Icon name="alert" size={13} /> {errors.title}
                          </p>
                        ) : null}
                      </div>

                      <div className={errors.category ? "field field--error" : "field"}>
                        <label htmlFor="category">
                          What kind of problem is this?<span className="field__req">*</span>
                        </label>
                        <select id="category" value={form.category} onChange={set("category")}>
                          <option value="">Choose one...</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} - {c.labelHi}
                            </option>
                          ))}
                        </select>
                        {errors.category ? (
                          <p className="field__error">
                            <Icon name="alert" size={13} /> {errors.category}
                          </p>
                        ) : selected ? (
                          <p className="field__hint">
                            {selected.blurb} <b>Forum:</b> {selected.forum}
                          </p>
                        ) : null}
                        <p className="field__hint">
                          Not sure which category fits? Describe what happened in your own words.
                        </p>
                      </div>

                      <div className={errors.location ? "field field--error" : "field"}>
                        <label htmlFor="location">Where did this happen?</label>
                        <input
                          id="location"
                          type="text"
                          value={form.location}
                          onChange={set("location")}
                          placeholder="City or district, State"
                        />
                        <p className="field__hint">
                          Jurisdiction decides which court and which police station are yours.
                        </p>
                      </div>

                      <div className={errors.startDate ? "field field--error" : "field"}>
                        <label htmlFor="startDate">When did it start?</label>
                        <input
                          id="startDate"
                          type="date"
                          value={form.startDate}
                          onChange={set("startDate")}
                        />
                        <p className="field__hint">
                          If the events fall before 1 July 2024, different criminal statutes applied
                          at the time. We will flag that.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="intake-step">
                    <div className={errors.narrative ? "field field--error" : "field"}>
                      <div className="intake-narrative-head">
                        <span className="field__label">
                          Your account of what happened<span className="field__req">*</span>
                        </span>
                        <div className="langbar" role="group" aria-label="Language of the narrative">
                          {LANGUAGES.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              data-on={form.language === l.id}
                              onClick={() => setForm((f) => ({ ...f, language: l.id }))}
                              title={l.local}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <textarea
                        id="narrative"
                        value={form.narrative}
                        onChange={set("narrative")}
                        placeholder={
                          form.language === "en"
                            ? "Write it as you would tell a friend. No legal words needed."
                            : "जैसे किसी को बता रहे हों। कानूनी शब्दों की ज़रूरत नहीं।"
                        }
                        aria-invalid={Boolean(errors.narrative)}
                        lang={form.language === "en" ? "en" : "hi"}
                      />

                      <div className="intake-narrative-foot">
                        <p className="field__hint" style={{ marginTop: 7 }}>
                          {form.language === "en" ? NARRATIVE_HINT_EN : NARRATIVE_HINT_HI}
                        </p>
                        <span className="char-count">{charCount} chars</span>
                      </div>

                      {errors.narrative ? (
                        <p className="field__error">
                          <Icon name="alert" size={13} /> {errors.narrative}
                        </p>
                      ) : null}
                    </div>

                    {localPdf?.ok ? (
                      <Notice tone="good" title="A document is ready to use">
                        <p>
                          {localPdf.file.name} - {localPdf.pages} pages, {localPdf.charCount}{" "}
                          characters read. You can pull the extracted text into the narrative, or
                          read it in the Documents tab of the workspace.
                        </p>
                      </Notice>
                    ) : null}

                    <details className="intake-more">
                      <summary>
                        <span>
                          <b>Attach a document</b>
                          <small>Optional. Read locally; it is not uploaded by this form.</small>
                        </span>
                        <Icon name="chevron" size={15} />
                      </summary>
                      <div className="intake-more__body">
                        <PdfPanel onExtracted={(d) => setLocalPdf(d)} />
                      </div>
                    </details>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="intake-step">
                    <div className="intake-review">
                      <p className="intake-review__eyebrow">Check before building</p>
                      <dl className="intake-review__grid">
                        <div>
                          <dt>Matter</dt>
                          <dd>{form.title || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Type</dt>
                          <dd>{selected?.label || "Not chosen"}</dd>
                        </div>
                        <div>
                          <dt>Place</dt>
                          <dd>{form.location || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Started</dt>
                          <dd>{form.startDate || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt>Language</dt>
                          <dd>{LANGUAGES.find((l) => l.id === form.language)?.label || "English"}</dd>
                        </div>
                        <div>
                          <dt>Document</dt>
                          <dd>{localPdf?.ok ? localPdf.file.name : "None attached"}</dd>
                        </div>
                      </dl>

                      <div className="intake-review__narrative">
                        <b>Your account</b>
                        <p>{form.narrative.trim() || "No account entered yet."}</p>
                      </div>

                      <p className="field__hint">
                        Nothing is filed. We use these details only to build a workspace from the
                        bundled corpus and, if configured, the language model.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="intake-nav">
                  <button
                    className="btn btn--quiet btn--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => (step === 0 ? onBack() : goToStep(step - 1))}
                  >
                    {step === 0 ? "Back to home" : "Back"}
                  </button>
                  <span className="intake-nav__progress">Step {step + 1} of 3</span>
                  <div className="intake-nav__actions">
                    {step < 2 ? (
                      <button
                        className="btn btn--primary"
                        type="button"
                        disabled={busy}
                        onClick={() => goToStep(step + 1)}
                      >
                        Continue <Icon name="arrow" size={15} />
                      </button>
                    ) : (
                      <button className="btn btn--primary" type="submit" disabled={busy}>
                        {busy ? "Building your workspace..." : "Build my case workspace"}
                        {!busy ? <Icon name="arrow" size={15} /> : null}
                      </button>
                    )}
                  </div>
                </div>
                {step === 2 ? (
                  <p className="intake-nav__hint">
                    {busy
                      ? "Retrieving provisions and decisions..."
                      : "Usually under 3 seconds. Requires the local API on port 8787."}
                  </p>
                ) : null}
              </div>
            </form>

            <aside className="rail">
              <div className="rail-card">
                <h3>While you write, have these ready</h3>
                <ul>
                  <li>The date of each incident, as near as you can</li>
                  <li>Names of anyone who saw what happened</li>
                  <li>Hospital or medical records, if there were injuries</li>
                  <li>Screenshots of messages, with the number visible</li>
                  <li>Where you live, and who pays the rent</li>
                </ul>
              </div>

              <div className="rail-card rail-card--navy">
                <h3>If this is an emergency</h3>
                <p>
                  Do not wait for a workspace. Call the police, get to a hospital, and go somewhere
                  safe first.
                </p>
                <ul style={{ marginTop: 10 }}>
                  {urgent.map((r) => (
                    <li key={r.id}>
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--brass-300)" }}>
                        {r.value}
                      </a>{" "}
                      - {r.name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rail-card">
                <h3>What we can and cannot read</h3>
                <p style={{ marginBottom: 8 }}>
                  <Tag tone="strong">Can read</Tag>
                </p>
                <ul style={{ marginBottom: 12 }}>
                  <li>Hindi and English narratives, including mixed text</li>
                  <li>Dates written as "12 April 2026", "April 12, 2026" or in Hindi</li>
                  <li>PDFs that contain selectable text</li>
                </ul>
                <p style={{ marginBottom: 8 }}>
                  <Tag tone="warn">Cannot read</Tag>
                </p>
                <ul>
                  <li>Scanned or photographed PDFs - no OCR in this build</li>
                  <li>Handwritten notes</li>
                  <li>Ambiguous numeric dates such as 03/04/2026, which are flagged for you</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer meta={meta} health={health} />
    </>
  );
}