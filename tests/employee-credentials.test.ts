import assert from "node:assert/strict";
import {test} from "node:test";
import {employeeEmail,suggestedLogin,generateEmployeePassword,credentialsMessage} from "../lib/employee-credentials.ts";
import {salesRange} from "../lib/employee-sales.ts";
test("Internal access uses the first name without accents and a fixed local domain",()=>{
 assert.equal(suggestedLogin("  Ána Flores "),"ana");assert.equal(suggestedLogin("Ana. Flores"),"ana");
 assert.equal(employeeEmail(" ANA2 "),"ana2@mamita.local");
 for(const login of ["","ana flores","ana@gmail.com",".ana","ana.","ana..flores"])assert.throws(()=>employeeEmail(login));
});
test("Generated passwords are independent, valid, and copied only as an explicit credential message",()=>{
 const first=generateEmployeePassword(),second=generateEmployeePassword();assert.notEqual(first,second);assert.match(first,/^(?=.*[A-Za-z])(?=.*\d).{20}$/);
 assert.equal(credentialsMessage("ana@mamita.local","example-not-an-account"),"Mamita Masita\nUsuario: ana@mamita.local\nContraseña: example-not-an-account");
});
test("Employee history shortcuts use a real day, Monday to Sunday and the complete leap-year month",()=>{
 assert.deepEqual(salesRange("2026-10-30","day"),{start:"2026-10-30",end:"2026-10-30"});
 assert.deepEqual(salesRange("2026-10-30","week"),{start:"2026-10-26",end:"2026-11-01"});
 assert.deepEqual(salesRange("2028-02-29","month"),{start:"2028-02-01",end:"2028-02-29"});
});
