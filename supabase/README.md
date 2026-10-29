# Supabase Backend

## P01 — October 2026

Use `pnpm test:p01:db` for the current authorization/checkout contract, in a temporary localhost PostgreSQL cluster with synthetic fixtures. The original SQL tests below describe the earlier MVP and include direct writes that P01 intentionally prohibits. Never load the original seed into the shared production database.

Migrations P01 (`20261029163703`), P04 (`20261029163747`) and P05 (`20261029163809`) were applied to the shared project on October 29 with Omar's explicit authorization. Local filenames match the versions recorded by the Supabase connector. See [application, scoped tests and remaining recovery limitations](../docs/desarrollo/APLICACION_SUPABASE_2026-10-29.md). Do not reapply these migrations or replay earlier migrations against the existing shared project.

## Files

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
