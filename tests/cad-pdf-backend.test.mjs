import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test, { afterEach } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const exports = {};
const source = readFileSync(new URL("../src/lib/cad-pdf-backend.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInThisContext(`(function(require, exports) { ${compiled}\n})`)(require, exports);
const { forwardCadPdf } = exports;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ["CAD_PDF_API_TOKEN", "CAD_PDF_API_TOKEN_FILE"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function input() {
  process.env.CAD_PDF_API_TOKEN = "test-token";
  delete process.env.CAD_PDF_API_TOKEN_FILE;
  const file = new File(["%PDF-1.7\n"], "floorplan.pdf", { type: "application/pdf" });
  const form = new FormData();
  form.set("password", "pdf-password");
  form.set("preview_dpi", "72");
  form.set("ignored", "not-forwarded");
  return [file, form, "https://cad.example.test/"];
}

test("forwards multipart file and options with server bearer auth and ngrok warning bypass", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, "https://cad.example.test/api/extract");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.headers["ngrok-skip-browser-warning"], "true");
    assert.equal(options.headers["Content-Type"], undefined);
    assert.equal(options.body.get("file").name, "floorplan.pdf");
    assert.equal(options.body.get("password"), "pdf-password");
    assert.equal(options.body.get("preview_dpi"), "72");
    assert.equal(options.body.get("ignored"), null);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return Response.json({ rooms: [] });
  };
  assert.deepEqual(await forwardCadPdf(...input()), { status: 200, body: { rooms: [] } });
});

test("missing or malformed credentials fail before making any request", async () => {
  const args = input();
  globalThis.fetch = async () => assert.fail("Should not contact backend");
  for (const token of ["", "bad token", "bad\nheader"]) {
    process.env.CAD_PDF_API_TOKEN = token;
    assert.equal((await forwardCadPdf(...args)).status, 503);
  }
});

test("unreadable token file fails closed without exposing its path", async () => {
  const args = input();
  delete process.env.CAD_PDF_API_TOKEN;
  process.env.CAD_PDF_API_TOKEN_FILE = "/nonexistent/private/token";
  const result = await forwardCadPdf(...args);
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result), /nonexistent/);
});

test("rejects invalid URLs and embedded URL credentials", async () => {
  const [file, form] = input();
  globalThis.fetch = async () => assert.fail("Should not contact backend");
  for (const url of ["not-a-url", "file:///tmp", "https://user:password@example.test"]) {
    assert.equal((await forwardCadPdf(file, form, url)).status, 503);
  }
});

test("backend validation errors and busy responses are preserved", async () => {
  for (const status of [422, 429, 413]) {
    globalThis.fetch = async () => Response.json({ error: "Rejected", code: "test" }, { status });
    assert.equal((await forwardCadPdf(...input())).status, status);
  }
});

test("credential rejection is reported as a backend issue", async () => {
  globalThis.fetch = async () => Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await forwardCadPdf(...input());
  assert.equal(result.status, 502);
  assert.equal(result.body.code, "backend_authentication");
});

test("ngrok HTML error pages and malformed JSON produce 502", async () => {
  globalThis.fetch = async () => new Response("<html>ngrok error</html>", { status: 200 });
  assert.equal((await forwardCadPdf(...input())).status, 502);
});

test("timeouts and connection failures are distinguished without leaking details", async () => {
  for (const [name, status] of [["TimeoutError", 504], ["TypeError", 502]]) {
    globalThis.fetch = async () => { const error = new Error("private infrastructure detail"); error.name = name; throw error; };
    const result = await forwardCadPdf(...input());
    assert.equal(result.status, status);
    assert.doesNotMatch(JSON.stringify(result), /private infrastructure/);
  }
});