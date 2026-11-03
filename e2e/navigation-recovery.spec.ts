import {test,expect,type Page} from "@playwright/test";
import {isReadOnlyTestRequest} from "./safe-requests";

async function login(page:Page,role="ADMIN",next="/pedidos"){
 await page.goto("/login?next="+encodeURIComponent(next));await page.getByLabel("Correo electrónico").fill(process.env["E2E_"+role+"_EMAIL"]!);await page.getByLabel("Contraseña").fill(process.env["E2E_"+role+"_PASSWORD"]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({page})=>{
 await page.route("**/rest/v1/**",async route=>{if(isReadOnlyTestRequest(route.request()))return route.continue();await route.abort();throw Error("Unexpected business write");});
});

test("server-verified admin navigation survives an unavailable first role request after login and reload",async({page})=>{
 let requests=0;await page.route("**/api/auth/access",route=>{requests++;return route.fulfill({status:503,json:{error:"simulated temporary connection failure"}});});
 await login(page);await expect.poll(()=>requests).toBeGreaterThan(0);await expect(page.getByRole("link",{name:"Empleados",exact:true})).toBeVisible();
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 const response=await page.request.get("/pedidos");expect(response.status()).toBe(200);const html=await response.text();
 expect(html).toContain("Historial");expect(html).toContain("Empleados");expect(response.headers()["cache-control"]).toContain("private");
 for(const width of [1365,390]){
  await page.setViewportSize({width,height:900});await page.reload();await expect(page.getByRole("heading",{name:"Pedidos",exact:true})).toBeVisible();
  if(width===390)await page.getByRole("button",{name:"Abrir menú",exact:true}).click();
  const nav=page.getByRole("navigation",{name:"Navegación principal",exact:true});
  await expect(nav.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();await expect(nav.getByRole("link",{name:"Admin menú",exact:true})).toBeVisible();await expect(nav.getByRole("link",{name:"Empleados",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/navigation-recovery/after-${width}.png`,animations:"disabled"});
 }
 expect(errors).toEqual([]);
});

test("role bootstrap never exposes administrator links to kitchen during an access outage",async({page})=>{
 await page.route("**/api/auth/access",route=>route.fulfill({status:503,json:{error:"simulated outage"}}));
 await login(page,"COOK","/cocina");await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();
 for(const label of ["Empleados","Admin menú","Historial","Promos"])await expect(page.getByRole("link",{name:label,exact:true})).toHaveCount(0);
 await page.getByRole("link",{name:"Perfil",exact:true}).click();await expect(page).toHaveURL(/\/perfil$/);await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();await page.goto("/empleados");await expect(page).toHaveURL(/\/cocina$/);
});

test("a confirmed denial still signs out despite the server-verified navigation",async({page})=>{
 await login(page,"COOK","/cocina");await expect(page.getByRole("link",{name:"Perfil",exact:true})).toBeVisible();
 await page.route("**/api/auth/access",route=>route.fulfill({status:401,json:{error:"disabled"}}));
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page).toHaveURL(/\/login\?reason=inactive/);await expect(page.getByText(/La sesión terminó porque tu acceso/)).toBeVisible();
});
