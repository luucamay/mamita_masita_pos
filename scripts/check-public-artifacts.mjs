import {existsSync,readFileSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {parseEnv} from "node:util";
const secrets=new Set();
for(const file of [".env.local",".env.test.local",".env.admin.local"])if(existsSync(file))for(const [name,value] of Object.entries(parseEnv(readFileSync(file,"utf8"))))if(value&&/PASSWORD|SECRET_KEY|SERVICE_ROLE/.test(name))secrets.add(value);
const git=spawnSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8",windowsHide:true});
if(git.status!==0)throw Error("No se pudieron enumerar los archivos de entrega.");
const source=git.stdout.split("\0").filter(Boolean);
function walk(dir){return existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]):[];}
const bundles=[...walk(".next-qa/static"),...walk(".next-release/static")];
const hits=[];
for(const file of [...source,...bundles])if(existsSync(file)&&statSync(file).isFile()){
 const text=readFileSync(file).toString("utf8");if([...secrets].some(secret=>text.includes(secret)))hits.push(file);
}
const logos={};for(const dir of [".next-qa",".next-release"]){
 const path=join(dir,"server/app/historial/export/route.js.nft.json");
 logos[dir]=existsSync(path)&&JSON.parse(readFileSync(path,"utf8")).files.some(file=>file.replaceAll("\\","/").endsWith("public/icons/icon-192.png"));
}
const privateTracked=source.filter(file=>/^\.env(?:\..+)?$/.test(file)&&!file.endsWith(".example"));
console.log(JSON.stringify({secretValuesChecked:secrets.size,sourceFiles:source.length,staticFiles:bundles.length,hits,privateTracked,exportLogoTraced:logos},null,2));
process.exitCode=hits.length||privateTracked.length||Object.values(logos).some(value=>!value)?1:0;
