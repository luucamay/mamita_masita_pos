import {test,expect,type Page} from "@playwright/test";
import {isReadOnlyTestRequest} from "./safe-requests";
import {ACCESS_CHANNEL,ACCESS_EVENT} from "../lib/access-notification";

async function login(page:Page,role="COOK",next="/cocina"){
 await page.goto("/login?next="+encodeURIComponent(next));await page.getByLabel("Correo electrónico").fill(process.env["E2E_"+role+"_EMAIL"]!);await page.getByLabel("Contraseña").fill(process.env["E2E_"+role+"_PASSWORD"]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({page})=>{
 await page.route("**/rest/v1/**",async route=>{if(isReadOnlyTestRequest(route.request()))return route.continue();await route.abort();throw Error("Unexpected business write");});
});

test("employee sharing opens only a WhatsApp draft containing the canonical app link, not the password",async({page})=>{
 await page.addInitScript(()=>{window.open=((url:string)=>{(window as any).__shareUrl=url;return null;}) as any;});
 await page.route("**/api/employees",async route=>{
  if(route.request().method()!=="POST")return route.continue();const value=route.request().postDataJSON();
  return route.fulfill({json:{employee:{id:"00000000-0000-4000-8000-000000009902",full_name:value.fullName,email:value.email,role:value.role,active:true,updated_at:new Date().toISOString()},resumed:false}});
 });
 await login(page,"ADMIN","/qa-preview/employees");await page.goto("/qa-preview/employees");
 await page.getByRole("button",{name:"Agregar empleado",exact:true}).click();await page.getByLabel("Nombre completo",{exact:true}).fill("Ana Prueba");await page.getByRole("button",{name:"Generar contraseña",exact:true}).click();await page.getByRole("button",{name:"Crear acceso",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Credenciales de acceso",exact:true});const password=await dialog.getByLabel("Contraseña",{exact:true}).inputValue();await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveAttribute("type","password");
 await dialog.getByRole("button",{name:"Compartir app por WhatsApp",exact:true}).click();
 const url=new URL(await page.evaluate(()=>(window as any).__shareUrl));expect(url.origin).toBe("https://wa.me");const message=url.searchParams.get("text")!;
 expect(message).toContain("https://mamita.example.test/login");expect(message).toContain("pantalla de inicio");expect(message).not.toContain(password);expect(message).not.toContain("ana@mamita.local");
 for(const width of [1365,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dialog.screenshot({path:`test-results/access-sharing/credentials-${width}.png`,animations:"disabled"});}
 await dialog.getByRole("button",{name:"Cerrar ventana",exact:true}).click();await page.reload();await page.getByRole("button",{name:"Ver credenciales de Atención QA",exact:true}).click();await expect(dialog.getByLabel("Contraseña",{exact:true})).toHaveCount(0);await expect(dialog.getByRole("button",{name:"Compartir app por WhatsApp",exact:true})).toBeVisible();
});

test("live hint checks the server: an inactive employee exits immediately while admin remains signed in",async({page,context,browser})=>{
 let access=200,calls=0,inject:()=>void=()=>{};
 await page.routeWebSocket("**/realtime/v1/websocket**",socket=>{
  const server=socket.connectToServer();socket.onMessage(message=>server.send(message));
  server.onMessage(message=>{
   if(typeof message==="string")try{
    const raw=JSON.parse(message),array=Array.isArray(raw),topic=array?raw[2]:raw.topic,event=array?raw[3]:raw.event,payload=array?raw[4]:raw.payload;
    if(topic===`realtime:${ACCESS_CHANNEL}`&&event==="phx_reply"&&payload?.status==="ok"){
     inject=()=>socket.send(JSON.stringify(array?[raw[0],null,topic,"broadcast",{event:ACCESS_EVENT,payload:{},type:"broadcast"}]:{join_ref:raw.join_ref,ref:null,topic,event:"broadcast",payload:{event:ACCESS_EVENT,payload:{},type:"broadcast"}}));
    }
   }catch{}
   socket.send(message);
  });
 });
 await page.route("**/api/auth/access",route=>{calls++;return route.fulfill({status:access,json:access===200?{role:"cook",userId:"QA"}:{error:"Denied"}});});
 await login(page);await expect.poll(()=>calls).toBeGreaterThan(0);await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();await page.waitForTimeout(700);
 const adminContext=await browser.newContext();const admin=await adminContext.newPage();await login(admin,"ADMIN","/empleados");
 // An unsolicited/spoofed public hint cannot log out an active user.
 const initial=calls;inject();await expect.poll(()=>calls).toBeGreaterThan(initial);await expect(page).not.toHaveURL(/\/login/);
 const second=await context.newPage();await second.route("**/api/auth/access",route=>route.fulfill({status:access,json:access===200?{role:"cook",userId:"QA"}:{error:"Denied"}}));await second.goto("/perfil");await expect(second.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();
 access=401;inject();await expect(page).toHaveURL(/\/login\?reason=inactive/);await expect(page.getByText(/La sesión terminó porque tu acceso/)).toBeVisible();
 await expect(second).toHaveURL(/\/login/);await expect(admin).toHaveURL(/\/empleados/);await expect(admin.getByRole("button",{name:"Agregar empleado",exact:true})).toBeVisible();await adminContext.close();
});

test("failed access checks retain the view; periodic fallback catches a missed deactivation",async({page})=>{
 await page.clock.install();
 let access=200,calls=0;await page.route("**/api/auth/access",route=>{calls++;return route.fulfill({status:access,json:access===200?{role:"cook",userId:"QA"}:{error:"Unavailable"}});});
 await login(page);await expect.poll(()=>calls).toBeGreaterThan(0);await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();
 access=503;const first=calls;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect.poll(()=>calls).toBeGreaterThan(first);await expect(page).not.toHaveURL(/\/login/);
 await page.clock.runFor(300);access=401;const before=calls;await page.clock.fastForward(16000);await page.clock.runFor(2000);await expect.poll(()=>calls).toBeGreaterThan(before);await expect(page).toHaveURL(/\/login/);
});

test("returning to the foreground catches deactivation while the app was suspended",async({page})=>{
 await page.clock.install();
 let access=200,calls=0;await page.route("**/api/auth/access",route=>{calls++;return route.fulfill({status:access,json:access===200?{role:"cook",userId:"QA"}:{error:"Denied"}});});
 await login(page);await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();await page.waitForTimeout(500);
 await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
 const before=calls;await page.clock.fastForward(16000);expect(calls).toBe(before);
 access=401;await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{value:"visible",configurable:true});document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("online"));});
 await page.clock.runFor(300);await expect(page).toHaveURL(/\/login/);
});

test("access endpoint authenticates the caller and returns private noncached responses",async({page,request})=>{
 expect((await request.get("/api/auth/access")).status()).toBe(401);await login(page,"COOK","/cocina");
 const result=await page.request.get("/api/auth/access");expect(result.status()).toBe(200);expect(result.headers()["cache-control"]).toContain("private, no-store");expect((await result.json()).role).toBe("cook");
});
