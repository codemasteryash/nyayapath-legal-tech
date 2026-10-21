/**
 * Thin API layer. One place that knows how the frontend talks to the backend,
 * so an error here is an error everywhere.
 */

const BASE = import.meta.env.VITE_API_BASE || "/api";

export class ApiError extends Error {
  constructor(message, { status, code, payload, timedOut } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.timedOut = Boolean(timedOut);
  }
}

/**
 * Every request is bounded. Without this a stalled server leaves the UI on
 * "Building your workspace..." forever with no way out.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

async function request(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new ApiError(
        `The service did not respond within ${Math.round(timeoutMs / 1000)} seconds. It may be busy or the model may be slow. You can retry, or continue without the model.`,
        { code: "client_timeout", timedOut: true },
      );
    }
    throw new ApiError(
      "Could not reach the NyayaPath service. Check that the API is running on port 8787 and try again.",
      { code: "network" },
    );
  }
  clearTimeout(timer);

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      body?.detail ||
      body?.error ||
      `The request failed (HTTP ${res.status}).`;
    throw new ApiError(
      body?.hint ? `${message} ${body.hint}` : message,
      {
        status: res.status,
        code: body?.error || body?.code,
        payload: body,
      },
    );
  }

  return body;
}

export const api = {
  health: () => request("/health"),

  meta: () => request("/meta"),

  samples: () => request("/samples"),

  sample: (id) => request(`/samples/${id}`),

  validate: (input) =>
    request("/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  analyze: (input) =>
    request("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      // Must exceed the server's own deadline so the server wins and returns a
      // structured 504, rather than the browser giving up on a live request.
      timeoutMs: 45000,
    }),

  actionPlan: (category) =>
    request("/action-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }),

  provisions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null),
    ).toString();
    return request(`/provisions${qs ? `?${qs}` : ""}`);
  },

  provision: (id) => request(`/provisions/${encodeURIComponent(id)}`),

  judgments: (category) =>
    request(`/judgments${category ? `?category=${encodeURIComponent(category)}` : ""}`),

  judgment: (id) => request(`/judgments/${encodeURIComponent(id)}`),

  search: (q, mode) =>
    request(`/search?q=${encodeURIComponent(q)}${mode ? `&mode=${encodeURIComponent(mode)}` : ""}`),

  graph: ({ provisions, category } = {}) => {
    const qs = new URLSearchParams();
    if (provisions?.length) qs.set("provisions", provisions.join(","));
    if (category) qs.set("category", category);
    const s = qs.toString();
    return request(`/graph${s ? `?${s}` : ""}`);
  },

  forms: (category) =>
    request(`/forms${category ? `?category=${encodeURIComponent(category)}` : ""}`),

  extractPdf: async (file, onProgress) => {
    const form = new FormData();
    form.append("file", file);

    // XHR rather than fetch so the upload can report progress.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/pdf/extract`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
        return reject(
          new ApiError(
            body?.detail || "The upload could not be processed.",
            { status: xhr.status, code: body?.code, payload: body },
          ),
        );
      };
      xhr.onerror = () =>
        reject(new ApiError("The upload failed before it reached the service.", { code: "network" }));
      xhr.ontimeout = () =>
        reject(
          new ApiError(
            "The upload timed out. The document may be too large or the service may be busy.",
            { code: "client_timeout", timedOut: true },
          ),
        );
      xhr.timeout = 60000;
      xhr.send(form);
    });
  },

  // Case-scoped stateful workflows
  createCase: (payload) =>
    request("/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  listCases: () => request("/cases"),

  getCase: (caseId) => request(`/cases/${encodeURIComponent(caseId)}`),

  deleteCase: (caseId) =>
    request(`/cases/${encodeURIComponent(caseId)}`, {
      method: "DELETE",
    }),

  getConversation: (caseId) => request(`/cases/${encodeURIComponent(caseId)}/conversation`),

  intakeChat: (payload) =>
    request("/intake/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 35000,
    }),

  sendMessage: (caseId, payload) =>
    request(`/cases/${encodeURIComponent(caseId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  runCaseAnalysis: (caseId) =>
    request(`/cases/${encodeURIComponent(caseId)}/analysis`, {
      method: "POST",
      timeoutMs: 45000,
    }),

  runOpponentSimulation: (caseId, customScenario = null) =>
    request(`/cases/${encodeURIComponent(caseId)}/opponent-simulation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customScenario }),
      timeoutMs: 35000,
    }),

  getOpponentSimulation: (caseId) =>
    request(`/cases/${encodeURIComponent(caseId)}/opponent-simulation`),

  runResearch: (caseId, query) =>
    request(`/cases/${encodeURIComponent(caseId)}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      timeoutMs: 30000,
    }),

  correctFact: (caseId, factId, correctedStatement) =>
    request(`/cases/${encodeURIComponent(caseId)}/facts/${encodeURIComponent(factId)}/corrections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correctedStatement }),
    }),

  getCaseActionPlan: (caseId) =>
    request(`/cases/${encodeURIComponent(caseId)}/action-plan`),

  toggleActionItem: (caseId, itemId, isCompleted) =>
    request(`/cases/${encodeURIComponent(caseId)}/action-plan/items/${encodeURIComponent(itemId)}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted }),
    }),

  runWorkflow: (caseId) =>
    request(`/cases/${encodeURIComponent(caseId)}/workflow`, {
      method: "POST",
      timeoutMs: 25000,
    }),

  lawyers: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== null),
    ).toString();
    return request(`/lawyers${qs ? `?${qs}` : ""}`);
  },

  lawyer: (id) => request(`/lawyers/${encodeURIComponent(id)}`),
};
