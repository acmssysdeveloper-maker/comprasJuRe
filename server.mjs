import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));

// Carrega .env localmente sem depender de pacote externo. Variáveis do ambiente
// de execução têm precedência sobre o arquivo.
function loadDotEnv(file){
  try{
    const txt=fs.readFileSync(file,'utf8');
    for(const raw of txt.split(/\r?\n/)){
      const line=raw.trim();
      if(!line||line.startsWith('#')) continue;
      const i=line.indexOf('='); if(i<1) continue;
      const key=line.slice(0,i).trim(), value=line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2');
      if(key&&!Object.prototype.hasOwnProperty.call(process.env,key)) process.env[key]=value;
    }
  }catch{}
}
loadDotEnv(path.join(ROOT,'.env'));

const PORT=Number(process.env.PORT||8000);
const KEY=process.env.GEMINI_API_KEY||'';
const MODEL=process.env.GEMINI_MODEL||'gemini-3.7-flash';
const OCR_KEY=process.env.OCR_SPACE_API_KEY||'';
const DANFE_URL=process.env.CONSULTADANFE_API_URL||'';
const DANFE_KEY=process.env.CONSULTADANFE_API_KEY||'';
const DANFE_FIELD=process.env.CONSULTADANFE_REQUEST_FIELD||'chave';
const DANFE_AUTH_HEADER=process.env.CONSULTADANFE_AUTH_HEADER||'Authorization';
const DANFE_AUTH_PREFIX=process.env.CONSULTADANFE_AUTH_PREFIX ?? '';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
function headers(type='application/json'){return {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'}}
function send(res,status,body,type='application/json'){res.writeHead(status,headers(type));res.end(typeof body==='string'?body:JSON.stringify(body));}
async function readBody(req,max=18_000_000){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>max)throw new Error('Payload muito grande');chunks.push(c)}return Buffer.concat(chunks).toString('utf8')}
function validModel(model){return typeof model==='string'&&/^gemini-[a-z0-9.-]{3,60}$/i.test(model)?model:MODEL}
async function geminiRequest(payload){
 if(!KEY)throw Object.assign(new Error('GEMINI_API_KEY não configurada no servidor local.'),{statusCode:503});
 const model=validModel(payload.model);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.body),signal:controller.signal});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j?.error?.message||`Gemini HTTP ${r.status}`),{statusCode:r.status>=500?502:r.status});
  return j;
 }finally{clearTimeout(timer)}
}
async function proxyChat(req,res){
 let payload;try{payload=JSON.parse(await readBody(req))}catch{return send(res,400,{error:'JSON inválido'});}
 if(!payload?.question)return send(res,400,{error:'Pergunta não informada'});
 try{const j=await geminiRequest({model:payload.model,body:{systemInstruction:{parts:[{text:String(payload.system||'')} ]},contents:[{parts:[{text:String(payload.question)}]}]}});const text=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';send(res,200,{text})}
 catch(e){send(res,e.statusCode||504,{error:e?.name==='AbortError'?'Tempo limite excedido no agente.':String(e?.message||e)})}
}
function cleanJsonText(txt){return String(txt||'').replace(/^```json/i,'').replace(/```$/,'').trim()}
async function proxyVision(req,res){
 let payload;try{payload=JSON.parse(await readBody(req))}catch{return send(res,400,{error:'JSON inválido'});}
 if(!payload?.data||!payload?.mimeType)return send(res,400,{error:'Imagem não informada'});
 if(!/^image\/(jpeg|jpg|png|webp)$/i.test(String(payload.mimeType)))return send(res,415,{error:'Tipo de imagem não suportado'});
 try{
  const body={contents:[{parts:[{text:String(payload.prompt||'')},{inline_data:{mime_type:String(payload.mimeType),data:String(payload.data)}}]}],generationConfig:{responseMimeType:'application/json'}};
  const j=await geminiRequest({model:payload.model,body});
  const txt=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';let data;try{data=JSON.parse(cleanJsonText(txt))}catch{return send(res,502,{error:'Gemini retornou conteúdo que não é JSON válido'});}
  send(res,200,{data});
 }catch(e){send(res,e.statusCode||504,{error:e?.name==='AbortError'?'Tempo limite excedido no serviço de visão.':String(e?.message||e)})}
}

function cleanAccessKey(v){return String(v||'').replace(/\D/g,'');}
function fiscalCheckDigit(key){const x=cleanAccessKey(key);if(x.length!==44)return false;let sum=0,w=2;for(let i=42;i>=0;i--){sum+=Number(x[i])*w;w=w===9?2:w+1}const d=11-(sum%11);return(d>=10?0:d)===Number(x[43]);}
function danfeHeaders(){const h={'Accept':'application/json'};if(DANFE_KEY){h[DANFE_AUTH_HEADER]=DANFE_AUTH_PREFIX?`${DANFE_AUTH_PREFIX} ${DANFE_KEY}`:DANFE_KEY}return h;}
function findDeep(obj, keys){const wanted=new Set(keys.map(k=>String(k).toLowerCase()));let hit;const walk=(v)=>{if(hit!==undefined)return;if(v&&typeof v==='object'){for(const [k,val] of Object.entries(v)){if(wanted.has(k.toLowerCase())&&val!=null&&val!==''){hit=val;return}walk(val)}}};walk(obj);return hit;}
function normalizeFiscalResponse(j,key){
 const root=j?.data||j?.result||j?.invoice||j?.document||j;
 const marketName=findDeep(root,['name','issuerName','razaoSocial','nome','emitente','xNome'])||'';
 const cnpj=String(findDeep(root,['cnpj','issuerCnpj','emitenteCnpj','CNPJ'])||'').replace(/\D/g,'');
 const rawDate=String(findDeep(root,['date','issueDate','dataEmissao','dhEmi'])||'');
 const date=rawDate.slice(0,10);
 const time=rawDate.includes('T')?rawDate.slice(11,19):String(findDeep(root,['time','hora'])||'').slice(0,8);
 const total=Number(findDeep(root,['total','grandTotal','valorTotal','vNF','invoiceTotal','amount'])||0)||0;
 const itemsRaw=findDeep(root,['items','products','itens','det'])||[];
 const arr=Array.isArray(itemsRaw)?itemsRaw:(itemsRaw&&typeof itemsRaw==='object'?[itemsRaw]:[]);
 const items=arr.map(i=>({barcode:String(i.barcode||i.ean||i.cEAN||i.codigo||i.cProd||'').replace(/\D/g,''),name:String(i.name||i.description||i.xProd||i.produto||''),quantity:Number(i.quantity??i.qty??i.qCom??i.qtd??0)||0,unit:String(i.unit||i.uCom||i.unidade||'un'),unitPrice:Number(i.unitPrice??i.vUnCom??i.precoUnitario??0)||0,total:Number(i.total??i.vProd??i.valor??i.lineTotal??0)||0,discount:Number(i.discount??i.vDesc??i.desconto??0)||0,confidence:1,needsReview:false})).filter(i=>i.name||i.total);
 // Official contract names: pdf_base64 and xml_base64 in /consulta. Preserve legacy aliases too.
 const pdf=findDeep(j,['pdf_base64','pdfBase64','pdf','danfePdf']);
 const xml=findDeep(j,['xml_base64','xmlBase64','xml']);
 const status=String(j?.status||'');
 const tipo=String(j?.tipo||'');
 return {source:'consultadanfe',nfceKey:key,fiscalKey:key,documentType:tipo,market:{name:marketName,cnpj},date,time,total,items,pdf:typeof pdf==='string'?pdf:'',xml:typeof xml==='string'?xml:'',status,raw:j};
}
function decodeXmlEntities(s){return String(s||'').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));}
function xmlTag(xml,tag,from=0){const re=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i');re.lastIndex=from;const m=re.exec(xml.slice(from));return m?decodeXmlEntities(m[1].trim()):'';}
function parseNfeXml(xml){
 const text=String(xml||'').replace(/\r/g,'');if(!text)return null;
 const tag=(name,scope=text)=>xmlTag(scope,name);
 const emit=tag('emit');const ide=tag('ide');const tot=tag('ICMSTot');
 const dhEmi=tag('dhEmi',ide),dEmi=tag('dEmi',ide),hEmi=tag('hEmi',ide);
 const dets=[...text.matchAll(/<det(?:\s[^>]*)?>([\s\S]*?)<\/det>/gi)].map(m=>m[1]);
 const items=dets.map(d=>{const prod=tag('prod',d)||d;return {barcode:String(tag('cEAN',prod)||tag('cBarra',prod)||'').replace(/\D/g,''),name:tag('xProd',prod),quantity:Number(String(tag('qCom',prod)||'').replace(',','.'))||0,unit:tag('uCom',prod)||'un',unitPrice:Number(String(tag('vUnCom',prod)||'').replace(',','.'))||0,total:Number(String(tag('vProd',prod)||'').replace(',','.'))||0,discount:Number(String(tag('vDesc',prod)||'').replace(',','.'))||0,confidence:1,needsReview:false,source:'xml'} }).filter(i=>i.name||i.total);
 const cnpj=String(tag('CNPJ',emit)).replace(/\D/g,'');
 const name=tag('xNome',emit)||tag('xFant',emit);
 const dateRaw=dhEmi||dEmi;const date=dateRaw.slice(0,10);const time=dhEmi?dhEmi.slice(11,19):hEmi;
 const total=Number(String(tag('vNF',tot)||'').replace(',','.'))||0;
 return {market:{name,cnpj},date,time,total,items};
}
function enrichFromXml(normalized,xml){
 const parsed=parseNfeXml(xml);if(!parsed)return normalized;
 return {...normalized,market:{...(normalized.market||{}),...(parsed.market||{})},date:parsed.date||normalized.date,time:parsed.time||normalized.time,total:parsed.total||normalized.total,items:parsed.items?.length?parsed.items:normalized.items};
}

function upstreamError(j,status){
 const code=String(j?.error||j?.code||'').trim();
 const message=String(j?.message||j?.error_description||code||`Consulta DANFE HTTP ${status}`).trim();
 return {ok:false,status,code,message};
}
async function fetchDanfeKey(key){
 if(!DANFE_URL)throw Object.assign(new Error('CONSULTADANFE_API_URL não configurada.'),{statusCode:503});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const body=JSON.stringify({[DANFE_FIELD]:key});
  const r=await fetch(DANFE_URL,{method:'POST',headers:danfeHeaders(),body,signal:controller.signal});
  const text=await r.text(); let j;try{j=JSON.parse(text)}catch{j={raw:text}};
  return {r,j};
 }finally{clearTimeout(timer)}
}
function multipartFormForXml(xmlBuffer,filename='nota.xml',type='application/xml'){
 const form=new FormData();
 form.append('xml',new Blob([xmlBuffer],{type}),filename);
 return form;
}
async function fetchDanfeXml(xmlBuffer,filename,type){
 if(!DANFE_URL)throw Object.assign(new Error('CONSULTADANFE_API_URL não configurada.'),{statusCode:503});
 const base=DANFE_URL.replace(/\/+$/,'');
 const danfeUrl=base.replace(/\/consulta$/i,'/danfe');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const form=multipartFormForXml(xmlBuffer,filename,type);
  const r=await fetch(danfeUrl,{method:'POST',headers:danfeHeaders(),body:form,signal:controller.signal});
  const text=await r.text(); let j;try{j=JSON.parse(text)}catch{j={raw:text}};
  return {r,j,endpoint:danfeUrl};
 }finally{clearTimeout(timer)}
}
async function proxyDanfeConsult(req,res){
 let payload;try{payload=JSON.parse(await readBody(req,2_000_000))}catch{return send(res,400,{ok:false,error:'JSON inválido'});}
 const key=cleanAccessKey(payload?.key);
 if(key.length!==44||!fiscalCheckDigit(key))return send(res,400,{ok:false,error:'Chave fiscal inválida: são necessários 44 dígitos com dígito verificador válido.',code:'dv_invalido'});
 if(!DANFE_URL)return send(res,503,{ok:false,configured:false,error:'CONSULTADANFE_API_URL não configurada.'});
 try{
  const {r,j}=await fetchDanfeKey(key);
  if(!r.ok){const e=upstreamError(j,r.status);return send(res,r.status,{...e,configured:true,upstream:j,headers:{errorCode:r.headers.get('x-error-code')||'',retryAfter:r.headers.get('retry-after')||''}})}
  let normalized=normalizeFiscalResponse(j,key);
  let xmlForParse=normalized.xml;
  if(xmlForParse&&!xmlForParse.trim().startsWith('<')){try{xmlForParse=Buffer.from(xmlForParse.replace(/\s+/g,''),'base64').toString('utf8')}catch{}}
  normalized=enrichFromXml(normalized,xmlForParse);
  return send(res,200,{ok:true,configured:true,data:normalized,upstream:j,route:'consulta',headers:{rateLimit:r.headers.get('x-ratelimit-limit')||'',remaining:r.headers.get('x-ratelimit-remaining')||''}});
 }catch(e){return send(res,e?.statusCode||504,{ok:false,configured:true,error:e?.name==='AbortError'?'Tempo limite na Consulta DANFE.':String(e?.message||e),code:e?.name==='AbortError'?'timeout':'network_error'})}
}
async function proxyDanfeXml(req,res){
 let payload;try{payload=JSON.parse(await readBody(req,9_000_000))}catch{return send(res,400,{ok:false,error:'JSON inválido'});}
 const filename=String(payload?.filename||'nota.xml').replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,120)||'nota.xml';
 const mime=String(payload?.mimeType||'application/xml');
 const raw=String(payload?.data||'').replace(/^data:[^,]+,/, '').replace(/\s+/g,'');
 if(!raw)return send(res,400,{ok:false,error:'XML não informado.'});
 let xmlBuffer;try{xmlBuffer=Buffer.from(raw,'base64')}catch{return send(res,400,{ok:false,error:'XML base64 inválido.'});}
 if(!xmlBuffer.length)return send(res,400,{ok:false,error:'XML vazio.'});
 if(xmlBuffer.length>5*1024*1024)return send(res,413,{ok:false,error:'XML excede 5 MB.',code:'arquivo_muito_grande'});
 if(!/^<\?xml|<\s*[^!]/.test(xmlBuffer.toString('utf8').trimStart()))return send(res,400,{ok:false,error:'O arquivo enviado não parece ser XML válido.',code:'xml_invalido'});
 try{
  const {r,j,endpoint}=await fetchDanfeXml(xmlBuffer,filename,mime);
  if(!r.ok){const e=upstreamError(j,r.status);return send(res,r.status,{...e,configured:true,upstream:j,route:'danfe',endpoint,headers:{errorCode:r.headers.get('x-error-code')||'',retryAfter:r.headers.get('retry-after')||''}})}
  const key=String(j?.chave||'').replace(/\D/g,'');
  let normalized=normalizeFiscalResponse(j,key);
  let xmlForParse=normalized.xml;
  if(xmlForParse&&!xmlForParse.trim().startsWith('<')){try{xmlForParse=Buffer.from(xmlForParse.replace(/\s+/g,''),'base64').toString('utf8')}catch{}}
  normalized=enrichFromXml(normalized,xmlForParse);
  return send(res,200,{ok:true,configured:true,data:normalized,upstream:j,route:'danfe',endpoint,headers:{rateLimit:r.headers.get('x-ratelimit-limit')||'',remaining:r.headers.get('x-ratelimit-remaining')||''}});
 }catch(e){return send(res,e?.statusCode||504,{ok:false,configured:true,error:e?.name==='AbortError'?'Tempo limite na Consulta DANFE por XML.':String(e?.message||e),code:e?.name==='AbortError'?'timeout':'network_error'})}
}

