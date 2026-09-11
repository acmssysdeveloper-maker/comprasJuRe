import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=app.indexOf("function parseReceiptText");
const end=app.indexOf("function validateReceiptData",start);
assert.ok(start>0&&end>start);
const code=app.slice(start,end);
const ctx={console};
vm.createContext(ctx);
const helpers=[
'const num=s=>{const x=String(s??"").replace(/\\./g,"").replace(",",".");return Number(x)||0};',
'const round2=n=>Math.round((Number(n)||0)*100)/100;',
'const money=n=>"R$ "+(Number(n)||0).toFixed(2).replace(".",",");',
'const normalize=s=>String(s||"").toUpperCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").trim();',
'const cleanProductName=s=>String(s||"").replace(/\\s+/g," ").trim();',
'const guessPack=s=>{const m=String(s||"").match(/(\\d+(?:[.,]\\d+)?)\\s*(kg|g|l|ml|un)\\b/i);return m?m[1].replace(",",".")+" "+m[2].toUpperCase():""};',
];
const dep=app.slice(app.indexOf("function normalizeOcrNumeric"),app.indexOf("function validateReceiptData"));
vm.runInContext(helpers.join("\n")+"\n"+dep+"\n"+code,ctx);

const fixture=`SUPERMERCADOS ALVORADA
CNPJ 17.833.301/0022-23
10/09/26 07:37
7891172523434 PAPEL HIGIENICO F.D. NEVE 20M
2 UN 14,90 29,80
7894900701517 REFRIG COCA COLA 2L
1 UN 10,40 10,40
VALOR A PAGAR 40,20`;
const r=ctx.parseReceiptText(fixture);
assert.equal(r.date,"2026-09-10");
assert.equal(r.market.cnpj,"17.833.301/0022-23");
assert.equal(r.items.length,2);
assert.equal(r.items[0].quantity,2);
assert.equal(r.items[0].unitPrice,14.9);
assert.equal(r.items[0].total,29.8);
assert.equal(r.items[1].total,10.4);
assert.equal(r.total,40.2);

const ocr=execFileSync("tesseract",[
  new URL("../test-fixtures/comprovante-alvorada-2026-09-10.jpg",import.meta.url).pathname,
  "stdout","-l","por","--psm","6"
],{encoding:"utf8"});
const real=ctx.parseReceiptText(ocr);
assert.ok(real.items.length>8,`parser real ficou em ${real.items.length} itens`);
console.log(`Receipt parser regression: PASS (synthetic=2, OCR-real candidates=${real.items.length})`);
