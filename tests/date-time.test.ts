import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { formatOrderDate, formatOrderTime } from "../lib/date-time.ts";

test("uses a fixed Spanish day period with ordinary spaces for the reported timestamp", () => {
  const value = formatOrderDate("2026-10-13T23:07:00Z");
  assert.equal(value, "13/10, 07:07 p. m.");
  assert.equal(/[\u00a0\u202f]/.test(value), false);
  assert.equal(formatOrderDate("2026-10-13T19:07:00-04:00"), value);
});

test("handles midnight, noon and the previous date in Bolivia", () => {
  assert.equal(formatOrderDate("2026-10-29T03:59:00Z"), "28/10, 11:59 p. m.");
  assert.equal(formatOrderTime("2026-10-29T04:00:00Z"), "12:00 a. m.");
  assert.equal(formatOrderTime("2026-10-29T15:59:00Z"), "11:59 a. m.");
  assert.equal(formatOrderTime("2026-10-29T16:00:00Z"), "12:00 p. m.");
  assert.equal(formatOrderDate("2027-01-01T02:00:00Z"), "31/12, 10:00 p. m.");
  assert.equal(formatOrderDate("invalid"), "—");
  assert.equal(formatOrderTime("invalid"), "—");
});

test("server timezone cannot change the visible date and time", () => {
  const module = new URL("../lib/date-time.ts", import.meta.url).href;
  const script = `import { formatOrderDate } from ${JSON.stringify(module)}; process.stdout.write(formatOrderDate('2026-10-13T23:07:00Z'));`;
  for (const timezone of ["UTC", "America/La_Paz", "Asia/Tokyo"]) {
    const result = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(result, "13/10, 07:07 p. m.", timezone);
  }
});