async function proxyOcrSpace(req,res){
 if(!OCR_KEY)return send(res,503,{error:'OCR_SPACE_API_KEY não configurada no servidor local.'});
 let payload;try{payload=JSON.parse(await readBody(req))}catch{return send(res,400,{error:'JSON inválido'});}
 if(!payload?.data||!payload?.mimeType)return send(res,400,{error:'Imagem não informada'});
 try{
  const form=new FormData();form.append('base64Image',`data:${payload.mimeType};base64,${payload.data}`);form.append('language','por');form.append('scale','true');form.append('OCREngine','2');form.append('isTable','true');form.append('apikey',OCR_KEY);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{const r=await fetch('https://api.ocr.space/parse/image',{method:'POST',body:form,signal:controller.signal});const j=await r.json().catch(()=>({}));if(!r.ok)return send(res,r.status,{error:j?.ErrorMessage?.[0]||`OCR.space HTTP ${r.status}`});const text=j?.ParsedResults?.map(x=>x.ParsedText||'').join('\n')||'';if(!text)return send(res,502,{error:j?.ErrorMessage?.[0]||'OCR secundário retornou vazio'});return send(res,200,{text,confidence:.65});}
  finally{clearTimeout(timer)}
 }catch(e){send(res,504,{error:e?.name==='AbortError'?'Tempo limite excedido no OCR secundário.':String(e?.message||e)})}
}


