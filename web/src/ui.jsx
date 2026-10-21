/**
 * Small presentational primitives shared across the app.
 * Deliberately inline SVG, no icon dependency.
 */

export function Icon({ name, size = 16, strokeWidth = 1.6 }) {
  const paths = {
    shield: "M12 3l7 3v5c0 4.2-2.8 8.2-7 10-4.2-1.8-7-5.8-7-10V6l7-3z",
    scale: "M12 4v16M6 8h12M6 8l-2.5 6h5L6 8zm12 0l-2.5 6h5L18 8zM8 20h8",
    layers: "M12 3l8 4-8 4-8-4 8-4zm8 8l-8 4-8-4m16 4l-8 4-8-4",
    route: "M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M18 18l3 3-3 3",
    doc: "M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4zm0 0v4h4",
    lock: "M6 11h12v9H6v-9zm3 0V8a3 3 0 016 0v3",
    search: "M11 4a7 7 0 100 14 7 7 0 000-14zm5.5 12.5L21 21",
    clock: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.5V12l3 2",
    check: "M4 12.5l5 5L20 6.5",
    chevron: "M9 5l7 7-7 7",
    print: "M7 9V4h10v5M7 19H5v-6h14v6h-2M8 15h8v6H8v-6z",
    copy: "M9 9h10v11H9zM5 15V4h10v3",
    alert: "M12 4l9 16H3L12 4zm0 5v5m0 3v.5",
    reset: "M4 12a8 8 0 1 1 2.5 5.8M4 12V6m0 6h6",
    book: "M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5zm2-2v18",
    upload: "M12 16V4m-4 4l4-4 4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2",
    phone: "M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z",
    info: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 5v.5M12 11v6",
    arrow: "M5 12h13m-5-5l5 5-5 5",
    trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] || paths.info} />
    </svg>
  );
}

export function Tag({ tone = "plain", children, title }) {
  return (
    <span className={`tag tag--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Notice({ tone = "info", title, children }) {
  return (
    <div className={`notice notice--${tone}`}>
      {title ? <b>{title}</b> : null}
      {children}
    </div>
  );
}

export function Loading({ label = "Working…" }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__bar">
        <span />
      </div>
      <span>{label}</span>
    </div>
  );
}

export function Empty({ icon = "info", title, children }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={19} />
      </div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function PanelSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 20 }}>
      <div className="skeleton sk-title" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton sk-line"
          style={{ width: `${58 + ((i * 13) % 38)}%` }}
        />
      ))}
    </div>
  );
}

/** Meter used for the self-assessment of how well the narrative was covered. */
export function Meter({ score, band, label }) {
  return (
    <div className="meter">
      <div className="meter__bar">
        <div
          className={`meter__fill meter__fill--${band}`}
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
      <span className="meter__val">{Math.round(score * 100)}%</span>
      <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>{label}</span>
    </div>
  );
}

export function Panel({ title, icon, sub, right, children, flush }) {
  return (
    <section className="panel">
      {(title || right) && (
        <header className="panel__head">
          <div>
            <h3>
              {icon ? <Icon name={icon} size={15} /> : null}
              {title}
            </h3>
            {sub ? <p>{sub}</p> : null}
          </div>
          {right}
        </header>
      )}
      <div className={flush ? "panel__body panel__body--flush" : "panel__body"}>
        {children}
      </div>
    </section>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast no-print" role="status" aria-live="polite">
      <Icon name="check" size={15} />
      {message}
    </div>
  );
}