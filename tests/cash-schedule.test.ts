import assert from "node:assert/strict";
import {test} from "node:test";
import {cashAvailability,reminderDue,shiftHours,shiftLabel} from "../lib/cash-schedule.ts";
import {qaScheduledCashContext} from "../lib/qa-cashbox-fixture.ts";
test("Morning window expires exactly at 14:00 Bolivia and never silently creates an afternoon shift",()=>{
 const c=qaScheduledCashContext();assert.equal(cashAvailability(c,Date.parse("2026-11-03T17:59:59Z")),"open");assert.equal(cashAvailability(c,Date.parse("2026-11-03T18:00:00Z")),"expired");assert.equal(c.shift?.status,"open");assert.equal(shiftLabel(c.shift),"Mañana");assert.equal(shiftHours(c.shift),"10:00–14:00");
});
test("Remind five minutes before end, snooze only the reminder, and enforce the deadline independently",()=>{
 const c=qaScheduledCashContext(),start=Date.parse("2026-11-03T17:55:00Z"),end=Date.parse("2026-11-03T18:00:00Z");assert.equal(reminderDue(c.shift,start-1),false);assert.equal(reminderDue(c.shift,start),true);assert.equal(reminderDue(c.shift,start,start+300000),false);assert.equal(reminderDue(c.shift,end),false);assert.equal(cashAvailability(c,end),"expired");
});
test("Empty, pending receipt and outside-hours states require a manual action without treating change as sales",()=>{
 const c=qaScheduledCashContext("closed");assert.equal(cashAvailability(c),"closed");c.shift=qaScheduledCashContext().shift;c.shift!.status="awaiting_receipt";assert.equal(cashAvailability(c),"receive");c.schedule!.in_hours=false;assert.equal(cashAvailability(c),"outside");assert.equal(cashAvailability(null),"checking");assert.equal(c.summary.cash,0);
});
test("A completed day cannot reopen and keeps yesterday's closing outside the new day's balance",()=>{
 const c=qaScheduledCashContext('closed');c.day_closed=true;assert.equal(cashAvailability(c),'day_closed');c.day_closed=false;assert.equal(cashAvailability(c),'closed');assert.equal(c.summary.expected_cash,0);
});
