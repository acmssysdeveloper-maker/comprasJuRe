/* Receipt Auditor 1.0 — contextual matching + financial reconciliation + duplicate protection. */
(function(global){
  'use strict';
  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:0;let s=String(v??'').trim().replace(/R\$\s*/ig,'').replace(/\s/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.')){const last=Math.max(s.lastIndexOf(','),s.lastIndexOf('.'));return Number(s.slice(0,last).replace(/[.,]/g,'')+'.'+s.slice(last+1))||0;}if(s.includes(','))return Number(s.replace(/\./g,'').replace(',','.'))||0;if((s.match(/\./g)||[]).length===1)return Number(s)||0;return Number(s.replace(/\./g,''))||0;};
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' e ').replace(/\bc\/\s*(?=\d)/g,' c ').replace(/p\s*\/\s*/g,' para ').replace(/\bqtd(?:e)?\.?\b/g,' quantidade ').replace(/\bqtde\.?\b/g,' quantidade ').replace(/\bvl\.?\b/g,' valor ').replace(/\bref\.?\b/g,' refrigerante ').replace(/\brefr\.?\b/g,' refrigerante ').replace(/\bcerv\.?\b/g,' cerveja ').replace(/\bado[cç]ante\b/g,' adocante ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const STOP=new Set('de da do das dos e em para com por c unidade un und vl total valor codigo cod item produto mercadoria supermercado mercado ltda sa rua avenida'.split(' '));
  const synonymMap={refrigerante:['refrigerante','refr','refri','refresco'],cerveja:['cerveja','cerv','beer'],zero:['zero'],light:['light'],integral:['integral'],desnatado:['desnatado'],sacarina:['sacarina'],adoçante:['adocante'],alimento:['alimento'],biodegradavel:['biodegradavel','biodegrad'],pacote:['pcte','pct','pacote'],unidade:['un','und','unid','unidade'],litro:['l'],mililitro:['ml'],quilograma:['kg'],grama:['g']};
  const canonicalTokens=s=>{const n=normalize(s);let toks=n.split(' ').filter(Boolean).filter(t=>!STOP.has(t));for(let i=0;i<toks.length;i++){for(const [canon,alts] of Object.entries(synonymMap)){if(alts.includes(toks[i]))toks[i]=canon;}}return toks;};
  const jaccard=(a,b)=>{const A=new Set(canonicalTokens(a)),B=new Set(canonicalTokens(b));if(!A.size||!B.size)return 0;const inter=[...A].filter(x=>B.has(x)).length,uni=new Set([...A,...B]).size;return inter/uni;};
  const levenshtein=(a,b)=>{a=String(a);b=String(b);const dp=Array(b.length+1).fill(0);for(let j=0;j<=b.length;j++)dp[j]=j;for(let i=1;i<=a.length;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=b.length;j++){const temp=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=temp;}}return dp[b.length];};
  const editSimilarity=(a,b)=>{const A=normalize(a),B=normalize(b);if(!A||!B)return 0;const d=levenshtein(A,B);return 1-d/Math.max(A.length,B.length);};
  const parsePack=name=>{const s=String(name||'');const m=s.match(/(?:c\/?\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|und|unid|unidades|rolos|latas|garrafas)\b/i);return m?`${m[1].replace(',','.')} ${m[2].toUpperCase()}`:''};
  const inferUnit=(raw,pack)=>{const s=String(raw||'').toLowerCase();if(/\bkg\b/.test(s)||/^kg$/i.test(pack))return'kg';if(/\bml\b/.test(s))return'ml';if(/\bl\b/.test(s))return'l';if(/\bg\b/.test(s))return'g';return'un';};
  function contextualProductMatch(item,products){
    const barcode=String(item.barcode||'').replace(/\D/g,'');
    if(barcode){const exact=(products||[]).find(p=>String(p.barcode||'').replace(/\D/g,'')===barcode);if(exact)return{product:exact,score:1,method:'barcode-exact',reasons:['EAN/código exato']};}
    let best=null;
    for(const p of products||[]){
      const names=[p.name,...(Array.isArray(p.aliases)?p.aliases:[])].filter(Boolean);
      const bn=normalize(item.name),brand=normalize(item.brand),pbrand=normalize(p.brand),pack=normalize(item.pack||parsePack(item.name)),ppack=normalize(p.pack||parsePack(p.name));
      const nameScores=names.map(n=>({n,token:jaccard(bn,n),edit:editSimilarity(bn,n)}));
      const bestName=nameScores.sort((a,b)=>Math.max(b.token,b.edit)-Math.max(a.token,a.edit))[0]||{token:0,edit:0};
      const token=bestName.token,edit=bestName.edit;
      let score=0,reasons=[];
      if(token>=.75){score+=.48;reasons.push('tokens do nome/histórico');} else if(token>=.5){score+=.34;reasons.push('tokens parciais/histórico');} else if(edit>=.82){score+=.28;reasons.push('semelhança textual/histórico');}
      if(brand&&pbrand&&brand===pbrand){score+=.18;reasons.push('marca');}
      else if(brand&&pbrand&&jaccard(brand,pbrand)>=.7){score+=.10;reasons.push('marca aproximada');}
      if(pack&&ppack&&(pack===ppack||jaccard(pack,ppack)>=.7)){score+=.16;reasons.push('embalagem');}
      if(item.unit&&p.unit&&String(item.unit).toLowerCase()===String(p.unit).toLowerCase()){score+=.08;reasons.push('unidade');}
      if(item.category&&p.category&&normalize(item.category)===normalize(p.category)){score+=.05;reasons.push('categoria');}
      if(!best||score>best.score)best={product:p,score,reasons,method:'contextual'};
    }
    if(!best)return null;
    const threshold=best.score>=.86?.86:best.score>=.74?.74:1;
    return best.score>=threshold?best:{...best,ambiguous:true};
  }
  function auditReceipt(receipt,history=[]){
    const r=receipt||{},items=Array.isArray(r.items)?r.items:[],issues=[],warnings=[],itemAudits=[];
    const total=num(r.total),discountTotal=num(r.discountTotal);
    for(let i=0;i<items.length;i++){
      const it=items[i]||{},q=num(it.quantity),u=num(it.unitPrice),line=num(it.total),disc=num(it.discount);
      const expected=round2(q*u),delta=round2(expected-line);
      const net=round2(line-disc);
      const ia={index:i+1,name:it.name||'',barcode:String(it.barcode||'').replace(/\D/g,''),quantity:q,unitPrice:u,lineTotal:line,discount:disc,expectedLineTotal:expected,delta,netTotal:net,checks:{quantityPositive:q>0,unitPricePositive:u>0,lineTotalPositive:line>=0,mathOk:Math.abs(delta)<=0.03,discountOk:disc>=0&&disc<=line},status:'ok'};
      if(!ia.checks.quantityPositive||!ia.checks.unitPricePositive||!ia.checks.lineTotalPositive){ia.status='error';issues.push(`Item ${i+1}: quantidade/preço/total inválido.`);}
      else if(!ia.checks.mathOk){ia.status='error';issues.push(`Item ${i+1}: ${q} × ${u.toFixed(2)} = ${expected.toFixed(2)}, mas o documento indica ${line.toFixed(2)}.`);}
      if(!ia.checks.discountOk){ia.status='error';issues.push(`Item ${i+1}: desconto incompatível com o total da linha.`);}
      itemAudits.push(ia);
    }
    const grossSum=round2(items.reduce((s,it)=>s+num(it.total),0));
    const netSum=round2(items.reduce((s,it)=>s+num(it.total)-num(it.discount),0));
    const grossDelta=round2(grossSum-total);const netDelta=round2(netSum-total);
    const declared=Number(r.itemCountDeclared||0);
    if(declared&&declared!==items.length)issues.push(`Quantidade de itens divergente: documento declara ${declared}, leitura encontrou ${items.length}.`);
    if(total>0){if(Math.abs(netDelta)<=.05){/* ok */}else if(Math.abs(grossDelta)<=.05&&discountTotal>0){warnings.push('Total fecha com a soma bruta; descontos devem ser conciliados separadamente.');}else issues.push(`Total incompatível: linhas líquidas ${netSum.toFixed(2)} × total ${total.toFixed(2)}.`);}
    if(r.paymentAmount!=null&&Math.abs(num(r.paymentAmount)-total)>.05)issues.push('Valor pago diferente do total da compra.');
    const key=String(r.nfceKey||r.fiscalKey||'').replace(/\D/g,'');
    let duplicate=null;
    if(key&&key.length===44)duplicate=history.find(p=>String(p.nfceKey||p.fiscalKey||'').replace(/\D/g,'')===key)||null;
    if(!duplicate&&r.date&&r.market?.cnpj&&total>0){
      const cnpj=String(r.market.cnpj).replace(/\D/g,'');const t=(r.time||'').slice(0,5);
      const candidates=history.filter(p=>p.active!==false&&String(p.cnpj||'').replace(/\D/g,'')===cnpj&&p.date===r.date&&Math.abs(num(p.total)-total)<=.05);
      duplicate=candidates.find(p=>((p.time||'').slice(0,5)===t))||null;
      if(!duplicate&&candidates.length===1)warnings.push('Há uma compra com mesmo CNPJ, data e total; confirme antes de gravar como nova.');
    }
    const signatures=new Map();for(const it of items){const sig=`${String(it.barcode||'').replace(/\D/g,'')}|${normalize(it.name)}|${num(it.quantity).toFixed(3)}|${num(it.unitPrice).toFixed(4)}|${num(it.total).toFixed(2)}`;signatures.set(sig,(signatures.get(sig)||0)+1)};if([...signatures.values()].some(n=>n>1))warnings.push('Há linhas de item repetidas com a mesma assinatura; confirme se são ocorrências distintas ou duplicação de leitura.');
    const severity=issues.length?'BLOCK':warnings.length?'REVIEW':'PASS';
    return {engine:'receipt-auditor-1.0',status:severity,canPublish:severity!=='BLOCK',canAutoLaunch:severity==='PASS'&&!duplicate,receiptKey:key,duplicate:duplicate?{id:duplicate.id,date:duplicate.date,time:duplicate.time,market:duplicate.marketName,total:duplicate.total}:null,math:{grossSum,netSum,total,grossDelta,netDelta,discountTotal},itemAudits,issues,warnings,checkedAt:new Date().toISOString()};
  }
  function reconcileItems(items,products){return (items||[]).map(it=>{const m=contextualProductMatch(it,products);if(!m)return {...it,matchStatus:'new',matchConfidence:.35,matchReasons:[]};return {...it,matchedProductId:m.product?.id||'',matchedProductName:m.product?.name||'',matchStatus:m.method==='barcode-exact'?'exact':m.ambiguous?'ambiguous':'contextual',matchConfidence:m.score,matchReasons:m.reasons||[],needsReview:!!(m.ambiguous||m.score<.86)};});}
  global.ReceiptAuditor={normalize,contextualProductMatch,auditReceipt,reconcileItems,parsePack,inferUnit};
})(window);
