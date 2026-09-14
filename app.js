/* Compras da JuRe v2.8.7
   Núcleo: IndexedDB + catálogo de produtos + ocorrências de compra + listas + auditoria.
   Não apagar histórico: exclusão é lógica/arquivamento.
*/
const APP_VERSION="2.8.7", DB_NAME="compras-jure-db", DB_VERSION=6;
const RUNNING_FROM_FILE=location.protocol==="file:";
async function clearStaleServiceWorkers(){
  if(RUNNING_FROM_FILE || !window.isSecureContext || !('serviceWorker' in navigator)) return false;
  try{
    const registrations=await navigator.serviceWorker.getRegistrations();
    const cachesBefore=await caches.keys();
    const legacy=registrations.length>0 || cachesBefore.length>0;
    if(!legacy) return false;
    await Promise.all(registrations.map(r=>r.unregister()));
    await Promise.all(cachesBefore.map(k=>caches.delete(k)));
    if(!sessionStorage.getItem('jure-stale-cache-cleared-2.8.7')){
      sessionStorage.setItem('jure-stale-cache-cleared-2.8.7','1');
      const u=new URL(location.href); u.searchParams.set('jure','2.8.7');
      location.replace(u.href);
      return true;
    }
  }catch(e){ console.warn('Limpeza de cache antigo não pôde ser concluída:', e); }
  return false;
}

