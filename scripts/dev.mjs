// Starts the whole app for local development with one command:
//   node scripts/dev.mjs   (or: npm run dev, from the repo root)
// Local PostgreSQL, the web app (http://localhost:3100) and the extractor
// (http://localhost:8100). Ctrl+C stops all three.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";

const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "web");
const extractor = path.join(root, "extractor");
const isWin = process.platform === "win32";
const python = path.join(extractor, ".venv", isWin ? "Scripts/python.exe" : "bin/python");

function envFromFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, "$1")];
      }),
  );
}

if (!existsSync(path.join(web, ".env"))) {
  console.error("Missing web/.env — copy web/.env.example to web/.env and fill it in first.");
  process.exit(1);
}
if (!existsSync(python)) {
  console.error("Missing extractor/.venv — see README.md, 'First-time setup'.");
  process.exit(1);
}

const children = [];
/** Long-running processes stop everything when they exit; `oneShot` ones (migrations) don't. */
function run(name, color, cmd, args, opts, oneShot = false) {
  const child = spawn(cmd, args, { ...opts, shell: isWin, env: { ...process.env, ...opts.env } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (d) =>
      d
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => out.write(tag + line + "\n")),
    );
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (oneShot) return;
    console.log(`${tag}stopped (${code ?? "signal"})`);
    shutdown();
  });
  if (!oneShot) children.push(child);
  return child;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  // Stop the database cleanly first, with PostgreSQL's own tool.
  const pgCtl = path.join(web, "node_modules", "@embedded-postgres", isWin ? "windows-x64" : `${process.platform}-${process.arch}`, "native", "bin", isWin ? "pg_ctl.exe" : "pg_ctl");
  if (existsSync(pgCtl)) spawnSync(pgCtl, ["stop", "-D", path.join(web, ".local-db"), "-m", "fast"], { stdio: "ignore" });
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    // On Windows a child started through a shell has its own children (next,
    // uvicorn's worker); kill the whole tree or they keep running on their ports.
    if (isWin) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGINT");
  }
  setTimeout(() => process.exit(0), 1000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const s = net.connect(port, "127.0.0.1");
      s.on("connect", () => {
        s.end();
        resolve();
      });
      s.on("error", () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`Port ${port} did not open`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

const webEnv = envFromFile(path.join(web, ".env"));

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.on("connect", () => (s.end(), resolve(true)));
    s.on("error", () => (s.destroy(), resolve(false)));
  });

// Reuse a local database that is already running (e.g. left over from an
// earlier session) instead of failing on the busy port.
if (await portOpen(54329)) console.log("[35m[db][0m already running on port 54329, reusing it");
else {
  run("db", "35", "node", ["scripts/local-db.mjs"], { cwd: web });
  await waitForPort(54329);
}
run("migrate", "90", "npx", ["prisma", "migrate", "deploy"], { cwd: web }, true).on("exit", (code) => {
  if (code !== 0) {
    console.error("Database migration failed — see the [migrate] lines above.");
    return shutdown();
  }
  run("web", "34", "npm", ["run", "dev"], { cwd: web });
  run("extractor", "33", python, ["-m", "uvicorn", "app.main:app", "--port", "8100"], {
    cwd: extractor,
    env: { EXTRACTOR_TOKEN: webEnv.EXTRACTOR_TOKEN ?? "", AI_KEYS_ENCRYPTION_KEY: webEnv.AI_KEYS_ENCRYPTION_KEY ?? "" },
  });
});
