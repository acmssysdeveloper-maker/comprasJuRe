import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function normalizeDisplayProductName');
const end=app.indexOf('function extractReceiptValuesRobust');
assert(start>=0&&end>start);
const parserCode=app.slice(start,end);
const tesseract=execFileSync('tesseract',[new URL('../test-fixtures/comprovante-contextual-5-itens.jpg',import.meta.url).pathname,'stdout','-l','por'],{encoding:'utf8'});
// Replace fixture with the user-provided visual when available through CLI by keeping the test deterministic.
const ctx={
 cleanProductName:s=>String(s||'').replace(/\s+/g,' ').trim(),
 guessPack:s=>{const m=String(s||'').match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un)\b/i);return m?m[1].replace(',','.')+' '+m[2].toUpperCase():''},
 normalizeReceiptName:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(),
 inferProductCategory:()=> 'Outros',
 isValidGtin:()=>true,
 repairCnpjCandidate:raw=>{const d=String(raw||'').replace(/\D/g,'');return d.length===14?d:''},
 canonicalCnpj:d=>String(d||'').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'),
 validCnpjDigits:()=>true,
 normalizeOcrNumeric:s=>String(s||''),
 round2:n=>Math.round((Number(n)||0)*100)/100,
 num:v=>Number(v)||0,
 moneyTokens:s=>String(s||'').match(/-?(?:\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g)||[],
 receiptNum:v=>{const x=String(v??'').replace(/\s/g,'');if(x.includes(','))return Number(x.replace(/\./g,'').replace(',','.'))||0;return Number(x)||0},
 normalizeReceiptDate:v=>{const m=String(v||'').match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})/);if(!m)return '';let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2]}-${m[1]}`},
 extractReceiptLabeledValue:(lines,patterns)=>{for(let i=lines.length-1;i>=0;i--){if(patterns.some(r=>r.test(lines[i].raw))){const toks=ctx.moneyTokens(lines[i].raw);if(toks.length)return Math.abs(ctx.receiptNum(toks[toks.length-1]));for(let j=i+1;j<Math.min(lines.length,i+4);j++){const t=ctx.moneyTokens(lines[j].raw);if(t.length)return Math.abs(ctx.receiptNum(t[t.length-1]));}}}return 0},
 extractMerchantIdentity:(lines)=>({name:(lines[0]?.raw||''),merchantType:'supermercado'})
};
vm.createContext(ctx);
vm.runInContext(parserCode,ctx);
const parsed=vm.runInContext(`parseReceiptText(${JSON.stringify(tesseract)})`,ctx);
assert.equal(parsed.items.length,5,`Esperados 5 itens, obtidos ${parsed.items.length}`);
const names=parsed.items.map(x=>x.name);assert.ok(names.some(x=>/Refrigerante Coca Cola 2L/i.test(x)));assert.ok(names.some(x=>/Saco para Alimento/i.test(x)));assert.ok(names.some(x=>/Espiral Pirisa 10/i.test(x)));assert.ok(names.some(x=>/Cerveja Brahma Chopp/i.test(x)));
assert.equal(parsed.total,95.51);assert.equal(parsed.itemCountDeclared,5);
assert.ok(Math.abs(parsed.items.reduce((s,x)=>s+x.total,0)-95.51)<0.01);
for(const x of parsed.items)assert.ok(Math.abs(x.quantity*x.unitPrice-x.total)<0.03,`${x.name} não fecha`);
console.log('OCR image parser test: PASS');
console.log(JSON.stringify({market:parsed.market,items:parsed.items.map(x=>({name:x.name,barcode:x.barcode,quantity:x.quantity,unit:x.unit,unitPrice:x.unitPrice,total:x.total})),total:parsed.total,itemCountDeclared:parsed.itemCountDeclared},null,2));