function setupRuntimeManifest(){
 if(RUNNING_FROM_FILE)return;
 if(document.querySelector('link[rel="manifest"]'))return;
 const l=document.createElement("link");l.rel="manifest";l.href="manifest.json";document.head.appendChild(l);
}
setupRuntimeManifest();
function runtimeNote(){
 return RUNNING_FROM_FILE ? "Modo arquivo local: recursos web (manifest/service worker) ficam desativados. Para leitura OCR/Gemini mais estável, use iniciar-local.bat." : "";
}
const STORES=["meta","settings","markets","products","purchases","purchaseItems","lists","attachments","audit"];
const CATEGORIES=["Mercearia","Bebidas","Biscoitos","Laticínios","Limpeza","Higiene","Frios","Hortifruti","Padaria","Carnes","Outros"];
let db=null,currentPage="dashboard",selectedFile=null,pendingImport=null,importRun=0,importStartedAt=0,importClock=null,previewUrl=null;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
const num=(v)=>{
 if(typeof v==="number")return Number.isFinite(v)?v:0;
 let s=String(v??"").trim().replace(/R\$\s*/ig,"").replace(/\s/g,""); if(!s)return 0;
 const hasC=s.includes(","),hasD=s.includes(".");
 if(hasC&&hasD){const last=Math.max(s.lastIndexOf(","),s.lastIndexOf("."));const dec=s[last],int=s.slice(0,last).replace(/[.,]/g,"");return Number(`${int}.${s.slice(last+1)}`)||0;}
 if(hasC)return Number(s.replace(/\./g,"").replace(",","."))||0;
 if(hasD){const parts=s.split(".");if(parts.length===2&&parts[1].length<=3)return Number(s)||0;return Number(s.replace(/\./g,""))||0;}
 return Number(s)||0;
};
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const todayISO=()=>new Date().toISOString();
const fmtDate=s=>s?new Intl.DateTimeFormat("pt-BR").format(new Date(`${s}T12:00:00`)):"—";
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const esc=s=>String(s??"").replace(/[<>&"]/g,m=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[m]));
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2200)}
function normalize(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")}
function productKey(p){return [p.barcode||"",normalize(p.brand),normalize(p.name),normalize(p.pack),p.unit||""].join("|")}

const EMBEDDED_SEED={"schemaVersion":4,"appVersion":"2.8.7","settings":{"currency":"BRL","geminiModel":"gemini-3.7-flash","healthEnabled":true},"markets":[{"id":"mkt-alvorada-17833301002223","name":"Supermercados Alvorada","legalName":"SUPERMERCADOS ALVORADA EIRELI","cnpj":"17.833.301/0022-23","address":"Avenida Saquarema, 5236, Loja, Bacaxá (Bacaxá)","city":"Saquarema","state":"RJ","source":"receipt","createdAt":"2026-09-10T07:40:00-03:00","active":true}],"products":[{"id":"prod-085e56ca3888","barcode":"7891172523434","name":"Papel higiênico F.D. Neve 20m c/12","brand":"Neve","category":"Higiene","pack":"12 rolos","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-113e2297a0b1","barcode":"2707","name":"Maçã Fuji","brand":"","category":"Hortifruti","pack":"kg","unit":"kg","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-1864a771b772","barcode":"7894900701517","name":"Refrigerante Coca-Cola 2L Zero","brand":"Coca-Cola","category":"Bebidas","pack":"2 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-da21d9bbbfd2","barcode":"7891991001373","name":"Refrigerante Antarctica 2L Guaraná","brand":"Antarctica","category":"Bebidas","pack":"2 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-48750ed6282b","barcode":"609963576906","name":"Refrigerante Citrus Plus 2L","brand":"","category":"Bebidas","pack":"2 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-d65559f14fb6","barcode":"7898360430215","name":"Leite Integral Capel 1L","brand":"Capel","category":"Laticínios","pack":"1 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-de6febcb58b9","barcode":"7896005404195","name":"Refresco Maguary 1L Uva","brand":"Maguary","category":"Bebidas","pack":"1 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-a3717eb1fa5b","barcode":"7891150064935","name":"Lava-roupas Omo 900ml","brand":"Omo","category":"Limpeza","pack":"900 ml","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-66c1602a5482","barcode":"7896056406087","name":"Amaciante concentrado Urca 1L","brand":"Urca","category":"Limpeza","pack":"1 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-7045588e9429","barcode":"7897344201087","name":"Vinho Tinto Galo 1L Suave","brand":"Galo","category":"Bebidas","pack":"1 L","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-8460161b30cc","barcode":"7896016501739","name":"Milho para pipoca Granfino 500g","brand":"Granfino","category":"Mercearia","pack":"500 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-656ee86ca3a2","barcode":"7896005271612","name":"Mistura para bolo Boa S 400g","brand":"Boa S","category":"Mercearia","pack":"400 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-1ee17458fe09","barcode":"7896093300720","name":"Mistura para bolo Regina 400g","brand":"Regina","category":"Mercearia","pack":"400 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-d35bfa277cf0","barcode":"7891000099032","name":"Farinha láctea Nestlé 210g","brand":"Nestlé","category":"Mercearia","pack":"210 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-a66fed7de82d","barcode":"7896024761651","name":"Biscoito Maizena Piraquê 175g","brand":"Piraquê","category":"Biscoitos","pack":"175 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-ecb1724c49cb","barcode":"7891910000197","name":"Açúcar refinado União 1kg","brand":"União","category":"Mercearia","pack":"1 kg","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-529635d729ed","barcode":"7898496681086","name":"Mistura para empanar Prático Supra","brand":"Prático","category":"Mercearia","pack":"","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-9ea34ca70361","barcode":"2516","name":"Presunto cozido Perdigão","brand":"Perdigão","category":"Frios","pack":"kg","unit":"kg","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-aa01fb8cebf5","barcode":"297","name":"Queijo prato fatiado","brand":"","category":"Frios","pack":"kg","unit":"kg","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-423b582d5e8c","barcode":"7894904271498","name":"Margarina Cremosa 500g","brand":"","category":"Laticínios","pack":"500 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-df8a46ad620c","barcode":"7891010518844","name":"Absorvente Sempre Livre LV32","brand":"Sempre Livre","category":"Higiene","pack":"32 un","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-64e18dead830","barcode":"7896982103388","name":"Ovos brancos Mantiqueira c/20","brand":"Mantiqueira","category":"Laticínios","pack":"20 un","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"},{"id":"prod-bd7f666d4293","barcode":"7891193010074","name":"Pão For S Boys 450g Trad","brand":"For S Boys","category":"Padaria","pack":"450 g","unit":"un","health":"Não classificado","active":true,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00"}],"purchases":[{"id":"purchase-20260910-alvorada","date":"2026-09-10","time":"07:37:19","marketId":"mkt-alvorada-17833301002223","marketName":"Supermercados Alvorada","cnpj":"17.833.301/0022-23","legalName":"SUPERMERCADOS ALVORADA EIRELI","address":"Avenida Saquarema, 5236, Loja, Bacaxá (Bacaxá)","city":"Saquarema","state":"RJ","total":350.01,"itemCount":23,"discountTotal":2.0,"paymentMethod":"Cartão de débito","receiptReference":"test-fixtures/comprovante-alvorada-2026-09-10.jpg","receiptName":"comprovante-alvorada-2026-09-10.jpg","source":"seed-receipt","status":"confirmed-with-review","createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","documentNumber":"383983","active":true}],"purchaseItems":[{"id":"item-20260910-01","purchaseId":"purchase-20260910-alvorada","productId":"prod-085e56ca3888","barcode":"7891172523434","descriptionRaw":"Papel higiênico F.D. Neve 20m c/12","quantity":2,"unit":"un","pack":"12 rolos","unitPrice":14.9,"lineTotal":29.8,"discount":2.0,"totalAfterDiscount":27.8,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-02","purchaseId":"purchase-20260910-alvorada","productId":"prod-113e2297a0b1","barcode":"2707","descriptionRaw":"Maçã Fuji","quantity":1.6,"unit":"kg","pack":"kg","unitPrice":11.98,"lineTotal":19.17,"discount":0,"totalAfterDiscount":19.17,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-03","purchaseId":"purchase-20260910-alvorada","productId":"prod-1864a771b772","barcode":"7894900701517","descriptionRaw":"Refrigerante Coca-Cola 2L Zero","quantity":1,"unit":"un","pack":"2 L","unitPrice":10.49,"lineTotal":10.49,"discount":0,"totalAfterDiscount":10.49,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-04","purchaseId":"purchase-20260910-alvorada","productId":"prod-da21d9bbbfd2","barcode":"7891991001373","descriptionRaw":"Refrigerante Antarctica 2L Guaraná","quantity":1,"unit":"un","pack":"2 L","unitPrice":6.59,"lineTotal":6.59,"discount":0,"totalAfterDiscount":6.59,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-05","purchaseId":"purchase-20260910-alvorada","productId":"prod-48750ed6282b","barcode":"609963576906","descriptionRaw":"Refrigerante Citrus Plus 2L","quantity":1,"unit":"un","pack":"2 L","unitPrice":5.99,"lineTotal":5.99,"discount":0,"totalAfterDiscount":5.99,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-06","purchaseId":"purchase-20260910-alvorada","productId":"prod-d65559f14fb6","barcode":"7898360430215","descriptionRaw":"Leite Integral Capel 1L","quantity":6,"unit":"un","pack":"1 L","unitPrice":4.79,"lineTotal":28.74,"discount":0,"totalAfterDiscount":28.74,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-07","purchaseId":"purchase-20260910-alvorada","productId":"prod-de6febcb58b9","barcode":"7896005404195","descriptionRaw":"Refresco Maguary 1L Uva","quantity":2,"unit":"un","pack":"1 L","unitPrice":4.99,"lineTotal":9.98,"discount":0,"totalAfterDiscount":9.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-08","purchaseId":"purchase-20260910-alvorada","productId":"prod-a3717eb1fa5b","barcode":"7891150064935","descriptionRaw":"Lava-roupas Omo 900ml","quantity":1,"unit":"un","pack":"900 ml","unitPrice":17.89,"lineTotal":17.89,"discount":0,"totalAfterDiscount":17.89,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-09","purchaseId":"purchase-20260910-alvorada","productId":"prod-66c1602a5482","barcode":"7896056406087","descriptionRaw":"Amaciante concentrado Urca 1L","quantity":1,"unit":"un","pack":"1 L","unitPrice":10.89,"lineTotal":10.89,"discount":0,"totalAfterDiscount":10.89,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-10","purchaseId":"purchase-20260910-alvorada","productId":"prod-7045588e9429","barcode":"7897344201087","descriptionRaw":"Vinho Tinto Galo 1L Suave","quantity":1,"unit":"un","pack":"1 L","unitPrice":29.98,"lineTotal":29.98,"discount":0,"totalAfterDiscount":29.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-11","purchaseId":"purchase-20260910-alvorada","productId":"prod-8460161b30cc","barcode":"7896016501739","descriptionRaw":"Milho para pipoca Granfino 500g","quantity":5,"unit":"un","pack":"500 g","unitPrice":5.49,"lineTotal":27.45,"discount":0,"totalAfterDiscount":27.45,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-12","purchaseId":"purchase-20260910-alvorada","productId":"prod-656ee86ca3a2","barcode":"7896005271612","descriptionRaw":"Mistura para bolo Boa S 400g","quantity":1,"unit":"un","pack":"400 g","unitPrice":6.99,"lineTotal":6.99,"discount":0,"totalAfterDiscount":6.99,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-13","purchaseId":"purchase-20260910-alvorada","productId":"prod-1ee17458fe09","barcode":"7896093300720","descriptionRaw":"Mistura para bolo Regina 400g","quantity":2,"unit":"un","pack":"400 g","unitPrice":5.49,"lineTotal":10.98,"discount":0,"totalAfterDiscount":10.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-14","purchaseId":"purchase-20260910-alvorada","productId":"prod-d35bfa277cf0","barcode":"7891000099032","descriptionRaw":"Farinha láctea Nestlé 210g","quantity":1,"unit":"un","pack":"210 g","unitPrice":6.99,"lineTotal":6.99,"discount":0,"totalAfterDiscount":6.99,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-15","purchaseId":"purchase-20260910-alvorada","productId":"prod-a66fed7de82d","barcode":"7896024761651","descriptionRaw":"Biscoito Maizena Piraquê 175g","quantity":3,"unit":"un","pack":"175 g","unitPrice":2.99,"lineTotal":8.97,"discount":0,"totalAfterDiscount":8.97,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-16","purchaseId":"purchase-20260910-alvorada","productId":"prod-ecb1724c49cb","barcode":"7891910000197","descriptionRaw":"Açúcar refinado União 1kg","quantity":1,"unit":"un","pack":"1 kg","unitPrice":3.19,"lineTotal":3.19,"discount":0,"totalAfterDiscount":3.19,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-17","purchaseId":"purchase-20260910-alvorada","productId":"prod-529635d729ed","barcode":"7898496681086","descriptionRaw":"Mistura para empanar Prático Supra","quantity":1,"unit":"un","pack":"","unitPrice":11.79,"lineTotal":11.79,"discount":0,"totalAfterDiscount":11.79,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-18","purchaseId":"purchase-20260910-alvorada","productId":"prod-9ea34ca70361","barcode":"2516","descriptionRaw":"Presunto cozido Perdigão","quantity":0.236,"unit":"kg","pack":"kg","unitPrice":26.98,"lineTotal":6.37,"discount":0,"totalAfterDiscount":6.37,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-19","purchaseId":"purchase-20260910-alvorada","productId":"prod-aa01fb8cebf5","barcode":"297","descriptionRaw":"Queijo prato fatiado","quantity":0.308,"unit":"kg","pack":"kg","unitPrice":57.99,"lineTotal":17.86,"discount":0,"totalAfterDiscount":17.86,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-20","purchaseId":"purchase-20260910-alvorada","productId":"prod-423b582d5e8c","barcode":"7894904271498","descriptionRaw":"Margarina Cremosa 500g","quantity":2,"unit":"un","pack":"500 g","unitPrice":4.99,"lineTotal":9.98,"discount":0,"totalAfterDiscount":9.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-21","purchaseId":"purchase-20260910-alvorada","productId":"prod-df8a46ad620c","barcode":"7891010518844","descriptionRaw":"Absorvente Sempre Livre LV32","quantity":1,"unit":"un","pack":"32 un","unitPrice":39.98,"lineTotal":39.98,"discount":0,"totalAfterDiscount":39.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-22","purchaseId":"purchase-20260910-alvorada","productId":"prod-64e18dead830","barcode":"7896982103388","descriptionRaw":"Ovos brancos Mantiqueira c/20","quantity":2,"unit":"un","pack":"20 un","unitPrice":12.98,"lineTotal":25.96,"discount":0,"totalAfterDiscount":25.96,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true},{"id":"item-20260910-23","purchaseId":"purchase-20260910-alvorada","productId":"prod-bd7f666d4293","barcode":"7891193010074","descriptionRaw":"Pão For S Boys 450g Trad","quantity":1,"unit":"un","pack":"450 g","unitPrice":5.98,"lineTotal":5.98,"discount":0,"totalAfterDiscount":5.98,"confidence":0.99,"needsReview":false,"createdAt":"2026-09-10T21:00:00-03:00","updatedAt":"2026-09-10T21:00:00-03:00","purchaseDate":"2026-09-10","active":true}],"lists":[],"audit":[{"id":"audit-seed-001","type":"seed","entity":"purchase","entityId":"purchase-20260910-alvorada","at":"2026-09-10T21:00:00-03:00","message":"Compra inicial cadastrada a partir do comprovante real enviado. Soma dos itens líquidos = R$ 350,01; total fiscal = R$ 350,01."}],"appMeta":{"lastBackupAt":null,"source":"seed","auditEnabled":true}}
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const d=req.result; for(const s of STORES){if(!d.objectStoreNames.contains(s)){const st=d.createObjectStore(s,{keyPath:"id"}); if(["products","markets","purchases"].includes(s))st.createIndex("active","active"); if(s==="purchaseItems"){st.createIndex("purchaseId","purchaseId");st.createIndex("productId","productId")}}}};
    req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error)
  })
}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function getOne(store,id){return new Promise((res,rej)=>{const r=tx(store).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
async function putPurchase(obj){
 const previous=await getOne("purchases",obj.id);
 if(previous && previous.date!==obj.date){
   await audit("Tentativa de alterar a data histórica bloqueada.","purchase",obj.id,"date-protection");
   obj={...obj,date:previous.date};
 }
 return put("purchases",obj);
}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,"readwrite").delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function bulkPut(store,arr){return new Promise((res,rej)=>{const t=db.transaction(store,"readwrite"),s=t.objectStore(store);arr.forEach(x=>s.put(x));t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}

async function seedIfEmpty(){
  const existingMeta=await getOne("meta","meta");
  if(existingMeta) return;
  const existing=await getAll("purchases"); if(existing.length) return;
  const r=EMBEDDED_SEED;
  await bulkPut("settings",[{"id":"settings",...r.settings}]);
  await bulkPut("markets",r.markets);
  await bulkPut("products",r.products);
  await bulkPut("purchases",r.purchases);
  await bulkPut("purchaseItems",r.purchaseItems);
  await bulkPut("audit",r.audit);
  await put("meta",{id:"meta",schemaVersion:4,appVersion:APP_VERSION,seededAt:todayISO()});
}
async function migrate(){
  const m=await getOne("meta","meta");
  if(!m) return;
  const from=Number(m.schemaVersion||1);
  if(from<2) await put("meta",{...m,schemaVersion:2,appVersion:APP_VERSION,migratedAt:todayISO()});
  if(from<3){
    const purchases=await getAll("purchases"), items=await getAll("purchaseItems");
    const byId=new Map(purchases.map(p=>[p.id,p.date]));
    for(const item of items){
      const d=byId.get(item.purchaseId);
      if(d && item.purchaseDate!==d) await put("purchaseItems",{...item,purchaseDate:d,active:item.active!==false});
    }
    for(const store of ["products","markets","purchases","lists"]){
      const rows=await getAll(store);
      for(const row of rows) if(row.active===undefined) await put(store,{...row,active:true});
    }
    const currentPurchases=await getAll("purchases"), currentItems=await getAll("purchaseItems");
    for(const p of currentPurchases){
      if(p.fingerprint) continue;
      const fp=await computePurchaseFingerprint({...p,items:currentItems.filter(i=>i.purchaseId===p.id)});
      await put("purchases",{...p,fingerprint:fp});
    }
    await put("meta",{id:"meta",schemaVersion:3,appVersion:APP_VERSION,migratedAt:todayISO()});
  }
  if(from<4){
    const lists=await getAll("lists");
    for(const l of lists){
      const items=(l.items||[]).map(it=>({...it,checked:false,qty:Math.max(.001,num(it.qty)||1)}));
      await put("lists",{...l,items,active:l.active!==false});
    }
    const purchases=await getAll("purchases");
    for(const p of purchases) if(p.source==="manual-list" && p.hasItemPrices===undefined) await put("purchases",{...p,hasItemPrices:false});
    await put("meta",{id:"meta",schemaVersion:4,appVersion:APP_VERSION,migratedAt:todayISO()});
  } else {
    await put("meta",{...m,schemaVersion:Math.max(4,Number(m.schemaVersion||4)),appVersion:APP_VERSION});
  }
}
async function ensureDB(){await openDB();await seedIfEmpty();await migrate()}


async function data(){
  const [settings,markets,products,purchases,purchaseItems,lists,audit]=await Promise.all([
    getOne("settings","settings").then(async x=>{const s=x||{id:"settings",geminiModel:"gemini-3.7-flash",healthEnabled:true};if(Object.prototype.hasOwnProperty.call(s,"geminiApiKey")||Object.prototype.hasOwnProperty.call(s,"allowDirectGeminiKey")){const clean={...s};delete clean.geminiApiKey;delete clean.allowDirectGeminiKey;await put("settings",clean);return clean}return s;}),
    getAll("markets"),getAll("products"),getAll("purchases"),getAll("purchaseItems"),getAll("lists"),getAll("audit")
  ]);
  return {settings,markets,products,purchases,purchaseItems,lists,audit}
}
async function setSettings(s){const clean={...s};delete clean.geminiApiKey;delete clean.allowDirectGeminiKey;await put("settings",{id:"settings",...clean})}
async function audit(message,entity,entityId,type="change"){await put("audit",{id:uid("audit"),at:todayISO(),message,entity,entityId,type})}

async function renderAll(){await renderDashboard();await renderPurchases();await renderProducts();await renderMarkets();await renderLists();await renderConsumption();await renderEconomy();await renderReport();await renderManual();await renderSettings();await renderUpdates()}
function go(page){currentPage=page;$$(".page").forEach(p=>p.classList.toggle("active",p.id===page));$$("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const label=$(`#nav button[data-page="${page}"] span`)?.textContent;$("#pageTitle").textContent=label||({dashboard:"Visão geral",manual:"Manual do usuário",config:"Configurações",updates:"Atualizações"}[page]||"Compras da JuRe");renderPage(page)}
async function renderPage(page){if(page==="dashboard")return renderDashboard();if(page==="compras")return renderPurchases();if(page==="listas")return renderLists();if(page==="importar")return; if(page==="produtos")return renderProducts();if(page==="mercados")return renderMarkets();if(page==="consumo")return renderConsumption();if(page==="economia")return renderEconomy();if(page==="relatorios")return renderReport();if(page==="manual")return renderManual();if(page==="config")return renderSettings();if(page==="updates")return renderUpdates()}
const menuToggle=$("#menuToggle"), navScrim=$("#navScrim");
function setNavOpen(open){document.body.classList.toggle("nav-open",!!open);menuToggle?.setAttribute("aria-expanded",open?"true":"false");if(menuToggle)menuToggle.setAttribute("aria-label",open?"Fechar menu":"Abrir menu");navScrim?.setAttribute("aria-hidden",open?"false":"true");}
menuToggle?.addEventListener("click",()=>setNavOpen(!document.body.classList.contains("nav-open")));
navScrim?.addEventListener("click",()=>setNavOpen(false));
document.addEventListener("keydown",e=>{if(e.key==="Escape")setNavOpen(false)});
$$("#nav button").forEach(b=>b.onclick=()=>{go(b.dataset.page);setNavOpen(false)});
$$("[data-go]").forEach(b=>b.onclick=()=>{go(b.dataset.go);setNavOpen(false)});

async function renderDashboard(){
  const d=await data();const activeP=d.purchases.filter(p=>p.active!==false),its=d.purchaseItems.filter(i=>activeP.some(p=>p.id===i.purchaseId));
  const total=activeP.reduce((s,p)=>s+num(p.total),0),disc=activeP.reduce((s,p)=>s+num(p.discountTotal),0);
  $("#dashTotal").textContent=money(total);$("#dashMeta").textContent=`${activeP.length} compra(s) · ${its.length} ocorrências de itens`;
  $("#kpiTotal").textContent=money(total);$("#kpiProducts").textContent=d.products.filter(p=>p.active!==false).length;$("#kpiMarkets").textContent=new Set(activeP.map(p=>p.marketId)).size;$("#kpiDiscount").textContent=money(disc);
  const map={};for(const i of its){const p=d.products.find(x=>x.id===i.productId);const c=p?.category||"Outros";map[c]=(map[c]||0)+num(i.totalAfterDiscount??i.lineTotal)}
  const max=Math.max(...Object.values(map),1);$("#categoryChart").innerHTML=Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;font-size:11px"><span>${k}</span><b>${money(v)}</b></div><div style="height:8px;background:#eee;border-radius:9px;overflow:hidden"><div style="height:100%;width:${v/max*100}%;background:#7158e8"></div></div></div>`).join("")||"<div class='muted'>Sem dados.</div>";
  const recent=activeP.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);$("#recentPurchases").innerHTML=recent.map(p=>`<div class="recent-row"><div><b>${p.marketName}</b><div class="muted">${fmtDate(p.date)} · ${p.itemCount} itens</div></div><b>${money(p.total)}</b></div>`).join("");
  const insights=buildInsights(d);$("#dashboardInsights").innerHTML=insights.slice(0,3).map(x=>`<div class="insight"><b>${x.icon} ${x.title}</b><span>${x.text}</span></div>`).join("")||"<div class='insight'>Importe mais compras para gerar padrões confiáveis.</div>";
}
function buildInsights(d){
  const out=[],activeP=d.purchases.filter(p=>p.active!==false),its=d.purchaseItems.filter(i=>activeP.some(p=>p.id===i.purchaseId)),ps=d.products.filter(p=>p.active!==false);
  for(const p of ps){const arr=its.filter(i=>i.productId===p.id).sort((a,b)=>a.purchaseDate?.localeCompare(b.purchaseDate));if(arr.length>=2){const avg=arr.reduce((s,i)=>s+num(i.quantity),0)/arr.length,last=num(arr.at(-1).quantity);if(last>avg*1.5)out.push({icon:"⚠️",title:`${p.name} acima do seu padrão`,text:`Na última ocorrência você comprou ${fmtQty(last)}. Sua média por ocorrência está em ${fmtQty(avg)}. Vale observar se isso foi uma exceção.`});}}
  const recent=its.slice().sort((a,b)=>(b.purchaseDate||"").localeCompare(a.purchaseDate||"")).slice(0,1)[0];if(recent){const p=ps.find(x=>x.id===recent.productId);if(p)out.push({icon:"🛒",title:"Último movimento",text:`${p.name} foi registrado recentemente. O histórico guardará essa compra separada das próximas ocorrências.`})}
  const cat=Object.entries(its.reduce((m,i)=>{const p=ps.find(x=>x.id===i.productId);m[p?.category||"Outros"]=(m[p?.category||"Outros"]||0)+num(i.totalAfterDiscount??i.lineTotal);return m},{})).sort((a,b)=>b[1]-a[1])[0];if(cat)out.push({icon:"💡",title:"Onde o dinheiro mais foi",text:`A categoria ${cat[0]} concentra ${money(cat[1])} do histórico analisado.`});
  const manualTrips=activeP.filter(p=>p.source==="manual-list");
  if(manualTrips.length){
    const avg=manualTrips.reduce((s,p)=>s+num(p.total),0)/manualTrips.length;
    out.unshift({icon:"🧾",title:"Seu gasto por ida está sendo acompanhado",text:`Você já registrou ${manualTrips.length} ida(s) usando suas listas. A média informada por ida é ${money(avg)}.`});
    const mk={};for(const p of manualTrips){mk[p.marketName]=(mk[p.marketName]||0)+num(p.total)};const top=Object.entries(mk).sort((a,b)=>b[1]-a[1])[0];if(top)out.push({icon:"🏪",title:"Mercado com maior gasto registrado",text:`Nos registros feitos pelas listas, ${top[0]} concentra ${money(top[1])}. Isso é gasto acumulado, não afirmação de que seja o mercado mais caro.`});
  }
  return out;
}
const fmtQty=q=>Number.isInteger(q)?q:String(Number(q).toFixed(3)).replace(".",",");

async function renderPurchases(){
  const d=await data();const ps=d.products,p=d.purchases.filter(x=>x.active!==false).sort((a,b)=>b.date.localeCompare(a.date));$("#purchaseCards").innerHTML=p.map(x=>{
    const items=d.purchaseItems.filter(i=>i.purchaseId===x.id);return `<div class="purchase-card"><div class="purchase-top"><div class="purchase-main"><h3>${x.marketName}</h3><div class="muted">${fmtDate(x.date)} · ${x.time||"hora não informada"} · ${x.cnpj||"CNPJ não identificado"}</div><div class="purchase-summary"><span>Itens: ${x.itemCount}</span><span>Total: ${money(x.total)}</span><span>Descontos: ${money(x.discountTotal)}</span><span>${x.paymentMethod||"Pagamento não informado"}</span></div></div><div class="purchase-actions"><button class="ghost" onclick="openPurchase('${x.id}')">Ver / editar</button><button class="ghost" onclick="openReceiptForPurchase('${x.id}')">Comprovante</button><button class="ghost" onclick="archivePurchase('${x.id}')">Excluir</button></div></div><div class="purchase-items">${items.slice(0,12).map(i=>{const pr=ps.find(z=>z.id===i.productId);return `<div class="item-line">${pr?.name||i.descriptionRaw}<span class="muted">${fmtQty(i.quantity)} ${i.unit||""} · ${money(i.unitPrice)}</span><strong>${money(i.totalAfterDiscount??i.lineTotal)}</strong></div>`}).join("")}${items.length>12?`<div class="item-line muted">+ ${items.length-12} itens no comprovante</div>`:""}</div></div>`
  }).join("")||"<div class='panel'>Nenhuma compra ativa.</div>";
}
window.openReceiptForPurchase=async id=>{const p=await getOne("purchases",id);const ref=p?.receiptReference||"";if(ref.startsWith("attachment:"))return openAttachment(ref.slice(11));if(ref)return openAttachment("",ref);toast("Comprovante não encontrado.")};

window.openPurchase=async id=>{
 const d=await data(),p=d.purchases.find(x=>x.id===id),items=d.purchaseItems.filter(i=>i.purchaseId===id);
 $("#modalTitle").textContent="Editar compra";
 $("#modalBody").innerHTML=`<div class="form-grid"><label>Data da compra<input id="editPurchaseDate" type="date" value="${p.date}" disabled><small>Protegida: a data do fato histórico não muda quando você corrige dados.</small></label><label>Mercado<input id="editMarket" value="${p.marketName||""}"></label><label>Total<input id="editTotal" value="${p.total}"></label><label>CNPJ<input id="editCnpj" value="${p.cnpj||""}"></label></div><h4>Itens</h4>${items.map(i=>{const pr=d.products.find(x=>x.id===i.productId);return `<div class="item-line"><b>${pr?.name||i.descriptionRaw}</b><div class="form-grid"><label>Quantidade<input data-i="${i.id}" class="ei-qty" value="${i.quantity}"></label><label>Preço unitário<input data-i="${i.id}" class="ei-price" value="${i.unitPrice}"></label></div></div>`}).join("")}<div class="button-row" style="margin-top:14px"><button class="primary" id="savePurchaseEdit">Salvar correções</button><button class="ghost" id="modalClose2">Cancelar</button></div>`;
 $("#modal").classList.remove("hidden");$("#modalClose2").onclick=closeModal;
 $("#savePurchaseEdit").onclick=async()=>{
   const newP={...p,marketName:$("#editMarket").value.trim()||p.marketName,total:num($("#editTotal").value),cnpj:$("#editCnpj").value.trim(),updatedAt:todayISO()};
   await putPurchase(newP);
   for(const i of items){const q=num(document.querySelector(`.ei-qty[data-i="${i.id}"]`).value),pr=num(document.querySelector(`.ei-price[data-i="${i.id}"]`).value);await put("purchaseItems",{...i,quantity:q,unitPrice:pr,lineTotal:round2(q*pr),totalAfterDiscount:round2(q*pr-num(i.discount)),updatedAt:todayISO()})}
   await audit("Compra corrigida sem alterar a data original.","purchase",id);closeModal();await renderAll();toast("Correção salva. A data permaneceu intacta.")
 };
};
window.archivePurchase=async id=>{if(!confirm("A compra será arquivada e deixará de aparecer nas análises ativas. O histórico não será destruído. Continuar?"))return;const p=await getOne("purchases",id);await putPurchase({...p,active:false,archivedAt:todayISO(),updatedAt:todayISO()});await audit("Compra arquivada; histórico preservado.","purchase",id,"archive");await renderAll();toast("Compra arquivada; histórico preservado.")};
function round2(n){return Math.round((n+Number.EPSILON)*100)/100}

async function renderLists(){
  const d=await data();
  const lists=d.lists.filter(l=>l.active!==false).sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  const purchases=d.purchases.filter(p=>p.active!==false&&p.source==="manual-list");
  $("#listsArea").innerHTML=lists.map(l=>{
    const trips=purchases.filter(p=>p.listId===l.id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const last=trips[0];
    const avg=trips.length?trips.reduce((s,p)=>s+num(p.total),0)/trips.length:0;
    return `<div class="stack-card list-card">
      <div class="purchase-top"><div><h3 style="margin:0">${esc(l.name)}</h3>
      <div class="muted">${new Date(l.createdAt).toLocaleDateString("pt-BR")} · ${l.items?.length||0} itens de costume</div></div>
      <div class="purchase-actions"><button class="primary" onclick="openList('${l.id}')">Abrir lista</button><button class="ghost" onclick="archiveList('${l.id}')">Arquivar</button></div></div>
      <div class="list-summary"><span><b>${trips.length}</b> ida(s) registrada(s)</span><span>${last?`Última: ${fmtDate(last.date)} · ${last.marketName} · <b>${money(last.total)}</b>`:"Ainda não há gasto registrado"}</span>${trips.length?`<span>Média por ida: <b>${money(avg)}</b></span>`:""}</div>
      <div class="list-chips">${(l.items||[]).slice(0,10).map(it=>`<span class="badge ${it.checked?"good":""}">${esc(it.name)} · ${fmtQty(it.qty||1)}</span>`).join("")}${(l.items||[]).length>10?`<span class="badge">+ ${(l.items||[]).length-10}</span>`:""}</div>
    </div>`
  }).join("")||"<div class='panel'><b>Você ainda não criou uma lista.</b><p class='muted'>Comece importando sua planilha de itens de costume ou cadastre os itens manualmente.</p></div>";
}
$("#newListBtn").onclick=()=>newListModal();

function productPickerRows(selected=[]){
 const ids=new Set(selected);
 return [...(CURRENT_DATA.products||[])].filter(p=>p.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(p=>`<label class="check list-picker-row"><input type="checkbox" class="list-prod" value="${esc(p.id)}" ${ids.has(p.id)?"checked":""}> <span><b>${esc(p.name)}</b><small>${esc([p.brand,p.pack,p.unit].filter(Boolean).join(" · "))}</small></span></label>`).join("");
}
function newListModal(prefill={name:"Compra do mês",ids:[]}){
 const body=`<div class="quick-import-note"><b>Lista de rotina</b><span>Escolha os itens que você costuma comprar. A lista vira seu modelo e pode ser usada várias vezes.</span></div>
 <div class="form-grid"><label>Nome da lista<input id="listName" value="${esc(prefill.name)}"></label></div>
 <div class="panel compact-panel"><div class="panel-head"><h3>Itens de costume</h3><button class="ghost" id="registerFromListBtn" type="button">+ Cadastrar item</button></div>
 <div class="list-picker" id="listPicker">${productPickerRows(prefill.ids)}</div></div>
 <div class="button-row" style="margin-top:12px"><button class="primary" id="createList">Criar lista</button><button class="ghost" onclick="closeModal()">Cancelar</button></div>`;
 openModal("Nova lista",body);
 $("#registerFromListBtn").onclick=()=>registerProductModal(async()=>{await data();$("#listPicker").innerHTML=productPickerRows(prefill.ids);});
 $("#createList").onclick=async()=>{
   const ids=$$(".list-prod:checked").map(x=>x.value),items=ids.map(id=>{const p=CURRENT_DATA.products.find(x=>x.id===id);return {productId:id,name:p.name,qty:1,checked:false}});
   if(!items.length)return toast("Selecione pelo menos um produto.");
   const l={id:uid("list"),name:$("#listName").value.trim()||"Nova lista",createdAt:todayISO(),active:true,items};
   await put("lists",l);await audit("Nova lista de rotina criada.","list",l.id,"create");closeModal();await renderLists();toast("Lista criada. Ela está pronta para a próxima ida ao mercado.");
 };
}

function marketOptions(selected=""){
 return (CURRENT_DATA.markets||[]).filter(m=>m.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(m=>`<option value="${esc(m.id)}" ${m.id===selected?"selected":""}>${esc(m.name)}</option>`).join("");
}
window.openList=async id=>{
 const d=await data(),l=d.lists.find(x=>x.id===id);
 if(!l)return toast("Lista não encontrada.");
 const trips=d.purchases.filter(p=>p.active!==false&&p.source==="manual-list"&&p.listId===id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const body=`<div class="list-open-head"><div><b>${esc(l.name)}</b><small>${(l.items||[]).length} itens de rotina</small></div><button class="ghost" id="editListNameBtn" type="button">Renomear</button></div>
 <div class="panel compact-panel"><div class="panel-head"><h3>Lista da ida ao mercado</h3><span class="badge">offline</span></div>
 <div class="list-edit-grid">${(l.items||[]).map((it,idx)=>`<label class="check list-item-edit"><input type="checkbox" ${it.checked?"checked":""} data-listidx="${idx}"><span><b>${esc(it.name)}</b><small><input class="inline-number" data-qtyidx="${idx}" value="${esc(it.qty||1)}" inputmode="decimal"> ${esc(d.products.find(p=>p.id===it.productId)?.unit||"un")}</small></span></label>`).join("")}</div></div>
 <div class="purchase-quick-box"><h3>Quando voltar do mercado</h3><div class="form-grid"><label>Mercado<select id="listPurchaseMarket"><option value="">Selecione</option>${marketOptions(l.lastMarketId||"")}</select></label><label>Gasto total (R$)<input id="listPurchaseTotal" inputmode="decimal" placeholder="0,00"></label><label>Data<input id="listPurchaseDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div><div class="helper">Aqui você registra apenas o total gasto nesta ida. O JuRe não inventa preço por item. Os preços individuais continuam disponíveis quando houver comprovante ou lançamento detalhado.</div><button class="primary wide" id="registerListPurchase">Registrar ida ao mercado</button></div>
 ${trips.length?`<div class="compact-history"><h3>Últimas idas com esta lista</h3>${trips.slice(0,5).map(p=>`<div class="recent-row"><div><b>${esc(p.marketName)}</b><div class="muted">${fmtDate(p.date)} · ${p.itemCount||0} itens marcados</div></div><b>${money(p.total)}</b></div>`).join("")}</div>`:""}
 <div class="button-row" style="margin-top:14px"><button class="primary" id="saveList">Salvar lista</button><button class="ghost" id="closeList">Fechar</button></div>`;
 openModal(l.name,body);
 $("#closeList").onclick=closeModal;
 $("#editListNameBtn").onclick=()=>{const n=prompt("Nome da lista",l.name);if(n&&n.trim()){$("#modalTitle").textContent=n.trim();l.name=n.trim()}};
 $("#saveList").onclick=async()=>{
   const items=[...(l.items||[])];items.forEach((it,i)=>{const c=$(`[data-listidx="${i}"]`),q=$(`[data-qtyidx="${i}"]`);it.checked=!!c?.checked;it.qty=Math.max(.001,num(q?.value)||1)});
   await put("lists",{...l,items,lastMarketId:$("#listPurchaseMarket")?.value||l.lastMarketId||"",updatedAt:todayISO()});await audit("Lista de rotina atualizada.","list",id);closeModal();await renderAll();toast("Lista salva.");
 };
 $("#registerListPurchase").onclick=async()=>{
   const marketId=$("#listPurchaseMarket").value,total=num($("#listPurchaseTotal").value),date=$("#listPurchaseDate").value;
   if(!marketId)return toast("Selecione o mercado onde a compra foi feita.");
   if(total<=0)return toast("Informe o total gasto nessa ida ao mercado.");
   if(!date)return toast("Informe a data da compra.");
   const market=d.markets.find(m=>m.id===marketId);
   const items=[...(l.items||[])];items.forEach((it,i)=>{const c=$(`[data-listidx="${i}"]`),q=$(`[data-qtyidx="${i}"]`);it.checked=!!c?.checked;it.qty=Math.max(.001,num(q?.value)||1)});
   const checkedCount=items.filter(x=>x.checked).length;
   const p={id:uid("purchase"),date,time:"",marketId:market.id,marketName:market.name,cnpj:market.cnpj||"",total,itemCount:checkedCount||items.length,discountTotal:0,paymentMethod:"",documentNumber:"",nfceKey:"",receiptReference:"",receiptName:"",source:"manual-list",purchaseType:"list-total",listId:l.id,listName:l.name,listSnapshot:items.map(x=>({productId:x.productId,name:x.name,qty:x.qty,checked:x.checked})),status:"confirmed-manual-total",auditStatus:"PASS",auditAt:todayISO(),createdAt:todayISO(),updatedAt:todayISO(),active:true,hasItemPrices:false};
   await put("purchases",p);const resetItems=items.map(x=>({...x,checked:false}));await put("lists",{...l,items:resetItems,lastMarketId:market.id,lastUsedAt:date,updatedAt:todayISO()});await audit(`Ida ao mercado registrada pela lista "${l.name}"; total informado manualmente.` ,"purchase",p.id,"create");
   closeModal();await renderAll();toast(`Compra registrada: ${money(total)} em ${market.name}.`);
 };
};
window.archiveList=async id=>{const l=await getOne("lists",id);if(!l)return;if(!confirm("A lista será arquivada. O histórico das compras feitas com ela será preservado. Continuar?"))return;await put("lists",{...l,active:false,archivedAt:todayISO()});await audit("Lista arquivada; histórico das compras preservado.","list",id,"archive");await renderLists();toast("Lista arquivada; histórico preservado.")};

function registerProductModal(onSaved){
 const body=`<div class="form-grid"><label>Nome do item *<input id="npName" placeholder="Ex.: Arroz 5 kg"></label><label>Marca<input id="npBrand" placeholder="Opcional"></label><label>Categoria<select id="npCat">${CATEGORIES.map(x=>`<option>${x}</option>`).join("")}</select></label><label>Embalagem<input id="npPack" placeholder="Ex.: 5 kg"></label><label>Unidade<input id="npUnit" value="un"></label><label>Código/EAN<input id="npBarcode" inputmode="numeric"></label></div><div class="button-row" style="margin-top:13px"><button class="primary" id="saveNewProduct">Cadastrar item</button><button class="ghost" onclick="closeModal()">Cancelar</button></div>`;
 openModal("Cadastrar item de costume",body);
 $("#saveNewProduct").onclick=async()=>{const name=$("#npName").value.trim();if(!name)return toast("Informe o nome do item.");const d=await data();const duplicate=d.products.find(p=>p.active!==false&&(normalize(p.name)===normalize(name)||(String($("#npBarcode").value||"").replace(/\D/g,"")&&String(p.barcode||"")===String($("#npBarcode").value||"").replace(/\D/g,""))));if(duplicate)return toast(`Este item já está cadastrado: ${duplicate.name}.`);const prod={id:uid("prod"),barcode:String($("#npBarcode").value||"").replace(/\D/g,""),name,brand:$("#npBrand").value.trim(),category:$("#npCat").value,pack:$("#npPack").value.trim(),unit:$("#npUnit").value.trim()||"un",health:"Não classificado",active:true,createdAt:todayISO(),updatedAt:todayISO()};await put("products",prod);await audit("Item de costume cadastrado.","product",prod.id,"create");toast("Item cadastrado.");if(typeof onSaved==="function")await onSaved();closeModal();}
}

async function renderProducts(){
 const d=await data(),q=normalize($("#productSearch")?.value||""),cat=$("#productCategoryFilter")?.value||"",health=$("#healthFilter")?.value||"";
 const cats=[...new Set(d.products.map(p=>p.category).filter(Boolean))].sort();$("#productCategoryFilter").innerHTML=`<option value="">Todas as categorias</option>${cats.map(c=>`<option ${c===cat?"selected":""}>${c}</option>`).join("")}`;
 const rows=d.products.filter(p=>p.active!==false&&(!q||normalize(p.name+" "+p.brand+" "+p.pack).includes(q))&&(!cat||p.category===cat)&&(!health||p.health===health)).map(p=>{const its=d.purchaseItems.filter(i=>i.productId===p.id);const last=its.slice().sort((a,b)=>(b.purchaseDate||"").localeCompare(a.purchaseDate||"")).at(-1)||its.at(-1);return `<tr><td><b>${p.name}</b><br><small>${p.brand||"marca não informada"}</small></td><td>${p.category||"—"}<br><small>${p.health||"Não classificado"}</small></td><td>${p.pack||"—"} · ${p.unit||""}</td><td>${last?money(last.unitPrice):"—"}</td><td>${its.length}</td><td><div class="button-row compact"><button class="link" onclick="editProduct('${p.id}')">Editar</button><button class="link danger-link" onclick="deleteProduct('${p.id}')">Excluir</button></div></td></tr>`}).join("");
 $("#productsTable").innerHTML=rows||"<tr><td colspan='6'>Nenhum produto encontrado.</td></tr>";
}
$("#productSearch").oninput=()=>renderProducts();$("#productCategoryFilter").onchange=()=>renderProducts();$("#healthFilter").onchange=()=>renderProducts();
if($("#newProductBtn"))$("#newProductBtn").onclick=()=>registerProductModal(async()=>{await renderProducts();});
if($("#listTemplateBtn"))$("#listTemplateBtn").onclick=()=>window.downloadListTemplateXlsx();
if($("#listXlsxBtn")){
  $("#listXlsxBtn").onclick=()=>$("#listXlsxFile").click();
  $("#listXlsxFile").onchange=async e=>{const f=e.target.files?.[0];if(f)await window.importListXlsx(f);e.target.value=""};
}
if($("#importListXlsxFromImportBtn")) $("#importListXlsxFromImportBtn").onclick=()=>$("#listXlsxFile")?.click();
if($("#goListsFromImportBtn")) $("#goListsFromImportBtn").onclick=()=>go("listas");

window.editProduct=async id=>{const p=await getOne("products",id);openModal("Editar produto",`<div class="form-grid"><label>Nome<input id="epName" value="${p.name}"></label><label>Marca<input id="epBrand" value="${p.brand||""}"></label><label>Categoria<select id="epCat">${CATEGORIES.map(c=>`<option ${c===p.category?"selected":""}>${c}</option>`).join("")}</select></label><label>Embalagem<input id="epPack" value="${p.pack||""}"></label><label>Unidade<input id="epUnit" value="${p.unit||"un"}"></label><label>Perfil alimentar<select id="epHealth">${["Não classificado","Saudável","Moderado","Evitar"].map(x=>`<option ${x===p.health?"selected":""}>${x}</option>`).join("")}</select></label></div><div class="button-row" style="margin-top:13px"><button class="primary" id="saveEp">Salvar</button><button class="ghost" onclick="closeModal()">Cancelar</button></div>`);$("#saveEp").onclick=async()=>{await put("products",{...p,name:$("#epName").value.trim()||p.name,brand:$("#epBrand").value.trim(),category:$("#epCat").value,pack:$("#epPack").value.trim(),unit:$("#epUnit").value.trim()||"un",health:$("#epHealth").value,updatedAt:todayISO()});await audit("Produto corrigido.","product",id);closeModal();await renderProducts();toast("Produto atualizado.")}};

window.deleteProduct=async id=>{const p=await getOne("products",id);if(!p)return;const d=await data();const purchaseRefs=d.purchaseItems.filter(i=>i.productId===id).length;const listRefs=d.lists.filter(l=>(l.items||[]).some(i=>i.productId===id)).length;const refs=purchaseRefs+listRefs;const msg=refs?`“${p.name}” já está ligado a ${purchaseRefs} registro(s) de compra e ${listRefs} lista(s). Ele será removido do catálogo, mas o histórico será preservado. Continuar?`:`Excluir “${p.name}” do catálogo?`;if(!confirm(msg))return;await put("products",{...p,active:false,archivedAt:todayISO(),updatedAt:todayISO()});await audit(`Produto excluído do catálogo${refs?"; histórico preservado":""}.`,"product",id,"archive");await renderProducts();toast("Item removido do catálogo.")};

function registerMarketModal(onSaved){
 const body=`<div class="form-grid"><label>Nome do mercado *<input id="nmName" placeholder="Ex.: Supermercados Alvorada"></label><label>CNPJ<input id="nmCnpj" inputmode="numeric" placeholder="Opcional"></label><label>Cidade<input id="nmCity" placeholder="Opcional"></label><label>Estado<input id="nmState" maxlength="2" placeholder="RJ"></label><label>Endereço<input id="nmAddress" placeholder="Opcional"></label></div><div class="button-row" style="margin-top:13px"><button class="primary" id="saveNewMarket">Cadastrar mercado</button><button class="ghost" onclick="closeModal()">Cancelar</button></div>`;
 openModal("Cadastrar mercado",body);
 $("#saveNewMarket").onclick=async()=>{
   const name=$("#nmName").value.trim(); if(!name)return toast("Informe o nome do mercado.");
   const cnpj=canonicalCnpj($("#nmCnpj").value); const d=await data();
   const dup=d.markets.find(m=>(cnpj&&canonicalCnpj(m.cnpj)===cnpj)||normalize(m.name)===normalize(name));
   if(dup)return toast(`Este mercado já está cadastrado: ${dup.name}.`);
   const m={id:uid("market"),name,legalName:name,cnpj,address:$("#nmAddress").value.trim(),city:$("#nmCity").value.trim(),state:$("#nmState").value.trim().toUpperCase(),createdAt:todayISO(),active:true,source:"manual"};
   await put("markets",m); await audit("Mercado cadastrado manualmente.","market",m.id,"create"); closeModal(); if(typeof onSaved==="function")await onSaved(); toast("Mercado cadastrado.");
 };
}

async function renderMarkets(){
 const d=await data(),active=d.purchases.filter(p=>p.active!==false),stats=new Map();
 for(const m of d.markets.filter(x=>x.active!==false)) stats.set(m.id,{market:m,total:0,count:0,manual:0,receipt:0});
 for(const p of active){const row=stats.get(p.marketId)||{market:{id:p.marketId,name:p.marketName,cnpj:p.cnpj,city:p.city,state:p.state},total:0,count:0,manual:0,receipt:0};row.total+=num(p.total);row.count++;if(p.source==="manual-list")row.manual+=num(p.total);else row.receipt+=num(p.total);stats.set(p.marketId,row)}
 const rows=[...stats.values()].sort((a,b)=>b.total-a.total);
 $("#marketCards").innerHTML=rows.map(x=>{const m=x.market;return `<div class="market-card"><h3>${esc(m.name)}</h3><div class="muted">${esc(m.city||"")}${m.city&&m.state?" · "+esc(m.state):""}${m.cnpj?" · "+esc(m.cnpj):""}</div><strong>${money(x.total)}</strong><p class="muted">${x.count?`${x.count} compra(s)${x.manual?" · "+money(x.manual)+" em registros de lista":""}${x.receipt?" · "+money(x.receipt)+" em comprovantes":""}`:"Ainda sem compras registradas"}</p><div class="mini-metrics"><span>Total acumulado</span><b>${money(x.total)}</b></div></div>`}).join("")||"<div class='panel'>Nenhum mercado cadastrado. Cadastre o primeiro para usá-lo nas listas.</div>";
}
if($("#newMarketBtn")) $("#newMarketBtn").onclick=()=>registerMarketModal(async()=>await renderMarkets());
async function renderConsumption(){
 const d=await data(),sel=$("#consumptionProduct"),products=d.products.filter(p=>p.active!==false),current=sel.value;
 sel.innerHTML=products.map((p,i)=>`<option value="${p.id}">${p.name}</option>`).join("");if(current&&products.some(p=>p.id===current))sel.value=current;const p=products.find(x=>x.id===sel.value)||products[0];if(!p){$("#consumptionChart").innerHTML="";return}
 const its=d.purchaseItems.filter(i=>i.productId===p.id).map(i=>({...i,purchaseDate:d.purchases.find(x=>x.id===i.purchaseId)?.date||""})).sort((a,b)=>a.purchaseDate.localeCompare(b.purchaseDate));$("#consumptionTitle").textContent=p.name;$("#consumptionBadge").textContent=`${its.length} ocorrência(s)`;
 const max=Math.max(...its.map(i=>num(i.quantity)),1);$("#consumptionChart").innerHTML=its.map(i=>`<div class="bar" style="height:${Math.max(10,num(i.quantity)/max*260)}px"><span>${fmtQty(i.quantity)}</span></div>`).join("")||"<div class='muted'>Sem ocorrências.</div>";
 if(its.length<3){$("#consumptionText").textContent="Ainda há pouco histórico para chamar o comportamento de consumo de padrão. Continue registrando compras para que a comparação fique mais confiável."}else{const avg=its.reduce((s,i)=>s+num(i.quantity),0)/its.length;const last=num(its.at(-1).quantity);$("#consumptionText").textContent=`Sua média por compra registrada é ${fmtQty(avg)}. Na última ocorrência foram ${fmtQty(last)}. O sistema trata isso como ritmo de aquisição, não como consumo físico comprovado.`}
}
$("#consumptionProduct").onchange=()=>renderConsumption();

async function renderEconomy(){
 const d=await data(),active=d.purchases.filter(p=>p.active!==false),confirmed=active.reduce((s,p)=>s+num(p.discountTotal),0);let opp=0,above=0,excess=0,rows=[];
 for(const p of d.products.filter(x=>x.active!==false)){const its=d.purchaseItems.filter(i=>i.productId===p.id).sort((a,b)=>(a.purchaseDate||"").localeCompare(b.purchaseDate||""));if(its.length>=2){const avg=its.reduce((s,i)=>s+num(i.unitPrice),0)/its.length,last=num(its.at(-1).unitPrice);if(last>avg*1.1){const x=round2(last-avg);opp+=x;above++;rows.push(`<div class="stack-card"><b>🟠 ${p.name}</b><p class="muted">Último preço ${money(last)} contra média histórica ${money(avg)}. Oportunidade estimada: ${money(x)} por unidade.</p></div>`)}const qtyAvg=its.reduce((s,i)=>s+num(i.quantity),0)/its.length;if(num(its.at(-1).quantity)>qtyAvg*1.5)excess++}}
 $("#ecoConfirmed").textContent=money(confirmed);$("#ecoOpportunity").textContent=money(opp);$("#ecoAbove").textContent=above;$("#ecoExcess").textContent=excess;$("#economyList").innerHTML=rows.join("")||"<div class='stack-card'><b>Sem alerta suficiente ainda.</b><p class='muted'>O aplicativo evita afirmar que existe “perda” sem histórico e evidência.</p></div>"
}

async function renderReport(){
 const d=await data(),active=d.purchases.filter(p=>p.active!==false),total=active.reduce((s,p)=>s+num(p.total),0),items=d.purchaseItems.filter(i=>active.some(p=>p.id===i.purchaseId)),manual=active.filter(p=>p.source==="manual-list"),receipts=active.filter(p=>p.source!=="manual-list"),categories={};for(const i of items){const p=d.products.find(x=>x.id===i.productId);categories[p?.category||"Outros"]=(categories[p?.category||"Outros"]||0)+num(i.totalAfterDiscount??i.lineTotal)}
 const marketRows={};for(const p of active){marketRows[p.marketName]??={total:0,count:0};marketRows[p.marketName].total+=num(p.total);marketRows[p.marketName].count++}
 const listRows={};for(const p of manual){listRows[p.listName||"Lista"]??={total:0,count:0};listRows[p.listName||"Lista"].total+=num(p.total);listRows[p.listName||"Lista"].count++}
 const avgManual=manual.length?manual.reduce((s,p)=>s+num(p.total),0)/manual.length:0;
 $("#reportContent").innerHTML=`<h2>Compras da JuRe</h2><p>Relatório gerado em ${new Date().toLocaleString("pt-BR")}. O relatório funciona sem internet e pode ser impresso ou salvo em PDF pelo navegador.</p><div class="report-grid"><div class="card"><span>Total registrado</span><strong>${money(total)}</strong></div><div class="card"><span>Idas registradas</span><strong>${active.length}</strong></div><div class="card"><span>Registros por lista</span><strong>${manual.length}</strong></div><div class="card"><span>Média por ida de lista</span><strong>${money(avgManual)}</strong></div></div><h3>Gasto por mercado</h3><div class="report-table"><table><thead><tr><th>Mercado</th><th>Idas</th><th>Total</th><th>Média/ida</th></tr></thead><tbody>${Object.entries(marketRows).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.count}</td><td>${money(v.total)}</td><td>${money(v.total/v.count)}</td></tr>`).join("")||`<tr><td colspan="4">Sem compras registradas.</td></tr>`}</tbody></table></div><h3>Listas de rotina</h3><div class="report-table"><table><thead><tr><th>Lista</th><th>Idas</th><th>Total</th><th>Média/ida</th></tr></thead><tbody>${Object.entries(listRows).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.count}</td><td>${money(v.total)}</td><td>${money(v.total/v.count)}</td></tr>`).join("")||`<tr><td colspan="4">Ainda não há registros de gasto por lista.</td></tr>`}</tbody></table></div><h3>Por categoria (somente compras com preços por item)</h3><ul>${Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<li>${esc(k)}: ${money(v)}</li>`).join("")||`<li>Sem preços individuais suficientes.</li>`}</ul><h3>Base do relatório</h3><p>${manual.length} registro(s) vieram de listas com apenas o total informado e ${receipts.length} compra(s) têm origem em comprovante. O JuRe não inventa preços individuais para registros de lista.</p>`
}
$("#printBtn").onclick=()=>{go("relatorios");setTimeout(()=>window.print(),150)};
async function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
async function exportBackup(){const d=await data();const attachments=await getAll("attachments");const packed=[];for(const a of attachments){packed.push({id:a.id,purchaseId:a.purchaseId,name:a.name,type:a.type,size:a.size,createdAt:a.createdAt,dataUrl:await blobToDataURL(a.blob)})}const meta=await getOne("meta","meta"); const payload={format:"compras-da-jure-backup",version:APP_VERSION,exportedAt:todayISO(),data:{...d,meta},attachments:packed};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`compras-da-jure-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);await audit("Backup JSON completo exportado.","backup","backup","export");toast("Backup completo exportado.")}
$("#exportJsonBtn").onclick=exportBackup;$("#backupBtn").onclick=exportBackup;

function setListStatus(state,title,text){const box=$("#listImportStatus");if(!box)return;box.dataset.state=state||"idle";$("#listImportStatusTitle").textContent=title||"";$("#listImportStatusText").textContent=text||"";}

async function resetUserData(){
  const ok=confirm("COMEÇAR DO ZERO\n\nIsto apagará deste dispositivo todas as compras, itens de compras, produtos, mercados, listas, anexos e registros de auditoria.\n\nAs configurações do aplicativo, como o modelo Gemini, serão preservadas. Esta ação não pode ser desfeita sem um backup.\n\nDeseja realmente apagar os dados?");
  if(!ok)return;
  const ok2=confirm("Última confirmação: todos os dados de compras do JuRe serão removidos. Continuar?");
  if(!ok2)return;
  try{
    for(const store of ["markets","products","purchases","purchaseItems","lists","attachments","audit"]){
      await new Promise((resolve,reject)=>{const t=db.transaction(store,"readwrite"),st=t.objectStore(store),r=st.clear();r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
    }
    const s=(await getOne("settings","settings"))||{id:"settings",geminiModel:"gemini-3.7-flash",healthEnabled:true};
    await put("meta",{id:"meta",schemaVersion:4,appVersion:APP_VERSION,resetAt:todayISO(),freshStart:true});
    await put("settings",{id:"settings",...s});
    await renderAll();
    go("dashboard");
    toast("JuRe limpo. Você pode começar do zero.");
  }catch(e){
    console.error(e);
    toast(`Não foi possível apagar os dados: ${e.message||"erro desconhecido"}`);
  }
}
window.resetUserData=resetUserData;


// XLSX offline: leitor/escritor mínimo OOXML sem CDN. Funciona sem internet em navegadores Chromium/Edge modernos.
function crc32(bytes){let c=~0;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0)}return (~c)>>>0}
function u16(v){return new Uint8Array([v&255,(v>>>8)&255])}
function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])}
function concatBytes(arrs){const n=arrs.reduce((s,a)=>s+a.length,0),o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length}return o}
function zipStore(entries){const parts=[],central=[];let offset=0;const enc=new TextEncoder();for(const e of entries){const name=enc.encode(e.name),data=e.data instanceof Uint8Array?e.data:enc.encode(e.data),head=concatBytes([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc32(data)),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);parts.push(head);central.push({name,data,offset});offset+=head.length}
 const cd=[];for(const c of central){const name=enc.encode(c.name),data=c.data;cd.push(concatBytes([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc32(data)),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(c.offset),name]))}const cdBytes=concatBytes(cd),body=concatBytes(parts);const eocd=concatBytes([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cdBytes.length),u32(body.length),u16(0)]);return new Blob([body,cdBytes,eocd],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
function xmlEscape(v){return esc(String(v??"")).replace(/'/g,"&apos;")}
function colName(n){let s="";n++;while(n){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function makeListXlsx(){const rows=[['Nome do item','Marca','Categoria','Embalagem','Unidade','Quantidade','Mercado preferido','Código/EAN'],['Arroz 5 kg','','Mercearia','5 kg','un',1,'',''],['Leite integral 1 L','','Laticínios','1 L','un',2,'',''],['Papel higiênico c/12','', 'Higiene','12 rolos','un',1,'','']];const sheet=rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{const ref=`${colName(ci)}${ri+1}`;if(typeof v==='number')return `<c r="${ref}"><v>${v}</v></c>`;return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`}).join('')}</row>`).join('');const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`;const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lista" sheetId="1" r:id="rId1"/></sheets></workbook>`;const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;const rootrels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;return zipStore([['[Content_Types].xml',types],['_rels/.rels',rootrels],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',rels],['xl/worksheets/sheet1.xml',sheetXml]])}
function dlBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
window.downloadListTemplateXlsx=()=>{dlBlob(makeListXlsx(),'modelo-lista-compras-jure.xlsx');toast('Modelo XLSX baixado.');}
async function readZipEntries(file){const bytes=new Uint8Array(await file.arrayBuffer()),dv=new DataView(bytes.buffer),dec=new TextDecoder(),sig=0x06054b50;let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--){if(dv.getUint32(i,true)===sig){eocd=i;break}}if(eocd<0)throw new Error('Arquivo XLSX inválido: final ZIP não encontrado.');const cdSize=dv.getUint32(eocd+12,true),cdOff=dv.getUint32(eocd+16,true);const out={};let p=cdOff;while(p<cdOff+cdSize){if(dv.getUint32(p,true)!==0x02014b50)break;const method=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nlen=dv.getUint16(p+28,true),elen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);const name=dec.decode(bytes.slice(p+46,p+46+nlen));const lp=lo,ln=dv.getUint16(lp+26,true),le=dv.getUint16(lp+28,true),start=lp+30+ln+le,raw=bytes.slice(start,start+cs);let data=raw;if(method===8){if(typeof DecompressionStream==='undefined')throw new Error('Este navegador não oferece descompressão ZIP offline. Use Chrome/Edge atualizados.');const ds=new DecompressionStream('deflate-raw');data=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer())}else if(method!==0)throw new Error(`Compressão ZIP não suportada: ${method}`);out[name]=data;p+=46+nlen+elen+clen}return out}
function xmlText(s){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'")}
async function parseXlsxList(file){const entries=await readZipEntries(file),dec=new TextDecoder();const wbxml=dec.decode(entries['xl/workbook.xml']||new Uint8Array());const relxml=dec.decode(entries['xl/_rels/workbook.xml.rels']||new Uint8Array());if(!wbxml||!relxml)throw new Error('XLSX sem estrutura de planilha reconhecível.');const sheetNames=[...wbxml.matchAll(/<(?:[A-Za-z0-9_]+:)?sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*>/g)];let rid=sheetNames.find(m=>normalize(m[1])==='lista')?.[2]||sheetNames[0]?.[2];if(!rid)throw new Error('Nenhuma aba encontrada no XLSX.');const relTag=[...relxml.matchAll(/<Relationship\b([^>]*)\/>/g)].map(m=>m[1]).find(a=>new RegExp('(?:^|\\s)Id=\"'+rid+'\"').test(a));const rel=relTag?relTag.match(/(?:^|\s)Target=\"([^\"]+)\"/):null;if(!rel)throw new Error('Relação da aba não encontrada.');let target=rel[1].replace(/^\//,'');if(!target.startsWith('xl/'))target='xl/'+target;const sheet=dec.decode(entries[target]||new Uint8Array());if(!sheet)throw new Error('Aba da lista não encontrada.');const sheetNormalized=sheet.replace(/<(?:[A-Za-z0-9_]+:)?c\b([^>]*)\/>/g,'<$1></c>');const shared=entries['xl/sharedStrings.xml']?dec.decode(entries['xl/sharedStrings.xml']):'';const sharedVals=shared?[...shared.matchAll(/<(?:[A-Za-z0-9_]+:)?si>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?si>/g)].map(m=>[...m[1].matchAll(/<(?:[A-Za-z0-9_]+:)?t[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>/g)].map(x=>xmlText(x[1])).join('')):[];const rows=[];for(const rm of sheetNormalized.matchAll(/<(?:[A-Za-z0-9_]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?row>/g)){const cells=[];for(const cm of rm[1].matchAll(/<(?:[A-Za-z0-9_]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?c>/g)){const attrs=cm[1],body=cm[2],ref=(attrs.match(/\br="([A-Z]+\d+)"/)||[])[1]||'',t=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'',vm=body.match(/<(?:[A-Za-z0-9_]+:)?v>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/),im=body.match(/<(?:[A-Za-z0-9_]+:)?t[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>/),val=t==='inlineStr'?(im?xmlText(im[1]):''):t==='s'?(sharedVals[Number(vm?.[1]||0)]||''):t==='b'?(vm?.[1]==='1'):vm?.[1]??'';cells.push({ref,val})}rows.push(cells)}const matrix=rows.map(r=>{const arr=[];for(const c of r){const m=c.ref.match(/^([A-Z]+)/);let col=0;for(const ch of m?.[1]||'A'){col=col*26+(ch.charCodeAt(0)-64)}arr[col-1]=c.val}return arr});return matrix.filter(r=>r.some(v=>String(v??'').trim()!=='') )}
function xlsxHeaderMap(headers){const map={};headers.forEach((h,i)=>{const k=normalize(h);if(/^(nome|item|produto|descricao|descri[cç][aã]o)$/.test(k))map.name=i;else if(/^(marca|brand)$/.test(k))map.brand=i;else if(/^(categoria|category)$/.test(k))map.category=i;else if(/^(embalagem|pack|apresentacao)$/.test(k))map.pack=i;else if(/^(unidade|unit)$/.test(k))map.unit=i;else if(/^(quantidade|qtd|qtde|qty)$/.test(k))map.qty=i;else if(/^(mercado|mercado preferido|market)$/.test(k))map.market=i;else if(/^(codigo|ean|c[oó]digo ean)$/.test(k))map.barcode=i});return map}
async function importListXlsx(file){setListStatus('working','Lendo planilha',`Abrindo ${file.name} e convertendo a aba Lista offline…`);const matrix=await parseXlsxList(file);if(matrix.length<2)throw new Error('A planilha não possui linhas de itens.');const map=xlsxHeaderMap(matrix[0]);if(map.name===undefined)throw new Error('A coluna Nome do item / Produto não foi encontrada.');const d=await data();const imported=[],newProducts=[];for(let r=1;r<matrix.length;r++){const row=matrix[r],name=String(row[map.name]??'').trim();if(!name)continue;const barcode=String(map.barcode!=null?row[map.barcode]??'':'').replace(/\D/g,'');let p=d.products.find(x=>x.active!==false&&((barcode&&String(x.barcode||'')===barcode)||normalize(x.name)===normalize(name)));if(!p){p={id:uid('prod'),barcode,name,brand:String(map.brand!=null?row[map.brand]??'':'' ).trim(),category:String(map.category!=null?row[map.category]??'Outros':'Outros').trim()||'Outros',pack:String(map.pack!=null?row[map.pack]??'':'').trim(),unit:String(map.unit!=null?row[map.unit]??'un':'un').trim()||'un',health:'Não classificado',active:true,createdAt:todayISO(),updatedAt:todayISO()};d.products.push(p);newProducts.push(p)}else{if(!p.brand&&map.brand!=null)p.brand=String(row[map.brand]??'').trim();if(!p.category&&map.category!=null)p.category=String(row[map.category]??'').trim();if(!p.pack&&map.pack!=null)p.pack=String(row[map.pack]??'').trim();if(!p.unit&&map.unit!=null)p.unit=String(row[map.unit]??'').trim()||'un'}const qty=Math.max(.001,num(map.qty!=null?row[map.qty]:1)||1);imported.push({productId:p.id,name:p.name,qty,checked:false,preferredMarketName:String(map.market!=null?row[map.market]??'':'').trim()})}if(!imported.length)throw new Error('Nenhum item válido foi encontrado na planilha.');await bulkPut('products',d.products);let name=`Lista importada · ${file.name.replace(/\.xlsx?$/i,'')}`;const l={id:uid('list'),name,createdAt:todayISO(),active:true,source:'xlsx',items:imported};await put('lists',l);await audit(`Lista criada a partir de XLSX com ${imported.length} itens (${newProducts.length} produtos novos).`,'list',l.id,'import');await renderAll();setListStatus('success','Planilha importada',`${imported.length} itens entraram em uma nova lista. ${newProducts.length} produto(s) foram cadastrados no catálogo.`);toast(`Lista criada com ${imported.length} itens.`);go('listas')}
window.importListXlsx=async file=>{try{await importListXlsx(file)}catch(e){console.error(e);setListStatus('error','Não foi possível importar a planilha',String(e.message||e));toast('Falha ao importar XLSX. Confira o modelo e as colunas.')}}

async function renderManual(){const manual=`<h2>Manual do usuário</h2><p><b>Objetivo:</b> começar pela rotina de listas de compras: cadastrar itens de costume, montar listas, registrar cada ida ao mercado pelo valor total e acompanhar os gastos por mercado. A leitura de comprovantes fica como recurso complementar, não como fonte obrigatória.</p><h3>1. Importar uma compra</h3><p>Entre em <b>Importar comprovante</b>, selecione uma foto ou PDF, faça a leitura e revise os campos antes de salvar. A compra recebe a data do documento, não a data da correção.</p><h3>2. Produto repetido</h3><p>O produto não é duplicado quando aparece em outro comprovante. O sistema procura primeiro pelo código de barras e, quando necessário, cruza marca, descrição, embalagem, unidade e contexto.</p><h3>3. Quantidade e preço</h3><p>Quantidade comprada, preço unitário e total do item são campos distintos. Por exemplo, 6 leites a R$ 4,79 viram quantidade 6, preço unitário R$ 4,79 e total R$ 28,74.</p><h3>4. Correções</h3><p>Você pode editar mercado, total, itens, quantidade e preço. A <b>data da compra é protegida</b>. A auditoria registra a correção.</p><h3>5. Exclusão</h3><p>Excluir um item do catálogo significa arquivá-lo. Ele desaparece da lista ativa, mas referências em listas e compras anteriores são preservadas para não quebrar o histórico.</p><h3>6. Listas</h3><p>As listas usam produtos do catálogo. Você pode importar um XLSX com seus itens de costume ou cadastrar cada item. Selecionar um produto não cria outra cópia no catálogo; apenas cria uma linha de planejamento.</p><h3>7. Registrar o gasto da ida</h3><p>Ao voltar do mercado, abra a lista, marque o que foi comprado, escolha o mercado e informe somente o total gasto. O JuRe registra essa ida sem inventar preços individuais. Quando houver comprovante fiscal confiável, os preços por item podem alimentar as análises detalhadas.</p><h3>7. Consumo</h3><p>O app mede o ritmo de aquisição. Com histórico suficiente, sinaliza desvios de padrão. Isso não deve ser confundido com consumo físico comprovado.</p><h3>8. Alimentação</h3><p>Cada produto pode receber o perfil <b>Saudável</b>, <b>Moderado</b>, <b>Evitar</b> ou <b>Não classificado</b>. Essa marcação é informativa e editável pelo usuário.</p><h3>9. Agente JuRe</h3><p>O agente pode consultar os dados e o manual. Sem Gemini, ele responde por regras locais. Com Gemini configurado, recebe um contexto controlado e pode explicar os dados em linguagem cotidiana.</p><h3>10. Backup e atualização</h3><p>Faça backup JSON antes de atualizar. O mecanismo usa versão de esquema e migração. Uma atualização da aplicação não deve apagar o banco local.</p>`;$("#manualContent").innerHTML=manual}
async function renderSettings(){const s=(await data()).settings;$("#geminiModel").value=s.geminiModel||"gemini-3.7-flash"}
$("#saveSettings").onclick=async()=>{const d=await data();await setSettings({...d.settings,geminiModel:$("#geminiModel").value});toast("Configurações salvas. A IA usa exclusivamente o servidor local seguro.")}
$("#resetUserDataBtn").onclick=resetUserData;
$('#consultFiscalBtn').onclick=consultFiscalKey; $('#openDanfeBtn').onclick=openDanfeOfficial; $('#sendFiscalXmlBtn').onclick=sendFiscalXml; $('#fiscalKey').addEventListener('input',()=>setFiscalKey($('#fiscalKey').value,'manual')); downloadFiscalArtifacts();
const restoreBackupBtn=$("#restoreBackupBtn"), restoreBackupFile=$("#restoreBackupFile");
if(restoreBackupBtn && restoreBackupFile){
  restoreBackupBtn.onclick=()=>restoreBackupFile.click();
  restoreBackupFile.onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  const payload=JSON.parse(await file.text());
  if(payload.format!=="compras-da-jure-backup")throw new Error("Formato de backup inválido.");
  if(!payload.data)throw new Error("Backup sem dados.");
  if(!confirm("Restaurar este backup substituirá os dados atuais. Faça um backup antes. Continuar?"))return;
  for(const s of ["settings","markets","products","purchases","purchaseItems","lists","attachments","audit"]){
    const rows=payload.data?.[s]||[];
    await new Promise((resolve,reject)=>{const t=db.transaction(s,"readwrite"),st=t.objectStore(s);const r=st.clear();r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
    if(s==="attachments"){
      for(const a of payload.attachments||[]){
        const comma=String(a.dataUrl||"").indexOf(",");
        if(comma<0)continue;
        const raw=atob(a.dataUrl.slice(comma+1)),bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        await put("attachments",{id:a.id,purchaseId:a.purchaseId,name:a.name,type:a.type||"application/octet-stream",size:a.size||bytes.length,createdAt:a.createdAt||todayISO(),blob:new Blob([bytes],{type:a.type||"application/octet-stream"})});
      }
    }else if(rows.length) await bulkPut(s,rows);
  }
  if(payload.data.meta) await put("meta",{...payload.data.meta,schemaVersion:4,appVersion:APP_VERSION});
  else await put("meta",{id:"meta",schemaVersion:4,appVersion:APP_VERSION,restoredAt:todayISO()});
  await audit("Backup restaurado e dados atuais substituídos.","backup","restore","import");
  await renderAll();toast("Backup restaurado. Os dados anteriores foram substituídos pelo conteúdo do arquivo.");
 }catch(err){console.error(err);toast(`Não foi possível restaurar o backup: ${err.message||"arquivo inválido"}`)}
 finally{e.target.value=""}
  };
}

async function renderUpdates(){const m=await getOne("meta","meta");$("#currentVersion").textContent=m?.appVersion||APP_VERSION}
$("#checkUpdate").onclick=async()=>{try{const r=await fetch("updates/manifest.json",{cache:"no-store"});const u=await r.json();const cur=(await getOne("meta","meta"))?.appVersion||APP_VERSION;$("#updateStatus").innerHTML=u.version===cur?`Você já está na versão ${cur}.`:`Existe a versão ${u.version}. Faça backup antes de substituir os arquivos do aplicativo.`}catch(e){$("#updateStatus").textContent="Não foi possível verificar o manifesto de atualização neste modo."}}

function openModal(title,body){$("#modalTitle").textContent=title;$("#modalBody").innerHTML=body;$("#modal").classList.remove("hidden")}
function closeModal(){$("#modal").classList.add("hidden");$("#modalBody").innerHTML=""}
$("#modalClose").onclick=closeModal;$("#modal").onclick=e=>{if(e.target===$("#modal"))closeModal()};

function setImportStatus(state,title,text,detail=""){
 const box=$("#importStatus"); if(!box)return;
 box.dataset.state=state||"idle"; $("#importStatusTitle").textContent=title||"";
 $("#importStatusText").textContent=text||"";
 const detailEl=$("#importStatusDetail");
 if(detailEl){
   detailEl.textContent=detail||"";
   detailEl.classList.toggle("hidden",!detail);
 }
}
function importErrorMessage(err){
 const s=String(err?.message||err||"Falha desconhecida");
 if(/Failed to fetch|NetworkError|Load failed/i.test(s)) return "Não foi possível carregar o mecanismo de leitura. Verifique a internet e tente novamente.";
 if(/OCR indisponível|OCR não carregou|Falha ao carregar OCR/i.test(s)) return "O OCR não ficou disponível. Isso normalmente acontece quando a biblioteca não consegue ser carregada.";
 if(/PDF/i.test(s)) return "Este arquivo é PDF. Nesta versão, a leitura automática de PDF depende do Gemini.";
 if(/Gemini 4\d\d/i.test(s)) return "O Gemini recusou a solicitação. Verifique a configuração da API.";
 if(/Gemini 5\d\d/i.test(s)) return "O serviço Gemini apresentou erro temporário. Tente novamente.";
 if(/Gemini/i.test(s)) return s;
 return `A leitura automática falhou: ${s}`;
}
function stopImportClock(){
 if(importClock){clearInterval(importClock);importClock=null;}
}
function startImportClock(){
 stopImportClock();
 importStartedAt=Date.now();
 const tick=()=>{const e=$("#importElapsed");if(e)e.textContent=`Tempo decorrido: ${((Date.now()-importStartedAt)/1000).toFixed(1)} s`;};
 tick(); importClock=setInterval(tick,250);
}
function clearReceiptPreview(){
 if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
 const box=$("#receiptPreview"); if(!box)return;
 box.classList.add("hidden"); box.innerHTML="";
}
async function previewReceiptFile(file){
 const box=$("#receiptPreview"); if(!box)return;
 clearReceiptPreview();
 previewUrl=URL.createObjectURL(file);
 box.classList.remove("hidden");
 if(/^image\//i.test(file.type)||/\.(jpe?g|png|webp|gif)$/i.test(file.name)){
   const img=document.createElement("img"); img.alt="Pré-visualização do comprovante"; img.src=previewUrl;
   box.appendChild(img);
   await new Promise((resolve)=>{img.onload=resolve;img.onerror=resolve});
   const w=img.naturalWidth||0,h=img.naturalHeight||0;
   if(w&&h) $("#fileMeta").textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB · ${w}×${h}px`;
 }else if(/pdf/i.test(file.type)||/\.pdf$/i.test(file.name)){
   const frame=document.createElement("iframe"); frame.title="Visualização do comprovante em PDF"; frame.src=previewUrl; frame.setAttribute("loading","eager");
   box.appendChild(frame);
 }
}
async function handleSelectedFile(file,{autoRead=true}={}){
 if(!file)return;
 importRun++; const run=importRun; pendingImport=null; selectedFile=file;
 $("#saveImportRow").classList.add("hidden");
 $("#receiptConfidence").textContent="aguardando"; $("#receiptConfidence").className="badge";
 $("#ocrBtn").disabled=false; $("#geminiReceiptBtn").disabled=false;
 $("#receiptEditor").className="editor empty"; $("#receiptEditor").textContent="Os campos identificados aparecerão aqui.";
 $("#fileMeta").classList.remove("hidden");
 $("#fileMeta").textContent=`Abrindo ${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
 setImportStatus("working","Arquivo recebido","Validando o arquivo e preparando a visualização…");
 startImportClock();
 try{
   const isPdf=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name);
   if(!/^image\//i.test(file.type) && !isPdf) throw new Error("Formato não suportado. Use JPG, JPEG, PNG ou PDF.");
   await previewReceiptFile(file);
   if(run!==importRun)return;
   setImportStatus("ready","Comprovante aberto","Arquivo carregado e visualizado. A leitura ainda não começou.");
   if(autoRead){
     if(isPdf){
       if(location.hostname==='localhost') await processReceipt("gemini",run);
       else setImportStatus("ready","PDF pronto para leitura","O PDF foi aberto. Para leitura visual, inicie o servidor local seguro e use o motor completo.");
     }else{
       await processReceipt("ocr",run);
     }
   }
 }catch(e){
   console.error("Receipt file selection failed:",e);
   stopImportClock();
   setImportStatus("error","Não foi possível abrir o comprovante",importErrorMessage(e),`Detalhe técnico: ${String(e?.message||e)}`);
 }
}

let qrCameraStream=null,qrCameraTimer=null,qrCameraBusy=false,qrCameraDetector=null;
function closeQrScanner(){
 if(qrCameraTimer){clearInterval(qrCameraTimer);qrCameraTimer=null;}
 qrCameraBusy=false;
 if(qrCameraStream){qrCameraStream.getTracks().forEach(t=>t.stop());qrCameraStream=null;}
 const v=$('#qrVideo');if(v){v.pause();v.srcObject=null;}
 const modal=$('#qrScannerModal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
}
function setQrStatus(text,kind=''){const el=$('#qrScannerStatus');if(el){el.textContent=text;el.className=`qr-status ${kind}`}}
function qrKeyAndModel(raw){
 const parsed=window.ReceiptEngine?.parseQr?.(raw)||{key:'',url:String(raw||'')};
 let key=normalizeFiscalKey(parsed.key||'');
 if(!key){const m=String(raw||'').match(/\b\d{44}\b/);if(m)key=m[0]}
 const model=key.length===44?key.slice(20,22):'';
 return {raw:String(raw||''),url:parsed.url||String(raw||''),key,model};
}
async function finishQrScan(raw){
 if(qrCameraBusy)return;qrCameraBusy=true;
 const found=qrKeyAndModel(raw);
 if(!found.key){qrCameraBusy=false;setQrStatus('QR lido, mas não encontramos uma chave fiscal válida. Tente enquadrar o QR inteiro.','warn');return;}
 closeQrScanner();
 const source=found.model==='65'?'QR NFC-e':'QR fiscal';
 setFiscalKey(found.key,source);
 pendingImport=pendingImport||{};pendingImport.nfceKey=found.key;pendingImport.sefazUrl=found.url;pendingImport.fiscalKeySource='camera';
 if(found.model==='65'){
   setImportStatus('working','NFC-e identificada','Consultando o endereço fiscal contido no QR. O OCR não será usado como fonte principal.');
   try{
     const r=await fetch('/api/fiscal/nfce-qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:found.url,key:found.key})});
     const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok)throw new Error((j.code?`${j.code}: `:'')+(j.error||'Consulta pública NFC-e não concluída'));
     const data=j.data||{}; data.nfceKey=found.key; data.sefazUrl=j.publicUrl||found.url; data.documentType='nfce';
     const merged=await applyFiscalResult({data,upstream:j.upstream||{},route:'nfce-qr'},found.key,'QR NFC-e');
     merged.validation=validateReceiptData(merged);
     if(merged.items?.length&&merged.total>0){
       pendingImport={...merged,fiscalAutoLaunch:true};
       if(!selectedFile) selectedFile=new File([JSON.stringify({type:'nfce-qr',key:found.key,url:found.url})],`nfce-${found.key}.json`,{type:'application/json'});
       renderReceiptEditor(merged);$('#saveImportRow').classList.remove('hidden');
       setImportStatus('success','NFC-e carregada','Dados estruturados encontrados na consulta pública. Lançando a compra automaticamente no histórico.');
       setTimeout(()=>$('#saveImportBtn')?.click(),150);
       return;
     }
     setImportStatus('warn','NFC-e identificada','A SEFAZ foi localizada, mas não entregou dados estruturados suficientes para lançamento automático. A consulta oficial foi aberta.');
     window.open(j.publicUrl||found.url,'_blank','noopener');
   }catch(e){
     setImportStatus('warn','NFC-e identificada, consulta pendente',String(e.message||e));
     window.open(found.url,'_blank','noopener');
   }
 }else{
   $('#fiscalKey').value=found.key;
   await consultFiscalKey();
 }
 qrCameraBusy=false;
}
async function detectCameraFrame(video,canvas){
 if(!video.videoWidth||!video.videoHeight)return '';
 const max=1280,scale=Math.min(1,max/video.videoWidth),w=Math.max(64,Math.round(video.videoWidth*scale)),h=Math.max(64,Math.round(video.videoHeight*scale));
 canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,w,h);
 if('BarcodeDetector' in window){
   try{if(!qrCameraDetector)qrCameraDetector=new BarcodeDetector({formats:['qr_code']});const codes=await qrCameraDetector.detect(canvas);if(codes?.[0]?.rawValue)return codes[0].rawValue;}catch{}
 }
 try{const jsqr=await loadCameraJsQR();const d=ctx.getImageData(0,0,w,h);const hit=jsqr?.(d.data,w,h,{inversionAttempts:'attemptBoth'});return hit?.data||'';}catch{return ''}
}
async function openQrScanner(){
 const modal=$('#qrScannerModal');if(!modal)return;
 if(location.protocol==='file:'){toast('Abra o JuRe pelo servidor local para usar a câmera.');setImportStatus('warn','Câmera indisponível','O navegador não libera câmera para páginas file://. Execute ABRIR_JURE.bat.');return;}
 if(!window.isSecureContext&&location.hostname!=='localhost'){toast('A câmera exige HTTPS ou localhost.');return;}
 closeQrScanner();modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');setQrStatus('Solicitando acesso à câmera…');
 try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador não oferece acesso à câmera.');
   qrCameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
   const v=$('#qrVideo');v.srcObject=qrCameraStream;await v.play();setQrStatus('Aponte para o QR Code. A leitura é automática.');
   const c=$('#qrScanCanvas');qrCameraTimer=setInterval(async()=>{if(qrCameraBusy||!v.videoWidth)return;const raw=await detectCameraFrame(v,c);if(raw)await finishQrScan(raw)},300);
 }catch(e){setQrStatus(`Não foi possível abrir a câmera: ${e.message||e}`,'warn');}
}
async function loadCameraJsQR(){
 if(window.jsQR)return window.jsQR;
 return new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-jure-camera-jsqr]');if(existing){existing.addEventListener('load',()=>resolve(window.jsQR),{once:true});existing.addEventListener('error',()=>reject(new Error('Falha ao carregar jsQR')),{once:true});return;}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';s.crossOrigin='anonymous';s.dataset.jureCameraJsqr='1';s.onload=()=>window.jsQR?resolve(window.jsQR):reject(new Error('jsQR não carregou'));s.onerror=()=>reject(new Error('Falha ao carregar jsQR'));document.head.appendChild(s)})
}
function setupQrCamera(){
 $('#scanQrBtn')?.addEventListener('click',openQrScanner);
 $('#closeQrScannerBtn')?.addEventListener('click',closeQrScanner);
 $('#cancelQrScannerBtn')?.addEventListener('click',closeQrScanner);
 document.querySelector('[data-close-qr]')?.addEventListener('click',closeQrScanner);
 $('#qrCaptureFallbackBtn')?.addEventListener('click',()=>$('#qrPhotoInput')?.click());
 $('#qrPhotoInput')?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{setQrStatus('Lendo a foto do QR…');const jsqr=await loadCameraJsQR();const img=new Image(),url=URL.createObjectURL(file);img.onload=async()=>{try{const max=2200,scale=Math.min(1,max/img.naturalWidth),w=Math.max(64,Math.round(img.naturalWidth*scale)),h=Math.max(64,Math.round(img.naturalHeight*scale)),c=$('#qrScanCanvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const d=ctx.getImageData(0,0,w,h),hit=jsqr(d.data,w,h,{inversionAttempts:'attemptBoth'});if(hit?.data)await finishQrScan(hit.data);else setQrStatus('Não foi possível ler o QR nessa foto.','warn');}finally{URL.revokeObjectURL(url)}};img.src=url;}catch(err){setQrStatus(`Falha na leitura do QR: ${err.message||err}`,'warn')}finally{e.target.value=''}});
}

function setupImport(){
 $("#dropZone").onclick=()=>$("#receiptFile").click();
 $("#receiptFile").onchange=e=>handleSelectedFile(e.target.files[0]||null);
 $("#dropZone").ondragover=e=>{e.preventDefault();$("#dropZone").style.background="#f1efff"};
 $("#dropZone").ondragleave=()=>$("#dropZone").style.background="";
 $("#dropZone").ondrop=e=>{e.preventDefault();$("#dropZone").style.background="";handleSelectedFile(e.dataTransfer.files[0]||null)};
 $("#ocrBtn").onclick=()=>processReceipt("ocr",importRun);
 $("#geminiReceiptBtn").onclick=()=>processReceipt("gemini",importRun);
 setupQrCamera();
}
function showSelected(){return handleSelectedFile(selectedFile)}
function shouldEscalateReceiptOCR(d){
 const items=Array.isArray(d?.items)?d.items:[], total=Number(d?.total||0);
 if(!items.length||total<=0||!d?.market?.cnpj||!d?.date)return true;
 if(d?.itemCountDeclared && Number(d.itemCountDeclared)!==items.length)return true;
 if(items.some(i=>!i.name||num(i.total)<=0||num(i.unitPrice)<=0))return true;
 const lineSum=receiptLineSum(d),diff=Math.abs(lineSum-total);
 if(diff>0.05)return true;
 if((d?.ocrPasses||0)<3)return true;
 return Number(d?.confidence||0)<0.84 || Number(d?.evidenceCoverage||0)<0.82 || d?.needsReview===true;
}
async function processReceipt(mode,run=importRun){
 if(run!==importRun)return;
 if(!selectedFile){setImportStatus("warn","Nenhum comprovante selecionado","Selecione uma imagem ou PDF antes de iniciar.");return toast("Selecione um comprovante.")}
 const isPdf=/pdf/i.test(selectedFile.type)||/\.pdf$/i.test(selectedFile.name);
 if(mode==="ocr"&&isPdf){
   setImportStatus("warn","OCR não iniciado","O arquivo é PDF. O OCR local trabalha com imagens; use o Gemini para este tipo de documento.");
   stopImportClock(); return;
 }
 $("#ocrBtn").disabled=true;$("#geminiReceiptBtn").disabled=true;$("#saveImportRow").classList.add("hidden");
 $("#ocrBtn").textContent=mode==="ocr"?"Motor anti-falhas em andamento…":"Ler comprovante — motor anti-falhas";
 $("#geminiReceiptBtn").textContent=mode==="gemini"?"IA visual em andamento…":"IA visual complementar";
 startImportClock();
 setImportStatus("working","Etapa 1 de 4 — iniciando leitura",mode==="gemini"?"Preparando o envio do comprovante para análise visual.":"Validando o arquivo e inicializando o mecanismo OCR.");
 try{
   if(mode==="gemini"){
     setImportStatus("working","Etapa 2 de 4 — Gemini lendo","O comprovante está sendo enviado e analisado como documento visual. Ainda não há gravação de dados.");
     pendingImport=await geminiReadReceipt(selectedFile);
   }else{
     setImportStatus("working","Etapa 2 de 4 — carregando OCR","Inicializando o motor OCR em cascata (múltiplas pré-processagens, regiões e modos Tesseract).");
     pendingImport=await ocrReadReceipt(selectedFile);
     const cfg=(await data()).settings;
     const visionAvailable=(location.protocol!=='file:'&&location.hostname==='localhost');
     if(shouldEscalateReceiptOCR(pendingImport)&&visionAvailable){
       setImportStatus("working","OCR local parcial — segunda camada","A leitura local não atingiu o limiar de segurança. Acionando leitura visual complementar sem gravar nenhum dado.");
       try{
         const vision=await geminiReadReceipt(selectedFile);
         if(vision&&Array.isArray(vision.items)&&vision.items.length)pendingImport=reconcileVisionWithLocal(pendingImport,vision);
       }catch(fallbackError){
         pendingImport.fallbackWarning=`A leitura visual complementar não pôde ser executada: ${fallbackError.message||fallbackError}`;
         if(location.protocol!=='file:'&&location.hostname==='localhost'){
           try{
             const cloud=await ocrSpaceReadReceipt(selectedFile);
             if(cloud?.text){const cp=parseReceiptText(cloud.text);pendingImport=reconcileVisionWithLocal(pendingImport,{...cp,sourceEngine:"ocr-space",confidence:Math.max(.55,cp.confidence||0)});pendingImport.fallbackWarning="";}
           }catch(secondaryError){pendingImport.ocrSpaceError=secondaryError.message||String(secondaryError);}
         }
       }
     }
   }
   if(run!==importRun)return;
   setImportStatus("working","Etapa 3 de 4 — auditoria e cruzamento","Rastreando o comprovante, cruzando produtos com o catálogo e conciliando quantidade × preço × total antes da publicação.");
   if(!pendingImport?.items?.length) throw new Error("Nenhuma linha de item foi identificada com segurança.");
   pendingImport=await auditAndContextualizeReceipt(pendingImport);
   pendingImport.validation=validateReceiptData(pendingImport);
   renderReceiptEditor(pendingImport);
   $("#saveImportRow").classList.remove("hidden");
   $("#saveImportBtn").disabled=!pendingImport.validation.ok;
   const v=pendingImport.validation;
   if(v.ok){
     $("#receiptConfidence").textContent=`${Math.round(clamp(num(pendingImport.confidence)||.8)*100)}% confiança`;
     $("#receiptConfidence").className="badge good";
     setImportStatus("success","Etapa 4 de 4 — leitura concluída",`Foram identificados ${pendingImport.items.length} itens e a soma das linhas concilia com o total informado. Revise e salve.`);
   }else{
     $("#receiptConfidence").textContent="revisão necessária";
     $("#receiptConfidence").className="badge warn";
     setImportStatus("warn","Etapa 4 de 4 — Leitura parcial — revisão necessária",v.message,"A leitura terminou, mas o sistema não considera esses dados prontos para gravação sem sua conferência.");
   }
   stopImportClock();
 }catch(e){
   console.error("Receipt import failed:",e);
   pendingImport=null;
   $("#receiptEditor").className="editor empty";
   $("#receiptEditor").textContent="Nenhum dado confiável foi produzido.";
   $("#receiptConfidence").textContent="falhou";
   $("#receiptConfidence").className="badge warn";
   setImportStatus("error","Leitura não concluída",importErrorMessage(e),`Detalhe técnico: ${String(e?.message||e)}`);
   stopImportClock();
   toast("A leitura não foi concluída.");
 }finally{
   $("#ocrBtn").disabled=false;$("#geminiReceiptBtn").disabled=false;
   $("#ocrBtn").textContent="Ler comprovante — motor anti-falhas";$("#geminiReceiptBtn").textContent="IA visual complementar";
 }
}
async function loadTesseract(){
 if(window.Tesseract)return window.Tesseract;
 return new Promise((resolve,reject)=>{
   const script=document.createElement("script");
   script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
   script.crossOrigin="anonymous";
   const timer=setTimeout(()=>{script.remove();reject(new Error("OCR indisponível sem conexão"))},30000);
   script.onload=()=>{clearTimeout(timer);window.Tesseract?resolve(window.Tesseract):reject(new Error("OCR não carregou"))};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error("Falha ao carregar OCR"))};
   document.head.appendChild(script);
 });
}
function clamp01(x){return Math.max(0,Math.min(1,Number(x)||0))}
function canvasToBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Não foi possível preparar a imagem para OCR")),"image/png",1))}
function grayscaleAndEnhance(ctx,w,h,mode="adaptive"){
 const data=ctx.getImageData(0,0,w,h),d=data.data;
 let min=255,max=0;
 const gray=new Uint8Array(w*h);
 for(let i=0,p=0;i<d.length;i+=4,p++){
   const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
   gray[p]=g; if(g<min)min=g;if(g>max)max=g;
 }
 const span=Math.max(1,max-min);
 if(mode==="contrast"){
   for(let p=0,i=0;p<gray.length;p++,i+=4){let g=(gray[p]-min)*255/span; g=g<118?0:255; d[i]=d[i+1]=d[i+2]=g; d[i+3]=255;}
 }else if(mode==="soft"){
   for(let p=0,i=0;p<gray.length;p++,i+=4){let g=(gray[p]-min)*255/span; g=Math.max(0,Math.min(255,(g-128)*1.45+128)); d[i]=d[i+1]=d[i+2]=g; d[i+3]=255;}
 }else{
   // Local thresholding: receipt paper is rarely uniformly lit.
   const cell=36, cols=Math.ceil(w/cell), rows=Math.ceil(h/cell), sums=new Float64Array(cols*rows), counts=new Uint32Array(cols*rows);
   for(let y=0;y<h;y++){const cy=Math.floor(y/cell);for(let x=0;x<w;x++){const cx=Math.floor(x/cell),k=cy*cols+cx;sums[k]+=gray[y*w+x];counts[k]++;}}
   for(let k=0;k<sums.length;k++)sums[k]/=counts[k]||1;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=Math.floor(y/cell)*cols+Math.floor(x/cell);const local=sums[k];const g=gray[y*w+x];const v=g<(local-8)?0:255;const i=(y*w+x)*4;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
 }
 ctx.putImageData(data,0,0);
}
function sharpenCanvas(ctx,w,h){
 const src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),a=src.data,b=out.data;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=(y*w+x)*4;
   for(let c=0;c<3;c++){
     const v=5*a[i+c]-a[i-4+c]-a[i+4+c]-a[i-w*4+c]-a[i+w*4+c];
     b[i+c]=Math.max(0,Math.min(255,v));
   }
   b[i+3]=255;
 }
 ctx.putImageData(out,0,0);
}
async function renderOcrCrop(file,top,bottom,scale=4){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=async()=>{try{const w=Math.min(3600,Math.round(img.naturalWidth*scale)),h=Math.round(img.naturalHeight*(bottom-top)*scale),c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,img.naturalHeight*top,img.naturalWidth,img.naturalHeight*(bottom-top),0,0,w,h);grayscaleAndEnhance(ctx,w,h,"soft");sharpenCanvas(ctx,w,h);resolve(await canvasToBlob(c));URL.revokeObjectURL(url)}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Falha ao abrir imagem para OCR"))};img.src=url})}
async function preprocessReceiptImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=async()=>{try{const maxW=3600,scale=Math.min(4,Math.max(2.8,maxW/img.naturalWidth)),w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale),variants=[];for(const mode of ["soft","contrast","adaptive"]){const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img,0,0,w,h);grayscaleAndEnhance(ctx,w,h,mode);if(mode!=="adaptive")sharpenCanvas(ctx,w,h);variants.push({blob:await canvasToBlob(c),label:mode})}URL.revokeObjectURL(url);resolve(variants)}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("A imagem do comprovante não pôde ser aberta"))};img.src=url})}
async function ocrRecognize(input,label,psm,T){setImportStatus("working",`Etapa 2 de 4 — OCR (${label})`,"Lendo o comprovante em múltiplos modos para recuperar texto, números e linhas parcialmente degradadas.");const r=await T.recognize(input,"por",{logger:m=>{if(m.status==="recognizing text"){const pct=Math.round(m.progress*100);$("#ocrBtn").textContent=`OCR ${pct}%`;$("#importStatusText").textContent=`Lendo o comprovante… ${pct}%`}},config:{tessedit_pageseg_mode:String(psm),preserve_interword_spaces:"1",user_defined_dpi:"300"}});return {text:r.data?.text||"",data:r.data||{}}}
function normalizeFiscalKey(v){return String(v||'').replace(/\D/g,'').slice(0,44)}
function setFiscalKey(key,source='OCR/QR'){
 const k=normalizeFiscalKey(key), input=$('#fiscalKey'); if(!input)return '';
 input.value=k;
 const valid=k.length===44 && window.ReceiptEngine?.keyCheckDigit?.(k);
 $('#consultFiscalBtn').disabled=!valid; $('#openDanfeBtn').disabled=!valid;
 $('#fiscalKeyStatus').textContent=valid?`Chave encontrada (${source}) e validada pelo dígito verificador.`:'Chave ainda não validada.';
 return valid?k:'';
}
let lastFiscalUpstream=null,lastFiscalXml='';
function showFiscalArtifacts(j,sourceLabel){
 const f=j?.data||{};lastFiscalUpstream=j?.upstream||f.raw||j||null;lastFiscalXml=f.xml||'';
 const row=$('#fiscalArtifactRow');if(!row)return;row.classList.remove('hidden');
 $('#fiscalArtifactStatus').textContent=`Artefatos fiscais disponíveis (${sourceLabel}).`;
 $('#downloadFiscalPdfBtn').disabled=!f.pdf;
 $('#downloadFiscalXmlBtn').disabled=!f.xml;
 $('#downloadFiscalJsonBtn').disabled=!lastFiscalUpstream;
}
function downloadTextFile(value,name,mime='application/json'){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function safeFileStem(keyOrName){return String(keyOrName||'documento-fiscal').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,80)||'documento-fiscal'}
function downloadFiscalArtifacts(){
 $('#downloadFiscalPdfBtn').onclick=()=>{const f=lastFiscalUpstream?.pdf_base64||lastFiscalUpstream?.data?.pdf_base64||lastFiscalUpstream?.pdf||null;const n=(lastFiscalUpstream?.chave||$('#fiscalKey')?.value||'danfe')+'-danfe.pdf';if(f)downloadDataUrl(f,n,'application/pdf');};
 $('#downloadFiscalXmlBtn').onclick=()=>{const f=lastFiscalUpstream?.xml_base64||lastFiscalUpstream?.xml||lastFiscalUpstream?.data?.xml||lastFiscalXml;if(f){if(/^[A-Za-z0-9+/=\s]+$/.test(String(f))&&!String(f).trim().startsWith('<')){try{downloadTextFile(atob(String(f).replace(/\s+/g,'')),safeFileStem(lastFiscalUpstream?.chave||$('#fiscalKey')?.value)+'.xml','application/xml');return}catch{}}downloadTextFile(f,safeFileStem(lastFiscalUpstream?.chave||$('#fiscalKey')?.value)+'.xml','application/xml')}};
 $('#downloadFiscalJsonBtn').onclick=()=>{if(lastFiscalUpstream)downloadTextFile(lastFiscalUpstream,safeFileStem(lastFiscalUpstream?.chave||$('#fiscalKey')?.value)+'.json','application/json')};
}
async function applyFiscalResult(j,key,routeLabel){
 const f=j.data||{}; const local=pendingImport||{};
 let merged={...local,market:{...(local.market||{}),...(f.market||{})},date:f.date||local.date,time:f.time||local.time,total:(Number(f.total)||0)||local.total,items:f.items?.length?f.items:local.items,discountTotal:f.discountTotal??local.discountTotal,nfceKey:key||f.fiscalKey||local.nfceKey,sourceEngine:'fiscal-api',fiscalSource:'consultadanfe',fiscalVerified:true,fiscalRoute:j.route||routeLabel,fiscalDocumentType:f.documentType||'nfe',fiscalRaw:j.upstream||f.raw||null};
 merged=await auditAndContextualizeReceipt(merged);merged.validation=validateReceiptData(merged);
 pendingImport=merged;renderReceiptEditor(merged);$('#receiptConfidence').textContent=merged.validation.ok?'fiscal + auditoria confirmados':'fiscal recebido · revisão necessária';$('#receiptConfidence').className=merged.validation.ok?'badge good':'badge warn';$('#saveImportRow').classList.remove('hidden');$('#saveImportBtn').disabled=!merged.validation.ok;showFiscalArtifacts(j,routeLabel);
 return merged;
}
async function consultFiscalKey(){
 const key=setFiscalKey($('#fiscalKey')?.value||'','campo manual'); if(!key)return toast('Informe uma chave fiscal válida de 44 dígitos.');
 if(location.protocol==='file:'){ setImportStatus('warn','Servidor local não está ativo','Abra o aplicativo pelo start-local.bat para usar a consulta fiscal. O navegador bloqueia fetch para /api quando o index.html é aberto como arquivo.'); toast('Abra o JuRe pelo start-local.bat.'); return; }
 setImportStatus('working','Consultando documento fiscal','Usando a rota por chave da Consulta DANFE. O OCR não será usado como verdade quando a resposta fiscal estiver disponível.');
 try{const r=await fetch('/api/fiscal/consult',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error((j.code?`${j.code}: `:'')+(j.error||'Consulta fiscal indisponível'));
   const merged=await applyFiscalResult(j,key,'consulta por chave');
   setImportStatus('success','Documento fiscal confirmado','A chave e os artefatos oficiais foram recebidos. O OCR permanece somente como apoio.');
   downloadFiscalArtifacts();toast(`Nota fiscal consultada. Rota: ${merged.fiscalRoute}.`);
 }catch(e){setImportStatus('warn','Consulta por chave não concluída',String(e.message||e));toast('A consulta fiscal por chave não pôde ser concluída.');}
}
async function sendFiscalXml(){
 const file=$('#fiscalXmlFile')?.files?.[0];if(!file)return toast('Selecione um arquivo XML fiscal.');
 if(location.protocol==='file:'){ setImportStatus('warn','Servidor local não está ativo','Abra o aplicativo pelo start-local.bat para enviar XML à API fiscal.'); toast('Abra o JuRe pelo start-local.bat.'); return; }
 if(file.size>5*1024*1024)return toast('O XML excede o limite de 5 MB.');
 setImportStatus('working','Enviando XML fiscal','Usando a segunda rota /danfe. Esta rota não depende do OCR nem da janela de datas da consulta por chave.');
 try{
  const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||'').split(',').pop());r.onerror=()=>reject(new Error('Falha ao ler o XML.'));r.readAsDataURL(file)});
  const r=await fetch('/api/fiscal/danfe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,mimeType:file.type||'application/xml',data:b64})});
  const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error((j.code?`${j.code}: `:'')+(j.error||'Geração do DANFE por XML indisponível'));
  const key=normalizeFiscalKey(j?.data?.fiscalKey||j?.upstream?.chave||'');
  await applyFiscalResult(j,key,'XML');
  if(key)setFiscalKey(key,'XML fiscal');
  setImportStatus('success','XML fiscal confirmado','O DANFE/JSON foi recebido diretamente da camada fiscal. Não depende de leitura OCR.');downloadFiscalArtifacts();toast('XML processado e artefatos fiscais disponíveis.');
 }catch(e){setImportStatus('warn','Processamento do XML não concluído',String(e.message||e));toast('O XML não pôde ser processado.');}
}
function downloadDataUrl(value,name,mime='application/octet-stream'){try{const s=String(value||'');if(/^https?:\/\//i.test(s)){window.open(s,'_blank','noopener');return}const href=s.startsWith('data:')?s:`data:${mime};base64,${s.replace(/[^A-Za-z0-9+/=]/g,'')}`;const a=document.createElement('a');a.href=href;a.download=name;a.click()}catch{}}
async function openDanfeOfficial(){
 const key=setFiscalKey($('#fiscalKey')?.value||'','campo manual'); if(!key)return;
 try{await navigator.clipboard?.writeText(key)}catch{}
 window.open('https://consultadanfe.com/api','_blank','noopener');
 setFiscalKey(key,'chave confirmada'); setImportStatus('success','Chave pronta para Consulta DANFE','A chave de 44 dígitos foi copiada para a área de transferência e a página oficial foi aberta.');
}

async function ocrReadReceipt(file){
 if(!window.ReceiptEngine?.run)throw new Error('Motor OCR anti-falhas não carregado.');
 const cascade=await window.ReceiptEngine.run(file,{loadTesseract,onProgress:p=>{const pct=Math.round(p*100);$('#ocrBtn').textContent=`OCR ${pct}%`;$('#importStatusText').textContent=`Leitura anti-falhas… ${pct}%`}});
 const candidates=cascade.readings.filter(r=>r.source==='tesseract'&&r.text).map((r,i)=>{const p=parseReceiptText(r.text);return {...p,_ocrText:r.text,_ocrRank:i,source:r.source,sourceLabel:r.label,ocrConfidence:r.confidence||0,ocrRegion:r.region||'full'}});
 const parsed=dedupeReceiptCandidates(candidates);
 const merged=reconcileReceiptCandidates(parsed);
 merged.ocrPasses=candidates.length;merged.ocrErrors=cascade.errors;merged.qrEvidence=cascade.qr||null;merged.ocrAudit=cascade.audit||null;
 if(cascade.qr?.key){merged.nfceKey=cascade.qr.key;merged.sefazUrl=cascade.qr.url}
 if(!merged.nfceKey){for(const c of candidates){const k=window.ReceiptEngine?.extractKeyFromText?.(c._ocrText||c.text||'');if(k){merged.nfceKey=k;merged.fiscalKeySource='ocr';break}}}
 if(merged.nfceKey)setFiscalKey(merged.nfceKey, cascade.qr?.key?'QR NFC-e':'OCR');
 return merged;
}
function itemSimilarity(a,b){
 let s=0;const an=normalize(String(a?.name||'')),bn=normalize(String(b?.name||''));
 if(a?.barcode&&b?.barcode&&String(a.barcode).replace(/\D/g,'')===String(b.barcode).replace(/\D/g,''))s+=.55;
 if(an&&bn){if(an===bn)s+=.35;else{const aa=new Set(an.split(' ')),bb=new Set(bn.split(' '));const inter=[...aa].filter(x=>bb.has(x)).length,union=new Set([...aa,...bb]).size;s+=.30*(inter/Math.max(1,union));}}
 if(a?.total&&b?.total&&Math.abs(num(a.total)-num(b.total))<=.03)s+=.25;
 if(a?.quantity&&b?.quantity&&Math.abs(num(a.quantity)-num(b.quantity))<=.001)s+=.10;
 return Math.min(1,s);
}
function dedupeReceiptCandidates(candidates){
 return (candidates||[]).filter(c=>c.items?.length).sort((a,b)=>receiptStructuralScore(b)+(b.ocrConfidence||0)*8-(receiptStructuralScore(a)+(a.ocrConfidence||0)*8)).slice(0,12);
}
function reconcileReceiptCandidates(candidates){
 const ordered=[...(candidates||[])],best=ordered[0]||parseReceiptText(''),clusters=[];
 for(const c of ordered){for(const item of (c.items||[])){let hit=clusters.find(cl=>cl.items.some(x=>itemSimilarity(x,item)>=.62));if(!hit){hit={items:[],sources:new Set};clusters.push(hit)}hit.items.push(item);hit.sources.add(c.sourceLabel||'ocr')}}
 const items=[];
 for(const cl of clusters){
  const xs=cl.items.slice().sort((a,b)=>(a.confidence||0)-(b.confidence||0)),seed={...(xs[xs.length-1]||{})},out=seed;
  for(const x of xs){if(!out.barcode&&x.barcode)out.barcode=x.barcode;if(!out.name&&x.name)out.name=x.name;if(!num(out.quantity)&&num(x.quantity))out.quantity=x.quantity;if(!num(out.unitPrice)&&num(x.unitPrice))out.unitPrice=x.unitPrice;if(!num(out.total)&&num(x.total))out.total=x.total;if(!out.unit&&x.unit)out.unit=x.unit;if(!out.pack&&x.pack)out.pack=x.pack}
  out.confidence=Math.min(1,(cl.items.reduce((a,x)=>a+num(x.confidence),0)/Math.max(1,cl.items.length))+Math.min(.15,(cl.sources.size-1)*.05));out.needsReview=cl.sources.size<2||out.confidence<.82;items.push(out);
 }
 const vote=arr=>{const m=new Map();for(const v of arr.filter(Boolean))m.set(v,(m.get(v)||0)+1);return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||''};
 const totals=ordered.map(c=>num(c.total)).filter(v=>v>0),dateVotes=ordered.map(c=>c.date),cnpjVotes=ordered.map(c=>c.market?.cnpj),nameVotes=ordered.map(c=>c.market?.name);
 const totalVote=vote(totals.map(v=>v.toFixed(2)));
 const d={...best,items,market:{...(best.market||{})}};d.total=totalVote?Number(totalVote):num(best.total);d.date=vote(dateVotes)||best.date;d.market={name:vote(nameVotes)||best.market?.name||'Mercado não identificado',cnpj:vote(cnpjVotes)||best.market?.cnpj||''};
 d.itemCountEvidence=items.length;d.evidenceCoverage=Math.min(1,items.filter(i=>i.name&&num(i.total)>0).length/Math.max(1,d.itemCountDeclared||items.length));d.ocrConsensus=items.length?items.filter(i=>num(i.confidence)>=.82).length/items.length:0;
 d.confidence=Math.min(1,.35*d.ocrConsensus+.25*d.evidenceCoverage+.20*(d.market.cnpj?1:0)+.20*(d.date&&d.total?1:0));d.needsReview=true;d.cascadeSources=ordered.map(c=>({label:c.sourceLabel||'ocr',items:c.items?.length||0,confidence:c.ocrConfidence||0}));
 return d;
}

function scoreOCRText(text){
 const t=String(text||"");
 return (t.match(/\b\d{4,14}\b/g)||[]).length*3+(t.match(/\d+[,.]\d{2}/g)||[]).length*2+(t.match(/\d{2}[\/.\-]\d{2}[\/.\-]\d{2,4}/g)||[]).length*4+t.length/10000;
}
function receiptStructuralScore(d){
 const items=Array.isArray(d?.items)?d.items:[];let s=items.length*4;
 if(d?.market?.name&&d.market.name!=="Mercado não identificado")s+=4;if(d?.market?.cnpj)s+=6;if(d?.date)s+=4;if(num(d?.total)>0)s+=5;
 const sum=round2(items.reduce((a,i)=>a+num(i.total)-num(i.discount),0));if(num(d?.total)>0)s+=Math.max(0,8-Math.min(8,Math.abs(sum-num(d.total))*2));
 s+=items.filter(i=>num(i.unitPrice)>0&&num(i.total)>0).length*1.5;
 return s;
}
function receiptLineSum(d){return round2((d.items||[]).reduce((a,i)=>a+num(i.total)-num(i.discount),0))}
function normalizeOcrNumeric(s){return String(s||"").replace(/[Oo]/g,"0").replace(/[Il|]/g,"1").replace(/[Ss]/g,"5").replace(/[Bb]/g,"8").replace(/[Zz]/g,"2").replace(/[Gg]/g,"6").replace(/\s+/g,"")}
function moneyTokens(s){return String(s||"").match(/-?(?:\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g)||[]}
function receiptNum(v){const x=String(v??"").trim().replace(/R\$\s*/gi,"").replace(/\s/g,"");if(!x)return 0;if(x.includes(","))return Number(x.replace(/\./g,"").replace(",","."))||0;if((x.match(/\./g)||[]).length===1)return Number(x)||0;if((x.match(/\./g)||[]).length>1)return Number(x.replace(/\./g,""))||0;return Number(x)||0}
function numericTokens(s){return String(s||"").match(/\b\d{3,14}\b/g)||[]}
function validCnpjDigits(d){
 const x=String(d||"").replace(/\D/g,"");if(x.length!==14||/^([0-9])\1{13}$/.test(x))return false;
 const calc=(n)=>{let sum=0,weight=n===12?5:6;for(let i=0;i<n;i++,weight--){if(weight===1)weight=9;sum+=Number(x[i])*weight}const r=sum%11;return r<2?0:11-r};
 return calc(12)===Number(x[12])&&calc(13)===Number(x[13]);
}
function repairCnpjCandidate(raw){
 const d=normalizeOcrNumeric(raw).replace(/\D/g,"");if(validCnpjDigits(d))return canonicalCnpj(d);
 if(d.length!==14)return "";
 const maps={0:"123456789",1:"023456789",2:"013456789",3:"012456789",4:"012356789",5:"012346789",6:"012345789",7:"012345689",8:"012345679",9:"012345678"};
 let frontier=[d];const seen=new Set([d]);
 for(let depth=1;depth<=1;depth++){const next=[];for(const cur of frontier){for(let i=0;i<cur.length;i++){for(const r of(maps[cur[i]]||"")){if(r===cur[i])continue;const a=cur.split("");a[i]=r;const candidate=a.join("");if(seen.has(candidate))continue;seen.add(candidate);if(validCnpjDigits(candidate))return canonicalCnpj(candidate);next.push(candidate)}}}frontier=next;}
 return "";
}
function extractReceiptCode(line){
 const toks=String(line||"").match(/[A-Za-z0-9]{3,16}/g)||[];
 const candidates=[];
 for(const tok of toks){
   const fixed=normalizeOcrNumeric(tok).replace(/^[A-Za-z]+/,"").replace(/[A-Za-z]+$/g,"");
   if(!/^\d{3,14}$/.test(fixed))continue;
   const ratio=(fixed.match(/\d/g)||[]).length/tok.length;
   if(ratio<.45)continue;
   candidates.push({fixed,index:line.indexOf(tok),len:fixed.length});
 }
 candidates.sort((a,b)=>(b.len-a.len)||((a.index||0)-(b.index||0)));
 const first=candidates.find(x=>x.len>=8)||candidates[0];return first||null;
}
function extractMerchantIdentity(lines){
 const reject=/^(cnpj|cpf|documento|cupom|nota|fiscal|consumidor|endereco|avenida|av\.|rua|r\.|fone|tel|telefone|saquarema|data|hora|codigo|descricao|qtde|qtd|forma|pagamento|venda|valor|total|desconto)/i;
 const rows=[];for(let i=0;i<Math.min(lines.length,18);i++){const raw=lines[i].raw.replace(/\s+/g,' ').trim();if(!raw||reject.test(raw))continue;let score=0;
  if(/supermercad|mercado|hipermercad|atacad|alvorada|drogaria|farm[aá]cia|farmacia|padaria|hortifruti|emporio|loja/i.test(raw))score+=8;
  if(/eireli|ltda|sa\b|s\.a\.|mei\b/i.test(raw))score+=2;if(raw.length>=6&&raw.length<=70)score+=2;
  if(score)rows.push({i,raw,score});
 }
 rows.sort((a,b)=>b.score-a.score||a.i-b.i);const hit=rows[0];if(!hit)return{name:'',merchantType:''};let name=hit.raw;
 if(hit.i>0 && /^(supermercad|mercad|drogaria|farm[aá]cia|farmacia|padaria|hiper|atacad)/i.test(lines[hit.i-1].raw) && !/cnpj|cpf/i.test(lines[hit.i-1].raw))name=lines[hit.i-1].raw+' '+name;
 name=name.replace(/^.*?(?:SUPER)?MERCAD(?:O|OS)?\s+/i,m=>'').trim()||hit.raw;
 const type=/drogaria|farm[aá]cia|farmacia/i.test(name)?'drogaria':/padaria/i.test(name)?'padaria':/hortifruti/i.test(name)?'hortifruti':/atacad/i.test(name)?'atacarejo':'supermercado';
 // Do not consume an adjacent "SA"/"S.A." token; preserve municipality names such as SÃO.
 name=name.replace(/\s{2,}/g,' ').trim();return{name,merchantType:type};
}
function normalizeReceiptName(s){return normalize(String(s||'')).replace(/\b(?:REFRIG|REFRESC|MIST|PRES|ABS|PAP|LAU|AMAC|ACUC|BISC|OVOS|PAO|FAR)\b/g,'').replace(/\s+/g,' ').trim()}
function inferProductCategory(name){const n=normalize(name);if(/BEBIDA|REFRIG|VINHO|REFRESC|COCA|ANTARCT|MAGUARY/.test(n))return'Bebidas';if(/PAPEL|ABSORVENT|HIGIEN/.test(n))return'Higiene';if(/AMAC|OMO|LIMPE/.test(n))return'Limpeza';if(/BOLO|PIPOCA|FARINHA|BISCOITO|ACUCAR|EMPANAR|MIST/.test(n))return'Mercearia';if(/OVOS|LEITE|QUEIJO|MARGARINA/.test(n))return'Laticínios';if(/PRESUNTO|QUEIJO PRATO|FRIOS/.test(n))return'Frios';if(/PAO|PADARIA/.test(n))return'Padaria';if(/MACA|BANANA|FRUTA|HORTI/.test(n))return'Hortifruti';return'Outros'}
function isValidGtin(code){const d=String(code||'').replace(/\D/g,'');if(d.length===4)return true;if(![8,12,13,14].includes(d.length))return false;let sum=0;for(let i=d.length-2,j=0;i>=0;i--,j++){const n=Number(d[i]);sum+=n*(j%2===0?3:1)}return((10-(sum%10))%10)===Number(d[d.length-1])}
function bestMoneyPair(tokens,quantity){
 const vals=tokens.map(receiptNum).filter(v=>v>0&&v<100000);if(vals.length<2)return null;let best=null;for(let a=0;a<vals.length;a++)for(let b=a+1;b<vals.length;b++){const x=vals[a],y=vals[b];const pairs=[[x,y],[y,x]];for(const [unitPrice,lineTotal] of pairs){const q=Number(quantity)||1,res=Math.abs(q*unitPrice-lineTotal);const score=res<=0.03?0:res;const candidate={unitPrice,lineTotal,score};if(!best||score<best.score)best=candidate}}return best}
function normalizeDisplayProductName(name){
 let s=String(name||'').replace(/\s+/g,' ').trim();
 const replacements=[[/^refr\.?\s+/i,'Refrigerante '],[/^refri\.?\s+/i,'Refrigerante '],[/^cerv\.?\s+/i,'Cerveja '],[/\bp\s*\/\s*/gi,'para '],[/\bc\s*\/\s*(\d+)/gi,'c/$1'],[/\bado[cç]ante\b/gi,'Adoçante']];
 for(const [r,v] of replacements)s=s.replace(r,v);
 return s.replace(/\s{2,}/g,' ').trim();
}
function extractInlineItemHeader(line){
 const m=String(line||'').match(/^(.*?)\s*\(\s*c[oó]digo\s*:\s*([0-9]{4,14})\s*\)\s*(?:VL?\.?\s*Total|Valor\s*Total)?\s*$/i);
 if(!m)return null;return{name:cleanProductName(normalizeDisplayProductName(m[1])),barcode:m[2]};
}
function extractItemRowsFromLines(lines){
 const out=[];
 const headerRegex=/^(.+?)\s*\(\s*c[oó]digo\s*:\s*([0-9]{4,14})\s*\).*$/i;
 for(let i=0;i<lines.length;i++){
   const raw=lines[i].raw;const inline=extractInlineItemHeader(raw);const codeFirst=(()=>{const x=raw.match(/^\s*(\d{4,14})\s+(.{3,})$/);return x?{name:cleanProductName(normalizeDisplayProductName(x[2])),barcode:x[1]}:null})();const m=inline||(()=>{const x=raw.match(headerRegex);return x?{name:cleanProductName(normalizeDisplayProductName(x[1])),barcode:x[2]}:null})()||codeFirst;if(!m)continue;
   const detailIndex=(()=>{for(let k=i+1;k<Math.min(lines.length,i+5);k++){if(/(?:qtde|qtd|quantidade)\s*(?:[:.]\s*)+/i.test(lines[k].raw)||/^\s*\d+(?:[.,]\d+)?\s+(?:UN|UND|UNID|KG|L|ML|G)\b/i.test(lines[k].raw))return k;}return i+1})();
   const detailLines=lines.slice(detailIndex,Math.min(lines.length,detailIndex+2));
   const window=detailLines.map(x=>x.raw).join(' ');
   const qm=window.match(/(?:qtde|qtd|quantidade)\s*(?:[:.]\s*)+(\d+(?:[\.,]\d+)?)\s*(?:un|und|unid)?/i)||window.match(/^\s*(\d+(?:[\.,]\d+)?)\s+(?:UN|UND|UNID|KG|L|ML|G)\b/i);const qty=qm?receiptNum(qm[1]):null;
   const um=window.match(/\b(?:UN|UND|UNID|KG|L|ML|G)\b/i);const unit=um?normalizeUnit(um[0]):'';
   const money=[];
   for(const line of detailLines){
     const lm=String(line.raw).match(/v(?:l|alor)\.?\s*unit\.?[^:]*:\s*(.*)$/i); const tail=lm?lm[1]:line.raw;
     const fixedTail=tail.replace(/(\d+)\s*,\s*(\d{2})/g,'$1,$2');
     const dec=(fixedTail.match(/\d+[.,]\d{2}/g)||[]).map(receiptNum); money.push(...dec);
     const bare=(fixedTail.match(/(?<![\dA-Za-z])\d{3,5}(?![\dA-Za-z])/g)||[]).map(x=>Number(x)/100).filter(v=>v>0&&v<10000); money.push(...bare);
   }
   if(money.length<2)continue;
   // Os dois últimos valores próximos ao rótulo "VL. Unit." são tratados como
   // preço unitário e total da linha; a matemática da quantidade decide a ordem.
   const moneyTail=money.slice(-4);
   const candidates=[];for(let a=0;a<moneyTail.length;a++)for(let b=a+1;b<moneyTail.length;b++){for(const [u,t] of [[moneyTail[a],moneyTail[b]],[moneyTail[b],moneyTail[a]]])candidates.push({u,t,err:Math.abs(round2(qty*u)-t)});}
   candidates.sort((a,b)=>a.err-b.err);const best=candidates[0];const unitPrice=best.u,total=best.t;
   let discount=0;for(let j=i+1;j<Math.min(lines.length,i+4);j++){const dm=lines[j].raw.match(/desconto[^0-9]*(-?(?:\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}))/i);if(dm){discount=Math.abs(receiptNum(dm[1]));break;}}
   if(m.name&&total>0)out.push({barcode:m.barcode,name:m.name,quantity:qty,unit,unitPrice,total,discount,brand:'',category:inferProductCategory(m.name),pack:guessPack(m.name),needsReview:best.err>.03||qty===null||!unit,confidence:(best.err<=.03&&qty!==null&&!!unit)?.90:.55,sourceLine:i,rawLine:raw,fieldEvidence:{name:'line-text',quantity:qm?'line-text':'missing',unit:um?'line-text':'missing',unitPrice:moneyTail.length?'price-columns':'missing',total:moneyTail.length?'price-columns':'missing'},gtinValid:isValidGtin(m.barcode)});
 }
 return out;
}
function parseReceiptText(text){
 const rawLines=String(text||'').split(/\r?\n/).map(x=>x.replace(/[\t ]+/g,' ').trim()).filter(Boolean);const lines=rawLines.map((raw,idx)=>({raw,norm:raw.replace(/\s+/g,' ').trim(),idx}));const joined=lines.map(x=>x.raw).join(' ');
 let cnpj='';for(const l of lines){const cand=(l.raw.match(/(?:\d\s*){14}/)?.[0]||l.raw.match(/\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/)?.[0]);if(cand){const fixed=repairCnpjCandidate(cand);if(fixed){cnpj=fixed;break}}}
 const dateMatches=joined.match(/\b\d{2}[\/\.\-]\d{2}[\/\.\-]\d{2,4}\b/g)||[];const date=normalizeReceiptDate(dateMatches[0]||'');const tm=joined.match(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/);const time=tm?tm[0]:'';
 const merchant=extractMerchantIdentity(lines);const total=extractReceiptLabeledValue(lines,[/valor\s*a\s*pagar/i,/valor\s*pago/i,/total\s*a\s*pagar/i,/^total/i]);const discountTotal=extractReceiptLabeledValue(lines,[/desconto/i])||0;const paymentLine=lines.find(x=>/cart[aã]o\s+(?:de\s+)?d[eé]bito|cr[eé]dito|pix|dinheiro|vale/i.test(x.raw));
 let declaredItemCount=0;for(const l of lines){const m=l.raw.match(/(?:qtde|qtd|quantidade)\.?\s*total\s*de\s*itens[^0-9]*(\d{1,3})/i);if(m){declaredItemCount=Number(m[1]);break}}
 const products=extractItemRowsFromLines(lines);const dedup=[];for(const it of products){const same=dedup.find(x=>((it.barcode&&x.barcode===it.barcode)||(!it.barcode&&!x.barcode&&normalizeReceiptName(it.name)===normalizeReceiptName(x.name)))&&Math.abs((it.total||0)-(x.total||0))<.01&&Math.abs((it.quantity||0)-(x.quantity||0))<.001);if(!same)dedup.push(it)}
 const lineSum=round2(dedup.reduce((a,i)=>a+num(i.total)-num(i.discount),0));let confidence=.05;if(dedup.length)confidence+=.40;if(total)confidence+=.15;if(cnpj)confidence+=.15;if(date)confidence+=.1;if(declaredItemCount&&declaredItemCount===dedup.length)confidence+=.1;if(total&&Math.abs(lineSum-total)<=.05)confidence+=.1;
 return {market:{name:merchant.name||'Mercado não identificado',cnpj},merchantType:merchant.merchantType,date,time,total,discountTotal,paymentMethod:paymentLine?.raw||'',items:dedup,itemCountDeclared:declaredItemCount,confidence:Math.min(1,confidence),rawText:text,needsReview:true};
}
function stripReceiptNumericTail(s){
 return String(s||"").replace(/\s+(?:\d+[.,]\d{2}\s+){1,2}-?\d+[.,]\d{2}\s*$/," ").replace(/\s+\d+[.,]\d{2}\s+\d+[.,]\d{2}\s*$/," ").trim();
}
function normalizeUnit(u){const x=String(u||"").toUpperCase();return x==="UND"?"un":x.toLowerCase()}
function extractReceiptLabeledValue(lines,patterns){
 for(let i=lines.length-1;i>=0;i--){if(patterns.some(r=>r.test(lines[i].raw))){const toks=moneyTokens(lines[i].raw);if(toks.length)return Math.abs(receiptNum(toks[toks.length-1]));for(let j=i+1;j<Math.min(lines.length,i+4);j++){const t=moneyTokens(lines[j].raw);if(t.length)return Math.abs(receiptNum(t[t.length-1]));}}}
 const joined=lines.map(x=>x.raw).join(" ");for(const r of patterns){const m=joined.match(new RegExp(r.source+"[^0-9]{0,40}(-?(?:\\d{1,3}(?:[.\\s]\\d{3})*[.,]\\d{2}|\\d+[.,]\\d{2}))","i"));if(m)return Math.abs(receiptNum(m[1]));}
 if(patterns.some(r=>/desconto/i.test(r.source)))return 0;
 const footer=lines.slice(Math.max(0,Math.floor(lines.length*.72))).flatMap(x=>moneyTokens(x.raw)).map(receiptNum).filter(v=>v>0&&v<100000);return footer.length?Math.max(...footer):0;
}
function extractReceiptValuesRobust(s){
 const str=String(s||"");const monies=moneyTokens(str);if(monies.length<2)return null;
 const last=monies.slice(-2).map(v=>Math.abs(receiptNum(v)));let unitPrice=last[0],lineTotal=last[1];
 const qm=str.match(/\b(\d+(?:[.,]\d+)?)\s*(UN|UND|KG|L|ML|G)\b/i);const quantity=qm?receiptNum(qm[1]):0,unit=qm?normalizeUnit(qm[2]):"un";
 if(quantity&&Math.abs(quantity*unitPrice-lineTotal)>0.03&&Math.abs(quantity*lineTotal-unitPrice)<=0.03)[[unitPrice,lineTotal],[lineTotal,unitPrice]]=[ [lineTotal,unitPrice] ];
 return {quantity,unit,unitPrice,lineTotal,discount:0,confidence:quantity?0.72:0.58};
}
function canonicalCnpj(value){const digits=String(value||"").replace(/\D/g,"");return digits.length===14?digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5"):""}
function normalizeReceiptDate(value){const m=String(value||"").match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})/);if(!m)return "";let y=m[3];if(y.length===2)y=(Number(y)<50?"20":"19")+y;return `${y}-${m[2]}-${m[1]}`}
function extractReceiptValues(s){return extractReceiptValuesRobust(s)}
function validateReceiptData(d){
 const items=Array.isArray(d?.items)?d.items:[];
 if(!items.length)return {ok:false,message:'Nenhum item foi identificado com segurança. O sistema não vai preencher a compra com dados de outro registro.'};
 if(!d.audit)return {ok:false,message:'A auditoria ainda não foi executada. O sistema não permite gravar sem auditoria.'};
 if(d.audit.status!=='PASS')return {ok:false,message:d.audit.issues?.[0]||'A auditoria não aprovou o documento. Corrija as divergências e execute novamente.'};
 if(!d.audit.canPublish)return {ok:false,message:'A barreira de publicação não foi liberada pela auditoria.'};
 const total=num(d?.total);
 if(total<=0)return {ok:false,message:'O total da compra não foi identificado. Confira o total no documento antes de salvar.'};
 if(d.market?.cnpj && !validCnpjDigits(d.market.cnpj))return {ok:false,message:'O CNPJ identificado não passou na validação dos dígitos verificadores. Confira o cabeçalho do comprovante.'};
 return {ok:true,message:`${items.length} itens auditados; reconciliação documental aprovada.`};
}
async function auditAndContextualizeReceipt(receipt){
 const d=await data();
 let out={...(receipt||{}),items:window.ReceiptAuditor?.reconcileItems?window.ReceiptAuditor.reconcileItems(receipt?.items||[],d.products||[]):(receipt?.items||[])};
 out.audit=window.ReceiptAuditor?.auditReceipt?window.ReceiptAuditor.auditReceipt(out,d.purchases||[]):null;
 out.auditReady=!!out.audit;
 const exact=(out.items||[]).filter(i=>i.matchStatus==='EXACT').length;
 const contextual=(out.items||[]).filter(i=>i.matchStatus==='STRONG').length;
 const ambiguous=(out.items||[]).filter(i=>i.matchStatus==='AMBIGUOUS').length;
 const review=(out.items||[]).filter(i=>['REVIEW','WEAK'].includes(i.matchStatus)).length;
 out.catalogMatch={exact,contextual,ambiguous,review,new:(out.items||[]).filter(i=>i.matchStatus==='NEW').length,total:out.items?.length||0};
 const evidenceByLine=out.audit?.evidence?.items||{};
 out.items=(out.items||[]).map(i=>{
   const ev=evidenceByLine[i.lineId];
   const fieldConf=Object.values(ev||{}).filter(x=>x&&x.confidence!=null).map(x=>Number(x.confidence)||0);
   const base=Math.max(num(i.confidence)||0,num(i.matchConfidence)||0,...fieldConf);
   return {...i,confidence:Math.min(1,base),fieldEvidence:ev||i.fieldEvidence||null,needsReview:!!(i.needsReview||['AMBIGUOUS','REVIEW','WEAK'].includes(i.matchStatus))};
 });
 return out;
}
function renderEvidenceField(e){
 if(!e)return '';
 const statusClass=e.status==='CONFIRMED'?'good':e.status==='MISSING'||e.status==='CONFLICT'?'danger':'warn';
 const conf=Math.round((Number(e.confidence)||0)*100);
 const extras=[];
 if(e.acceptedBecause)extras.push(`<span>${esc(e.acceptedBecause)}</span>`);
 if(e.rejectionReason)extras.push(`<span class="danger-text">${esc(e.rejectionReason)}</span>`);
 if(e.corroboration?.length)extras.push(`<span>Corroboração: ${esc(e.corroboration.join(' · '))}</span>`);
 if(e.conflicts?.length)extras.push(`<span class="danger-text">Conflitos: ${esc(e.conflicts.join(' · '))}</span>`);
 return `<div class="evidence-field"><b>${esc(e.field)}</b><span class="badge ${statusClass}">${esc(e.status)} · ${conf}%</span><small>fonte: ${esc(e.source)} · método: ${esc(e.extractor)}</small>${extras.join('')}</div>`;
}
function renderItemEvidence(it){
 const ev=it?.fieldEvidence;
 if(!ev)return '';
 return `<details class="evidence-details"><summary>Rastreabilidade do item</summary><div class="evidence-grid">${Object.values(ev).map(renderEvidenceField).join('')}</div><small class="mono">linha: ${esc(it.lineId||'')} · origem: ${esc(it.source||'unknown')}</small></details>`;
}
function renderReceiptAudit(d){
 const a=d?.audit;if(!a)return '';
 const cls=a.status==='PASS'?'good':a.status==='REVIEW'?'warn':'danger';
 const title=a.status==='PASS'?'Auditoria aprovada':a.status==='REVIEW'?'Auditoria requer conferência':'Auditoria bloqueou a publicação';
 const lines=[`Matemática: bruto ${money(a.math.grossSum)} · descontos de linha ${money(a.math.lineDiscountSum)} · desconto global ${money(a.math.receiptDiscount)} · acréscimos ${money(a.math.surcharge)}`,`Reconciliação: esperado ${money(a.math.expectedTotal)} · total ${money(a.math.total)} · diferença ${money(Math.abs(a.math.totalDelta||0))}`,`Itens auditados: ${a.coverage.itemsPassed}/${a.coverage.itemsTotal} aprovados · ${a.coverage.itemsBlocked} bloqueados`, `Evidência obrigatória: ${Math.round((a.evidence?.requiredCoverage||0)*100)}%`];
 if(a.duplicate)lines.push(`Duplicidade: ${a.duplicate.reason}`);
 const errs=(a.issues||[]).slice(0,4).concat((a.warnings||[]).slice(0,4));
 return `<div class="audit-block ${cls}"><b>${title}</b><div>${lines.map(esc).join('<br>')}</div>${errs.length?`<small>${errs.map(esc).join(' · ')}</small>`:''}</div>`;
}

async function saveAttachment(purchaseId,file){const id=uid("att");await put("attachments",{id,purchaseId,name:file.name,type:file.type,size:file.size,blob:file,createdAt:todayISO()});return id}
async function openAttachment(id,relative){if(relative){window.open(relative,"_blank");return}const a=await getOne("attachments",id);if(!a?.blob)return toast("Comprovante não encontrado no banco local.");const u=URL.createObjectURL(a.blob);window.open(u,"_blank");setTimeout(()=>URL.revokeObjectURL(u),60000)}
window.openAttachment=openAttachment
async function readFileBase64(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result.split(",")[1]);fr.onerror=()=>rej(fr.error||new Error("Falha ao ler arquivo"));fr.readAsDataURL(file)})}
async function fetchWithRetry(url,options={},retries=2,timeoutMs=30000){
 let last;
 for(let attempt=0;attempt<=retries;attempt++){
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const r=await fetch(url,{...options,signal:controller.signal});
   clearTimeout(timer);
   if(r.ok || (r.status>=400 && r.status<500 && r.status!==429)) return r;
   last=new Error(`HTTP ${r.status}`);
  }catch(e){clearTimeout(timer);last=e}
  if(attempt<retries) await new Promise(r=>setTimeout(r,700*Math.pow(2,attempt)));
 }
 throw new Error(last?.name==="AbortError"?"Tempo limite excedido ao consultar o Gemini.":last?.message||"Falha de rede ao consultar o Gemini.");
}
async function geminiReadReceipt(file){
 const s=(await data()).settings,b64=await readFileBase64(file),mime=file.type||'application/octet-stream';
 const prompt='Você é o módulo fiscal do Compras da JuRe. Leia visualmente o comprovante e devolva SOMENTE JSON válido. Identifique data, hora, estabelecimento, CNPJ, endereço/localidade, total, descontos, pagamento e cada linha de item com nome, marca se houver, embalagem/peso/volume, quantidade, unidade, preço unitário, total da linha e desconto. Nunca invente. Se um campo estiver ilegível, use vazio/null e needsReview=true. Preserve exatamente a data do documento. Não use dados de outros comprovantes, histórico ou exemplos. Estrutura: {market:{name,cnpj,address,city,state},date,time,total,discountTotal,paymentMethod,documentNumber,nfceKey,items:[{barcode,name,brand,category,pack,unit,quantity,unitPrice,total,discount,needsReview,confidence}],confidence}.';
 if(location.protocol!=='file:'&&location.hostname==='localhost'){
  const r=await fetchWithRetry('/api/vision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType:mime,data:b64,prompt,model:s.geminiModel||'gemini-3.7-flash'})},1,60000);
  if(!r.ok){let e='Proxy visual indisponível';try{const x=await r.json();e=x.error||e}catch{};throw new Error(e)}
  const j=await r.json();return j.data||j.result||j;
 }
 throw new Error('IA visual indisponível neste modo. Inicie o servidor local seguro; a chave nunca é usada no navegador.');
}
async function ocrSpaceReadReceipt(file){
 const b64=await readFileBase64(file),mime=file.type||'image/jpeg';
 const r=await fetchWithRetry('/api/ocr-space',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType:mime,data:b64})},1,60000);if(!r.ok){let e='OCR secundário indisponível';try{const x=await r.json();e=x.error||e}catch{};throw new Error(e)}const j=await r.json();return {text:j.text||'',source:'ocr-space',confidence:j.confidence||.65};
}
function reconcileVisionWithLocal(local,vision){
 const out={...(local||{}),market:{...((local&&local.market)||{})},items:[]};
 const li=local?.items||[],vi=vision?.items||[],used=new Set();
 if(vision?.market)out.market={...out.market,...vision.market};
 if(vi.length){
  for(const v of vi){
   let best=li.reduce((acc,x,idx)=>{if(used.has(idx))return acc;const sim=itemSimilarityLocal(x,v);return (!acc||sim>acc.sim)?{x,sim,idx}:acc},{x:null,sim:0,idx:-1});
   const x=best?.sim>=.55?best.x:null;if(best?.idx>=0&&x)used.add(best.idx);
   out.items.push({...((x)||{}),...v,confidence:Math.max(num(v.confidence),num(x?.confidence)||0),needsReview:!!(v.needsReview||x?.needsReview||best.sim<.70)});
  }
  li.forEach((x,idx)=>{if(!used.has(idx)&&num(x.total)>0&&x.name){out.items.push({...x,needsReview:true,confidence:Math.min(num(x.confidence)||.6,.78)});}});
 }else out.items=li;
 const vTotal=num(vision?.total),lTotal=num(local?.total);out.total=vTotal||lTotal;
 if(vTotal&&lTotal&&Math.abs(vTotal-lTotal)>.05){out.total=lTotal;out.needsReview=true;out.totalMismatch={local:lTotal,vision:vTotal};}
 out.date=vision?.date||local?.date;out.time=vision?.time||local?.time;out.discountTotal=num(vision?.discountTotal)||num(local?.discountTotal);out.paymentMethod=vision?.paymentMethod||local?.paymentMethod;out.documentNumber=vision?.documentNumber||local?.documentNumber;out.nfceKey=local?.nfceKey||vision?.nfceKey;out.sefazUrl=local?.sefazUrl||vision?.sefazUrl;out.sourceEngine='ocr+cascade-vision';out.visionConfidence=num(vision?.confidence);out.itemCountDeclared=Number(vision?.itemCountDeclared||local?.itemCountDeclared||0);out.evidenceCoverage=Math.min(1,(out.items||[]).filter(i=>i.name&&num(i.total)>0).length/Math.max(1,out.itemCountDeclared||out.items.length));return out;
}

