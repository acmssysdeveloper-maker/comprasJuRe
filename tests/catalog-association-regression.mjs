import fs from 'fs';
global.window=global;
eval(fs.readFileSync(new URL('../modules/receipt-auditor.js', import.meta.url),'utf8'));
const A=global.ReceiptAuditor;
const products=[
 {id:'p1',name:'Refrigerante Coca-Cola 2L Zero',barcode:'7894900027013',category:'Bebidas',unit:'un'},
 {id:'p2',name:'Pão For S Boys 450g Trad',barcode:'7891193010074',category:'Padaria',unit:'un'},
 {id:'p3',name:'Amaciante concentrado Urca 1L',barcode:'7896056406087',category:'Limpeza',unit:'un'},
 {id:'p4',name:'Mistura para bolo Regina 400g',barcode:'7896093300720',category:'Mercearia',unit:'un'},
 {id:'p5',name:'Papel higiênico F.D. Neve 20m c/12',barcode:'7891172523434',category:'Higiene',unit:'un'}
];
const items=[
 {lineId:'ITEM-001',name:'Refrigerante Coca Cola 2L',barcode:'7894900027013',unit:'un',quantity:1,unitPrice:10.49,total:10.49},
 {lineId:'ITEM-002',name:'Saco para Alimento Biodegrad V',barcode:'7896492405293',unit:'un',quantity:2,unitPrice:.14,total:.28},
 {lineId:'ITEM-003',name:'Adoçante Adocyl Sacarina 200',barcode:'7891104393067',unit:'un',quantity:1,unitPrice:9.29,total:9.29},
 {lineId:'ITEM-004',name:'Espiral Pirisa 10',barcode:'7896582100015',unit:'un',quantity:3,unitPrice:5.99,total:17.97},
 {lineId:'ITEM-005',name:'Cerveja Brahma Chopp 473ml c/12',barcode:'7891991294508',unit:'un',quantity:1,unitPrice:57.48,total:57.48}
];
const out=A.reconcileItems(items,products);
if(out.some(i=>i.lineId!=='ITEM-001' && i.matchedProductName)) throw new Error('FALHA: item com EAN incompatível recebeu associação automática');
if(out.some(i=>i.lineId!=='ITEM-001' && i.matchStatus!=='NEW')) throw new Error('FALHA: item incompatível não foi classificado como NEW');
if(out[0].matchStatus!=='REVIEW' || out[0].matchedProductName) throw new Error('FALHA: variante divergente no mesmo EAN deveria exigir REVIEW, sem substituir nome por catálogo');
console.log('Catalog association regression: PASS');
