/** Add only the CAD service/tunnel. Never restart or reconfigure the shared agent. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, ".runtime");
const tokenFile = path.join(root, ".secrets/api-token");
const upstream = "http://127.0.0.1:18002";
const agent = "http://127.0.0.1:4040/api";
const name = "cad-pdf-extractor";

async function agentRequest(resource, options = {}) {
  const response = await fetch(`${agent}${resource}`, {
    ...options, signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ngrok refused the request (${response.status}): ${data.details?.err ?? data.msg ?? data.error ?? "unknown error"}. Existing tunnels were not stopped.`);
  return data;
}

async function health(url) {
  const token = readFileSync(tokenFile, "utf8").trim();
  if (!token || !/^[\x21-\x7e]+$/.test(token)) throw new Error("Invalid backend token file.");
  const response = await fetch(`${url}/api/health`, {
    headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || data.status !== "ok" || data.app !== "CAD PDF Extractor") {
    throw new Error(`CAD backend health check failed (${response.status}).`);
  }
}

function matches(tunnel) {
  return tunnel.name === name && tunnel.config?.addr === upstream && tunnel.public_url?.startsWith("https://");
}

async function backend() {
  // Binding a temporary listener detects conflicts without killing any process.
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error("Port 18002 is occupied. No process was restarted; run cad:status to inspect the CAD backend.")));
    server.listen(18002, "127.0.0.1", () => server.close(resolve));
  });
  const listing = spawnSync("pm2", ["jlist"], { encoding: "utf8" });
  if (listing.status !== 0) throw new Error("PM2 is unavailable. No application was changed.");
  const apps = JSON.parse(listing.stdout);
  if (apps.some(app => app.name === "cadtoolbackend")) {
    throw new Error("A PM2 process named cadtoolbackend already exists. Inspect it explicitly; this command will not restart it.");
  }
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 });
  const result = spawnSync("pm2", ["start", path.join(root, "ecosystem.config.cjs"), "--only", "cadtoolbackend"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("CAD backend did not start. Check its own logs.");
  console.log("Started only cadtoolbackend on 127.0.0.1:18002. Run npm run cad:status to verify readiness.");
}

async function start() {
  await health(upstream); // Do not expose an unready/unauthenticated service.
  const before = (await agentRequest("/tunnels")).tunnels;
  const existing = before.find(t => t.name === name);
  if (existing && !matches(existing)) throw new Error("The CAD tunnel name is already used by a different configuration; nothing was changed.");
  const tunnel = existing ?? await agentRequest("/tunnels", {
    method: "POST",
    body: JSON.stringify({ name, proto: "http", addr: upstream, schemes: ["https"], inspect: false }),
  });
  if (!matches(tunnel)) throw new Error("Unexpected CAD tunnel configuration; inspect cad:status. No existing tunnel was modified.");
  const after = (await agentRequest("/tunnels")).tunnels;
  for (const previous of before) {
    if (!after.some(t => t.name === previous.name && t.public_url === previous.public_url && t.config?.addr === previous.config?.addr)) {
      throw new Error("An existing tunnel changed unexpectedly. No automatic restart or repair will be attempted.");
    }
  }
  await health(tunnel.public_url);
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(runtime, "tunnel.json"), JSON.stringify({ url: tunnel.public_url, upstream }, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(path.join(runtime, "website.env"), `CAD_PDF_API_URL=${tunnel.public_url}\nCAD_PDF_API_TOKEN_FILE=${tokenFile}\n`, { mode: 0o600 });
  console.log(`CAD backend is healthy: ${tunnel.public_url}`);
  console.log("Website settings saved in cad-pdf-extractor/.runtime/website.env (no token value printed). Existing website environment was not changed.");
  console.log("This dynamically added tunnel must be re-added after the shared ngrok agent restarts.");
}

async function status() {
  try { await health(upstream); console.log("CAD backend: healthy on port 18002"); }
  catch { console.log("CAD backend: unavailable or authentication failed"); }
  const tunnels = (await agentRequest("/tunnels")).tunnels;
  for (const tunnel of tunnels) console.log(`${tunnel.name}: ${tunnel.public_url} -> ${tunnel.config?.addr}`);
}

async function stop() {
  const tunnel = (await agentRequest("/tunnels")).tunnels.find(t => t.name === name);
  if (!tunnel) return console.log("No CAD tunnel is running. Nothing changed.");
  if (!matches(tunnel)) throw new Error("CAD name points to a different service; refusing to stop it.");
  await agentRequest(`/tunnels/${encodeURIComponent(name)}`, { method: "DELETE" });
  console.log("Stopped only the CAD tunnel. Backend and all other tunnels remain running.");
}

try {
  const action = { backend, start, status, stop }[process.argv[2]];
  if (!action) throw new Error("Usage: node cad-pdf-extractor/ngrok.mjs backend|start|status|stop");
  await action();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}