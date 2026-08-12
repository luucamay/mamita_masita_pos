# Supabase Backend

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
