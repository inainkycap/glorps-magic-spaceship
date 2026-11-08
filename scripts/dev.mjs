#!/usr/bin/env node
// `npm run dev` at the repo root: the backend (uvicorn :8000, --reload) and the frontend
// (Vite :5173) together, with labelled output; Ctrl+C stops both.
//
// Plain Node (no shell syntax), so it runs the same in PowerShell, cmd, macOS and Linux.
// The backend runs on the venv's own Python (no activation needed) with PYTHONUTF8=1.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const IS_WIN = process.platform === "win32";
const API_PORT = 8000;
const WEB_PORT = 5173;
const HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/health`;
const APP_URL = `http://localhost:${WEB_PORT}`;
const READY_TIMEOUT_MS = 90_000;

// --- colours (off when not a terminal, or NO_COLOR is set) -------------------------------
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
const c = { api: paint("36"), web: paint("35"), dev: paint("33"), ok: paint("32;1"), err: paint("31;1"), dim: paint("2") };
const say = (msg) => console.log(`${c.dev("[dev]")} ${msg}`);
const fail = (msg) => {
  console.error(`${c.err("[dev]")} ${msg}`);
  process.exit(1);
};

// --- preflight -----------------------------------------------------------------------------
const PYTHON = IS_WIN ? path.join(BACKEND, ".venv", "Scripts", "python.exe") : path.join(BACKEND, ".venv", "bin", "python");
const VITE = path.join(FRONTEND, "node_modules", "vite", "bin", "vite.js");

if (!existsSync(PYTHON)) {
  fail(
    [
      `No backend virtualenv found (looked for ${path.relative(ROOT, PYTHON)}).`,
      "",
      "  First-time setup:  npm run setup",
      "",
      "  (or by hand:  cd backend && python -m venv .venv && <venv python> -m pip install -r requirements.txt)",
    ].join("\n"),
  );
}
if (!existsSync(VITE)) {
  fail(["Frontend dependencies aren't installed (no frontend/node_modules/vite).", "", "  First-time setup:  npm run setup"].join("\n"));
}

/** True if something is already listening on the port. */
const portInUse = (port) =>
  new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });

for (const [port, what] of [
  [API_PORT, "backend"],
  [WEB_PORT, "frontend"],
]) {
  if (await portInUse(port)) {
    fail(`Port ${port} (${what}) is already in use. Stop whatever is running there (another \`npm run dev\`?) and try again.`);
  }
}

// --- children --------------------------------------------------------------------------------
const children = [];
let stopping = false;

/** Start a process and prefix every output line with its coloured label. */
function start(label, colour, cmd, args, opts) {
  // POSIX: own process group, so stop() can signal uvicorn's reloader and its worker together.
  const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"], detached: !IS_WIN });
  const tag = colour(`[${label}]`);
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on("line", (line) => console.log(`${tag} ${line}`));
  }
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(`${c.err("[dev]")} ${label} stopped (${signal ?? `exit code ${code}`}); stopping everything.`);
    stop(code || 1);
  });
  child.on("error", (e) => {
    if (!stopping) {
      console.error(`${c.err("[dev]")} couldn't start ${label}: ${e.message}`);
      stop(1);
    }
  });
  children.push(child);
  return child;
}

/** Kill a child and everything it started (uvicorn --reload runs a reloader + a worker). */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (IS_WIN) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM"); // the whole process group
    } catch {
      child.kill("SIGTERM");
    }
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  say("stopping backend and frontend…");
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("SIGHUP", () => stop(0));

say(`starting backend (uvicorn :${API_PORT}) and frontend (Vite :${WEB_PORT})…`);

start("api", c.api, PYTHON, ["-m", "uvicorn", "app.main:app", "--reload", "--port", String(API_PORT)], {
  cwd: BACKEND,
  // UTF-8 mode: the species files are UTF-8 (Windows would otherwise read them as cp1252).
  env: { ...process.env, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" },
});

// Vite's colours: forced on in a terminal (its stdout is a pipe here), off otherwise.
// (Any FORCE_COLOR value, even "0", turns them on, so drop it rather than set it to 0.)
const { FORCE_COLOR: _ignored, ...baseEnv } = process.env;
start("web", c.web, process.execPath, [VITE, "--port", String(WEB_PORT), "--strictPort"], {
  cwd: FRONTEND,
  env: useColour ? { ...baseEnv, FORCE_COLOR: "1" } : { ...baseEnv, NO_COLOR: "1" },
});

// --- wait for the backend's health check, then announce -------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const deadline = Date.now() + READY_TIMEOUT_MS;
let ready = false;
while (!stopping && Date.now() < deadline) {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    // not up yet
  }
  await sleep(500);
}

if (!stopping) {
  if (ready) {
    console.log("");
    say(`${c.ok("ready")}: open ${c.ok(APP_URL)}   ${c.dim(`(API docs: http://localhost:${API_PORT}/docs · Ctrl+C stops both)`)}`);
    console.log("");
    // Smoke-test hook (used to check the shutdown path): stop right after "ready".
    if (process.env.DEV_EXIT_AFTER_READY === "1") stop(0);
  } else {
    console.error(`${c.err("[dev]")} the backend didn't answer ${HEALTH_URL} within ${READY_TIMEOUT_MS / 1000} s; see the [api] output above.`);
    stop(1);
  }
}
