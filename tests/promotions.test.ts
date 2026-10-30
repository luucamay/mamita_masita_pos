import assert from "node:assert/strict";
import { test } from "node:test";
import { percentToBasisPoints, discountLabel, isPricingContext } from "../lib/promotions.ts";
import { priceOrder } from "../lib/money.ts";
test("percentage parsing preserves centesimal percentages and rejects invalid values", () => {
  for (const [text, bps] of [["15",1500],["20",2000],["15,25",1525],["0.01",1],["100",10000]] as const) assert.equal(percentToBasisPoints(text),bps);
  for (const value of ["", "0", "-15", "101", "15.001", "NaN", "1e2"]) assert.throws(()=>percentToBasisPoints(value));
  assert.equal(discountLabel(1525),"15,25%"); assert.equal(discountLabel(1500),"15%");
});
test("pricing quote requires an authoritative date, rate, version and expiry", () => {
  const quote={date:"2026-10-29",discount_bps:1500,revision:1,expires_at:"2026-10-30T04:00:00Z"};
  assert.equal(isPricingContext(quote),true);
  for(const invalid of [null,{...quote,discount_bps:"1500"},{...quote,discount_bps:10001},{...quote,revision:-1},{...quote,expires_at:"bad"}]) assert.equal(isPricingContext(invalid),false);
});
test("two Cappuccino reconcile to Bs 34 at fifteen percent and Bs 40 without a promotion",()=>{
  const line=[{id:"cappuccino",unitPrice:20,quantity:2}];
  assert.equal(priceOrder(line,1500).netCents,3400); assert.equal(priceOrder(line).netCents,4000);
});
