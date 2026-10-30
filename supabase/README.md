# Supabase Backend

P15 on October 30 added no migration. Omar identified the six exact orders `20261030-001` through `006` as manual tests and authorized removal. Private snapshots were verified first; a transaction removed only those six headers, 17 lines, four payments, 36 events and three private customer requests. Other-data fingerprints across fifteen tables remain equal. Daily counters and real employee accounts were preserved. Remaining: 939 orders, 938 payments, 63 menu items and 11 profiles; cashbox still disabled with no shifts. See [P15 evidence and verification](../docs/desarrollo/P15_VALIDACION_Y_ENTREGA.md). Earlier counts below are historical; do not replay this data cleanup or the already-applied migrations.

Shared cashbox shifts and explicit employee password reset were applied on October 30 as `20261030161805_shift_cashbox_and_employee_passwords`. Do not reapply. Existing data fingerprints across eleven public tables and private customer requests remain identical after migration and browser checks: 945 orders and 942 payments. Cashbox enforcement remains disabled until the first explicit opening; no shifts, receipt mappings or password reservations were generated remotely by tests. New `cash_shifts` has role-based read policies; financial writes use guarded RPCs and a transaction lock. See [workflow, activation, verification and rollback limits](../docs/desarrollo/ACCESOS_TURNOS_Y_ATENCION_2026-10-30.md). No web deployment was performed.

Admin employee sales history was applied on October 30 as `20261030143332_admin_employee_sales_history`. Do not reapply. It adds an admin-only security-invoker read function and a partial author/date index for customer orders; no business rows, Auth settings or policies were changed. History uses registration dates in Bolivia and separates the order creator from the cashier. General cash reports retain collection-date accounting. All eleven public-table fingerprints and the customer-request fingerprint match before/after, including final browser verification. See [admin implementation and operator guide](../docs/desarrollo/ADMIN_INTERFAZ_Y_REPORTES_2026-10-30.md).

Customer payment flows and compact closed-day reading were applied on October 30: `20261030124536`, `20261030124544`, `20261030130832`. Do not reapply. Table service remains postpaid; new takeaway orders are paid at placement, with signed cash movements for adjustments/refunds. New nullable `orders.payment_methods` identifies mixed tenders. Current reports include collection/refund dates and preserve the original payment. See [rules, testing and migration details](../docs/desarrollo/AJUSTES_COMPACTOS_Y_FLUJOS_2026-10-30.md). Original sale rows were preserved, comparing orders without the added column. A new table order 004 for Bs 51 and its legitimate counter advance were retained during verification. Automated probes were rolled back.

P14 paginated order reading (`20261030110916`) was applied on October 30. Do not reapply. Adds security-invoker `get_orders_board_page`: closed orders in pages of 24; active orders remain complete. The P13 RPC, RLS, publication and all business data remain unchanged. See [P14 measurements and verification](../docs/desarrollo/P14_RENDIMIENTO.md). No sales were created by P14 tests; full PostgreSQL/Auth recovery remains unverified.

P13 live order board (`20261030102045`) was applied on October 30. Do not reapply. Adds `orders` to Realtime without replacing item publication/RLS and an active admin/staff-only security-invoker snapshot RPC. See [implementation, scoped real tests and review guide](../docs/desarrollo/P13_PEDIDOS_TIEMPO_REAL.md). The recorded QA rows were removed and all ten public table fingerprints match the baseline; 939 orders/938 payments remain. Full PostgreSQL/Auth recovery remains unverified.

P09 paid-date reporting (`20261030041017`) was applied on October 30 (Bolivia date). Do not reapply it. The new admin-only invoker RPC returns one aggregated JSON snapshot by Bolivia day/week/month, payment and purchase type; an index supports payment date ranges. Existing report views and sales rows are preserved. P10 uses the same snapshot without another migration. See [P09](../docs/desarrollo/P09_PERIODOS_REPORTES.md) and [P10](../docs/desarrollo/P10_SUMATORIAS_CAJA.md). `pnpm test:p10:db` runs 40 synthetic SQL groups locally, without a production connection.

P07 employee purchases (`20261030014210`) was applied on October 29 (Bolivia date). Do not reapply it. It adds fixed 20% personal purchases with admin/staff payment approval, private request idempotency, owner history and marked consolidated reporting. P08 profile uses existing fields and has no additional migration. See [P07](../docs/desarrollo/P07_COMPRAS_EMPLEADOS.md) and [P08](../docs/desarrollo/P08_PERFIL.md). `pnpm test:p07:db` runs synthetic PostgreSQL tests locally; no shared sales are committed by that runner.

## P01 — October 2026

Use `pnpm test:p01:db` for the current authorization/checkout contract, in a temporary localhost PostgreSQL cluster with synthetic fixtures. The original SQL tests below describe the earlier MVP and include direct writes that P01 intentionally prohibits. Never load the original seed into the shared production database.

Migrations P01 (`20261029163703`), P04 (`20261029163747`) and P05 (`20261029163809`) were applied to the shared project on October 29 with Omar's explicit authorization. Local filenames match the versions recorded by the Supabase connector. See [application, scoped tests and remaining recovery limitations](../docs/desarrollo/APLICACION_SUPABASE_2026-10-29.md). Do not reapply these migrations or replay earlier migrations against the existing shared project.

## Files

P06 daily promotions (`20261030005743`) was also applied on October 29 (Bolivia date). See [P06 rules, tests and review guide](../docs/desarrollo/P06_PROMOCIONES.md). It preserves existing data; no promotions were left programmed after the reversible integration test. Do not reapply it.

- `migrations/0001_init.sql`: schema, functions, views, RLS, and grants.
- `seed.sql`: deterministic seed data for the four MVP roles and menu catalog.
- `tests/00_happy_path.sql`: end-to-end order lifecycle.
- `tests/01_rls.sql`: role boundary checks.
- `tests/02_reporting.sql`: report-view smoke test.
- `tests/03_roles.sql`: explicit admin, staff, cook, and barista permissions.

## Original MVP Run Order — fresh disposable databases only

1. Apply the migration.
2. Load the seed.
3. Execute the SQL tests in order.

## Notes

- The backend spec in `docs/lite-prd/restaurant-pos-order-management/supabase-backend-spec.md` is the human-readable contract.
- The SQL here is the implementation slice that follows that contract.
- Kitchen printing is modeled as queued `print_jobs`; a real worker can poll and send them to an IPP/LPR printer.

## Frontend E2E

Install the Playwright browser once, then run the authenticated lifecycle test:

```bash
pnpm exec playwright install chromium
E2E_EMAIL=staff@example.com E2E_PASSWORD=secret pnpm test:e2e
```

Set `PLAYWRIGHT_BASE_URL` to test against an already running deployment instead of starting local Next.js.
