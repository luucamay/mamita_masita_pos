import { execFileSync } from "node:child_process";
import { inspectEnvironment, loadLocalEnvironment } from "./environment.cjs";

try {
  loadLocalEnvironment();
  const state = inspectEnvironment();
  const branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  console.log(JSON.stringify({ branch, ...state, credentialsPrinted: false }, null, 2));
  if (branch === "main" || !state.publicKeyConfigured) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "No se pudo revisar el entorno.");
  process.exitCode = 1;
}
