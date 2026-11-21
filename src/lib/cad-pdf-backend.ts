import { readFileSync } from "node:fs";

type BackendResult = { status: number; body: unknown };

/** Server-only: never expose the backend credential to the browser. */
export async function forwardCadPdf(
  file: File,
  form: FormData,
  backendUrl: string,
): Promise<BackendResult> {
  let endpoint: URL;
  let token: string;
  try {
    endpoint = new URL(`${backendUrl.trim().replace(/\/+$/, "")}/api/extract`);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error("Invalid backend URL");
    }
    token = (process.env.CAD_PDF_API_TOKEN ??
      (process.env.CAD_PDF_API_TOKEN_FILE
        ? readFileSync(process.env.CAD_PDF_API_TOKEN_FILE, "utf8")
        : "")).trim();
    if (!token || !/^[\x21-\x7e]+$/.test(token)) throw new Error("Invalid token");
  } catch {
    return {
      status: 503,
      body: { error: "The CAD PDF backend URL or authentication token is not configured correctly.", code: "backend_configuration" },
    };
  }

  const forward = new FormData();
  forward.append("file", file, file.name);
  for (const field of ["password", "preview_dpi", "max_preview_pages", "count_vectors"]) {
    const value = form.get(field);
    if (typeof value === "string") forward.append(field, value);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
      body: forward,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { status: 502, body: { error: "The CAD PDF backend returned an unreadable response.", code: "backend_error" } };
    }
    // Backend credentials belong to this server, not the user's browser session.
    if (response.status === 401 || response.status === 403) {
      return { status: 502, body: { error: "The CAD PDF backend rejected the server credentials.", code: "backend_authentication" } };
    }
    return { status: response.status, body };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      status: timedOut ? 504 : 502,
      body: {
        error: timedOut
          ? "The extraction timed out. Try a smaller PDF or lower the preview settings."
          : "Could not reach the CAD PDF extraction service.",
        code: timedOut ? "timeout" : "backend_unreachable",
      },
    };
  }
}