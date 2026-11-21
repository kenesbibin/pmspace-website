const path = require("node:path");
const root = __dirname;

module.exports = {
  apps: [{
    name: "cadtoolbackend",
    cwd: root,
    script: path.join(root, ".venv/bin/python"),
    interpreter: "none",
    args: "-B -m uvicorn backend.main:app --host 127.0.0.1 --port 18002 --workers 1 --limit-concurrency 8 --backlog 16",
    exec_mode: "fork",
    instances: 1,
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    max_memory_restart: "512M",
    env: {
      PYTHONUNBUFFERED: "1",
      TMPDIR: path.join(root, ".runtime/uploads"),
      CAD_API_TOKEN_FILE: path.join(root, ".secrets/api-token"),
      PYTHONDONTWRITEBYTECODE: "1"
    },
    out_file: path.join(root, ".runtime/backend-out.log"),
    error_file: path.join(root, ".runtime/backend-error.log"),
    time: true
  }]
};