function itemSimilarityLocal(a,b){let s=0;const an=normalize(a?.name),bn=normalize(b?.name);if(a?.barcode&&b?.barcode&&String(a.barcode).replace(/\D/g,'')===String(b.barcode).replace(/\D/g,''))s+=.55;if(an&&bn){if(an===bn)s+=.35;else{const aa=new Set(an.split(' ')),bb=new Set(bn.split(' '));s+=.30*([...aa].filter(x=>bb.has(x)).length/Math.max(1,new Set([...aa,...bb]).size));}}if(a?.total&&b?.total&&Math.abs(num(a.total)-num(b.total))<=.05)s+=.25;return Math.min(1,s);}

function renderReceiptEditor(d){
 const m=d.market||{};$("#receiptEditor").classList.remove("empty");
 $("#receiptEditor").innerHTML=`<div class="form-grid"><label>Mercado<input id="riMarket" value="${esc(m.name||"")}"></label><label>CNPJ<input id="riCnpj" value="${esc(m.cnpj||"")}"></label><label>Data da compra<input id="riDate" type="date" value="${d.date||""}" disabled><small>Data vem do documento e fica protegida como fato histórico.</small></label><label>Hora<input id="riTime" value="${esc(d.time||"")}"></label><label>Total<input id="riTotal" value="${d.total??""}"></label><label>Desconto<input id="riDiscount" value="${d.discountTotal||0}"></label></div>${renderReceiptAudit(d)}<h4>Itens (${d.items.length})</h4>${d.items.map((it,i)=>`<div class="item-line"><b>${esc(it.matchedProductName||it.name||"Item não identificado")}</b>${it.matchedProductName?` <span class="badge">associado ao catálogo</span>`:(['AMBIGUOUS','REVIEW','WEAK'].includes(it.matchStatus)?` <span class="badge warn">associação não confirmada</span>`:` <span class="badge">${it.matchStatus==='NEW'?'produto novo não associado':'sem associação automática'}</span>`)}${it.confidence!=null?` <span class="badge">${Math.round(clamp(num(it.confidence)||0)*100)}%</span>`:""}<small>${esc(it.name||'')} · ${esc(it.matchStatus||'novo')}</small>${(it.matchCandidates?.length||it.matchStatus==='AMBIGUOUS')?`<label>Associação no catálogo<select data-ri="${i}" class="ri-match"><option value="__NEW__">Novo produto</option>${(it.matchCandidates||[]).map(c=>`<option value="${esc(c.id)}" ${String(c.id)===String(it.matchedProductId)?"selected":""}>${esc(c.name)} · ${Math.round((Number(c.score)||0)*100)}%</option>`).join("")}</select><small>Escolha somente se reconhecer o mesmo produto. A seleção será auditada como confirmação manual.</small></label>`:""}<div class="form-grid"><label>Quantidade<input data-ri="${i}" class="ri-qty" value="${it.quantity??1}"></label><label>Unidade<input data-ri="${i}" class="ri-unit" value="${esc(it.unit||"un")}"></label><label>Preço unitário<input data-ri="${i}" class="ri-price" value="${it.unitPrice??0}"></label><label>Total da linha<input data-ri="${i}" class="ri-line" value="${it.total??0}"></label></div>${renderItemEvidence(it)}</div>`).join("")}`;
}
async function computePurchaseFingerprint(p){
 const key=String(p.nfceKey||p.fiscalKey||'').replace(/\D/g,'');if(key.length===44)return `FISCAL:${key}`;
 const base=[canonicalCnpj(p.cnpj),String(p.marketName||'').trim().toUpperCase(),normalizeReceiptDate(p.date),String(p.time||'').slice(0,8),String(p.documentNumber||'').trim().toUpperCase(),Number(p.total||0).toFixed(2),(p.items||[]).map(i=>`${String(i.barcode||'').replace(/\D/g,'')}|${normalize(i.name)}|${normalize(i.unit)}|${Number(i.quantity||0).toFixed(3)}|${Number(i.unitPrice||0).toFixed(4)}|${Number(i.total||0).toFixed(2)}`).sort().join('||')].join('##');
 if(globalThis.crypto?.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(base));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}return base;
}
$("#saveImportBtn").onclick=async()=>{
 if(!pendingImport)return;
 const qs=$$(".ri-qty"),us=$$(".ri-unit"),ps=$$(".ri-price"),ls=$$(".ri-line"),matches=$$(".ri-match");
 const editData=await data();
 const edited={...pendingImport,date:$("#riDate").value,total:num($("#riTotal").value),discountTotal:num($("#riDiscount").value),items:pendingImport.items.map((it,i)=>{
   const next={...it,quantity:num(qs[i]?.value),unit:us[i]?.value||"un",unitPrice:num(ps[i]?.value),total:num(ls[i]?.value)};
   const selected=matches[i]?.value||"";
   if(selected){
     if(selected==="__NEW__"){next.matchedProductId="";next.matchedProductName="";next.matchStatus="NEW";next.matchConfidence=.75;next.needsReview=false;}
     else {const prod=(editData.products||[]).find(p=>String(p.id)===selected); if(prod){next.matchedProductId=prod.id;next.matchedProductName=prod.name;next.matchStatus="MANUAL";next.matchConfidence=1;next.needsReview=false;}}
   }
   const previous=pendingImport.items[i]||{}; const fe={...(it.fieldEvidence||{})};
   for(const f of ["name","quantity","unit","unitPrice","total"]){const a=previous[f],b=next[f];if(String(a??"")!==String(b??"")){fe[f]={...(fe[f]||{}),source:"manual",extractor:"manual-edit",confidence:1,observedValue:a};}}
   next.fieldEvidence=fe;
   return next;
 })};
 const originalDoc={market:{...(pendingImport.market||{})},marketName:pendingImport.marketName,date:pendingImport.date,time:pendingImport.time,total:pendingImport.total,discountTotal:pendingImport.discountTotal,paymentMethod:pendingImport.paymentMethod};
 const docEvidence={...(pendingImport.fieldEvidence||{})};
 for(const [f,newValue] of [["marketName",$("#riMarket").value.trim()],["cnpj",$("#riCnpj").value.trim()],["time",$("#riTime").value.trim()],["total",num($("#riTotal").value)],["discountTotal",num($("#riDiscount").value)]]){const oldValue=f==="marketName"?(pendingImport.market?.name||pendingImport.marketName||""):f==="cnpj"?(pendingImport.market?.cnpj||pendingImport.cnpj||""):originalDoc[f];if(String(oldValue??"")!==String(newValue??"")){docEvidence[f]={...(docEvidence[f]||{}),source:"manual",extractor:"manual-edit",confidence:1,observedValue:oldValue};}}
 edited.fieldEvidence=docEvidence;
 const d=editData,date=edited.date;if(!date)return toast("A data do documento é obrigatória.");
 const finalAudited=await auditAndContextualizeReceipt(edited); edited.items=finalAudited.items; edited.audit=finalAudited.audit; edited.catalogMatch=finalAudited.catalogMatch; const finalValidation=validateReceiptData(edited); if(!finalValidation.ok){setImportStatus("warn","Auditoria bloqueou o lançamento",finalValidation.message);toast("A auditoria não permitiu gravar esta compra.");return;}
 if(!selectedFile) selectedFile=new File([JSON.stringify({type:'fiscal-document',key:edited.nfceKey||'',createdAt:todayISO()})],`documento-fiscal-${edited.nfceKey||'sem-chave'}.json`,{type:'application/json'});
 const marketName=$("#riMarket").value.trim()||"Mercado não identificado",cnpj=canonicalCnpj($("#riCnpj").value);
 const docNo=edited.documentNumber||"";
 const fingerprint=await computePurchaseFingerprint({...edited,cnpj});
 const dup=d.purchases.find(x=>x.active!==false&&x.fingerprint&&x.fingerprint===fingerprint) ||
   d.purchases.find(x=>x.active!==false&&x.date===date&&String(x.time||'').slice(0,5)===String(edited.time||'').slice(0,5)&&num(x.total)===num(edited.total)&&((cnpj&&canonicalCnpj(x.cnpj)===cnpj)||(docNo&&x.documentNumber===docNo)));
 if(dup){
   const sameFiscal=edited.nfceKey&&String(dup.nfceKey||'').replace(/\D/g,'')===String(edited.nfceKey||'').replace(/\D/g,'');
   if(sameFiscal||edited.fiscalAutoLaunch){setImportStatus('warn','Compra já cadastrada',`A auditoria identificou o mesmo comprovante no histórico (${fmtDate(dup.date)} ${dup.time||''} · ${dup.marketName}). O JuRe bloqueou a duplicação.`);pendingImport=null;selectedFile=null;return;}
   if(!confirm(`A auditoria encontrou um comprovante muito semelhante já cadastrado em ${fmtDate(dup.date)} ${dup.time||''} no ${dup.marketName}.\n\nDeseja registrar novamente?`))return;
 }
 let market=d.markets.find(m=>m.cnpj&&cnpj&&canonicalCnpj(m.cnpj)===cnpj)||d.markets.find(m=>normalize(m.name)===normalize(marketName));
 if(!market){market={id:uid("market"),name:marketName,legalName:marketName,cnpj,address:"",city:"",state:"",createdAt:todayISO(),active:true};await put("markets",market)}
 const p={id:uid("purchase"),date,time:$("#riTime").value.trim(),marketId:market.id,marketName,cnpj,total:num(edited.total),itemCount:edited.items.length,discountTotal:num(edited.discountTotal),paymentMethod:edited.paymentMethod||"",documentNumber:edited.documentNumber||"",nfceKey:edited.nfceKey||"",sefazUrl:edited.sefazUrl||"",fingerprint,receiptReference:"",receiptName:selectedFile.name,source:"import",status:"audited",auditStatus:edited.audit?.status||"PASS",auditAt:edited.audit?.checkedAt||todayISO(),catalogMatch:edited.catalogMatch||null,auditEvidence:edited.audit?.evidence||null,auditTrace:edited.audit?.trace||null,createdAt:todayISO(),updatedAt:todayISO(),active:true};
 await putPurchase(p);const attachmentId=await saveAttachment(p.id,selectedFile);p.receiptReference=`attachment:${attachmentId}`;await putPurchase(p);
 const items=[];edited.items.forEach(it=>{const match=findExistingProduct(d.products,it);const product=match||{id:uid("prod"),barcode:it.barcode||"",name:cleanProductName(it.name),brand:it.brand||"",category:it.category||"Outros",pack:it.pack||guessPack(it.name),unit:it.unit||"un",health:"Não classificado",active:true,createdAt:todayISO(),updatedAt:todayISO()};items.push({id:uid("item"),purchaseId:p.id,productId:product.id,barcode:it.barcode||"",descriptionRaw:it.name,quantity:num(it.quantity),unit:it.unit||product.unit,pack:it.pack||product.pack,unitPrice:num(it.unitPrice),lineTotal:num(it.total),discount:num(it.discount),totalAfterDiscount:round2(num(it.total)-num(it.discount)),confidence:clamp(num(it.confidence)||.7),needsReview:!!it.needsReview,fieldEvidence:edited.audit?.evidence?.items?.[it.lineId]||it.fieldEvidence||null,purchaseDate:date,createdAt:todayISO(),updatedAt:todayISO()});if(!match)d.products.push(product)});
 await bulkPut("products",d.products.filter(x=>x.id));await bulkPut("purchaseItems",items);await audit(edited.fiscalAutoLaunch?"Compra lançada automaticamente a partir de NFC-e por QR.":"Nova compra importada após revisão.","purchase",p.id,"create");pendingImport=null;selectedFile=null;$("#receiptFile").value="";$("#saveImportRow").classList.add("hidden");$("#receiptEditor").className="editor empty";$("#receiptEditor").textContent="Compra salva. Os itens já podem aparecer nas próximas listas.";setImportStatus("success","Compra gravada","O comprovante original foi associado ao histórico e os dados conferidos foram registrados.");await renderAll();toast("Compra salva e adicionada ao histórico.");go("compras")
};
$("#cancelImportBtn").onclick=()=>{$("#saveImportRow").classList.add("hidden");$("#receiptEditor").className="editor empty";$("#receiptEditor").textContent="Os dados identificados aparecerão aqui.";pendingImport=null;selectedFile=null;setImportStatus("idle","Aguardando comprovante","Selecione uma imagem ou PDF para iniciar a leitura.")}

