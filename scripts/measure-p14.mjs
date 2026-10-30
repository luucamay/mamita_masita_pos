// Sequential, read-only QA measurements. No load test or sales mutations.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectEnvironment, loadLocalEnvironment } from './environment.cjs';
loadLocalEnvironment();
const label=process.argv[2];
if(!['before','after'].includes(label)||!inspectEnvironment().sharedProduction)throw Error('Invalid measurement target');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({baseURL:'http://127.0.0.1:3101',viewport:{width:1365,height:900},serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(30000);
const samples=[],payloads=[],reports=[];let documents=0;
page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try{
 await page.goto('/login?next=%2Fpedidos');await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL);await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/pedidos');await page.getByTestId('live-status').waitFor();
 const routes=[{link:'Cocina',path:'/cocina',heading:'Cola de cocina'},{link:'Café',path:'/cafe',heading:'Cola de café'},{link:'Pedidos',path:'/pedidos',heading:'Pedidos'},{link:'Historial',path:'/historial',heading:'Historial y reportes'}];
 for(let round=0;round<5;round++)for(const route of routes){const began=performance.now();await page.getByRole('link',{name:route.link,exact:true}).click();await page.waitForURL(url=>url.pathname===route.path);await page.getByRole('heading',{name:route.heading,exact:true}).waitFor();samples.push({round,path:route.path,ms:Math.round(performance.now()-began)});}
 for(let round=0;round<4;round++){
  await page.goto('/pedidos');const began=performance.now();await page.getByRole('link',{name:'Cerrados',exact:true}).click();await page.waitForURL('**/pedidos?view=closed');await page.locator('[data-order-id]').first().waitFor();samples.push({round,path:'/pedidos?view=closed',ms:Math.round(performance.now()-began),cards:await page.locator('[data-order-id]').count()});
  const start=performance.now(),response=await page.request.get('/api/orders/live?view=closed');const bytes=await response.body(),body=JSON.parse(bytes.toString());payloads.push({round,ms:Math.round(performance.now()-start),bytes:bytes.length,orders:body.orders.length,total:body.pagination?.total??body.orders.length,serverTiming:response.headers()['server-timing']??null});
 }
 await page.goto('/historial?period=daily&date=2026-10-13&payment=all&purchase=all');
 for(let round=0;round<4;round++)for(const period of ['Semanal','Mensual','Diario']){const oldDocuments=documents,began=performance.now();await page.getByRole('navigation',{name:'Período del reporte'}).getByRole('link',{name:period,exact:true}).click();await page.getByRole('link',{name:period,exact:true}).and(page.locator('[aria-current="page"]')).waitFor();await page.getByTestId('product-summary').waitFor();reports.push({round,period,ms:Math.round(performance.now()-began),documentNavigations:documents-oldDocuments});}
 await page.goto('/cafe');await page.getByRole('heading',{name:'Cola de café',exact:true}).waitFor();let idleRequests=0;const idle=request=>{if(new URL(request.url()).pathname==='/cafe'&&request.method()==='GET')idleRequests++;};page.on('request',idle);await page.waitForTimeout(16000);page.off('request',idle);
 const timing=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return{ttfbMs:Math.round(n.responseStart-n.requestStart),downloadMs:Math.round(n.responseEnd-n.responseStart),domMs:Math.round(n.domContentLoadedEventEnd-n.responseEnd),decodedBytes:n.decodedBodySize};});
 const result={label,measuredAt:new Date().toISOString(),method:'same local QA production build mode, Chrome desktop, real shared DB; sequential 5 navigation rounds (round0 warmup), 4 closed/report rounds (round0 warmup); idle cafe 16s; no load test',samples,payloads,reports,idleCafeRequests16s:idleRequests,lastDocumentTiming:timing,summary:{navigation:routes.map(route=>({path:route.path,medianMs:median(samples.filter(s=>s.path===route.path&&s.round>0).map(s=>s.ms))})),closedMedianMs:median(samples.filter(s=>s.path.includes('closed')&&s.round>0).map(s=>s.ms)),closedApiMedianMs:median(payloads.slice(1).map(s=>s.ms)),closedBytes:median(payloads.slice(1).map(s=>s.bytes)),reportMedianMs:median(reports.filter(s=>s.round>0).map(s=>s.ms)),reportDocumentNavigations:reports.reduce((n,s)=>n+s.documentNavigations,0)}};
 mkdirSync(resolve('docs/desarrollo/evidencias'),{recursive:true});writeFileSync(resolve(`docs/desarrollo/evidencias/p14-${label}.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({label,summary:result.summary,idleCafeRequests16s:idleRequests}));
}finally{await context.close();await browser.close();}
