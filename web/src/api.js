/**
 * Thin API layer. One place that knows how the frontend talks to the backend,
 * so an error here is an error everywhere.
 */

const BASE = import.meta.env.VITE_API_BASE || "/api";

export class ApiError extends Error {
  constructor(message, { status, code, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError(
      "Could not reach the NyayaPath service. Check that the API is running on port 8787 and try again.",
      { code: "network" },
    );
  }

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      body?.detail ||
      body?.error ||
      `The request failed (HTTP ${res.status}).`;
    throw new ApiError(message, {
      status: res.status,
      code: body?.error || body?.code,
      payload: body,
    });
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

  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),

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
      xhr.send(form);
    });
  },
};