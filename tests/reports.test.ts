import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReportFilters, reportRange, reportQuery, validReportDate } from "../lib/report-filters.ts";
test("P09 rejects malformed, duplicate and out of range report filters", () => {
  assert.deepEqual(parseReportFilters({}), { period: "daily", date: null, payment: "all", purchase: "all" });
  for (const query of [{ date: "2026-02-30" }, { period: "yearly" }, { payment: "bitcoin" }, { purchase: "staff" }, { period: ["daily", "weekly"] }, { date: "2100-01-01" }]) assert.throws(() => parseReportFilters(query));
  assert.equal(validReportDate("2028-02-29"), true); assert.equal(validReportDate("2026-02-29"), false);
});
test("P09 periods and navigation handle leap day, month ends and year boundaries", () => {
  assert.deepEqual(reportRange("weekly", "2027-01-01"), { start: "2026-12-28", end: "2027-01-04", previous: "2026-12-21", next: "2027-01-04" });
  assert.deepEqual(reportRange("monthly", "2028-02-29"), { start: "2028-02-01", end: "2028-03-01", previous: "2028-01-01", next: "2028-03-01" });
  assert.equal(reportRange("daily", "2026-12-31").end, "2027-01-01");
});
test("P09 URLs preserve all filters for screen and export", () => {
  const filters = parseReportFilters({ period: "monthly", date: "2026-10-17", payment: "qr", purchase: "employee" });
  assert.deepEqual(parseReportFilters(Object.fromEntries(new URLSearchParams(reportQuery(filters)))), filters);
});
