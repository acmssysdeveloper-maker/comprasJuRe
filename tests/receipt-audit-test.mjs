import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const auditorCode=fs.readFileSync(new URL('../modules/receipt-auditor.js',import.meta.url),'utf8');
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(auditorCode,ctx);const A=ctx.window.ReceiptAuditor;
assert(A,'ReceiptAuditor não carregou');

const products=[
 {id:'p1',barcode:'7894900027013',name:'Refrigerante Coca-Cola 2L',brand:'Coca-Cola',pack:'2 L',unit:'un',category:'Bebidas'},
 {id:'p2',barcode:'7891104393067',name:'Adoçante Adocyl Sacarina 200ml',brand:'Adocyl',pack:'200 ml',unit:'un',category:'Mercearia'},
 {id:'p3',barcode:'7891991294508',name:'Cerveja Brahma Chopp 473ml c/12',brand:'Brahma',pack:'12 un',unit:'un',category:'Bebidas'}
];
const aliases=A.reconcileItems([
 {barcode:'7894900027013',name:'Refr Coca Cola 2L',quantity:1,unit:'un',unitPrice:10.49,total:10.49},
 {barcode:'7891104393067',name:'Adocante Adocyl Sacarina 200',quantity:1,unit:'un',unitPrice:9.29,total:9.29},
 {barcode:'7891991294508',name:'Cerv Brahma Chopp 473ml c/12',quantity:1,unit:'un',unitPrice:57.48,total:57.48}
],products);
assert.equal(aliases[0].matchStatus,'exact');assert.equal(aliases[1].matchStatus,'exact');assert.equal(aliases[2].matchStatus,'exact');
const receipt={date:'2026-09-10',time:'18:42:10',total:95.51,discountTotal:0,market:{name:'Supermercado Sao Judas Tadeu LTDA',cnpj:'09.653.290/0001-47'},items:[
 {barcode:'7894900027013',name:'Refrigerante Coca-Cola 2L',quantity:1,unit:'un',unitPrice:10.49,total:10.49,discount:0},
 {barcode:'7896492405293',name:'Saco para Alimento Biodegradável V',quantity:2,unit:'un',unitPrice:.14,total:.28,discount:0},
 {barcode:'7891104393067',name:'Adoçante Adocyl Sacarina 200',quantity:1,unit:'un',unitPrice:9.29,total:9.29,discount:0},
 {barcode:'7896582100015',name:'Espiral Pirisa 10',quantity:3,unit:'un',unitPrice:5.99,total:17.97,discount:0},
 {barcode:'7891991294508',name:'Cerveja Brahma Chopp 473ml c/12',quantity:1,unit:'un',unitPrice:57.48,total:57.48,discount:0}
]};
const audit=A.auditReceipt(receipt,[]);
assert.equal(audit.status,'PASS');assert.equal(audit.canPublish,true);assert.equal(audit.math.netSum,95.51);assert.equal(audit.itemAudits.length,5);assert.ok(audit.itemAudits.every(x=>x.checks.mathOk));
const duplicate=A.auditReceipt(receipt,[{id:'old1',date:'2026-09-10',time:'18:42:10',marketName:'Supermercado Sao Judas Tadeu LTDA',cnpj:'09.653.290/0001-47',total:95.51,nfceKey:''}]);
assert.ok(duplicate.duplicate);assert.equal(duplicate.canAutoLaunch,false);
const bad={...receipt,total:96.51};const badAudit=A.auditReceipt(bad,[]);assert.equal(badAudit.status,'BLOCK');assert.equal(badAudit.canPublish,false);
const badItem={...receipt,items:receipt.items.map((x,i)=>i===3?{...x,total:15.00}:x)};const badItemAudit=A.auditReceipt(badItem,[]);assert.equal(badItemAudit.status,'BLOCK');
console.log('Receipt Auditor tests: PASS');
console.log(JSON.stringify({aliases:aliases.map(x=>({name:x.name,matchStatus:x.matchStatus,matchConfidence:x.matchConfidence})),audit:{status:audit.status,netSum:audit.math.netSum,items:audit.itemAudits.length},duplicateBlocked:duplicate.canAutoLaunch===false,badTotalBlocked:badAudit.status==='BLOCK',badItemBlocked:badItemAudit.status==='BLOCK'},null,2));
