# Supabase Backend

## P01 — October 2026

Use `pnpm test:p01:db` for the current authorization/checkout contract, in a temporary localhost PostgreSQL cluster with synthetic fixtures. The original SQL tests below describe the earlier MVP and include direct writes that P01 intentionally prohibits. Never load the original seed into the shared production database.

Migration `20261029122749_p01_permissions_integrity_amounts.sql` is prepared locally and has not been applied to the shared project. See [P01 implementation and deployment order](../docs/desarrollo/P01_PERMISOS_INTEGRIDAD_IMPORTES.md). This frontend requires the migration before real checkout.

## Files

- `migrations/0001_init.sql`: schema, functions, views, RLS, and grants.
- `seed.sql`: deterministic seed data for the four MVP roles and menu catalog.
- `tests/00_happy_path.sql`: end-to-end order lifecycle.
- `tests/01_rls.sql`: role boundary checks.
- `tests/02_reporting.sql`: report-view smoke test.
- `tests/03_roles.sql`: explicit admin, staff, cook, and barista permissions.

## Intended Run Order

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
