import { testReporting } from "./test-reporting-checks.mjs";
// Never loads .env files. Uses only a new localhost PostgreSQL cluster and synthetic fixtures.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";

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
  for (const file of migrations.filter((file) => file < p01[0])) query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
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
  if (["p04", "p05", "p06", "p07", "p09", "p10"].includes(process.argv[2])) {
    const migration = migrations.find((file) => file.endsWith("_p04_edit_orders.sql"));
    assert(migration);
    query(`begin; ${readFileSync(join(root, "supabase/migrations", migration), "utf8")} commit;`);
    const revision = (order) => read(`select revision from public.orders where id='${order}'`);
    const editSql = (order, version, changes, key = randomUUID()) => `select public.edit_order('${order}',${version},'${JSON.stringify(changes)}'::jsonb,'${key}')`;
    check("P04 add/remove keeps the order, totals 59 → 79 → 69 and creation time", () => {
      const order = createOrder();
      const created = read(`select created_at from public.orders where id='${order}'`);
      const kitchen = read(`select printed_at from public.order_items where order_id='${order}' and queue_type='kitchen'`);
      const changes = [{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 20 }];
      const version = revision(order), key = randomUUID();
      const saved = JSON.parse(as("staff", editSql(order, version, changes, key)));
      assert.equal(Number(saved.order.total), 79);
      as("staff", editSql(order, version, changes, key));
      assert.equal(read(`select count(*) from public.order_items where order_id='${order}' and menu_item_id='${cappuccino}'`), "1");
      const coffee = read(`select id from public.order_items where order_id='${order}' and menu_item_id='${espresso}'`);
      const after = JSON.parse(as("staff", editSql(order, revision(order), [{ action: "remove", order_item_id: coffee }])));
      assert.equal(Number(after.order.total), 69);
      assert.equal(after.items.find((line) => line.id === coffee).status, "voided");
      assert.equal(read(`select created_at from public.orders where id='${order}'`), created);
      assert.equal(read(`select printed_at from public.order_items where order_id='${order}' and queue_type='kitchen'`), kitchen);
      assert.equal(read(`select count(*) from public.print_jobs where order_id='${order}'`), "1");
    });
    check("P04 stale versions, alien lines, invalid catalog and roles cannot edit", () => {
      const order = createOrder(), version = revision(order);
      const change = [{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 20 }];
      for (const who of ["anon", "inactive", "missing", "cook", "barista"]) {
        denied(who, editSql(order, version, change), "42501");
        denied(who, `select public.get_order_edit_snapshot('${order}')`, "42501");
      }
      denied("staff", editSql(order, version, [{ ...change[0], expected_unit_price: 1 }]), "40001");
      as("staff", editSql(order, version, change));
      denied("staff", editSql(order, version, change), "40001");
      const other = createOrder();
      const foreignLine = read(`select id from public.order_items where order_id='${other}' limit 1`);
      denied("staff", editSql(order, revision(order), [{ action: "remove", order_item_id: foreignLine }]));
      query(`update public.menu_items set active=false where id='${cappuccino}'`);
      denied("staff", editSql(order, revision(order), change), "40001");
      query(`update public.menu_items set active=true where id='${cappuccino}'`);
      assert.equal(read(`select total from public.orders where id='${order}'`), "79.00");
    });
    check("P04 delivered lines survive, empty orders and partial batches roll back", () => {
      const order = createOrder();
      const coffee = read(`select id from public.order_items where order_id='${order}' and queue_type='cafe'`);
      as("barista", `select * from public.mark_order_item_delivered('${coffee}')`);
      denied("staff", editSql(order, revision(order), [{ action: "remove", order_item_id: coffee }]));
      const version = revision(order);
      denied("staff", editSql(order, version, [{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 20 }, { action: "add", menu_item_id: "00000000-0000-0000-0000-000000000000", quantity: 1, expected_unit_price: 1 }]));
      assert.equal(revision(order), version);
      assert.equal(read(`select total from public.orders where id='${order}'`), "59.00");
      const kitchen = read(`select id from public.order_items where order_id='${order}' and queue_type='kitchen'`);
      query(`update public.menu_items set price=999 where id='${focaccia}'`);
      as("staff", editSql(order, revision(order), [{ action: "update", order_item_id: kitchen, quantity: 2 }]));
      assert.equal(read(`select total from public.orders where id='${order}'`), "108.00");
      query(`update public.menu_items set price=49 where id='${focaccia}'`);
      as("staff", editSql(order, revision(order), [{ action: "update", order_item_id: kitchen, quantity: 1 }]));
      assert.equal(read(`select total from public.orders where id='${order}'`), "59.00");
      const single = createOrder([{ menu_item_id: espresso, quantity: 1 }]);
      const only = read(`select id from public.order_items where order_id='${single}'`);
      denied("staff", editSql(single, revision(single), [{ action: "remove", order_item_id: only }]));
      assert.equal(read(`select status from public.order_items where id='${only}'`), "pending");
      as("staff", `select * from public.mark_order_delivered('${order}')`);
      as("staff", `select * from public.checkout_order('${order}','cash')`);
      denied("staff", editSql(order, revision(order), [{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 20 }]));
    });
    const simultaneous = createOrder(), currentVersion = revision(simultaneous);
    const additions = [{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 20 }];
    const attempts = await Promise.all([concurrently(asSql("staff", editSql(simultaneous, currentVersion, additions))), concurrently(asSql("staff", editSql(simultaneous, currentVersion, additions)))]);
    check("P04 concurrent editors cannot overwrite or duplicate additions", () => {
      assert.equal(attempts.filter((attempt) => attempt.status === 0).length, 1, JSON.stringify(attempts));
      assert.equal(read(`select total from public.orders where id='${simultaneous}'`), "79.00");
    });
  }
  if (process.argv[2] === "p05") {
    // Minimal synthetic Auth table only in this disposable native PostgreSQL cluster.
    query(`create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');`);
    const migration = migrations.find((file) => file.endsWith("_p05_employee_access.sql"));
    assert(migration);
    query(`begin; ${readFileSync(join(root, "supabase/migrations", migration), "utf8")} commit;`);
    const version = (employee) => read(`select updated_at from public.profiles where id='${employee}'`);
    const toggle = (employee, active, timestamp = version(employee)) => `select public.admin_set_employee_active('${employee}',${active},'${timestamp}')`;
    const requestId = randomUUID(), userId = randomUUID();
    const prepare = (request = requestId, email = "new@example.test", name = "Nuevo QA") => `select public.admin_prepare_employee('${request}','${email}','${name}','staff')`;
    const complete = (request = requestId, user = userId) => `select public.admin_complete_employee('${request}','${user}')`;
    check("P05 admin readiness rejects broad grants and all non-admin identities", () => {
      assert.equal(JSON.parse(as("admin", "select public.admin_employee_context()")).actor_id, id.admin);
      for (const who of ["anon", "staff", "cook", "barista", "inactive", "missing"]) {
        denied(who, "select public.admin_employee_context()", "42501");
        denied(who, prepare(), "42501"); denied(who, complete(), "42501"); denied(who, toggle(id.staff, false), "42501");
      }
      query("grant update on public.profiles to authenticated");
      denied("admin", "select public.admin_employee_context()", "55000");
      query("revoke update on public.profiles from authenticated");
    });
    check("P05 deactivate blocks an existing session and reactivation preserves history", () => {
      const before = read(`select count(*) from public.orders where created_by='${id.staff}'`);
      as("admin", toggle(id.staff, false));
      denied("staff", "select * from public.create_order('QA')", "42501");
      assert.equal(as("staff", "select count(*) from public.orders"), "0");
      assert.equal(read(`select count(*) from public.orders where created_by='${id.staff}'`), before);
      as("admin", toggle(id.staff, true));
      assert.equal(as("staff", `select active from public.profiles where id='${id.staff}'`), "t");
      assert.equal(read(`select count(*) from public.profiles where id='${id.staff}'`), "1");
      denied("admin", toggle(id.admin, false));
      denied("admin", toggle(id.staff, false, "2000-01-01T00:00:00Z"), "40001");
    });
    check("P05 reservations normalize emails and safely resume only matching pending data", () => {
      const original = JSON.parse(as("admin", prepare(requestId, " NEW@EXAMPLE.TEST ")));
      assert.equal(original.email, "new@example.test");
      assert.equal(JSON.parse(as("admin", prepare(randomUUID()))).request_id, requestId);
      denied("admin", prepare(requestId, "another@example.test"), "22023");
      denied("admin", prepare(randomUUID(), "new@example.test", "Other Name"), "23505");
    });
    check("P05 completion rejects spoofed metadata and preserves already completed profiles", () => {
      query(`insert into auth.users(id,email,raw_user_meta_data) values('${userId}','new@example.test','{"mamita_employee_request":"${requestId}"}')`);
      denied("admin", complete(), "42501");
      query(`update auth.users set raw_app_meta_data='{"mamita_employee_request":"${requestId}"}' where id='${userId}'`);
      const result = JSON.parse(as("admin", complete())); assert.equal(result.role, "staff"); assert.equal(result.active, true);
      as("admin", complete());
      assert.equal(read(`select count(*) from public.profiles where id='${userId}'`), "1");
      assert.equal(read(`select count(*) from private.employee_events where employee_id='${userId}' and action='created'`), "1");
      as("admin", toggle(userId, false));
      assert.equal(JSON.parse(as("admin", complete())).active, false);
      denied("admin", prepare(randomUUID()), "23505");
      denied("admin", complete(requestId, randomUUID()), "22023");
    });
    const secondAdmin = randomUUID();
    query(`insert into public.profiles(id,role,full_name,active) values('${secondAdmin}','admin','Second QA admin',true)`);
    id.secondAdmin = secondAdmin;
    const attempts = await Promise.all([concurrently(asSql("admin", toggle(secondAdmin, false))), concurrently(asSql("secondAdmin", toggle(id.admin, false)))]);
    check("P05 concurrent admins cannot deactivate each other and leave no administrator", () => {
      assert.equal(attempts.filter((attempt) => attempt.status === 0).length, 1, JSON.stringify(attempts));
      assert.equal(read("select count(*) from public.profiles where role='admin' and active"), "1");
      assert.equal(read("select count(*) from public.profiles where role='admin'"), "2");
    });
  }
  if (["p06", "p07", "p09", "p10"].includes(process.argv[2])) {
    query(`create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');`);
    const p05 = migrations.find((file) => file.endsWith("_p05_employee_access.sql"));
    query(readFileSync(join(root, "supabase/migrations", p05), "utf8"));
    const before = read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o");
    const migration = migrations.find((file) => file.endsWith("_p06_daily_promotions.sql"));
    assert(migration); query(`begin; ${readFileSync(join(root, "supabase/migrations", migration), "utf8")} commit;`);
    const quote = () => JSON.parse(as("staff", "select public.get_order_pricing_context()"));
    const day = quote().date;
    const save = (bps, active = true, revision = null, date = day) => `select public.admin_save_daily_promotion('${date}',${bps},${active},${revision ?? "null"})`;
    const items = [{ menu_item_id: cappuccino, quantity: 2, expected_unit_price: 20 }];
    const create = (q = quote(), lines = items) => `select public.create_order_with_promotion('QA','P06','${JSON.stringify(lines)}','${q.date}',${q.revision},${q.discount_bps})`;
    let discounted;
    check("P06 migration preserves old records and only admin programs promotions", () => {
      assert.equal(read("select md5(string_agg((to_jsonb(o)-'promotion_date'-'promotion_revision')::text,'' order by id)) from public.orders o"), before);
      for (const who of ["anon", "staff", "cook", "barista", "inactive", "missing"]) denied(who, save(1500), "42501");
      for (const who of ["anon", "cook", "barista", "inactive", "missing"]) denied(who, "select public.get_order_pricing_context()", "42501");
      denied("admin", `insert into public.daily_promotions(promotion_date,discount_bps,created_by,updated_by) values('${day}',1500,'${id.admin}','${id.admin}')`, "42501");
    });
    check("P06 fifteen percent is applied by server to Bs 40 -> 34 including legacy creation RPC", () => {
      as("admin", save(1500)); discounted = JSON.parse(as("staff", create()));
      assert.equal(Number(discounted.total), 34); assert.equal(Number(discounted.subtotal), 40); assert.equal(Number(discounted.discount_amount), 6);
      assert.equal(read(`select sum(net_total) from public.order_items where order_id='${discounted.order_id}'`), "34.00");
      const legacy = createOrder([{ menu_item_id: cappuccino, quantity: 2 }]);
      assert.equal(read(`select total from public.orders where id='${legacy}'`), "34.00");
      assert.equal(as("staff", "select count(*) from public.daily_promotions"), "0");
    });
    check("P06 stale dates, changed promotion and changed product prices roll back before order creation", () => {
      const q = quote(), count = read("select count(*) from public.orders");
      for (const bad of [{ ...q, date: "2000-01-01" }, { ...q, revision: q.revision + 1 }, { ...q, discount_bps: 0 }]) denied("staff", create(bad), "40001");
      denied("staff", create(q, [{ ...items[0], expected_unit_price: 1 }]), "40001");
      denied("staff", create(q, [...items, ...items]), "22023");
      assert.equal(read("select count(*) from public.orders"), count);
    });
    check("P06 edited orders keep their original percentage, unit prices and exact net line totals", () => {
      as("admin", save(2000, true, quote().revision));
      query(`update public.menu_items set price=22 where id='${cappuccino}'`);
      const order = discounted.order_id;
      const edit = (changes) => `select public.edit_order('${order}',(select revision from public.orders where id='${order}'),'${JSON.stringify(changes)}','${randomUUID()}')`;
      let snapshot = JSON.parse(as("staff", edit([{ action: "add", menu_item_id: cappuccino, quantity: 1, expected_unit_price: 22 }])));
      assert.equal(Number(snapshot.order.total), 52.7); assert.equal(snapshot.order.discount_bps, 1500);
      const addition = snapshot.items.find((line) => Number(line.unit_price) === 22);
      snapshot = JSON.parse(as("staff", edit([{ action: "remove", order_item_id: addition.id }])));
      assert.equal(Number(snapshot.order.total), 34);
      const original = snapshot.items.find((line) => line.status !== "voided");
      snapshot = JSON.parse(as("staff", edit([{ action: "update", order_item_id: original.id, quantity: 3 }])));
      assert.equal(Number(snapshot.order.total), 51);
      assert.equal(read(`select sum(net_total) from public.order_items where order_id='${order}'`), "51.00");
      as("staff", `select public.mark_order_delivered('${order}'); select public.checkout_order('${order}','qr')`);
      as("admin", save(3000, true, quote().revision));
      assert.equal(read(`select amount from public.order_payments where order_id='${order}'`), "51.00");
      query(`update public.menu_items set price=20 where id='${cappuccino}'`);
    });
    check("P06 disabling affects only new orders and retries do not duplicate dates or audit", () => {
      const q = quote();
      as("admin", save(3000, false, q.revision));
      const count = read("select count(*) from private.promotion_events");
      as("admin", save(3000, false, q.revision));
      assert.equal(read("select count(*) from private.promotion_events"), count);
      const next = JSON.parse(as("staff", create())); assert.equal(Number(next.total), 40);
      assert.equal(read(`select discount_bps from public.orders where id='${discounted.order_id}'`), "1500");
    });
    check("P06 Bolivia midnight chooses exactly one daily promotion and rejects invalid programming", () => {
      as("admin", save(2000, true, quote().revision));
      const tomorrow = read(`select '${day}'::date+1`);
      as("admin", save(2500, true, null, tomorrow));
      assert.equal(JSON.parse(read(`select private.promotion_for_instant('${day}T03:59:59Z')`)).discount_bps, 0);
      assert.equal(JSON.parse(read(`select private.promotion_for_instant('${day}T04:00:00Z')`)).discount_bps, 2000);
      assert.equal(JSON.parse(read(`select private.promotion_for_instant('${tomorrow}T03:59:59Z')`)).discount_bps, 2000);
      assert.equal(JSON.parse(read(`select private.promotion_for_instant('${tomorrow}T04:00:00Z')`)).discount_bps, 2500);
      for (const bps of [0, -1, 10001, "null"]) denied("admin", save(bps), "22023");
      denied("admin", save(2000, true, null, "2000-01-01"), "22023");
      denied("staff", "select private.promotion_for_instant(now())", "42501");
    });
    const revision = quote().revision;
    const attempts = await Promise.all([concurrently(asSql("admin", save(1500, true, revision))), concurrently(asSql("admin", save(2500, true, revision)))]);
    check("P06 concurrent administrators cannot overwrite a changed promotion", () => {
      assert.equal(attempts.filter((attempt) => attempt.status === 0).length, 1, JSON.stringify(attempts));
      assert.equal(read(`select count(*) from public.daily_promotions where promotion_date='${day}'`), "1");
    });
  }
  if (["p07", "p09", "p10"].includes(process.argv[2])) {
    const before = read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o");
    const previousReport = as("admin", "select coalesce(sum(total_sale_value),0) from public.v_sales_report_daily");
    const migration = migrations.find((file) => file.endsWith("_p07_employee_purchases.sql"));
    query(`begin; ${readFileSync(join(root, "supabase/migrations", migration), "utf8")} commit;`);
    const lines = [{ menu_item_id: espresso, quantity: 1, expected_unit_price: 10 }, { menu_item_id: focaccia, quantity: 1, expected_unit_price: 49 }];
    const create = (items = lines, request = randomUUID()) => `select public.create_employee_purchase('${JSON.stringify(items)}','${request}')`;
    const get = (order) => JSON.parse(read(`select private.employee_purchase_snapshot('${order}')`));
    const pay = (order, method = "cash", revision = get(order).order.revision) => `select public.checkout_employee_purchase('${order}','${method}',${revision})`;
    const cancel = (order, revision = get(order).order.revision) => `select public.cancel_employee_purchase('${order}',${revision})`;
    const purchases = {};
    check("P07 preserves old rows and existing consolidated report amounts", () => {
      assert.equal(read("select md5(string_agg((to_jsonb(o)-'employee_cancelled_at')::text,'' order by id)) from public.orders o"), before);
      assert.equal(as("admin", "select coalesce(sum(total_sale_value),0) from public.v_sales_report_daily"), previousReport);
    });
    check("P07 every active role buys only for itself at fixed twenty percent without stacking", () => {
      const q = JSON.parse(as("staff", "select public.get_order_pricing_context()"));
      as("admin", `select public.admin_save_daily_promotion('${q.date}',6000,true,${q.revision})`);
      for (const role of ["admin","staff","cook","barista"]) {
        const snapshot = JSON.parse(as(role, create(lines.map((line) => ({...line,buyer_employee_id:id.admin,discount_bps:9999})))));
        purchases[role] = snapshot.order.id;
        assert.equal(snapshot.order.buyer_employee_id,id[role]);assert.equal(snapshot.order.created_by,id[role]);assert.equal(snapshot.order.discount_bps,2000);
        assert.equal(Number(snapshot.order.total),47.2);assert.equal(Number(snapshot.order.discount_amount),11.8);
        assert.equal(snapshot.order.promotion_date,null);
        assert.equal(read(`select count(*) from public.print_jobs where order_id='${snapshot.order.id}'`),"0");
        assert.equal(as(role,`select count(*) from public.v_cafe_queue where order_id='${snapshot.order.id}'`),"0");
        assert.equal(as(role,`select count(*) from public.v_kitchen_tickets where order_id='${snapshot.order.id}'`),"0");
      }
      const customer = createOrder(); assert.equal(read(`select purchase_type||','||discount_bps||','||total from public.orders where id='${customer}'`),"customer,6000,23.60");
    });
    check("P07 inactive and unauthorized users cannot create, browse or confirm purchases", () => {
      for (const role of ["anon","inactive","missing"]) {denied(role,create(),"42501");denied(role,"select public.list_employee_purchases()","42501");}
      for (const role of ["cook","barista"]) {denied(role,pay(purchases[role]),"42501");denied(role,"select public.list_employee_purchases('all')","42501");}
      const mine=JSON.parse(as("cook","select public.list_employee_purchases()"));assert(mine.purchases.every((p)=>p.order.buyer_employee_id===id.cook));
      assert.equal(as("cook",`select count(*) from public.orders where id='${purchases.barista}'`),"0");
      denied("cook",cancel(purchases.barista),"42501");
    });
    check("P07 all customer mutators reject personal purchases", () => {
      const order = purchases.staff, snapshot=get(order), line=snapshot.items[0].id;
      for (const sql of [`select public.add_order_item('${order}','${espresso}',1)`,`select public.update_order_item('${line}',2)`,`select public.confirm_order('${order}')`,`select public.mark_order_delivered('${order}')`,`select public.mark_order_item_delivered('${line}')`,`select public.checkout_order('${order}','cash')`,`select public.edit_order('${order}',${snapshot.order.revision},'[{"action":"add","menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','${randomUUID()}')`]) denied("staff",sql);
      assert.equal(Number(get(order).order.total),47.2);
    });
    check("P07 creation retries are idempotent and invalid catalog/quantities leave no orders", () => {
      const request=randomUUID();const first=JSON.parse(as("cook",create(lines,request)));const retry=JSON.parse(as("cook",create(lines,request)));assert.equal(first.order.id,retry.order.id);
      denied("barista",create(lines,request),"42501");
      const before=read("select count(*) from public.orders");
      denied("cook",create([{...lines[0],quantity:1.2}]),"22023");denied("cook",create([{...lines[0],expected_unit_price:1}]),"40001");
      assert.equal(read("select count(*) from public.orders"),before);
    });
    check("P07 cashier settlement records real receiver and includes marked net income in every report", () => {
      const order=purchases.cook,old=get(order).order;
      denied("staff",pay(order,"cash",old.revision+1),"40001");
      as("staff",pay(order,"qr"));as("staff",pay(order,"qr",old.revision));
      const after=get(order);assert.equal(after.order.status,"archivado");assert.equal(after.order.paid_by,id.staff);assert.equal(after.order.created_at,old.created_at);
      assert.equal(read(`select count(*) from public.order_payments where order_id='${order}'`),"1");
      for(const period of ["daily","weekly","monthly"])assert.equal(as("admin",`select sum(total_sale_value) from public.v_sales_report_${period} where purchase_type='employee' and buyer_employee_id='${id.cook}'`),"47.20");
      denied("staff",pay(order,"cash"));denied("cook",cancel(order));
    });
    check("P07 cancellation keeps history, produces no income, and pending buyer deactivation prevents settlement", () => {
      const order=purchases.barista;as("barista",cancel(order));as("barista",cancel(order));
      assert(get(order).order.employee_cancelled_at);assert.equal(Number(get(order).order.total),47.2);denied("admin",pay(order));
      assert.equal(read(`select count(*) from public.order_payments where order_id='${order}'`),"0");
      query(`update public.profiles set active=false where id='${id.staff}'`);denied("admin",pay(purchases.staff));denied("staff",create(),"42501");query(`update public.profiles set active=true where id='${id.staff}'`);
    });
    const marraqueta=randomUUID();query(`insert into public.menu_items(id,category_id,name,price) values('${marraqueta}','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Marraqueta QA',2.5)`);
    const tiny=JSON.parse(as("barista",create([{menu_item_id:marraqueta,quantity:3,expected_unit_price:2.5}])));assert.equal(Number(tiny.order.total),6);
    const concurrent=JSON.parse(as("barista",create())).order.id;const revision=get(concurrent).order.revision;
    const attempts=await Promise.all([concurrently(asSql("admin",pay(concurrent,"cash",revision))),concurrently(asSql("staff",pay(concurrent,"cash",revision)))]);
    check("P07 simultaneous checkout creates one payment and keyset history has no repeated purchases",()=>{
      assert(attempts.every((a)=>a.status===0),JSON.stringify(attempts));assert.equal(read(`select count(*) from public.order_payments where order_id='${concurrent}'`),"1");
      const first=JSON.parse(as("barista","select public.list_employee_purchases('mine',null,null,1)"));assert.equal(first.purchases.length,1);assert.equal(first.has_more,true);
      const last=first.purchases[0].order;const second=JSON.parse(as("barista",`select public.list_employee_purchases('mine','${last.created_at}','${last.id}',1)`));assert.notEqual(first.purchases[0].order.id,second.purchases[0].order.id);
    });
  }
  if (["p09", "p10"].includes(process.argv[2])) {
    const file = migrations.find(file => file.endsWith("_p09_sales_report_periods.sql"));
    query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
    testReporting({ query, read, as, denied, check, id, espresso, focaccia, cappuccino, includeSummary: process.argv[2] === "p10" });
  }
  success = true;
  console.log(JSON.stringify({ checksPassed: passed, productionConnected: false, realSalesCreated: false }));
} finally {
  if (started) command("pg_ctl", ["stop", "-D", data, "-m", "fast", "-w", "-t", "30"]);
  // Resolve and verify the precise temporary root before any recursive removal on Windows.
  const target = resolve(temporary);
  if (success && dirname(target) === resolve(tmpdir()) && basename(target).startsWith("mamita-p01-")) rmSync(target, { recursive: true, force: true });
  else console.log(`Local diagnostic files retained at: ${target}`);
}
