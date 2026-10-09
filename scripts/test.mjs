// Runs every test suite: web (Vitest) then extractor (pytest). Exits non-zero if any fails.
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const isWin = process.platform === "win32";
const python = path.join(root, "extractor", ".venv", isWin ? "Scripts/python.exe" : "bin/python");

const steps = [
  ["web", "npm", ["test"], path.join(root, "web")],
  ["extractor", python, ["-m", "pytest", "-q"], path.join(root, "extractor")],
];

for (const [name, cmd, args, cwd] of steps) {
  console.log(`\n── ${name} tests ──`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin && cmd === "npm" });
  if (r.status !== 0) {
    console.error(`\n${name} tests failed.`);
    process.exit(r.status ?? 1);
  }
}
console.log("\nAll tests passed.");