function cleanProductName(s){return String(s||"").replace(/\s+/g," ").trim()}
function guessPack(s){const m=String(s||"").match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un)\b/i);return m?m[1].replace(",",".")+" "+m[2].toUpperCase():""}
function findExistingProduct(products,it){
 if(window.ReceiptAuditor?.contextualProductMatch){const m=window.ReceiptAuditor.contextualProductMatch(it,products);return m&&m.score>=.74&&!m.ambiguous?m.product:null;}
 const barcode=String(it.barcode||'').replace(/\D/g,'');if(barcode){const x=products.find(p=>p.barcode&&String(p.barcode).replace(/\D/g,'')===barcode);if(x)return x}return null;
}

async function agentContext(){const d=await data();const active=d.purchases.filter(p=>p.active!==false),items=d.purchaseItems.filter(i=>active.some(p=>p.id===i.purchaseId));return {summary:{total:active.reduce((s,p)=>s+num(p.total),0),purchases:active.length,products:d.products.filter(p=>p.active!==false).length,markets:new Set(active.map(p=>p.marketId)).size},purchases:active.map(p=>({id:p.id,date:p.date,market:p.marketName,total:p.total,itemCount:p.itemCount})),products:d.products.filter(p=>p.active!==false).map(p=>({id:p.id,name:p.name,brand:p.brand,category:p.category,pack:p.pack,health:p.health})),recentItems:items.slice(-80).map(i=>{const p=d.products.find(x=>x.id===i.productId);return {date:i.purchaseDate||active.find(x=>x.id===i.purchaseId)?.date,product:p?.name,qty:i.quantity,unitPrice:i.unitPrice,total:i.totalAfterDiscount||i.lineTotal,market:active.find(x=>x.id===i.purchaseId)?.marketName}})}}
function localAgent(q){
 const d=CURRENT_DATA;const nq=normalize(q);const active=d.purchases.filter(p=>p.active!==false),items=d.purchaseItems.filter(i=>active.some(p=>p.id===i.purchaseId));
 if(/ultima compra|última compra|ultima ida/.test(nq)){const p=active.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];return p?`Sua compra mais recente foi em ${fmtDate(p.date)}, no ${p.marketName}, no valor de ${money(p.total)}.`:"Ainda não há compras."}
 if(/maior gasto|categoria/.test(nq)){const map={};for(const i of items){const p=d.products.find(x=>x.id===i.productId);map[p?.category||"Outros"]=(map[p?.category||"Outros"]||0)+num(i.totalAfterDiscount??i.lineTotal)}const x=Object.entries(map).sort((a,b)=>b[1]-a[1])[0];return x?`A categoria que mais concentra gasto no histórico é ${x[0]}, com ${money(x[1])}.`:"Ainda não há dados."}
 if(/mais de uma vez|recorrentes|repetid/.test(nq)){const counts={};for(const i of items)counts[i.productId]=(counts[i.productId]||0)+1;const xs=Object.entries(counts).filter(x=>x[1]>1).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,n])=>`${d.products.find(p=>p.id===id)?.name||"produto"} (${n} ocorrências)`);return xs.length?`Alguns itens que já aparecem repetidamente são: ${xs.join(", ")}.`:"Ainda não há itens recorrentes."}
 if(/como funciona a edição|editar compra|corrigir/.test(nq))return"Entre em Compras, abra a compra e use “Ver / editar”. A data da compra fica protegida; você corrige os demais campos e salva. A correção é registrada em auditoria."
 if(/melhor preço|onde .*preço|mercado/.test(nq))return"Com apenas uma compra ainda não dá para afirmar qual mercado é melhor. Assim que o mesmo produto aparecer em mais de um mercado, o histórico permitirá comparar preço médio, menor preço e variação."
 return"Consigo responder perguntas sobre suas compras, produtos, listas, consumo e o manual. Tente perguntar, por exemplo: “quanto gastei no Alvorada?” ou “como funciona a lista de compras?”.";
}
async function askAgent(q){
 CURRENT_DATA=await data();const s=CURRENT_DATA.settings,context=await agentContext();const system=`Você é o Agente JuRe. Fale em português cotidiano, claro e objetivo. Nunca invente dados. Não trate uma compra como consumo físico certo; trate como ritmo de aquisição. Não chame de perda aquilo que é apenas oportunidade. A data de uma compra é um fato histórico e não deve ser alterada por correção. Use apenas o contexto fornecido. Contexto JSON: ${JSON.stringify(context)}. Manual resumido: o app separa produto, ocorrência de compra e lista; produtos repetidos não são duplicados; correções não mudam a data; exclusões são arquivamentos.`;
 if(location.protocol!=='file:'&&location.hostname==='localhost'){
  const r=await fetchWithRetry('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,system,model:s.geminiModel||'gemini-3.7-flash'})},1,60000);if(!r.ok)throw new Error(`Proxy HTTP ${r.status}`);const j=await r.json();return j.text||'Não recebi uma resposta útil.';
 }
 return localAgent(q);
}
async function sendAgent(q){if(!q.trim())return;const box=$("#chatMessages");box.insertAdjacentHTML("beforeend",`<div class="msg user">${q.replace(/[<>&]/g,m=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[m]))}</div>`);$("#agentInput").value="";box.insertAdjacentHTML("beforeend",`<div class="msg bot" id="typing">Analisando…</div>`);box.scrollTop=box.scrollHeight;try{const a=await askAgent(q);$("#typing").remove();box.insertAdjacentHTML("beforeend",`<div class="msg bot">${a.replace(/\n/g,"<br>")}</div>`)}catch(e){$("#typing").textContent="Não consegui consultar o Gemini agora. A chave ou conexão pode estar indisponível.";}}
$("#agentSend").onclick=()=>sendAgent($("#agentInput").value);$("#agentInput").onkeydown=e=>{if(e.key==="Enter")sendAgent($("#agentInput").value)};$$(".quick button").forEach(b=>b.onclick=()=>sendAgent(b.dataset.q));

setupImport();
if(RUNNING_FROM_FILE){
 const h=$("#importHelper"); if(h) h.innerHTML=`<b>Modo arquivo local.</b> ${runtimeNote()}<br>O app pode exibir e armazenar dados locais, mas o navegador não permite alguns recursos web neste modo.`;
}
(async()=>{
  try{
    if(await clearStaleServiceWorkers()) return;
    await ensureDB();
    await renderAll();
  }catch(e){
    console.error(e);
    document.body.innerHTML=`<div style="padding:30px;font-family:system-ui"><h1>Compras da JuRe</h1><p>Não foi possível inicializar o banco local.</p><pre>${String(e)}</pre></div>`;
  }
})();
