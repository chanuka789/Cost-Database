// Stops this project's local services if they're still running (e.g. after a
// terminal was closed without Ctrl+C):  npm run stop
// Only processes on the app's ports whose command line points inside this
// project are stopped — nothing else on the machine is touched.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "web");
const isWin = process.platform === "win32";

const pgCtl = path.join(web, "node_modules", "@embedded-postgres", isWin ? "windows-x64" : `${process.platform}-${process.arch}`, "native", "bin", isWin ? "pg_ctl.exe" : "pg_ctl");
if (existsSync(path.join(web, ".local-db", "postmaster.pid")) && existsSync(pgCtl)) {
  spawnSync(pgCtl, ["stop", "-D", path.join(web, ".local-db"), "-m", "fast"], { stdio: "inherit" });
}

function pidsOnPort(port) {
  try {
    if (isWin) {
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      return [...new Set(out.split(/\r?\n/).filter((l) => l.includes("LISTENING") && new RegExp(`:${port}\\s`).test(l)).map((l) => l.trim().split(/\s+/).pop()))];
    }
    return execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function commandLine(pid) {
  try {
    if (isWin) {
      return execFileSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine; (Get-CimInstance Win32_Process -Filter "ProcessId=$((Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId)").CommandLine`], { encoding: "utf8" });
    }
    return execFileSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" });
  } catch {
    return "";
  }
}

const marker = root.toLowerCase().replace(/\\/g, "/");
let stopped = 0;
for (const port of [3100, 8100]) {
  for (const pid of pidsOnPort(port)) {
    const cmd = commandLine(pid).toLowerCase().replace(/\\/g, "/");
    if (!cmd.includes(marker)) {
      console.log(`Port ${port}: process ${pid} isn't part of this project — left running.`);
      continue;
    }
    if (isWin) spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    else spawnSync("kill", [pid]);
    console.log(`Port ${port}: stopped process ${pid}.`);
    stopped++;
  }
}
console.log(stopped ? "Done." : "Nothing else was running.");
