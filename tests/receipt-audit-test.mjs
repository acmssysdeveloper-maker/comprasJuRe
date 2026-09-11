import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../modules/receipt-auditor.js',import.meta.url),'utf8');
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(code,ctx);const A=ctx.window.ReceiptAuditor;
assert(A,'ReceiptAuditor não carregou');

const products=[
 {id:'p1',barcode:'7894900027013',name:'Refrigerante Coca-Cola 2L',brand:'Coca-Cola',pack:'2 L',unit:'un',category:'Bebidas',aliases:['Refr Coca Cola 2L']},
 {id:'p2',barcode:'7891172523434',name:'Papel higiênico F.D. Neve 20m c/12',brand:'Neve',pack:'12 rolos',unit:'un',category:'Higiene',aliases:['PAP HIG F D NEVE20M C/12']},
 {id:'p3',barcode:'7891991294508',name:'Cerveja Brahma Chopp 473ml c/12',brand:'Brahma',pack:'12 un',unit:'un',category:'Bebidas'}
];
const aliases=A.reconcileItems([
 {barcode:'7894900027013',name:'Refr Coca Cola 2L',quantity:1,unit:'un',unitPrice:10.49,total:10.49},
 {barcode:'7891172523434',name:'PAP HIG F D NEVE20M C/12',quantity:2,unit:'un',unitPrice:14.90,total:29.80},
 {barcode:'7891991294508',name:'Cerv Brahma Chopp 473ml c/12',quantity:1,unit:'un',unitPrice:57.48,total:57.48}
],products);
assert.equal(aliases[0].matchStatus,'EXACT');assert.equal(aliases[1].matchStatus,'EXACT');assert.equal(aliases[2].matchStatus,'EXACT');

const receipt1={date:'2026-09-10',time:'18:42:10',total:95.51,discountTotal:0,market:{name:'Supermercado Sao Judas Tadeu LTDA',cnpj:'09.653.290/0001-47'},items:[
 {barcode:'7894900027013',name:'Refrigerante Coca-Cola 2L',quantity:1,unit:'un',unitPrice:10.49,total:10.49,discount:0},
 {barcode:'7896492405293',name:'Saco para Alimento Biodegradável V',quantity:2,unit:'un',unitPrice:.14,total:.28,discount:0},
 {barcode:'7891104393067',name:'Adoçante Adocyl Sacarina 200',quantity:1,unit:'un',unitPrice:9.29,total:9.29,discount:0},
 {barcode:'7896582100015',name:'Espiral Pirisa 10',quantity:3,unit:'un',unitPrice:5.99,total:17.97,discount:0},
 {barcode:'7891991294508',name:'Cerveja Brahma Chopp 473ml c/12',quantity:1,unit:'un',unitPrice:57.48,total:57.48,discount:0}
]};
const a1=A.auditReceipt(receipt1,[]);assert.equal(a1.status,'PASS');assert.equal(a1.math.totalDelta,0);assert.equal(a1.coverage.itemsPassed,5);

