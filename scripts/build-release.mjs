import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";

// Exercise the production build with QA routes disabled, without touching pnpm dev.
const original=readFileSync("next-env.d.ts","utf8");
let result;
try {
 result=spawnSync(process.execPath,["node_modules/next/dist/bin/next","build"],{
  env:{...process.env,MAMITA_RELEASE_BUILD:"true",MAMITA_QA_BUILD:"false"},stdio:"inherit",windowsHide:true,
 });
} finally {
 const generated=readFileSync("next-env.d.ts","utf8");
 if(generated.replaceAll(".next-release/types/",".next/types/")===original)writeFileSync("next-env.d.ts",original);
}
if(result.error)throw result.error;
process.exitCode=result.status??1;
