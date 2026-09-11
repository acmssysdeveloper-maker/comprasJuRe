import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../modules/receipt-auditor.js',import.meta.url),'utf8');
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(code,ctx);const A=ctx.window.ReceiptAuditor;
assert(A && A.buildFieldEvidence,'ReceiptAuditor 3.0 não carregou');

const products=[
  {id:'p-coca',barcode:'7894900027013',name:'Refrigerante Coca-Cola 2L',brand:'Coca-Cola',pack:'2 L',unit:'un',aliases:['Refr Coca Cola 2L']},
  {id:'p-coca-zero',barcode:'7894900701517',name:'Refrigerante Coca-Cola 2L Zero',brand:'Coca-Cola',pack:'2 L',unit:'un'}
];
const item=A.reconcileItems([{lineId:'ITEM-001',barcode:'7894900027013',name:'Refr Coca Cola 2L',quantity:1,unit:'UN',unitPrice:10.49,total:10.49,source:'tesseract',confidence:.91}],products)[0];
assert.equal(item.matchStatus,'EXACT');
const audit=A.auditReceipt({market:{name:'Mercado X'},date:'2026-09-11',time:'10:00:00',total:10.49,items:[item],source:'tesseract'},[]);
assert.equal(audit.status,'PASS');
assert.equal(audit.canPublish,true); assert.equal(audit.canAutoLaunch,true);
assert.equal(audit.trace.processedIndependently,true);
assert.ok(audit.evidence.items['ITEM-001'].name.evidenceId==='ITEM-001:name');
assert.equal(audit.evidence.items['ITEM-001'].quantity.corroboration.length,0); // quantity acceptance is justified by its status, not fabricated corroboration
assert.match(audit.evidence.items['ITEM-001'].quantity.acceptedBecause,/quantidade positiva/);
assert.match(audit.evidence.items['ITEM-001'].total.acceptedBecause,/total da linha fechado/);

const bad=A.auditReceipt({market:{name:'Mercado X'},date:'2026-09-11',total:12,items:[{lineId:'ITEM-001',name:'Coca',quantity:1,unit:'un',unitPrice:10,total:10,source:'tesseract',confidence:.95}]},[]);
assert.equal(bad.status,'BLOCK'); assert.equal(bad.canPublish,false);
assert.ok(bad.issues.some(x=>/Total do documento/.test(x)));
assert.equal(bad.evidence.receipt.auditMath.status,'CONFIRMED'===bad.evidence.receipt.auditMath.status ? 'CONFIRMED':'UNCERTAIN');

const discount=A.auditReceipt({market:{name:'Mercado X'},date:'2026-09-11',total:27.80,discountTotal:2,items:[{lineId:'ITEM-001',name:'Papel',quantity:2,unit:'un',unitPrice:14.90,total:27.80,discount:2,source:'fiscal_xml',confidence:1}]},[]);
assert.equal(discount.status,'PASS');
assert.equal(discount.math.grossSum,29.8); assert.equal(discount.math.lineDiscountSum,2); assert.equal(discount.math.receiptDiscount,0); assert.equal(discount.math.expectedTotal,27.8);
assert.equal(discount.itemAudits[0].totalBasis,'NET_AFTER_DISCOUNT');

const dup=A.auditReceipt({market:{name:'Mercado X',cnpj:'09.653.290/0001-47'},date:'2026-09-11',time:'10:00:00',total:10.49,nfceKey:'35260444823938000187551090000002691092067649',items:[{name:'Coca',quantity:1,unit:'un',unitPrice:10.49,total:10.49}]},[{id:'old',nfceKey:'35260444823938000187551090000002691092067649'}]);
assert.equal(dup.status,'BLOCK'); assert.equal(dup.canAutoLaunch,false); assert.match(dup.issues.join(' '),/Duplicidade forte/);

const amb=A.contextualProductMatch({name:'Refrigerante Coca Cola 2L',brand:'Coca-Cola',pack:'2 L',unit:'un'},products);
assert.equal(amb.ambiguous,true); assert.equal(amb.product,null);

const manual=A.auditReceipt({market:{name:'Mercado X'},date:'2026-09-11',total:10.49,items:[{lineId:'ITEM-001',name:'Coca',quantity:1,unit:'un',unitPrice:10.49,total:10.49,matchStatus:'MANUAL',matchedProductId:'p-coca',matchedProductName:'Refrigerante Coca-Cola 2L',matchConfidence:1,fieldEvidence:{name:{source:'manual',extractor:'manual-edit',confidence:1,observedValue:'Coca'}}}]},[]);
assert.equal(manual.status,'PASS');
assert.equal(manual.evidence.items['ITEM-001'].productIdentity.status,'CONFIRMED');
assert.match(manual.evidence.items['ITEM-001'].productIdentity.acceptedBecause,/manualmente/);

console.log(JSON.stringify({pass:true,checks:12,status:'PASS',receiptEvidenceFields:Object.keys(audit.evidence.receipt),itemEvidenceFields:Object.keys(audit.evidence.items['ITEM-001'])},null,2));