function isPrivateHost(host){
 const h=String(host||'').toLowerCase().replace(/\.$/,'');
 if(h==='localhost'||h==='127.0.0.1'||h==='::1')return true;
 if(/^(10\.|127\.|169\.254\.|192\.168\.)/.test(h))return true;
 const m=h.match(/^172\.(\d+)\./); if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
 return false;
}
function allowedFiscalQrUrl(value){
 try{
  const u=new URL(String(value||''));
  if(u.protocol!=='https:')return null;
  if(isPrivateHost(u.hostname))return null;
  const host=u.hostname.toLowerCase();
  const allowed=/((^|\.)fazenda\.rj\.gov\.br$)|((^|\.)sefaz\.br$)|((^|\.)sefaz\.gov\.br$)|(^|\.)gov\.br$|(^|\.)sefazvirtual\.rs\.gov\.br$|(^|\.)svrs\.rs\.gov\.br$/i.test(host);
  if(!allowed)return null;
  return u;
 }catch{return null}
}
function parseMoneyLoose(s){const v=String(s??'').replace(/[^0-9,.-]/g,'').trim();if(!v)return 0;const x=v.includes(',')?v.replace(/\./g,'').replace(',','.'):v;const n=Number(x);return Number.isFinite(n)?n:0}
function parseDateLoose(s){const x=String(s||'');let m=x.match(/(\d{2})[\/-](\d{2})[\/-](\d{2,4})/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2]}-${m[1]}`;}m=x.match(/(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''}
function htmlToText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim()}
function parseNfcePublicHtml(html,key){
 const text=htmlToText(html);
 const result={key,documentType:'nfce',market:{name:'',cnpj:''},date:'',time:'',total:0,discountTotal:0,paymentMethod:'',documentNumber:'',items:[],publicUrl:''};
 const cnpj=text.match(/\bCNPJ\D{0,30}(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i); if(cnpj)result.market.cnpj=cnpj[1].replace(/\D/g,'');
 const name=text.match(/(?:Raz[aã]o Social|Nome\/Raz[aã]o Social|Emitente|Estabelecimento)\D{0,5}([A-ZÀ-Ú0-9][^|]{3,100}?)(?=\s+(?:CNPJ|CPF|Endere[cç]o|Data|Valor|Total)\b)/i); if(name)result.market.name=name[1].trim();
 const dt=text.match(/(?:Data(?: de emiss[aã]o)?|Emiss[aã]o)\D{0,12}(\d{2}[\/-]\d{2}[\/-]\d{2,4})/i); if(dt)result.date=parseDateLoose(dt[1]);
 const tm=text.match(/(?:Hora|Hor[aá]rio)\D{0,8}(\d{2}:\d{2}(?::\d{2})?)/i); if(tm)result.time=tm[1];
 const total=text.match(/(?:Valor\s+a\s+pagar|Valor\s+total|Total\s+da\s+nota|Total)\D{0,12}(R\$\s*)?([\d\.]+,\d{2})/i); if(total)result.total=parseMoneyLoose(total[2]);
 const disc=text.match(/(?:Desconto|Descontos)\D{0,12}(R\$\s*)?([\d\.]+,\d{2})/i); if(disc)result.discountTotal=parseMoneyLoose(disc[2]);
 const doc=text.match(/(?:NFC-e|Nota Fiscal de Consumidor).{0,80}?(?:N[ºo°]?|Número|Numero|n[uú]mero)\D{0,8}(\d{1,12})/i); if(doc)result.documentNumber=doc[1];
 const pay=text.match(/(?:Forma de pagamento|Pagamento|Meio de pagamento)\D{0,20}([A-Za-zÀ-Ú ]{3,40})/i); if(pay)result.paymentMethod=pay[1].trim();
 // Generic item-row recovery. We only accept lines with product-like text and at least one money value.
 const normalizedLines=String(text).split(/(?=\b\d{4,14}\b\s+)/).map(x=>x.trim()).filter(Boolean);
 for(const line of normalizedLines){
   const code=line.match(/\b(\d{4,14})\b/); const prices=[...line.matchAll(/(\d+[\.,]\d{2})/g)].map(m=>parseMoneyLoose(m[1]));
   if(!code||prices.length<1)continue;
   const namePart=line.replace(code[0],'').replace(/\b(?:R\$|C[oó]digo|Qtde?|Quantidade|UN|KG)\b/ig,' ').trim();
   if(namePart.length<2||/^(CNPJ|CPF|TOTAL|DESCONTO|PAGAMENTO|EMISS)/i.test(namePart))continue;
   const totalLine=prices[prices.length-1]; const unit=prices.length>1?prices[prices.length-2]:totalLine;
   const qm=line.match(/(?:\b|\s)(\d+[\.,]?\d*)\s*(kg|un|lt?|l|ml)\b/i);
   result.items.push({barcode:code[1],name:namePart.slice(0,120),quantity:qm?parseFloat(qm[1].replace(',','.')):1,unit:qm?qm[2].toLowerCase():'un',unitPrice:unit,total:totalLine,discount:0,confidence:.78,needsReview:true,source:'nfce-public'});
   if(result.items.length>=200)break;
 }
 // Deduplicate by barcode/name+total.
 const seen=new Set(); result.items=result.items.filter(i=>{const k=`${i.barcode}|${i.name}|${i.total.toFixed(2)}`;if(seen.has(k))return false;seen.add(k);return true});
 return result;
}
async function proxyNfceQr(req,res){
 let payload;try{payload=JSON.parse(await readBody(req,2_000_000))}catch{return send(res,400,{ok:false,error:'JSON inválido'});}
 const rawUrl=String(payload?.url||'').trim();
 const key=cleanAccessKey(payload?.key||'');
 if(key.length===44&&!fiscalCheckDigit(key))return send(res,400,{ok:false,error:'Chave NFC-e inválida.',code:'dv_invalido'});
 const u=allowedFiscalQrUrl(rawUrl);
 if(!u)return send(res,400,{ok:false,error:'A URL do QR não é uma consulta fiscal pública permitida ou não usa HTTPS.',code:'qr_url_nao_permitida'});
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let r;try{r=await fetch(u,{method:'GET',redirect:'follow',headers:{'Accept':'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36'},signal:controller.signal});}finally{clearTimeout(timer)}
  const html=await r.text();
  const finalUrl=r.url||u.toString();
  if(!r.ok)return send(res,r.status,{ok:false,configured:true,error:`Consulta pública NFC-e HTTP ${r.status}`,code:'nfce_public_http',publicUrl:finalUrl});
  const parsed=parseNfcePublicHtml(html,key);
  parsed.publicUrl=finalUrl;
  // Conservative: if the public page did not yield product lines, return the public URL so the client can offer the official view rather than invent.
  return send(res,200,{ok:true,configured:true,data:parsed,route:'nfce-qr',upstream:{status:'ok',tipo:'nfce',chave:key,public_url:finalUrl,items_count:parsed.items.length},publicUrl:finalUrl,structured:parsed.items.length>0});
 }catch(e){return send(res,e?.name==='AbortError'?504:502,{ok:false,configured:true,error:e?.name==='AbortError'?'Tempo limite na consulta pública da NFC-e.':String(e?.message||e),code:e?.name==='AbortError'?'timeout':'network_error',publicUrl:u.toString()});}
}

function safePath(urlPath){const rel=decodeURIComponent(urlPath||'').replace(/^\/+/, '')||'index.html';const full=path.resolve(ROOT,rel);if(!full.startsWith(path.resolve(ROOT)+path.sep))return null;return full}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,`http://${req.headers.host}`);
  if(req.method==='GET'&&u.pathname==='/api/status')return send(res,200,{ok:true,version:'2.8.0',gemini:!!KEY,ocrSpace:!!OCR_KEY,consultadanfe:!!DANFE_URL,model:MODEL});
  if(req.method==='POST'&&u.pathname==='/api/fiscal/consult')return proxyDanfeConsult(req,res);
  if(req.method==='POST'&&u.pathname==='/api/fiscal/danfe')return proxyDanfeXml(req,res);
  if(req.method==='POST'&&u.pathname==='/api/fiscal/nfce-qr')return proxyNfceQr(req,res);
  if(req.method==='POST'&&u.pathname==='/api/vision')return proxyVision(req,res);
  if(req.method==='POST'&&u.pathname==='/api/chat')return proxyChat(req,res);
  if(req.method==='POST'&&u.pathname==='/api/ocr-space')return proxyOcrSpace(req,res);
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Método não permitido'});
  const full=safePath(u.pathname);if(!full)return send(res,403,{error:'Acesso negado'});
  let target=full;try{if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');const data=fs.readFileSync(target);res.writeHead(200,headers(MIME[path.extname(target).toLowerCase()]||'application/octet-stream'));res.end(data)}catch{send(res,404,{error:'Não encontrado'})}
 }catch(e){send(res,500,{error:'Erro interno do servidor local'})}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Compras da JuRe 2.8.0 — http://localhost:${PORT} — Gemini ${KEY?'ATIVO':'sem chave'} — OCR.space ${OCR_KEY?'ATIVO':'sem chave'} — Consulta DANFE ${DANFE_URL?'ATIVA':'sem URL'}`));
