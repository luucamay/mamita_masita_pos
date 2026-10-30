import {isReadOnlyTestRequest} from "./safe-requests";
import { test,expect,type Page } from "@playwright/test";
async function login(page:Page,role="ADMIN",next="/pedidos?view=closed&all=1"){
  await page.goto(`/login?next=${encodeURIComponent(next)}`);await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({page})=>{
  // No real business mutations are permitted by this suite.
  await page.route("**/rest/v1/**",route=>isReadOnlyTestRequest(route.request())?route.continue():route.abort());
});
test("P14 closed history is paginated without losing totals, detail or later pages",async({page})=>{
  await login(page);const nav=page.getByRole("navigation",{name:"Páginas de pedidos cerrados"});await expect(nav).toContainText("pedidos cerrados");await expect(page.locator("article[data-order-id]")).toHaveCount(24);
  const first=(await(await page.request.get("/api/orders/live?view=closed&all=1&page=1")).json());const second=(await(await page.request.get("/api/orders/live?view=closed&all=1&page=2")).json());
  expect(first.pagination.page).toBe(1);expect(first.pagination.total).toBeGreaterThan(900);expect(second.orders).toHaveLength(24);expect(second.orders.every((order:any)=>!first.orders.some((o:any)=>o.id===order.id))).toBe(true);
  const detail=await(await page.request.get(`/api/orders/live?view=closed&all=1&page=2&selected=${first.orders[0].id}`)).json();expect(detail.selected.id).toBe(first.orders[0].id);expect(detail.selected.total).toBe(first.orders[0].total);
  await nav.getByRole("link",{name:"Siguientes",exact:true}).click();await expect(page).toHaveURL(/page=2/);await expect(page.locator("article[data-order-id]").first()).toHaveAttribute("data-order-id",second.orders[0].id);
  await page.locator("article[data-order-id]").first().getByRole("heading").click();await expect(page.getByRole("dialog")).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("button",{name:"Cerrar detalle",exact:true}).click();
  const last=await(await page.request.get("/api/orders/live?view=closed&all=1&page=1000000")).json();expect(last.pagination.page).toBe(last.pagination.pages);expect(last.orders.length).toBeGreaterThan(0);
  expect((await page.request.get("/api/orders/live?view=closed&all=1&page=0")).status()).toBe(400);expect((await page.request.get("/api/orders/live?view=closed&all=1&page=1&page=2")).status()).toBe(400);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await nav.screenshot({path:"test-results/p14/closed-pagination-mobile.png"});
});
test("P14 queue API keeps fresh role boundaries and private responses",async({page,request})=>{
  expect((await request.get("/api/queues/live?queue=cafe")).status()).toBe(401);
  for(const [role,allowed,denied] of [["COOK","kitchen","cafe"],["BARISTA","cafe","kitchen"]]){
    await login(page,role);const response=await page.request.get(`/api/queues/live?queue=${allowed}`);expect(response.status()).toBe(200);expect(response.headers()["cache-control"]).toContain("private, no-store");expect(Array.isArray((await response.json()).items)).toBe(true);expect((await page.request.get(`/api/queues/live?queue=${denied}`)).status()).toBe(403);expect((await page.request.get("/api/orders/live?view=closed")).status()).toBe(403);await page.getByRole("button",{name:"Salir",exact:true}).click();
  }
});
for(const [queue,path]of [["cafe","/cafe"],["kitchen","/cocina"]])test(`P14 ${queue} pauses while hidden/offline, retains failed data and refreshes without page reload`,async({page,context})=>{
  await login(page,"ADMIN",path);await expect(page.getByTestId("queue-status")).toContainText("En vivo");
  let calls=0,failure=false;const line={order_id:"00000000-0000-0000-0000-000000000014",order_item_id:"00000000-0000-0000-0000-000000000015",order_number:"P14 QA",table_number:"QA",customer_name:null,order_status:"confirmado",item_name:"Producto QA",quantity:1,unit_price:10,line_total:10,item_status:"pending",created_at:"2026-10-30T10:00:00Z",printed_at:null};
  await page.route(`**/api/queues/live?queue=${queue}`,route=>{calls++;return route.fulfill({status:failure?503:200,json:failure?{error:"simulated outage"}:{items:[line],error:null}});});
  await page.evaluate(()=>document.documentElement.dataset.p14="same");await page.getByRole("button",{name:"Actualizar página",exact:true}).click();await expect(page.getByText("1 × Producto QA",{exact:true})).toBeVisible();
  await page.clock.install();const before=calls;await page.clock.fastForward(16000);expect(calls).toBe(before);
  failure=true;await page.getByRole("button",{name:"Actualizar página",exact:true}).click();await expect(page.getByTestId("queue-status")).toContainText("última lectura");await expect(page.getByText("1 × Producto QA",{exact:true})).toBeVisible();
  await context.setOffline(true);await expect(page.getByTestId("queue-status")).toContainText("Sin conexión");const offline=calls;await page.clock.fastForward(60000);expect(calls).toBe(offline);
  failure=false;await context.setOffline(false);await expect(page.getByTestId("queue-status")).toContainText("En vivo");
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});const hidden=calls;await page.clock.fastForward(60000);expect(calls).toBe(hidden);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});await expect.poll(()=>calls).toBeGreaterThan(hidden);expect(await page.evaluate(()=>document.documentElement.dataset.p14)).toBe("same");
});

test("P14 queue groups Realtime bursts and also reconciles header-only changes",async({page})=>{
  // Proxy the real subscription; inject synthetic server frames locally only.
  // This exercises the SDK callback/hook without committing a fake sale.
  let socket:any,subscription:any,asArray=false,topic="",joinRef:any=null,calls=0;
  await page.routeWebSocket("**/realtime/v1/websocket**",ws=>{
    socket=ws;const server=ws.connectToServer();ws.onMessage(message=>server.send(message));
    server.onMessage(message=>{
      if(typeof message==="string")try{
        const raw=JSON.parse(message),payload=Array.isArray(raw)?raw[4]:raw.payload;
        if(payload?.response?.postgres_changes){subscription=payload.response.postgres_changes;asArray=Array.isArray(raw);topic=asArray?raw[2]:raw.topic;joinRef=asArray?raw[0]:raw.join_ref;}
      }catch{}
      ws.send(message);
    });
  });
  await login(page,"ADMIN","/cafe");await expect(page.getByTestId("queue-status")).toContainText("En vivo");await expect.poll(()=>Boolean(subscription)).toBe(true);
  await page.route("**/api/queues/live?queue=cafe",async route=>{calls++;await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:{items:[],error:null}});});
  const emit=(table:string)=>{
    const binding=subscription.find((entry:any)=>entry.table===table);expect(binding).toBeTruthy();
    const payload={ids:[binding.id],data:{schema:"public",table,type:"UPDATE",commit_timestamp:new Date().toISOString(),errors:null,columns:[{name:"queue_type",type:"text"},{name:"status",type:"text"}],record:{queue_type:"cafe",status:"pending"},old_record:{}}};
    socket.send(JSON.stringify(asArray?[joinRef,null,topic,"postgres_changes",payload]:{join_ref:joinRef,ref:null,topic,event:"postgres_changes",payload}));
  };
  for(let i=0;i<20;i++)emit("order_items");await expect.poll(()=>calls).toBeGreaterThan(0);await page.waitForTimeout(800);expect(calls).toBeLessThanOrEqual(2);
  const before=calls;emit("orders");await expect.poll(()=>calls).toBeGreaterThan(before);
});
