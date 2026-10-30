import { test,expect,type Page,type BrowserContext } from "@playwright/test";
import { readFileSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
const folder=resolve("../SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_p13");
const fixture=JSON.parse(readFileSync(resolve(folder,"live-fixture.json"),"utf8"));
async function login(page:Page,role:string){await page.goto("/login?next=%2Fpedidos");await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL("/pedidos");await expect(page.getByTestId("live-status")).toContainText("En vivo");}
async function restrict(context:BrowserContext,actor=false){await context.route("**/rest/v1/**",async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(["GET","HEAD"].includes(request.method()))return route.continue();
 const allowed=path.endsWith("/rpc/get_order_edit_snapshot")||actor&&["edit_order","mark_order_delivered","checkout_order"].some(name=>path.endsWith(`/rpc/${name}`));
 if(allowed&&request.postDataJSON().p_order_id===fixture.mainId)return route.continue();
 const body=request.postDataJSON();writeFileSync(resolve(folder,"blocked-request.json"),JSON.stringify({method:request.method(),path,order:body?.p_order_id,keys:Object.keys(body??{})}));await route.abort();throw Error(`P13 refused ${request.method()} ${path} outside the recorded order UUID`);
});}
test("P13 real two-session creation, edit, reconnect, delivery, payment and queue isolation",async({browser,baseURL})=>{
 const actorContext=await browser.newContext({baseURL}),observerContext=await browser.newContext({baseURL});
 const listeners:SupabaseClient[]=[];const received:Record<string,{orders:Set<string>;items:Map<string,string>}>= {};
 const facts:Record<string,unknown>={mainId:fixture.mainId,hiddenId:fixture.hiddenId};
 const mark=(name:string)=>{facts[name]=true;writeFileSync(resolve(folder,"browser-progress.json"),JSON.stringify(facts));};
 try{
  await restrict(actorContext,true);await restrict(observerContext);
  const actor=await actorContext.newPage(),observer=await observerContext.newPage();let realtimeFrames=0;observer.on("websocket",socket=>socket.on("framereceived",event=>{if(String(event.payload).includes(fixture.mainId))realtimeFrames++;}));await login(actor,"STAFF");await login(observer,"ADMIN");
  for(const role of ["COOK","BARISTA"]){
   const client=createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});listeners.push(client);
   const signed=await client.auth.signInWithPassword({email:process.env[`E2E_${role}_EMAIL`]!,password:process.env[`E2E_${role}_PASSWORD`]!});if(signed.error)throw Error("QA listener login failed");
   received[role]={orders:new Set(),items:new Map()};
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("QA listener subscription timed out")),15000);client.channel(`qa-p13-${role}-${fixture.mainId}`).on("postgres_changes",{event:"*",schema:"public",table:"orders"},payload=>{const row=payload.new as Record<string,string>;if(row.id===fixture.mainId||row.id===fixture.hiddenId)received[role].orders.add(row.id);}).on("postgres_changes",{event:"*",schema:"public",table:"order_items"},payload=>{const row=payload.new as Record<string,string>;if(row.order_id===fixture.mainId||row.order_id===fixture.hiddenId)received[role].items.set(row.id,row.queue_type);}).subscribe(status=>{if(status==="SUBSCRIBED"){clearTimeout(timeout);resolve();}else if(status==="CHANNEL_ERROR"){clearTimeout(timeout);reject(Error("QA listener channel failed"));}});});
  }
  const card=observer.locator(`[data-order-id="${fixture.mainId}"]`),actorCard=actor.locator(`[data-order-id="${fixture.mainId}"]`);
  await expect(card).toHaveCount(0);writeFileSync(resolve(folder,"browser-ready.json"),JSON.stringify({mainId:fixture.mainId,ready:true}));
  await expect(card).toBeVisible({timeout:120000});await expect(card).toContainText("Espresso");await expect(card).toContainText("Focaccia");await expect(card.getByTestId("order-total")).toContainText(/59[,.]00/);mark("creationObserved");
  await expect.poll(()=>received.COOK.orders.has(fixture.mainId)).toBe(true);await expect.poll(()=>received.BARISTA.orders.has(fixture.mainId)).toBe(true);
  for(const [index,role]of ["COOK","BARISTA"].entries()){expect(received[role].orders.has(fixture.hiddenId)).toBe(false);const read=await listeners[index].from("orders").select("id").eq("id",fixture.hiddenId);expect(read.data).toEqual([]);}
  expect([...received.COOK.items.values()]).not.toContain("cafe");expect([...received.BARISTA.items.values()]).not.toContain("kitchen");mark("queueIsolationVerified");
  await observer.clock.setFixedTime(new Date("2020-01-01T00:00:00Z"));await expect(card.getByTestId("account-time")).toContainText(/^01:/);mark("deviceDateSkewIgnored");
  await card.getByRole("heading").first().click();await expect(observer.getByRole("dialog")).toContainText("Focaccia");
  await actorCard.getByRole("heading").first().click();await actor.getByRole("button",{name:"Editar pedido",exact:true}).click();await actor.getByLabel("Buscar producto para agregar",{exact:true}).fill("Cappuccino");await actor.getByRole("button",{name:"Agregar Cappuccino",exact:true}).click();await actor.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(actor.getByRole("region",{name:"Editar pedido",exact:true})).toHaveCount(0);
  await expect(observer.getByRole("dialog")).toContainText("Cappuccino");await expect(card.getByTestId("order-total")).toContainText(/79[,.]00/);await expect(card).toHaveCount(1);mark("editObservedWithSelection");
  await observer.getByRole("button",{name:"Cerrar detalle",exact:true}).click();await actor.getByRole("button",{name:"Cerrar detalle",exact:true}).click();
  await observerContext.setOffline(true);await expect(observer.getByTestId("live-status")).toContainText(/Sin conexión|Reconectando|pendientes/);
  await actorCard.getByRole("heading").first().click();await actor.getByRole("button",{name:"Editar pedido",exact:true}).click();await actor.getByLabel("Cantidad de Cappuccino",{exact:true}).fill("2");await actor.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(actor.getByRole("region",{name:"Editar pedido",exact:true})).toHaveCount(0);await actor.getByRole("button",{name:"Cerrar detalle",exact:true}).click();
  await observerContext.setOffline(false);await observer.bringToFront();await expect(card.getByTestId("order-total")).toContainText(/99[,.]00/);await expect(card).toHaveCount(1);await expect(observer.getByTestId("live-status")).toContainText("En vivo");mark("reconnectReconciledWithoutDuplicate");
  await card.screenshot({path:"test-results/p13-live/active-desktop.png",animations:"disabled"});await observer.setViewportSize({width:390,height:844});expect(await observer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await card.screenshot({path:"test-results/p13-live/active-mobile.png",animations:"disabled"});
  await actorCard.getByRole("button",{name:"Entregado",exact:true}).click();await expect(card.getByTestId("order-status")).toHaveText("entregado");const preparation=await card.getByTestId("preparation-time").textContent();const account=await card.getByTestId("account-time").textContent();await expect.poll(()=>card.getByTestId("account-time").textContent()).not.toBe(account);await expect(card.getByTestId("preparation-time")).toHaveText(preparation!);mark("preparationStoppedAndAccountContinued");
  await card.getByRole("heading").first().click();await actorCard.getByRole("button",{name:"Pagar",exact:true}).click();await actorCard.getByRole("button",{name:"QR",exact:true}).click();
  await expect(card).toHaveCount(0);await expect(observer.getByRole("dialog")).toContainText("archivado");await expect(observer.getByRole("dialog").locator('[data-payment-kind="qr"]')).toBeVisible();mark("paymentObservedAndSelectionPreserved");
  await observer.getByRole("button",{name:"Cerrar detalle",exact:true}).click();await observer.getByRole("link",{name:"Cerrados",exact:true}).click();await expect(card).toBeVisible();await expect(card.locator('[data-payment-kind="qr"]')).toBeVisible();
  await observer.screenshot({path:"test-results/p13-live/closed-desktop.png",animations:"disabled"});
  for(const role of ["COOK","BARISTA"])expect(received[role].orders.has(fixture.hiddenId)).toBe(false);expect([...received.COOK.items.values()]).not.toContain("cafe");expect([...received.BARISTA.items.values()]).not.toContain("kitchen");
  expect(realtimeFrames).toBeGreaterThan(0);facts.realtimeFrameCount=realtimeFrames;
  writeFileSync(resolve(folder,"browser-result.json"),JSON.stringify({passed:true,...facts},null,2));
 }finally{for(const client of listeners){await client.removeAllChannels();await client.auth.signOut({scope:"local"});}await actorContext.close();await observerContext.close();}
});
