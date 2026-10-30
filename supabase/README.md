# Supabase Backend

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
