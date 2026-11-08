import assert from "node:assert/strict";
import {test} from "node:test";
import {cashAvailability,isInShiftGrace,reminderDue,shiftGraceEnd,shiftHours,shiftLabel} from "../lib/cash-schedule.ts";
import {qaScheduledCashContext} from "../lib/qa-cashbox-fixture.ts";
test("Morning stays operational from 14:00 through 14:59 and expires at 15:00 Bolivia",()=>{
 const c = qaScheduledCashContext();
 for (const [at, state, grace] of [
  ["17:59:59", "open", false],
  ["18:00:00", "open", true],
  ["18:59:59", "open", true],
  ["19:00:00", "expired", false],
 ] as const) {
  const now = Date.parse(`2026-11-03T${at}Z`);
  assert.equal(cashAvailability(c, now), state);
  assert.equal(isInShiftGrace(c.shift, now), grace);
 }
 assert.equal(c.shift?.status, "open");
 assert.equal(shiftLabel(c.shift), "Mañana");
 assert.equal(shiftHours(c.shift), "10:00–14:00");
 assert.equal(shiftGraceEnd(c.shift), "15:00");
});
test("Remind five minutes before end, snooze only the reminder, and enforce the deadline independently",()=>{
 const c=qaScheduledCashContext(),start=Date.parse("2026-11-03T17:55:00Z"),end=Date.parse("2026-11-03T18:00:00Z");assert.equal(reminderDue(c.shift,start-1),false);assert.equal(reminderDue(c.shift,start),true);assert.equal(reminderDue(c.shift,start,start+300000),false);assert.equal(reminderDue(c.shift,end),false);assert.equal(cashAvailability(c,end+3600000),"expired");
});
test("Empty, pending receipt and outside-hours states require a manual action without treating change as sales",()=>{
 const c=qaScheduledCashContext("closed");assert.equal(cashAvailability(c),"closed");c.shift=qaScheduledCashContext().shift;c.shift!.status="awaiting_receipt";assert.equal(cashAvailability(c),"receive");c.schedule!.in_hours=false;assert.equal(cashAvailability(c),"outside");assert.equal(cashAvailability(null),"checking");assert.equal(c.summary.cash,0);
});
test("A completed day cannot reopen and keeps yesterday's closing outside the new day's balance",()=>{
 const c=qaScheduledCashContext('closed');c.day_closed=true;assert.equal(cashAvailability(c),'day_closed');c.day_closed=false;assert.equal(cashAvailability(c),'closed');assert.equal(c.summary.expected_cash,0);
});
