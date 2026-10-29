// Never loads .env files. Uses only a new localhost PostgreSQL cluster and synthetic fixtures.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.env.P01_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const executable = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const temporary = mkdtempSync(join(tmpdir(), "mamita-p01-"));
const data = join(temporary, "data");
const listener = createServer();
await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("PG") && !key.startsWith("SUPABASE_"))), PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "postgres", PGDATABASE: "postgres", PGSSLMODE: "disable" };
let started = false;
let passed = 0;
let success = false;
function command(name, args) { return execFileSync(executable(name), args, { env, encoding: "utf8", timeout: 60_000, windowsHide: true, stdio: name === "pg_ctl" ? "ignore" : ["ignore", "pipe", "pipe"] }); }
function query(sql, fail = true) {
  const result = spawnSync(executable("psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], { env, input: sql, encoding: "utf8", timeout: 20_000, windowsHide: true });
  if (fail && result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result;
}
const read = (sql) => query(sql).stdout.trim();
const id = { admin: "11111111-1111-1111-1111-111111111111", staff: "22222222-2222-2222-2222-222222222222", cook: "33333333-3333-3333-3333-333333333333", barista: "44444444-4444-4444-4444-444444444444", inactive: "55555555-5555-5555-5555-555555555555", missing: "66666666-6666-6666-6666-666666666666" };
const asSql = (who, sql) => `begin; set local role ${who === "anon" ? "anon" : "authenticated"}; set local request.jwt.claim.sub='${id[who] ?? ""}'; ${sql}; commit;`;
const as = (who, sql) => read(asSql(who, sql));
function denied(who, sql, code) { const result = query(asSql(who, sql), false); assert.notEqual(result.status, 0, `Expected denial for ${who}: ${sql}`); if (code) assert(result.stderr.includes(code), result.stderr); }
function check(label, fn) { fn(); passed++; console.log(`ok ${passed} - ${label}`); }
const espresso = "aaaaaaaa-0000-0000-0000-000000000001";
const focaccia = "bbbbbbbb-0000-0000-0000-000000000001";
const cappuccino = "aaaaaaaa-0000-0000-0000-000000000002";
function createOrder(items = [{ menu_item_id: espresso, quantity: 1 }, { menu_item_id: focaccia, quantity: 1 }]) {
  const value = as("staff", `select order_id from public.create_order_with_items('QA','P01','${id.staff}','${JSON.stringify(items)}'::jsonb)`);
  assert.match(value, /^[a-f0-9-]{36}$/);
  return value;
}
function concurrently(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable("psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { env, windowsHide: true });
    let out = "", error = "";
    child.stdout.on("data", (chunk) => out += chunk);
    child.stderr.on("data", (chunk) => error += chunk);
    child.once("error", reject);
    child.once("exit", (status) => resolve({ status, out, error }));
    child.stdin.end(sql);
  });
}

try {
  console.log("P01: isolated localhost PostgreSQL, no production connection or real data.");
  command("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale=C"]);
  command("pg_ctl", ["start", "-D", data, "-l", join(temporary, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -c wal_level=logical`, "-w", "-t", "30"]);
  started = true;
  query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;
    create publication supabase_realtime;`);
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  const p01 = migrations.filter((file) => file.endsWith("_p01_permissions_integrity_amounts.sql"));
  assert.equal(p01.length, 1);
  for (const file of migrations.filter((file) => !p01.includes(file))) query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
  query(readFileSync(join(root, "supabase/tests/fixtures/p01_baseline.sql"), "utf8"));
  const legacyBefore = read("select jsonb_build_object('order',to_jsonb(o),'items',(select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where i.order_id=o.id),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.order_payments p where p.order_id=o.id)) from public.orders o where o.order_number='LEGACY-QA'");
  query(`begin; ${readFileSync(join(root, "supabase/migrations", p01[0]), "utf8")} commit;`);

  check("historical sale retains Bs 59, status, prices and customer classification", () => {
    const legacyAfter = read("select jsonb_build_object('order',to_jsonb(o)-'discount_bps'-'discount_amount'-'purchase_type'-'buyer_employee_id','items',(select jsonb_agg(to_jsonb(i)-'discount_amount'-'net_total' order by id) from public.order_items i where i.order_id=o.id),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.order_payments p where p.order_id=o.id)) from public.orders o where o.order_number='LEGACY-QA'");
    assert.equal(legacyAfter, legacyBefore);
    assert.equal(read("select subtotal||','||total||','||discount_amount||','||discount_bps||','||purchase_type||','||status from public.orders where order_number='LEGACY-QA'"), "59.00,59.00,0.00,0,customer,archivado");
    assert.equal(read("select line_total||','||net_total from public.order_items where order_id='99999999-9999-9999-9999-999999999999'"), "59.00,59.00");
  });
  check("anon, inactive and missing profiles cannot invoke lower or higher order RPCs", () => {
    for (const role of ["anon", "inactive", "missing", "cook", "barista"]) {
      denied(role, "select * from public.create_order('QA')");
      denied(role, `select * from public.create_order_with_items('QA',null,'${id[role] ?? id.staff}','[]')`);
    }
    for (const role of ["inactive", "missing"]) {
      assert.equal(as(role, "select count(*) from public.menu_items"), "0");
      assert.equal(as(role, "select count(*) from public.v_kitchen_tickets"), "0");
      assert.equal(as(role, "select count(*) from public.v_order_detail"), "0");
    }
  });
  check("profiles are readable without recursion; role escalation and direct financial writes fail", () => {
    assert.equal(as("staff", `select role from public.profiles where id='${id.staff}'`), "staff");
    for (const who of ["admin", "staff", "cook", "barista", "inactive"]) {
      denied(who, `update public.profiles set role='admin',active=true where id='${id.staff}'`);
      denied(who, "insert into public.orders(order_number,table_number,total) values('forged','QA',0)");
      denied(who, "delete from public.order_payments");
      denied(who, "select public.clear_order_history()");
      denied(who, "select public.recalculate_order_totals('99999999-9999-9999-9999-999999999999')");
      denied(who, "select private.recalculate_order_totals('99999999-9999-9999-9999-999999999999')");
    }
    assert.equal(as("staff", `select role from public.profiles where id='${id.staff}'`), "staff");
  });
  check("only active admin edits the menu; inactive token loses access immediately", () => {
    for (const who of ["staff", "cook", "barista", "inactive"]) {
      const before = read(`select price from public.menu_items where id='${espresso}'`);
      query(asSql(who, `update public.menu_items set price=1 where id='${espresso}'`), false);
      assert.equal(read(`select price from public.menu_items where id='${espresso}'`), before);
      denied(who, "insert into public.categories(name,slug,queue_type) values('bad','bad','cafe')");
    }
    as("admin", `update public.menu_items set price=10 where id='${espresso}'`);
    assert.equal(read(`select updated_by from public.menu_items where id='${espresso}'`), id.admin);
    denied("admin", `update public.menu_items set price='NaN' where id='${espresso}'`);
    query(`update public.profiles set active=false where id='${id.staff}'`);
    denied("staff", "select * from public.create_order('QA')");
    assert.equal(as("staff", "select count(*) from public.orders"), "0");
    query(`update public.profiles set active=true where id='${id.staff}'`);
  });
  check("bad or fractional items roll back the whole order, including the daily counter", () => {
    const before = read("select (select count(*) from public.orders)||','||(select coalesce(sum(next_sequence),0) from public.order_daily_counters)");
    for (const items of [null, {}, [], [{ menu_item_id: espresso, quantity: 1.2 }], [{ menu_item_id: espresso, quantity: 1 }, { menu_item_id: "00000000-0000-0000-0000-000000000000", quantity: 1 }]]) {
      denied("staff", `select * from public.create_order_with_items('QA',null,'${id.staff}','${JSON.stringify(items)}'::jsonb)`);
    }
    assert.equal(read("select (select count(*) from public.orders)||','||(select coalesce(sum(next_sequence),0) from public.order_daily_counters)"), before);
    denied("staff", `select * from public.create_order('QA',null,'${id.admin}')`);
  });

  const order = createOrder();
  const cafeLine = read(`select id from public.order_items where order_id='${order}' and queue_type='cafe'`);
  const kitchenLine = read(`select id from public.order_items where order_id='${order}' and queue_type='kitchen'`);
  check("all financial mutators reject wrong roles with SQLSTATE 42501", () => {
    const mutations = [
      `select * from public.add_order_item('${order}','${cappuccino}',1)`,
      `select * from public.update_order_item('${cafeLine}',2)`,
      `select * from public.confirm_order('${order}')`,
      `select * from public.mark_order_delivered('${order}')`,
      `select * from public.register_payment('${order}','cash')`,
      `select * from public.archive_order('${order}')`,
      `select * from public.checkout_order('${order}','cash')`,
    ];
    for (const who of ["anon", "inactive", "missing", "cook", "barista"]) for (const sql of mutations) denied(who, sql, "42501");
    for (const sql of [
      `select * from public.add_order_item('${order}','${cappuccino}',1,'${id.admin}')`,
      `select * from public.update_order_item('${cafeLine}',2,'update','${id.admin}')`,
      `select * from public.confirm_order('${order}','${id.admin}')`,
      `select * from public.mark_order_delivered('${order}','${id.admin}')`,
      `select * from public.archive_order('${order}','${id.admin}')`,
      `select * from public.checkout_order('${order}','cash','${id.admin}')`,
    ]) denied("staff", sql, "42501");
    assert.equal(read("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')"), "0");
    for (const table of ["order_items", "order_payments", "order_events", "print_jobs", "order_daily_counters"]) denied("staff", `delete from public.${table}`, "42501");
  });
  check("queue roles see and deliver only their queue; pending orders cannot be paid", () => {
    assert.equal(read(`select total from public.orders where id='${order}'`), "59.00");
    assert.equal(as("cook", `select count(*) from public.order_items where order_id='${order}' and queue_type='cafe'`), "0");
    assert.equal(as("barista", `select count(*) from public.order_items where order_id='${order}' and queue_type='kitchen'`), "0");
    denied("cook", `select * from public.mark_order_item_delivered('${cafeLine}')`);
    denied("barista", `select * from public.mark_kitchen_item_delivered('${kitchenLine}')`);
    denied("staff", `select * from public.checkout_order('${order}','cash')`);
    denied("staff", `select * from public.archive_order('${order}')`);
    as("barista", `select * from public.mark_order_item_delivered('${cafeLine}')`);
    assert.equal(read(`select status from public.orders where id='${order}'`), "confirmado");
    as("cook", `select * from public.mark_kitchen_item_delivered('${kitchenLine}')`);
    assert.equal(read(`select status from public.orders where id='${order}'`), "entregado");
  });
  check("atomic checkout and identical retries create one payment and one archive", () => {
    denied("staff", `select * from public.register_payment('${order}','cash','${id.admin}')`);
    denied("cook", `select * from public.checkout_order('${order}','cash')`);
    const first = as("staff", `select payment_id from public.checkout_order('${order}','cash')`);
    assert.equal(as("staff", `select payment_id from public.checkout_order('${order}','cash')`), first);
    assert.equal(read(`select count(*) from public.order_payments where order_id='${order}'`), "1");
    assert.equal(read(`select amount from public.order_payments where order_id='${order}'`), "59.00");
    assert.equal(read(`select status from public.orders where id='${order}'`), "archivado");
    assert.equal(read(`select count(*) from public.order_events where order_id='${order}' and event_type='order_archived'`), "1");
    denied("staff", `select * from public.checkout_order('${order}','qr')`);
    for (const sql of [`select * from public.add_order_item('${order}','${cappuccino}',1)`, `select * from public.update_order_item('${cafeLine}',2)`, `select * from public.confirm_order('${order}')`, `select * from public.mark_order_delivered('${order}')`]) denied("staff", sql);
    denied("staff", `update public.orders set total=1,status='entregado' where id='${order}'`);
    denied("staff", `update public.order_items set quantity=10 where id='${cafeLine}'`);
    assert.equal(as("staff", "select count(*) from public.v_sales_report_line_items"), "0");
    assert(Number(as("admin", "select count(*) from public.v_sales_report_line_items")) > 0);
  });
  check("pending removal preserves audit, excludes voided amounts and rejects delivered edits", () => {
    const id = createOrder();
    const line = read(`select id from public.order_items where order_id='${id}' and queue_type='cafe'`);
    as("staff", `select * from public.update_order_item('${line}',null,'remove')`);
    assert.equal(read(`select status||','||net_total from public.order_items where id='${line}'`), "voided,0.00");
    assert.equal(read(`select total from public.orders where id='${id}'`), "49.00");
    as("staff", `select * from public.mark_order_delivered('${id}')`);
    assert.equal(read(`select status from public.order_items where id='${line}'`), "voided");
    const delivered = read(`select id from public.order_items where order_id='${id}' and queue_type='kitchen'`);
    denied("staff", `select * from public.update_order_item('${delivered}',2)`);
  });
  check("percentage allocation reconciles SQL cents, including a one-cent tie", () => {
    const order = createOrder();
    query(`update public.orders set discount_bps=2000,discount_amount=11.8,total=47.2,purchase_type='employee',buyer_employee_id='${id.staff}' where id='${order}'; select private.recalculate_order_totals('${order}')`);
    assert.equal(read(`select total from public.orders where id='${order}'`), "47.20");
    assert.equal(read(`select sum(net_total)||','||sum(discount_amount) from public.order_items where order_id='${order}'`), "47.20,11.80");
    const line = read(`select id from public.order_items where order_id='${order}' and queue_type='cafe'`);
    as("staff", `select * from public.update_order_item('${line}',10)`);
    assert.equal(read(`select total from public.orders where id='${order}'`), "119.20");
    as("staff", `select * from public.update_order_item('${line}',1)`);
    assert.equal(read(`select total from public.orders where id='${order}'`), "47.20");
    const tiny = createOrder([{ menu_item_id: "aaaaaaaa-0000-0000-0000-000000000003", quantity: 1 }, { menu_item_id: "aaaaaaaa-0000-0000-0000-000000000003", quantity: 1 }]);
    query(`update public.orders set discount_bps=5000,discount_amount=0.01,total=0.01 where id='${tiny}'; select private.recalculate_order_totals('${tiny}')`);
    assert.equal(read(`select sum(net_total)||','||sum(discount_amount) from public.order_items where order_id='${tiny}'`), "0.01,0.01");
    assert.equal(read(`select discount_amount from public.order_items where order_id='${tiny}' order by id limit 1`), "0.01");
  });
  check("failure during archive rolls back the payment and supports a clean retry", () => {
    const order = createOrder();
    as("staff", `select * from public.mark_order_delivered('${order}')`);
    query(`create function public.p01_fail_archive() returns trigger language plpgsql as $$ begin if new.event_type='order_archived' then raise exception 'simulated failure'; end if; return new; end $$; create trigger p01_fail_archive before insert on public.order_events for each row execute function public.p01_fail_archive()`);
    denied("staff", `select * from public.checkout_order('${order}','qr')`);
    assert.equal(read(`select count(*) from public.order_payments where order_id='${order}'`), "0");
    assert.equal(read(`select status from public.orders where id='${order}'`), "entregado");
    query("drop trigger p01_fail_archive on public.order_events; drop function public.p01_fail_archive()");
    as("staff", `select * from public.checkout_order('${order}','qr')`);
  });
  const concurrentOrder = createOrder();
  as("staff", `select * from public.mark_order_delivered('${concurrentOrder}')`);
  const results = await Promise.all([concurrently(asSql("staff", `select * from public.checkout_order('${concurrentOrder}','cash'); select pg_sleep(0.2)`)), concurrently(asSql("staff", `select * from public.checkout_order('${concurrentOrder}','cash')`))]);
  check("simultaneous checkout sessions serialize into one payment", () => {
    assert(results.every((result) => result.status === 0), JSON.stringify(results));
    assert.equal(read(`select count(*) from public.order_payments where order_id='${concurrentOrder}'`), "1");
  });
  const racingOrder = createOrder();
  as("staff", `select * from public.mark_order_delivered('${racingOrder}')`);
  const racing = await Promise.all([concurrently(asSql("staff", `select * from public.add_order_item('${racingOrder}','${cappuccino}',1); select pg_sleep(0.2)`)), concurrently(asSql("staff", `select * from public.checkout_order('${racingOrder}','cash')`))]);
  check("editing versus payment cannot charge a stale total or edit a closed order", () => {
    assert.equal(racing.filter((result) => result.status === 0).length, 1, JSON.stringify(racing));
    const final = read(`select status||','||total||','||(select count(*) from public.order_payments p where p.order_id=o.id) from public.orders o where id='${racingOrder}'`);
    assert(["confirmado,79.00,0", "archivado,59.00,1"].includes(final), final);
  });
  success = true;
  console.log(JSON.stringify({ checksPassed: passed, productionConnected: false, realSalesCreated: false }));
} finally {
  if (started) command("pg_ctl", ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"]);
  // Resolve and verify the precise temporary root before any recursive removal on Windows.
  const target = resolve(temporary);
  if (success && dirname(target) === resolve(tmpdir()) && basename(target).startsWith("mamita-p01-")) rmSync(target, { recursive: true, force: true });
  else console.log(`Local diagnostic files retained at: ${target}`);
}
