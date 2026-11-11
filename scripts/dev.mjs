import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "-w", "@milezero/shared"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev", "-w", "@milezero/api"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(npm, ["run", "dev", "-w", "@milezero/web"], { stdio: "inherit", shell: process.platform === "win32" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(exitCode);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping && (code ?? 0) !== 0) {
      console.error(`Development process stopped (${code ?? signal ?? "unknown"}).`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
