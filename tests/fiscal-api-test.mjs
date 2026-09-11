import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';

const KEY='35260444823938000187551090000002691092067649';
const PDF=Buffer.from('%PDF-1.7\nJuRe fiscal test\n','utf8').toString('base64');
const XML=Buffer.from('<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe35260444823938000187551090000002691092067649"><ide><mod>55</mod><dhEmi>2026-09-10T07:37:19-03:00</dhEmi></ide><emit><CNPJ>17833301002223</CNPJ><xNome>Supermercados Alvorada</xNome></emit><det nItem="1"><prod><cProd>2707</cProd><cEAN>7891172523434</cEAN><xProd>Papel higienico Neve 12 rolos</xProd><qCom>2.0000</qCom><uCom>un</uCom><vUnCom>14.90</vUnCom><vProd>29.80</vProd><vDesc>2.00</vDesc></prod></det><det nItem="2"><prod><cProd>1</cProd><cEAN>7894900701517</cEAN><xProd>Refrigerante Coca-Cola 2L Zero</xProd><qCom>1.0000</qCom><uCom>un</uCom><vUnCom>10.49</vUnCom><vProd>10.49</vProd></prod></det><total><ICMSTot><vNF>38.29</vNF></ICMSTot></total></infNFe></NFe></nfeProc>','utf8').toString('base64');

let seen=[];
const upstream=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks).toString('utf8');
  seen.push({path:req.url,method:req.method,contentType:req.headers['content-type']||'',body});
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/v1/consulta'){
    const parsed=JSON.parse(body||'{}');
    if(!parsed.chave){res.writeHead(400);return res.end(JSON.stringify({error:'chave_obrigatoria',message:'campo chave ausente'}));}
    res.writeHead(200);return res.end(JSON.stringify({status:'ok',chave:parsed.chave,tipo:'nfe',pdf_base64:PDF,xml_base64:XML}));
  }
  if(req.url==='/api/v1/danfe'){
    assert.match(req.headers['content-type'],/^multipart\/form-data; boundary=/i);
    assert.match(body,/<ide>.*?<mod>55<\/mod>/s);
    res.writeHead(200);return res.end(JSON.stringify({status:'ok',chave:KEY,tipo:'nfe',pdf_base64:PDF,xml_base64:XML}));
  }
  res.writeHead(404);res.end(JSON.stringify({error:'nao_encontrado'}));
});
await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const upPort=upstream.address().port;
const appPort=upPort+1;
const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(appPort),CONSULTADANFE_API_URL:`http://127.0.0.1:${upPort}/api/v1/consulta`,CONSULTADANFE_API_KEY:'',CONSULTADANFE_REQUEST_FIELD:'chave',CONSULTADANFE_AUTH_HEADER:'Authorization',CONSULTADANFE_AUTH_PREFIX:'',GEMINI_API_KEY:'',OCR_SPACE_API_KEY:''},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
try{
  let ready=false;for(let i=0;i<50&&!ready;i++){try{const r=await fetch(`http://127.0.0.1:${appPort}/api/status`);ready=r.ok}catch{} if(!ready)await new Promise(r=>setTimeout(r,50));}
  assert.ok(ready,`servidor JuRe não iniciou: ${log}`);

  let r=await fetch(`http://127.0.0.1:${appPort}/api/fiscal/consult`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:KEY})});
  let j=await r.json();
  assert.equal(r.status,200);assert.equal(j.ok,true);assert.equal(j.route,'consulta');assert.equal(j.data.documentType,'nfe');assert.equal(j.data.pdf,PDF);assert.equal(j.data.xml,XML);assert.equal(j.upstream.pdf_base64,PDF);assert.equal(j.data.market.name,'Supermercados Alvorada');assert.equal(j.data.market.cnpj,'17833301002223');assert.equal(j.data.total,38.29);assert.equal(j.data.items.length,2);assert.equal(j.data.items[0].name,'Papel higienico Neve 12 rolos');assert.equal(j.data.items[0].unitPrice,14.9);
  assert.equal(seen[0].path,'/api/v1/consulta');assert.equal(JSON.parse(seen[0].body).chave,KEY);assert.equal(JSON.parse(seen[0].body).accessKey,undefined);

  const xml=Buffer.from('<?xml version="1.0"?><NFe><infNFe><ide><mod>55</mod></ide></infNFe></NFe>','utf8').toString('base64');
  r=await fetch(`http://127.0.0.1:${appPort}/api/fiscal/danfe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'nota.xml',mimeType:'application/xml',data:xml})});
  j=await r.json();
  assert.equal(r.status,200);assert.equal(j.ok,true);assert.equal(j.route,'danfe');assert.equal(j.data.pdf,PDF);assert.equal(j.data.xml,XML);assert.equal(j.data.fiscalKey,KEY);assert.equal(j.data.items.length,2);assert.equal(j.data.items[1].barcode,'7894900701517');
  assert.equal(seen[1].path,'/api/v1/danfe');

  r=await fetch(`http://127.0.0.1:${appPort}/api/fiscal/consult`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'123'})});
  j=await r.json();assert.equal(r.status,400);assert.equal(j.code,'dv_invalido');

  r=await fetch(`http://127.0.0.1:${appPort}/api/fiscal/danfe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'nota.txt',mimeType:'text/plain',data:Buffer.from('nao xml').toString('base64')})});
  j=await r.json();assert.equal(r.status,400);assert.equal(j.code,'xml_invalido');

  console.log('Fiscal API integration: PASS (consulta por chave + /danfe por XML + validações)');
}finally{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,100));upstream.close();}
