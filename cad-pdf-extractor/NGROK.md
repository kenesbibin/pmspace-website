# Run this computer as the CAD PDF backend

The website browser uploads to `/api/cad-pdf-extractor` on Next.js. That
server forwards the PDF over HTTPS through ngrok to FastAPI on this computer.
The bearer token is **server-only**: never use a `NEXT_PUBLIC_` variable for it.

## Safe startup on this Linux system

Run from the **website repository root**, not the extractor directory:

```sh
npm run cad:backend
npm run cad:status
npm run cad:tunnel
```

- `cad:backend` starts **only** the PM2 process `cadtoolbackend` on
  `127.0.0.1:18002`. It refuses an occupied port or an existing process name,
  rather than killing or restarting anything. An existing token is preserved;
  on a new installation it creates a random token with owner-only permissions.
- `cad:tunnel` adds a separate HTTPS tunnel named `cad-pdf-extractor` through
  the **already-running** ngrok agent API on `127.0.0.1:4040`. It checks backend
  authentication first, disables request capture for CAD uploads, and verifies
  existing tunnel names, addresses and URLs remain unchanged. Repeated runs reuse
  the CAD tunnel. It does not edit ngrok's global configuration or start another
  agent session.
- It requires an installed ngrok agent that is already authenticated and running.
  If ngrok rejects an additional endpoint because of domain/plan limits, the
  command stops with an error. **Do not replace the existing n8n tunnel or enable
  pooling on its domain.** Use a separate available domain/plan instead.
- No existing PM2 app, website, reverse proxy, port, or environment is restarted
  or changed. Previous unrelated work in the repository is preserved.

Python dependencies must already be installed in this folder's `.venv` from
`requirements.txt`. Tesseract with English data is needed for scanned drawings.
The PM2 configuration uses one extraction worker, an eight-connection limit,
small backlog and a 512 MB **restart threshold**. The threshold is not a hard
memory cap and does not guarantee host-wide CPU/memory isolation. Large OCR
jobs still consume resources; a dedicated machine/container is preferable for
strict isolation or heavy production traffic.

## Connect the website

After the tunnel health check succeeds, its URL and local token-file path are
saved to `.runtime/website.env`, and its nonsecret URL to `.runtime/tunnel.json`.
Neither file is committed. The startup script does **not** load these into the
existing website or overwrite any environment file.

For the website hosted on Netlify (or another machine), set these **server-side**
environment variables in the hosting dashboard:

| Variable | Value |
| --- | --- |
| `CAD_PDF_API_URL` | The HTTPS URL printed by `cad:tunnel`, without `/api/extract` |
| `CAD_PDF_API_TOKEN` | The token stored locally in `.secrets/api-token` |

Enter the token directly into the hosting secret/environment UI; do not send it
in chat, commit it, or put it in frontend code. The local file path cannot be
used by a remote host. Redeploy the website after setting its environment.

For a **new local website process**, set `CAD_PDF_API_URL` and
`CAD_PDF_API_TOKEN_FILE` to the values in `.runtime/website.env`. Do not restart
the already-running website without planning its maintenance window.
Without `CAD_PDF_API_URL`, the website retains its existing local CLI fallback.

No public browser CORS change is needed: the call to Python is server-to-server.
All FastAPI endpoints, including `/api/health`, require the bearer token.

## Lifecycle and checks

```sh
npm run cad:status
npm run test:cad-proxy
npm run cad:tunnel:stop
```

Stopping the tunnel affects **only** the verified CAD tunnel, not the backend or
other tunnels. To stop the backend explicitly, use `pm2 stop cadtoolbackend`.
CAD logs are in `.runtime/backend-out-<pm2-id>.log` and
`.runtime/backend-error-<pm2-id>.log` (PM2 adds the process ID).

The dynamic CAD tunnel is not part of the shared ngrok agent's startup config:
**run `cad:tunnel` again after the agent restarts**. Recheck the URL and update
the hosting environment if it changes. Keep this machine awake, online, and the
backend/ngrok processes running. Free ngrok usage limits and hosting upload/body
limits may be lower than the extractor's 50 MB upload limit. This is suitable
for a controlled deployment, not a guaranteed high-availability service.