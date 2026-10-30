import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Keep the QA build separate from the development server's .next directory.
const originalTypes = readFileSync("next-env.d.ts", "utf8");
let result;
try {
  result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: { ...process.env, MAMITA_QA_BUILD: "true" },
    stdio: "inherit",
    windowsHide: true,
  });
} finally {
  // Next generates this reference for the active distDir. Restore the dev reference.
  const generated = readFileSync("next-env.d.ts", "utf8");
  if (generated.replaceAll(".next-qa/types/", ".next/types/") === originalTypes) writeFileSync("next-env.d.ts", originalTypes);
}
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
