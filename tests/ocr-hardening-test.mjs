import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function parseReceiptText');
const end=app.indexOf('function validateReceiptData',start);
const code=app.slice(start,end);
const ctx={console}; vm.createContext(ctx);
const helpers=[
'const num=s=>{const x=String(s??"").replace(/\\./g,"").replace(",",".");return Number(x)||0};',
'const round2=n=>Math.round((Number(n)||0)*100)/100;',
'const money=n=>"R$ "+(Number(n)||0).toFixed(2);',
'const normalize=s=>String(s||"").toUpperCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^A-Z0-9]+/g," ").trim();',
'const cleanProductName=s=>String(s||"").replace(/\\s+/g," ").trim();',
'const guessPack=s=>{const m=String(s||"").match(/(\\d+(?:[.,]\\d+)?)\\s*(kg|g|l|ml|un)\\b/i);return m?m[1].replace(",",".")+" "+m[2].toUpperCase():""};'
];
const dep=app.slice(app.indexOf('function normalizeOcrNumeric'),app.indexOf('function validateReceiptData'));
vm.runInContext(helpers.join('\n')+'\n'+dep+'\n'+code,ctx);
const fixture=fs.readFileSync(new URL('../test-fixtures/comprovante-alvorada-2026-09-10.jpg',import.meta.url));
for(const psm of [3,4,6,11,12]){
 const o=execFileSync('tesseract',['test-fixtures/comprovante-alvorada-2026-09-10.jpg','stdout','-l','por','--psm',String(psm)],{encoding:'utf8'});
 const r=ctx.parseReceiptText(o);
 console.log(`PSM ${psm}: ${r.items.length} item candidates; total=${r.total}; cnpj=${r.market.cnpj||'-'}`);
}
const synthetic=`SUPERMERCADOS ALVORADA\nCNPJ 17.893.301/0022-23\n10/09/26 07:37\n7891172523434 PAPEL HIGIENICO F.D. NEVE 20M\n2 UN 14,90 29,80\nVALOR A PAGAR 40,20`;
const r=ctx.parseReceiptText(synthetic);
assert.equal(r.market.cnpj,'17.833.301/0022-23','CNPJ OCR repair should prefer a valid check-digit candidate');
assert.equal(r.total,40.20,'comma decimal parsing must preserve cents');
console.log('OCR hardening assertions: PASS');
