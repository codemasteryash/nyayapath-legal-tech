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
  const firstErrorRef = useRef(null);

  useEffect(() => {
    if (prefill) setForm({ ...EMPTY, ...prefill });
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

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    setSubmitError(null);

    const check = await api.validate(form).catch(() => null);
    if (check && !check.valid) {
      setErrors(check.errors);
      firstErrorRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await api.analyze(form);
      onSubmitted(result, form);
    } catch (err) {
      setSubmitError(err);
      if (err.payload?.fields) setErrors(err.payload.fields);
    } finally {
      setBusy(false);
    }
  }

  const selected = categories.find((c) => c.id === form.category);
  const hints = meta?.referrals || [];
  const urgent = hints.filter((r) =>
    ["police-112", "cyber-1930", "childline", "women-helpline"].includes(r.id),
  );

  return (
    <>
      <main className="section">
        <div className="shell">
          <div style={{ marginBottom: 26 }}>
            <button className="btn btn--quiet btn--sm" onClick={onBack} type="button">
              Back
            </button>
            <h1 style={{ marginTop: 12, marginBottom: 8 }}>Tell us what happened</h1>
            <p style={{ maxWidth: "62ch", color: "var(--ink-soft)" }}>
              Nothing is submitted to any court or authority. This text is sent only to the local
              NyayaPath service to produce your workspace, and is discarded when you close the tab.
              Use example details rather than real personal information if you are presenting this.
            </p>
          </div>

          <div className="intake">
            <form className="form-card" onSubmit={submit} noValidate>
              <div className="form-card__head">
                <h2>Case intake</h2>
                <p>Five fields. Only the account and the type of problem are required.</p>
              </div>

              <div className="form-body">
                {submitError ? (
                  <Notice tone="warn" title="The workspace could not be generated">
                    {submitError.message}
                  </Notice>
                ) : null}

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
                </div>

                <div className={errors.narrative ? "field field--error" : "field"}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span className="field__label" style={{ marginBottom: 7 }}>
                      Your account of what happened<span className="field__req">*</span>
                    </span>
                    <div style={{ marginLeft: "auto" }}>
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
                  </div>

                  <textarea
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

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <p className="field__hint" style={{ marginTop: 7 }}>
                      {form.language === "en" ? NARRATIVE_HINT_EN : NARRATIVE_HINT_HI}
                    </p>
                    <span className="char-count" style={{ flex: "none", alignSelf: "flex-start", marginTop: 7 }}>
                      {charCount} chars
                    </span>
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
                      {localPdf.file.name} - {localPdf.pages} pages, {localPdf.charCount} characters
                      read. You can pull the extracted text into the narrative, or read it in the
                      Documents tab of the workspace.
                    </p>
                  </Notice>
                ) : null}

                <div className="row">
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
                      If the events fall before 1 July 2024, different criminal statutes applied at
                      the time. We will flag that.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                  <button className="btn btn--primary" type="submit" disabled={busy}>
                    {busy ? "Building your workspace..." : "Build my case workspace"}
                    {!busy ? <Icon name="arrow" size={15} /> : null}
                  </button>
                  <span style={{ fontSize: "0.78rem", color: "var(--ink-faint)" }}>
                    {busy ? "Retrieving provisions and decisions..." : "Usually under 3 seconds"}
                  </span>
                </div>

                <div className="field" style={{ marginTop: 26 }}>
                  <span className="field__label">Or attach a document</span>
                  <PdfPanel onExtracted={(d) => setLocalPdf(d)} />
                </div>
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