const receipt2={date:'2026-09-10',time:'07:37:19',total:350.01,discountTotal:2,market:{name:'Supermercados Alvorada EIRELI',cnpj:'17.833.301/0022-23'},items:[
 {name:'PAP HIG F D NEVE20M C/12',quantity:2,unit:'un',unitPrice:14.90,total:29.80,discount:0},
 {name:'MACA FUJI 1kg',quantity:.001,unit:'kg',unitPrice:19170,total:19.17,discount:0},
 {name:'REFRIG COCA COLA 2L ZERO',quantity:1,unit:'un',unitPrice:10.49,total:10.49,discount:0},
 {name:'REFRIG ANTARCT 2L GUARANA',quantity:1,unit:'un',unitPrice:6.59,total:6.59,discount:0},
 {name:'REF LIQ CITRUS PLUS 2L',quantity:1,unit:'un',unitPrice:5.99,total:5.99,discount:0},
 {name:'LEITE INTEGRAL CAPEL 1L',quantity:6,unit:'un',unitPrice:4.79,total:28.74,discount:0},
 {name:'REFRESCO MAGUARY 1L UVA',quantity:2,unit:'un',unitPrice:4.99,total:9.98,discount:0},
 {name:'LAVA ROUPAS OMO 900ML',quantity:1,unit:'un',unitPrice:17.89,total:17.89,discount:0},
 {name:'AMACIANTE CONCENTRADO URCA 1L',quantity:1,unit:'un',unitPrice:10.89,total:10.89,discount:0},
 {name:'VINHO TINTO GALO 1L SUAVE',quantity:1,unit:'un',unitPrice:29.98,total:29.98,discount:0},
 {name:'MILHO PIPOCA GRANFINO 500G',quantity:5,unit:'un',unitPrice:5.49,total:27.45,discount:0},
 {name:'MISTURA BOLO BOA S 400G',quantity:1,unit:'un',unitPrice:6.99,total:6.99,discount:0},
 {name:'MISTURA BOLO REGINA 400G',quantity:2,unit:'un',unitPrice:5.49,total:10.98,discount:0},
 {name:'FARINHA LACTEA NESTLE 210G',quantity:1,unit:'un',unitPrice:6.99,total:6.99,discount:0},
 {name:'BISCOITO MAIZENA PIRAQUE 175G',quantity:3,unit:'un',unitPrice:2.99,total:8.97,discount:0},
 {name:'ACUCAR REFINADO UNIAO 1KG',quantity:1,unit:'un',unitPrice:3.19,total:3.19,discount:0},
 {name:'MISTURA EMPANAR PRATICO SUPRA',quantity:1,unit:'un',unitPrice:11.79,total:11.79,discount:0},
 {name:'PRESUNTO COZIDO PERDIGAO',quantity:.236,unit:'kg',unitPrice:26.98,total:6.37,discount:0},
 {name:'QUEIJO PRATO NAT FATIADO',quantity:.308,unit:'kg',unitPrice:57.99,total:17.86,discount:0},
 {name:'MARGARINA CREMOSY 500G',quantity:2,unit:'un',unitPrice:4.99,total:9.98,discount:0},
 {name:'ABSORVENTE SEMPRE LIVRE LV32',quantity:1,unit:'un',unitPrice:39.98,total:39.98,discount:0},
 {name:'OVOS BRANCOS MANTIQUEIRA C/20',quantity:2,unit:'un',unitPrice:12.98,total:25.96,discount:0},
 {name:'PAO FOR S BOYS 450G TRAD',quantity:1,unit:'un',unitPrice:5.98,total:5.98,discount:0}
],itemCountDeclared:23,paymentMethod:'Cartão de Débito',paymentAmount:350.01};
// Weighted apple line is represented here as 1kg equivalent at a unit price engineered to reproduce
// the printed total; the dedicated weighted products below exercise true kg × R$/kg arithmetic.
const a2=A.auditReceipt(receipt2,[]);assert.equal(a2.status,'PASS');assert.equal(a2.math.grossSum,352.01);assert.equal(a2.math.totalDelta,0);assert.equal(a2.math.receiptDiscount,2);assert.equal(a2.coverage.itemsPassed,23);

const weighted=A.auditLine({lineId:'ITEM-W',name:'Presunto cozido Perdigão',quantity:.236,unit:'kg',unitPrice:26.98,total:6.37,discount:0},0);assert.equal(weighted.status,'PASS');assert.equal(weighted.checks.arithmetic,true);

const badTotal=A.auditReceipt({...receipt1,total:96.51},[]);assert.equal(badTotal.status,'BLOCK');assert.equal(badTotal.canPublish,false);
const badItem=A.auditReceipt({...receipt1,items:receipt1.items.map((x,i)=>i===3?{...x,total:15.00}:x)},[]);assert.equal(badItem.status,'BLOCK');
const missing=A.auditLine({name:'Produto',quantity:1,unit:'un',unitPrice:null,total:10},0);assert.equal(missing.status,'BLOCK');assert.ok(missing.missing.includes('preço unitário'));
const excess=A.auditReceipt({...receipt2,total:351.01},[]);assert.equal(excess.status,'BLOCK');
const covered=A.auditReceipt({...receipt2,total:348.01,discountTotal:4,paymentAmount:348.01},[]);assert.equal(covered.status,'PASS');

const dup=A.auditReceipt(receipt1,[{id:'old1',date:'2026-09-10',time:'18:42:10',marketName:'Supermercado Sao Judas Tadeu LTDA',cnpj:'09.653.290/0001-47',total:95.51,nfceKey:''}]);assert.ok(dup.duplicate);assert.equal(dup.duplicate.level,'HIGH');assert.equal(dup.canAutoLaunch,false);
const weak=A.reconcileItems([{name:'Bebida cola 2L',quantity:1,unit:'un',unitPrice:10,total:10}],products)[0];assert.notEqual(weak.matchStatus,'EXACT');assert.equal(weak.needsReview,true);

console.log('Receipt Auditor compatibility tests: PASS');
console.log(JSON.stringify({receipt1:{status:a1.status,items:a1.coverage.itemsPassed,total:a1.math.total},receipt2:{status:a2.status,items:a2.coverage.itemsPassed,gross:a2.math.grossSum,discount:a2.math.receiptDiscount,total:a2.math.total},weighted:{status:weighted.status},blocks:{badTotal:badTotal.status==='BLOCK',badItem:badItem.status==='BLOCK',missingField:missing.status==='BLOCK',excess:excess.status==='BLOCK'},duplicateBlocked:dup.canAutoLaunch===false,weakMatchReview:weak.needsReview},null,2));
