#!/usr/bin/env node
// `npm run setup` at the repo root: first-time setup for both halves.
//   1. backend/.venv: create it (if missing) and pip install backend/requirements.txt
//   2. frontend: npm install
// Plain Node, so it works the same in PowerShell, cmd, macOS and Linux. Safe to re-run.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const IS_WIN = process.platform === "win32";
const VENV_PYTHON = IS_WIN ? path.join(BACKEND, ".venv", "Scripts", "python.exe") : path.join(BACKEND, ".venv", "bin", "python");
const MIN_PYTHON = [3, 10];

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const tag = (s, code = "33") => (colour ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (msg) => console.log(`${tag("[setup]")} ${msg}`);
const fail = (msg) => {
  console.error(`${tag("[setup]", "31;1")} ${msg}`);
  process.exit(1);
};

/** Run a command, streaming its output; exit on failure. */
function run(cmd, args, opts = {}) {
  console.log(tag(`$ ${[cmd, ...args].join(" ")}`, "2"));
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) fail(`couldn't run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} failed (exit code ${r.status}).`);
}

/** A system Python ≥ 3.10 to create the venv with: py -3 (Windows launcher), python3 or python. */
function findPython() {
  const candidates = IS_WIN ? [["py", ["-3"]], ["python", []], ["python3", []]] : [["python3", []], ["python", []]];
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8" });
    if (r.status !== 0 || !r.stdout) continue;
    const [major, minor] = r.stdout.trim().split(".").map(Number);
    if (major > MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor >= MIN_PYTHON[1])) return { cmd, pre, version: r.stdout.trim() };
    say(`skipping ${cmd} (Python ${r.stdout.trim()}; need ${MIN_PYTHON.join(".")}+)`);
  }
  return null;
}

// 1. Backend venv + requirements
if (existsSync(VENV_PYTHON)) {
  say(`backend venv already exists (${path.relative(ROOT, VENV_PYTHON)})`);
} else {
  const py = findPython();
  if (!py) fail(`No Python ${MIN_PYTHON.join(".")}+ found. Install it from https://www.python.org/downloads/ and run npm run setup again.`);
  say(`creating backend/.venv with ${py.cmd} (Python ${py.version})…`);
  run(py.cmd, [...py.pre, "-m", "venv", ".venv"], { cwd: BACKEND });
}
say("installing backend requirements…");
run(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: BACKEND });
run(VENV_PYTHON, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: BACKEND });

// 2. Frontend packages. Under `npm run`, npm_execpath is npm's own CLI script, so we can
// run it with this Node directly (no shell needed for npm.cmd on Windows).
say("installing frontend packages…");
const npmCli = process.env.npm_execpath;
if (npmCli && npmCli.endsWith(".js")) run(process.execPath, [npmCli, "install"], { cwd: FRONTEND });
else run(IS_WIN ? "npm.cmd" : "npm", ["install"], { cwd: FRONTEND, shell: IS_WIN });

say(tag("done. Now run: npm run dev", "32;1"));
