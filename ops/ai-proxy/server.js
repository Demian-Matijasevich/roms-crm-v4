// AI Proxy — envoltura sobre `claude -p` (Claude Code headless) para que la
// app web (Vercel) pueda consultar tu suscripción de Claude desde el VPS.
//
// Variables de entorno requeridas:
//   PORT           — puerto (default 3007)
//   PROXY_TOKEN    — token compartido con la app; va en header Authorization: Bearer X
//   CLAUDE_BIN     — path al binario claude (default "claude")
//
// Endpoints:
//   POST /ask  { prompt: string, system?: string, timeout_ms?: number }
//              → { answer: string, ms: number }
//   GET  /health

const express = require("express");
const { spawn } = require("child_process");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3007;
const TOKEN = process.env.PROXY_TOKEN || "";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

if (!TOKEN) {
  console.warn("[ai-proxy] ATENCIÓN: PROXY_TOKEN vacío. Configurá una clave.");
}

function authOk(req) {
  const h = req.headers.authorization || "";
  return TOKEN && h === `Bearer ${TOKEN}`;
}

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.post("/ask", async (req, res) => {
  if (!authOk(req)) return res.status(401).json({ error: "unauthorized" });
  const { prompt, system, timeout_ms } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt requerido (string)" });
  }
  const TIMEOUT = Math.min(Number(timeout_ms) || 120000, 300000);

  const args = ["-p"];
  if (system) {
    args.push("--system-prompt", system);
  }
  args.push(prompt);

  const t0 = Date.now();
  const child = spawn(CLAUDE_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    child.kill("SIGKILL");
  }, TIMEOUT);

  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => (stderr += d.toString()));

  child.on("close", (code) => {
    clearTimeout(timer);
    const ms = Date.now() - t0;
    if (killed) return res.status(504).json({ error: "timeout", ms });
    if (code !== 0) {
      console.error("[ai-proxy] claude exit", code, stderr.slice(0, 500));
      return res.status(500).json({ error: "claude error", code, stderr: stderr.slice(0, 1000), ms });
    }
    return res.json({ answer: stdout.trim(), ms });
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    console.error("[ai-proxy] spawn error", err);
    return res.status(500).json({ error: "spawn error", message: String(err) });
  });
});

app.listen(PORT, () => {
  console.log(`[ai-proxy] listening on :${PORT}`);
});
