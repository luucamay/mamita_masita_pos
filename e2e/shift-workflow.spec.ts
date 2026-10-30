import {test,expect,type Page} from "@playwright/test";
import {qaCashActor,qaCashContext,qaCashHistory,qaCashShift} from "../lib/qa-cashbox-fixture";
import {isReadOnlyTestRequest} from "./safe-requests";
import type {CashContext,CashShift} from "../lib/cashbox";
async function login(page:Page,role="STAFF",next="/caja"){
 await page.goto("/login?next="+encodeURIComponent(next));await page.getByLabel("Correo electrónico").fill(process.env["E2E_"+role+"_EMAIL"]!);await page.getByLabel("Contraseña").fill(process.env["E2E_"+role+"_PASSWORD"]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
 if(next.startsWith("/qa-preview/"))await page.goto(next);
}
test.beforeEach(async({page})=>{
 await page.route("**/rest/v1/**",async route=>{if(isReadOnlyTestRequest(route.request()))return route.continue();await route.abort();throw Error("Unexpected real financial write");});
});
async function mockDrawer(page:Page,state="empty",lost=false){
 let context=qaCashContext(state),history=qaCashHistory(),first=true;
 const calls:{name:string;body:any}[]=[];
 await page.route("**/rest/v1/rpc/*",async route=>{
  const name=new URL(route.request().url()).pathname.split("/").at(-1)!;
  if(name==="get_cashbox_context")return route.fulfill({json:context});
  if(name==="list_cashbox_shifts")return route.fulfill({json:history});
  if(name==="open_cashbox_shift"){
   const body=route.request().postDataJSON();calls.push({name,body});
   const shift=qaCashShift();shift.opening_cash=Number(body.p_cash);shift.previous_shift_id=body.p_previous_shift;shift.cashier_name="Cajero entrante QA";shift.id="00000000-0000-4000-8000-000000009811";
   if(context.shift?.status==="awaiting_receipt"){
    const previous={...context.shift,status:"received" as const,received_at:"2026-10-30T20:01:00Z",received_by:qaCashActor,received_by_name:"Cajero entrante QA",received_cash:Number(body.p_cash),receipt_difference:Number(body.p_cash)-context.shift.cash_left!,receipt_note:body.p_note};
    history={...history,total_count:1,shifts:[previous]};
   }
   context={...context,enabled:true,shift,receipts:[],summary:{cash:0,qr:0,other:0,receipts:0,expected_cash:Number(body.p_cash)}};
   return route.fulfill({json:shift});
  }
  if(name==="close_cashbox_shift"){
   const body=route.request().postDataJSON();calls.push({name,body});
   if(lost&&first){first=false;return route.abort();}
   const shift:CashShift={...context.shift!,status:"awaiting_receipt",closed_at:"2026-10-30T20:00:00Z",closed_by:qaCashActor,closed_by_name:"Ana QA",counted_cash:Number(body.p_counted),withdrawal:Number(body.p_withdrawal),cash_left:Number(body.p_counted)-Number(body.p_withdrawal),cash_net:50,qr_net:20,receipt_count:2,difference:Number(body.p_counted)-150,close_note:body.p_note,closing_snapshot:context.receipts};
   context={...context,shift};history={...history,total_count:1,shifts:[shift]};
   return route.fulfill({json:shift});
  }
  return route.fallback();
 });
 return {calls,get:()=>context};
}
test("fixed local username creates a masked credential handover and copies only on request",async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copiedCredentials=text;}}}));
 let submitted:any;
 await page.route("**/api/employees",async route=>{
  if(route.request().method()!=="POST")return route.continue();
  submitted=route.request().postDataJSON();
  return route.fulfill({json:{employee:{id:"00000000-0000-4000-8000-000000009901",full_name:submitted.fullName,email:submitted.email,role:submitted.role,active:true,updated_at:"2026-10-30T15:00:00Z"},resumed:false}});
 });
 await login(page,"ADMIN","/qa-preview/employees");
 await page.getByRole("button",{name:"Agregar empleado",exact:true}).click();
 await page.getByLabel("Nombre completo",{exact:true}).fill("Ána Flores");await expect(page.getByLabel("Usuario de acceso",{exact:true})).toHaveValue("ana");await expect(page.getByText("@mamita.local",{exact:true})).toBeVisible();
 await page.getByLabel("Usuario de acceso",{exact:true}).fill("ana2");await page.getByRole("button",{name:"Generar contraseña",exact:true}).click();
 await page.getByRole("button",{name:"Crear acceso",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Credenciales de acceso",exact:true});
 await expect(dialog.getByLabel("Usuario",{exact:true})).toHaveValue("ana2@mamita.local");
 await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveAttribute("type","password");
 await dialog.getByRole("button",{name:"Ver contraseña",exact:true}).click();await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveAttribute("type","text");
 await dialog.getByRole("button",{name:"Ocultar contraseña",exact:true}).click();
 await dialog.getByRole("button",{name:"Copiar credenciales",exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__copiedCredentials)).toBe("Mamita Masita\nUsuario: ana2@mamita.local\nContraseña: "+submitted.password);
 expect(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),submitted.password)).toBe(false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:"test-results/turnos/credentials-mobile.png",animations:"disabled"});
 await dialog.getByRole("button",{name:"Cerrar ventana",exact:true}).click();
 await page.getByRole("button",{name:"Ver credenciales de Ána Flores",exact:true}).click();await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveAttribute("type","password");
});
test("existing credentials require explicit reset and keep the same operation after a lost response",async({page})=>{
 const requests:any[]=[];
 await page.route("**/api/employees/*/password",async route=>{
  requests.push(route.request().postDataJSON());if(requests.length===1)return route.abort();
  return route.fulfill({json:{employee:{id:"00000000-0000-4000-8000-000000005002",email:"atencion@example.test"},resumed:true}});
 });
 await login(page,"ADMIN","/qa-preview/employees");await page.getByRole("button",{name:"Ver credenciales de Atención QA",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Credenciales de acceso",exact:true});
 await expect(dialog.getByRole("button",{name:"Copiar credenciales",exact:true})).toHaveCount(0);
 await dialog.getByRole("button",{name:"Generar nueva contraseña",exact:true}).click();expect(requests).toHaveLength(0);
 await dialog.getByRole("button",{name:"Confirmar nueva contraseña",exact:true}).click();await expect(dialog.getByRole("alert")).toBeVisible();await expect(dialog.getByRole("button",{name:"Copiar credenciales",exact:true})).toHaveCount(0);
 await dialog.getByRole("button",{name:"Confirmar nueva contraseña",exact:true}).click();await expect(dialog.getByRole("button",{name:"Copiar credenciales",exact:true})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveAttribute("type","password");
});
test("six table shortcuts stay on a single line at small phone widths",async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,"STAFF","/");await page.getByPlaceholder("Buscar ítem...").fill("Cappuccino");await page.getByRole("button",{name:"Agregar Cappuccino",exact:true}).click();await page.getByRole("button",{name:"Ver pedido",exact:true}).click();
 const row=page.getByTestId("table-shortcuts");
 await expect(row.getByRole("button")).toHaveText(["1","2","3","4","5","6","Para llevar","Otra"]);
 for(const width of [320,360,390,1365]){
  await page.setViewportSize({width,height:844});const boxes=await row.getByRole("button").evaluateAll(buttons=>buttons.map(b=>({top:b.getBoundingClientRect().top,width:b.getBoundingClientRect().width,overflow:b.scrollWidth>b.clientWidth})));
  expect(new Set(boxes.map(b=>b.top)).size).toBe(1);expect(boxes.every(b=>b.width>=24&&!b.overflow)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/turnos/tables-"+width+".png",animations:"disabled"});
 }
});
test("cashbox opens with the counted initial cash and never sends a real financial write",async({page})=>{
 const mock=await mockDrawer(page);await login(page,"STAFF","/caja");
 await page.getByRole("button",{name:"Abrir caja",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Abrir caja",exact:true});
 await dialog.getByLabel("Efectivo inicial para cambio (Bs)",{exact:true}).fill("100");
 await dialog.getByRole("checkbox").check();await dialog.getByRole("button",{name:"Confirmar apertura",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Caja de Cajero entrante QA",exact:true})).toBeVisible();
 expect(mock.calls).toHaveLength(1);expect(mock.calls[0].body.p_cash).toBe("100.00");expect(mock.calls[0].body.p_previous_shift).toBeNull();
});
test("close and handover reconcile initial cash, withdrawal and differences; retry does not change the request",async({page})=>{
 const mock=await mockDrawer(page,"open",true);await login(page,"STAFF","/caja");
 await page.getByRole("button",{name:"Cerrar y entregar caja",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Cerrar y entregar caja",exact:true});
 await dialog.getByLabel("Efectivo contado (Bs)",{exact:true}).fill("155");await dialog.getByLabel("Retiro de efectivo (Bs, opcional)",{exact:true}).fill("50");
 await dialog.getByLabel("Observación (obligatoria)",{exact:true}).fill("Sobran cinco, retiro autorizado QA");await dialog.getByRole("checkbox").check();
 await expect(dialog.getByText(/Dejas en caja:/)).toContainText(/105[,.]00/);
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:"test-results/turnos/close-"+width+".png",animations:"disabled"});}
 await dialog.getByRole("button",{name:"Confirmar cierre y entrega",exact:true}).click();await expect(dialog.getByRole("alert")).toBeVisible();
 await dialog.getByRole("button",{name:"Confirmar cierre y entrega",exact:true}).click();await expect(page.getByRole("heading",{name:"Caja entregada, pendiente de recepción",exact:true})).toBeVisible();
 expect(mock.calls).toHaveLength(2);expect(mock.calls[0].body).toEqual(mock.calls[1].body);expect(mock.get().shift?.cash_left).toBe(105);expect(mock.get().shift?.difference).toBe(5);
 await expect(page.getByRole("region",{name:"Mis cierres de caja",exact:true})).toContainText(/Diferencia al cerrar/);
});
test("incoming cashier counts the received amount and records a discrepancy before opening",async({page})=>{
 const mock=await mockDrawer(page,"pending");await login(page,"STAFF","/caja");
 await page.getByRole("button",{name:"Recibir caja e iniciar turno",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Recibir caja",exact:true});
 await dialog.getByLabel("Efectivo recibido (Bs)",{exact:true}).fill("95");await dialog.getByLabel("Observación (obligatoria)",{exact:true}).fill("Faltan cinco al contar");await dialog.getByRole("checkbox").check();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:"test-results/turnos/receive-mobile.png",animations:"disabled"});
 await dialog.getByRole("button",{name:"Confirmar recepción y abrir",exact:true}).click();await expect(page.getByRole("heading",{name:"Caja de Cajero entrante QA",exact:true})).toBeVisible();
 expect(mock.calls[0].body.p_cash).toBe("95.00");expect(mock.calls[0].body.p_previous_shift).toBeTruthy();
 await expect(page.getByRole("region",{name:"Mis cierres de caja",exact:true})).toContainText("Diferencia:");
});
test("staff sees the collection explanation and kitchen gets compact product cards",async({page})=>{
 await login(page,"STAFF","/compras-empleados");await expect(page.getByText(/Ana envía su café desde Perfil/)).toBeVisible();
 const item={order_id:"00000000-0000-4000-8000-000000008000",order_item_id:"00000000-0000-4000-8000-000000008001",order_number:"QA-COCINA",table_number:"6",customer_name:null,order_status:"confirmado",item_name:"Sándwich QA",quantity:2,unit_price:10,line_total:20,item_status:"pending",created_at:"2026-10-30T15:00:00Z",printed_at:null};
 await page.route("**/api/queues/live?queue=kitchen",route=>route.fulfill({json:{items:[item],error:null}}));await page.goto("/cocina");await page.getByRole("button",{name:"Actualizar página",exact:true}).click();
 await expect(page.getByText("2 × Sándwich QA",{exact:true})).toBeVisible();
 for(const width of [1365,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"test-results/turnos/kitchen-"+width+".png",animations:"disabled"});}
});
test("only authorized active users can open Caja or reset passwords; invalid admin reset writes nothing",async({page})=>{
 const endpoint="/api/employees/00000000-0000-4000-8000-000000005002/password";
 expect((await page.request.post(endpoint,{data:{}})).status()).toBe(401);
 await login(page,"STAFF","/caja");await expect(page.getByRole("heading",{name:"Caja y turnos",exact:true})).toBeVisible();
 const base="http://127.0.0.1:3101";
 expect((await page.request.post(endpoint,{headers:{origin:base},data:{requestId:crypto.randomUUID(),password:"Synthetic12345"}})).status()).toBe(403);
 await page.getByRole("button",{name:"Salir",exact:true}).click();await expect(page).toHaveURL(/\/login/);await login(page,"ADMIN","/empleados");
 expect((await page.request.post(endpoint,{headers:{origin:base},data:{requestId:crypto.randomUUID(),password:"bad"}})).status()).toBe(400);
 await page.getByRole("button",{name:"Salir",exact:true}).click();await expect(page).toHaveURL(/\/login/);await login(page,"COOK","/cocina");await page.goto("/caja");await expect(page).toHaveURL("/cocina");
});

test("cashbox handover updates live without reloading or writing a real shift",async({page})=>{
 const subscriptions:{socket:any;bindings:any[];array:boolean;topic:string;joinRef:any}[]=[];
 await page.routeWebSocket("**/realtime/v1/websocket**",socket=>{
  const server=socket.connectToServer();socket.onMessage(message=>server.send(message));
  server.onMessage(message=>{
   if(typeof message==="string")try{
    const raw=JSON.parse(message),array=Array.isArray(raw),payload=array?raw[4]:raw.payload;
    if(payload?.response?.postgres_changes?.some((entry:any)=>entry.table==="cash_shifts"))subscriptions.push({socket,bindings:payload.response.postgres_changes,array,topic:array?raw[2]:raw.topic,joinRef:array?raw[0]:raw.join_ref});
   }catch{}
   socket.send(message);
  });
 });
 const mock=await mockDrawer(page);await login(page,"STAFF","/caja");
 await expect(page.getByRole("button",{name:"Abrir caja",exact:true})).toBeVisible();
 await expect.poll(()=>subscriptions.length).toBeGreaterThan(0);
 // Let the subscription's initial reconciliation finish before the injected event.
 await page.waitForTimeout(600);await page.evaluate(()=>document.documentElement.dataset.cashboxPage="same");
 Object.assign(mock.get(),qaCashContext("pending"));
 for(const entry of subscriptions){
  const binding=entry.bindings.find(b=>b.table==="cash_shifts");
  const payload={ids:[binding.id],data:{schema:"public",table:"cash_shifts",type:"UPDATE",commit_timestamp:new Date().toISOString(),errors:null,columns:[{name:"status",type:"text"}],record:{id:mock.get().shift!.id,status:"awaiting_receipt"},old_record:{}}};
  entry.socket.send(JSON.stringify(entry.array?[entry.joinRef,null,entry.topic,"postgres_changes",payload]:{join_ref:entry.joinRef,ref:null,topic:entry.topic,event:"postgres_changes",payload}));
 }
 await expect(page.getByRole("heading",{name:"Caja entregada, pendiente de recepción",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.dataset.cashboxPage)).toBe("same");expect(mock.calls).toHaveLength(0);
});
