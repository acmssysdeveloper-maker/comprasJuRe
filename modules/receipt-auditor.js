/* Receipt Auditor 3.0 — field-level evidence, line-by-line reconciliation and publication gate. */
(function(global){
  'use strict';

  const TOLERANCE = 0.03;
  const DOC_TOLERANCE = 0.05;
  const REQUIRED_ITEM_FIELDS = ['name','quantity','unit','unitPrice','total'];
  const UNIT_ALIASES = {
    un:'un', und:'un', unid:'un', unidade:'un', unidades:'un', pc:'un', pç:'un', pçs:'un', pcs:'un',
    kg:'kg', quilo:'kg', quilograma:'kg', quilogramas:'kg',
    g:'g', grama:'g', gramas:'g',
    l:'l', lt:'l', litro:'l', litros:'l',
    ml:'ml', mililitro:'ml', mililitros:'ml',
    m:'m', metro:'m', metros:'m',
    cx:'cx', caixa:'cx', caixas:'cx',
    pct:'pct', pacote:'pct', pacotes:'pct',
    fd:'fd', fardo:'fd', fardos:'fd',
    sc:'sc', saco:'sc', sacos:'sc',
    dz:'dz', duzia:'dz', duzias:'dz'
  };
  const SOURCE_WEIGHT = {
    fiscal_xml:1, fiscal_json:.99, fiscal_pdf:.98, qr:.97, manual:1, vision:.90,
    catalog:.88, tesseract:.75, ocr:.72, ocr_space:.70, unknown:.25
  };

  const round2=n=>Math.round((Number(n)||0)*100)/100;
  const num=v=>{
    if(typeof v==='number') return Number.isFinite(v)?v:0;
    let s=String(v??'').trim().replace(/R\$\s*/ig,'').replace(/\s/g,'');
    if(!s)return 0;
    if(s.includes(',')&&s.includes('.')){
      const last=Math.max(s.lastIndexOf(','),s.lastIndexOf('.'));
      return Number(s.slice(0,last).replace(/[.,]/g,'')+'.'+s.slice(last+1))||0;
    }
    if(s.includes(',')) return Number(s.replace(/\./g,'').replace(',','.'))||0;
    return Number(s)||0;
  };
  const hasValue=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
  const cleanDigits=v=>String(v??'').replace(/\D/g,'');
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/&/g,' e ')
    .replace(/\bp\s*\/\s*/g,' para ')
    .replace(/\bc\s*\/\s*(\d+)/g,' c $1 ')
    .replace(/\bref(?:ri|rig)?\b/g,' refrigerante ')
    .replace(/\bcerv\b/g,' cerveja ')
    .replace(/\bp\s*hig\b/g,' papel higienico ')
    .replace(/\bqjo\b/g,' queijo ')
    .replace(/\bacuc\b/g,' acucar ')
    .replace(/\bbisc\b/g,' biscoito ')
    .replace(/\bmist\b/g,' mistura ')
    .replace(/\bconc\b/g,' concentrado ')
    .replace(/\bqtde\.?\b/g,' quantidade ')
    .replace(/\bqtd\.?\b/g,' quantidade ')
    .replace(/\bvl\.?\b/g,' valor ')
    .replace(/\bcod\.?\b/g,' codigo ')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const STOP=new Set('de da do das dos e em para com por c unidade un und vl total valor codigo cod item produto mercadoria supermercado mercado ltda sa rua avenida'.split(' '));
  const synonyms={
    refrigerante:['refrigerante','refr','refri','refrig'], cerveja:['cerveja','cerv'],
    adoçante:['adoçante','adocante'], integral:['integral'], zero:['zero'],
    kg:['kg','quilo','quilograma'], g:['g','grama'], l:['l','litro'], ml:['ml','mililitro'],
    un:['un','und','unid','unidade','unidades','pc','pç','pcs']
  };
  const canonicalTokens=s=>normalize(s).split(' ').filter(Boolean).filter(t=>!STOP.has(t)).map(t=>{
    for(const [k,a] of Object.entries(synonyms)) if(a.includes(t)) return k;
    return t;
  });
  const tokenSet=s=>new Set(canonicalTokens(s));
  const jaccard=(a,b)=>{const A=tokenSet(a),B=tokenSet(b);if(!A.size||!B.size)return 0;let i=0;for(const x of A)if(B.has(x))i++;return i/new Set([...A,...B]).size;};
  const levenshtein=(a,b)=>{a=String(a);b=String(b);const dp=Array(b.length+1).fill(0);for(let j=0;j<=b.length;j++)dp[j]=j;for(let i=1;i<=a.length;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t;}}return dp[b.length];};
  const editSimilarity=(a,b)=>{const A=normalize(a),B=normalize(b);if(!A||!B)return 0;return Math.max(0,1-levenshtein(A,B)/Math.max(A.length,B.length));};
  const canonicalUnit=v=>{const n=normalize(v);return UNIT_ALIASES[n]||n;};
  const parsePack=s=>{const m=String(s||'').match(/(?:c\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|und|unid|rolos|latas|garrafas|pacotes|caixas)\b/i);return m?`${m[1].replace(',','.')} ${m[2].toLowerCase()}`:'';};
  const inferUnit=(raw,unit,pack)=>{
    if(hasValue(unit)) return canonicalUnit(unit);
    const s=normalize(raw);
    if(/\bkg\b|quilo|quilograma/.test(s))return'kg';
    if(/\bml\b|mililitro/.test(s))return'ml';
    if(/\bl\b|litro/.test(s))return'l';
    if(/\bg\b|grama/.test(s))return'g';
    if(pack)return /kg/i.test(String(pack))?'kg':'un';
    return'';
  };

  function scoreProductMatch(item,product){
    const ib=cleanDigits(item?.barcode),pb=cleanDigits(product?.barcode);
    // Contradição de identificador é uma barreira: não permitir que um nome
    // parecido compense EAN/código diferente. Isso evita associações falsas.
    if(ib&&pb&&ib!==pb) return {status:'CONFLICT',score:0,reasons:['EAN/código incompatível'],basis:'identificador contraditório'};
    if(ib&&pb&&ib===pb) {
      const reasons=['EAN/código exato'];
      const itemN=normalize(item?.name), prodN=normalize(product?.name);
      // Detecta variantes semanticamente incompatíveis (ex.: ZERO vs comum).
      const variants=['zero','integral','light','diet','tradicional','suave','sem acucar','sem alcool'];
      const conflicts=variants.filter(v=>itemN.includes(v)!==prodN.includes(v));
      if(conflicts.length) return {status:'REVIEW',score:.89,reasons:[...reasons,`variante divergente: ${conflicts.join(', ')}`],basis:'EAN igual, mas descrição/variante exige revisão'};
      return {status:'EXACT',score:1,reasons,basis:'identificador único'};
    }
    const names=[product?.name,...(Array.isArray(product?.aliases)?product.aliases:[])].filter(Boolean);
    let bestName=0;
    for(const n of names) bestName=Math.max(bestName,.65*jaccard(item?.name,n)+.35*editSimilarity(item?.name,n));
    let score=bestName;
    const reasons=[];
    if(bestName>=.55) reasons.push('nome normalizado/apelido');
    const brand=normalize(item?.brand),pbrand=normalize(product?.brand);
    if(brand&&pbrand&&brand===pbrand){score+=.15;reasons.push('marca exata');}
    else if(brand&&pbrand&&jaccard(brand,pbrand)>=.8){score+=.08;reasons.push('marca semelhante');}
    const ip=normalize(item?.pack||parsePack(item?.name)),pp=normalize(product?.pack||parsePack(product?.name));
    if(ip&&pp&&ip===pp){score+=.12;reasons.push('embalagem/apresentação');}
    const iu=canonicalUnit(item?.unit),pu=canonicalUnit(product?.unit);
    if(iu&&pu&&iu===pu){score+=.05;reasons.push('unidade');}
    const ic=normalize(item?.category),pc=normalize(product?.category);
    if(ic&&pc&&ic===pc){score+=.03;reasons.push('categoria');}
    const corroborated=reasons.length>=2;
    if(score>=.90&&corroborated)return{status:'STRONG',score:Math.min(1,score),reasons,basis:'múltiplos atributos corroborantes'};
    if(score>=.78&&corroborated)return{status:'REVIEW',score:Math.min(1,score),reasons,basis:'atributos semelhantes, mas insuficientes para fusão automática'};
    if(score>=.60)return{status:'WEAK',score:Math.min(1,score),reasons,basis:'similaridade parcial sem confirmação suficiente'};
    return{status:'NEW',score:Math.min(1,score),reasons,basis:'não há evidência suficiente de identidade'};
  }

  function contextualProductMatch(item,products){
    const ranked=(products||[]).map(p=>({product:p,match:scoreProductMatch(item,p)})).sort((a,b)=>b.match.score-a.match.score);
    if(!ranked.length)return{product:null,score:0,status:'NEW',ambiguous:false,candidates:[]};
    const top=ranked[0], second=ranked[1];
    const eligible=ranked.filter(x=>x.match.status!=='CONFLICT');
    const topEligible=eligible[0], secondEligible=eligible[1];
    const ambiguous=!!topEligible&&topEligible.match.status!=='EXACT'&&!!secondEligible&&topEligible.match.score>=.60&&(topEligible.match.score-secondEligible.match.score)<.08;
    // Somente uma associação explicitamente forte/exata pode preencher matchedProduct.
    // REVIEW/WEAK/NEW permanecem sem identidade automática; candidatos continuam visíveis.
    const autoStatus=ambiguous?'AMBIGUOUS':(topEligible?.match.status||'NEW');
    const autoProduct=['EXACT','STRONG'].includes(autoStatus)&&!ambiguous?topEligible.product:null;
    return{product:autoProduct,score:topEligible?.match.score||0,status:autoStatus,ambiguous,reasons:topEligible?.match.reasons||[],candidates:ranked.slice(0,5).map(x=>({id:x.product.id||'',name:x.product.name||'',score:x.match.score,status:x.match.status,reasons:x.match.reasons}))};
  }

  function reconcileItems(items,products){
    return (items||[]).map((it,index)=>{
      const lineId=it.lineId||`ITEM-${String(index+1).padStart(3,'0')}`;
      const m=contextualProductMatch(it,products||[]);
      const status=m.status==='AMBIGUOUS'?'AMBIGUOUS':m.status;
      return {...it,lineId,matchedProductId:m.product?.id||'',matchedProductName:m.product?.name||'',matchStatus:status,matchConfidence:m.score,matchReasons:m.reasons||[],matchCandidates:m.candidates||[],needsReview:['AMBIGUOUS','REVIEW','WEAK'].includes(status)};
    });
  }

  function sourceInfo(raw, fallbackSource){
    const source=normalize(raw?.source||fallbackSource||'unknown').replace(/ /g,'_')||'unknown';
    return {source,weight:SOURCE_WEIGHT[source]??SOURCE_WEIGHT.unknown};
  }

  function evidenceId(scope,field){return `${scope}:${field}`;}

  function buildFieldEvidence({scope,field,value,required=false,observedValue,source,fallbackSource,extractor='parser',locator=null,confidence=0,candidates=[],corroboration=[],conflicts=[],normalization='',acceptedBecause='',rejectionReason=''}){
    const present=hasValue(value);
    const src=sourceInfo({source},fallbackSource);
    const status=!present?'MISSING':conflicts.length?'CONFLICT':confidence>=.80?'CONFIRMED':confidence>=.55?'INFERRED':'UNCERTAIN';
    return {
      evidenceId:evidenceId(scope,field), field, required, status, source:src.source,
      observedValue:hasValue(observedValue)?observedValue:null, parsedValue:present?value:null,
      normalizedValue:present&&typeof value==='string'?normalize(value):value,
      extractor, locator, confidence:Number(Math.max(0,Math.min(1,confidence))||0),
      candidates, corroboration, conflicts, normalization, acceptedBecause, rejectionReason
    };
  }

  function matchEvidence(it){
    const status=it?.matchStatus||'NEW';
    const conf=Number(it?.matchConfidence||0);
    let acceptedBecause='';
    if(status==='EXACT')acceptedBecause='identificador do produto coincide exatamente com o catálogo';
    else if(status==='MANUAL')acceptedBecause='associação confirmada manualmente pelo usuário após revisão';
    else if(status==='STRONG')acceptedBecause='múltiplos atributos do item coincidem com o cadastro histórico';
    else if(status==='NEW')acceptedBecause='não houve evidência suficiente para associar a um cadastro existente; tratado como produto novo';
    return buildFieldEvidence({scope:it.lineId,field:'productIdentity',value:it.matchedProductId||null,required:false,observedValue:it.name,source:'catalog',fallbackSource:it.source||'unknown',extractor:'catalog-context',confidence:status==='NEW'?.75:(status==='MANUAL'?1:conf),candidates:it.matchCandidates||[],corroboration:it.matchReasons||[],conflicts:status==='AMBIGUOUS'?["mais de um candidato plausível"]:[],acceptedBecause,rejectionReason:['AMBIGUOUS','REVIEW','WEAK'].includes(status)?'associação não suficientemente forte para fusão automática':''});
  }

  function auditLine(it,index){
    const lineId=it?.lineId||`ITEM-${String(index+1).padStart(3,'0')}`;
    const raw=String(it?.rawLine||'').trim();
    const name=String(it?.name||'').trim();
    const unit=canonicalUnit(it?.unit||inferUnit(it?.name,'',it?.pack));
    const quantity=hasValue(it?.quantity)?num(it.quantity):null;
    const unitPrice=hasValue(it?.unitPrice)?num(it.unitPrice):null;
    const total=hasValue(it?.total)?num(it.total):null;
    const discount=hasValue(it?.discount)?Math.max(0,num(it.discount)):0;
    const grossCalculated=(quantity!==null&&unitPrice!==null)?round2(quantity*unitPrice):null;
    let totalBasis='UNRESOLVED';
    let expectedLineNet=null;
    let mathDelta=null;
    if(grossCalculated!==null&&total!==null){
      const grossDelta=round2(total-grossCalculated);
      const netExpected=round2(grossCalculated-discount);
      const netDelta=round2(total-netExpected);
      if(Math.abs(netDelta)<=TOLERANCE&&discount>0){totalBasis='NET_AFTER_DISCOUNT';expectedLineNet=netExpected;mathDelta=netDelta;}
      else if(Math.abs(grossDelta)<=TOLERANCE){totalBasis=discount>0?'GROSS_BEFORE_DISCOUNT':'GROSS_EQ_NET';expectedLineNet=round2(grossCalculated-discount);mathDelta=grossDelta;}
      else {expectedLineNet=netExpected;mathDelta=round2(total-netExpected);}
    }
    const validUnit=Object.values(UNIT_ALIASES).includes(unit);
    const checks={
      namePresent:name.length>=2,
      quantityPresent:quantity!==null&&quantity>0,
      unitPresent:validUnit,
      unitPricePresent:unitPrice!==null&&unitPrice>=0,
      lineTotalPresent:total!==null&&total>=0,
      arithmetic:grossCalculated!==null&&total!==null&&((discount>0&&Math.abs(total-(grossCalculated-discount))<=TOLERANCE)||(Math.abs(total-grossCalculated)<=TOLERANCE)),
      discountValid:discount>=0&&grossCalculated!==null&&discount<=grossCalculated+TOLERANCE,
      unitSemantics:validUnit,
      weighted:['kg','g','l','ml'].includes(unit)
    };
    const missing=[];
    if(!checks.namePresent)missing.push('nome');
    if(!checks.quantityPresent)missing.push('quantidade');
    if(!checks.unitPresent)missing.push('unidade');
    if(!checks.unitPricePresent)missing.push('preço unitário');
    if(!checks.lineTotalPresent)missing.push('total da linha');
    const evidence={
      name:buildFieldEvidence({scope:lineId,field:'name',value:name,required:true,observedValue:it?.rawFields?.name||name,source:it?.fieldEvidence?.name?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.name?.extractor||'receipt-parser',confidence:Number(it?.fieldEvidence?.name?.confidence??it?.confidence??0),locator:it?.fieldEvidence?.name?.locator||null,candidates:it?.fieldEvidence?.name?.candidates||[],acceptedBecause:checks.namePresent?'campo textual presente; mantido para cruzamento semântico':'nome ausente ou curto demais',rejectionReason:checks.namePresent?'':'não é possível identificar o produto sem descrição'}),
      barcode:buildFieldEvidence({scope:lineId,field:'barcode',value:cleanDigits(it?.barcode),required:false,observedValue:it?.rawFields?.barcode??it?.barcode,source:it?.fieldEvidence?.barcode?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.barcode?.extractor||'identifier-parser',confidence:Number(it?.fieldEvidence?.barcode?.confidence??it?.confidence??0),acceptedBecause:cleanDigits(it?.barcode)?'código preservado como evidência forte de identidade':'código não informado'}),
      brand:buildFieldEvidence({scope:lineId,field:'brand',value:it?.brand||'',required:false,observedValue:it?.rawFields?.brand??it?.brand,source:it?.fieldEvidence?.brand?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.brand?.extractor||'semantic-parser',confidence:Number(it?.fieldEvidence?.brand?.confidence??it?.confidence??0),acceptedBecause:it?.brand?'marca preservada para corroborar identidade':'marca não identificada'}),
      pack:buildFieldEvidence({scope:lineId,field:'pack',value:it?.pack||parsePack(it?.name),required:false,observedValue:it?.rawFields?.pack??it?.pack,source:it?.fieldEvidence?.pack?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.pack?.extractor||'presentation-parser',confidence:Number(it?.fieldEvidence?.pack?.confidence??it?.confidence??0),acceptedBecause:(it?.pack||parsePack(it?.name))?'apresentação preservada para diferenciar variantes e embalagens':'apresentação não identificada'}),
      category:buildFieldEvidence({scope:lineId,field:'category',value:it?.category||'',required:false,observedValue:it?.rawFields?.category??it?.category,source:it?.fieldEvidence?.category?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.category?.extractor||'semantic-parser',confidence:Number(it?.fieldEvidence?.category?.confidence??it?.confidence??0),acceptedBecause:it?.category?'categoria usada como corroborador contextual':'categoria não identificada'}),
      quantity:buildFieldEvidence({scope:lineId,field:'quantity',value:quantity,required:true,observedValue:it?.rawFields?.quantity??quantity,source:it?.fieldEvidence?.quantity?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.quantity?.extractor||'numeric-parser',confidence:Number(it?.fieldEvidence?.quantity?.confidence??it?.confidence??0),acceptedBecause:checks.quantityPresent&&checks.arithmetic?'quantidade positiva e corroborada pela equação da linha':'quantidade não foi confirmada matematicamente',rejectionReason:checks.quantityPresent?'':'quantidade ausente ou inválida'}),
      unit:buildFieldEvidence({scope:lineId,field:'unit',value:unit,required:true,observedValue:it?.rawFields?.unit??it?.unit,source:it?.fieldEvidence?.unit?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.unit?.extractor||'unit-normalizer',confidence:Number(it?.fieldEvidence?.unit?.confidence??it?.confidence??0),acceptedBecause:checks.unitPresent?'unidade normalizada e reconhecida pelo dicionário':'unidade não reconhecida',rejectionReason:checks.unitPresent?'':'unidade ausente ou fora do vocabulário suportado'}),
      unitPrice:buildFieldEvidence({scope:lineId,field:'unitPrice',value:unitPrice,required:true,observedValue:it?.rawFields?.unitPrice??unitPrice,source:it?.fieldEvidence?.unitPrice?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.unitPrice?.extractor||'numeric-parser',confidence:Number(it?.fieldEvidence?.unitPrice?.confidence??it?.confidence??0),corroboration:checks.arithmetic?['equação quantidade × preço unitário fecha']:[],acceptedBecause:checks.unitPricePresent&&checks.arithmetic?'preço presente e matematicamente corroborado':'preço ainda não corroborado',rejectionReason:checks.unitPricePresent?'':'preço unitário ausente ou inválido'}),
      total:buildFieldEvidence({scope:lineId,field:'total',value:total,required:true,observedValue:it?.rawFields?.total??total,source:it?.fieldEvidence?.total?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.total?.extractor||'numeric-parser',confidence:Number(it?.fieldEvidence?.total?.confidence??it?.confidence??0),corroboration:checks.arithmetic?[`${quantity} × ${unitPrice} = ${grossCalculated} e desconto=${discount}`]:[],acceptedBecause:checks.lineTotalPresent&&checks.arithmetic?'total da linha fechado contra quantidade, preço e desconto':'total não fechado matematicamente',rejectionReason:checks.lineTotalPresent?'':'total da linha ausente ou inválido'}),
      discount:buildFieldEvidence({scope:lineId,field:'discount',value:discount,required:false,observedValue:it?.rawFields?.discount??discount,source:it?.fieldEvidence?.discount?.source||it?.source,fallbackSource:it?.source,extractor:it?.fieldEvidence?.discount?.extractor||'discount-parser',confidence:Number(it?.fieldEvidence?.discount?.confidence??(hasValue(it?.discount)?it?.confidence||0:0)),acceptedBecause:discount===0?'nenhum desconto de linha informado':'desconto de linha limitado ao valor bruto do item',rejectionReason:checks.discountValid?'':'desconto superior ao valor bruto'}),
      productIdentity:matchEvidence({...it,lineId})
    };
    const status=(missing.length||!checks.arithmetic||!checks.discountValid||!checks.unitSemantics)?'BLOCK':'PASS';
    const rejection=[];
    if(!checks.arithmetic)rejection.push('equação da linha não fecha');
    if(!checks.discountValid)rejection.push('desconto incompatível');
    return {
      lineId,index:index+1,name,barcode:cleanDigits(it?.barcode),quantity,unit,unitPrice,total,discount,
      grossCalculated,expectedLineNet,mathDelta,totalBasis,weighted:checks.weighted,checks,missing,status,
      source:it?.source||'unknown',rawLine:raw,evidence,evidenceCoverage:Object.values(evidence).filter(e=>e.status!=='MISSING').length/Object.keys(evidence).length,
      match:{status:it?.matchStatus||'NEW',confidence:Number(it?.matchConfidence||0),productId:it?.matchedProductId||'',productName:it?.matchedProductName||'',candidates:it?.matchCandidates||[],reasons:it?.matchReasons||[]},
      rejectionReasons:rejection
    };
  }

  function buildReceiptEvidence(receipt, items, math){
    const source=receipt.source||receipt.sourceEngine||'unknown';
    return {
      marketName:buildFieldEvidence({scope:'RECEIPT',field:'marketName',value:receipt?.market?.name||receipt?.marketName||'',required:true,source:receipt?.fieldEvidence?.marketName?.source||source,fallbackSource:source,extractor:'document-header',confidence:Number(receipt?.fieldEvidence?.marketName?.confidence??receipt?.confidence??0),acceptedBecause:'identificação do estabelecimento preservada para rastreabilidade'}),
      cnpj:buildFieldEvidence({scope:'RECEIPT',field:'cnpj',value:receipt?.market?.cnpj||receipt?.cnpj||'',required:false,source:receipt?.fieldEvidence?.cnpj?.source||source,fallbackSource:source,extractor:'document-header',confidence:Number(receipt?.fieldEvidence?.cnpj?.confidence??receipt?.confidence??0),acceptedBecause:'CNPJ usado como identificador forte do estabelecimento'}),
      date:buildFieldEvidence({scope:'RECEIPT',field:'date',value:receipt?.date||'',required:true,source:receipt?.fieldEvidence?.date?.source||source,fallbackSource:source,extractor:'document-header',confidence:Number(receipt?.fieldEvidence?.date?.confidence??receipt?.confidence??0),acceptedBecause:'data do documento preservada como fato histórico'}),
      time:buildFieldEvidence({scope:'RECEIPT',field:'time',value:receipt?.time||'',required:false,source:receipt?.fieldEvidence?.time?.source||source,fallbackSource:source,extractor:'document-header',confidence:Number(receipt?.fieldEvidence?.time?.confidence??receipt?.confidence??0),acceptedBecause:'hora usada para rastreamento e deduplicação'}),
      documentNumber:buildFieldEvidence({scope:'RECEIPT',field:'documentNumber',value:receipt?.documentNumber||'',required:false,source:source,fallbackSource:source,extractor:'document-header',confidence:Number(receipt?.confidence??0),acceptedBecause:'número do documento auxilia a identidade do comprovante'}),
      fiscalKey:buildFieldEvidence({scope:'RECEIPT',field:'fiscalKey',value:receipt?.nfceKey||receipt?.fiscalKey||'',required:false,source:receipt?.qrEvidence?.ok?'qr':source,fallbackSource:source,extractor:receipt?.qrEvidence?.ok?'qr-decoder':'fiscal-parser',confidence:receipt?.qrEvidence?.ok ? .99 : Number(receipt?.confidence??0),acceptedBecause:'chave fiscal é identificador máximo para deduplicação'}),
      total:buildFieldEvidence({scope:'RECEIPT',field:'total',value:receipt?.total,required:true,source:source,fallbackSource:source,extractor:'numeric-parser',confidence:Number(receipt?.confidence??0),corroboration:[`soma auditada dos itens = ${math.expectedTotal}`],acceptedBecause:math.total!==null&&math.balanced?'total conciliado matematicamente':'total ainda não conciliado',rejectionReason:math.balanced?'':'total não fecha com os itens'}),
      discountTotal:buildFieldEvidence({scope:'RECEIPT',field:'discountTotal',value:receipt?.discountTotal??0,required:false,source:source,fallbackSource:source,extractor:'discount-parser',confidence:Number(receipt?.confidence??0),acceptedBecause:'desconto global separado dos descontos de linha'}),
      paymentMethod:buildFieldEvidence({scope:'RECEIPT',field:'paymentMethod',value:receipt?.paymentMethod||'',required:false,source:source,fallbackSource:source,extractor:'payment-parser',confidence:Number(receipt?.confidence??0),acceptedBecause:'forma de pagamento preservada para conferência'}),
      paymentAmount:buildFieldEvidence({scope:'RECEIPT',field:'paymentAmount',value:receipt?.paymentAmount,required:false,source:source,fallbackSource:source,extractor:'payment-parser',confidence:Number(receipt?.confidence??0),acceptedBecause:receipt?.paymentAmount!=null?'valor pago comparado ao total':'valor pago não informado'}),
      declaredItemCount:buildFieldEvidence({scope:'RECEIPT',field:'declaredItemCount',value:receipt?.itemCountDeclared,required:false,source:source,fallbackSource:source,extractor:'items-counter',confidence:Number(receipt?.confidence??0),acceptedBecause:receipt?.itemCountDeclared?'quantidade declarada confrontada com linhas':'não informado no documento'}),
      auditMath:buildFieldEvidence({scope:'RECEIPT',field:'auditMath',value:math.balanced,required:true,source:'auditor',fallbackSource:'auditor',extractor:'arithmetic-reconciliation',confidence:math.balanced?1:0,corroboration:[`gross=${math.grossSum}`,`lineDiscount=${math.lineDiscountSum}`,`receiptDiscount=${math.receiptDiscount}`,`surcharge=${math.surcharge}`,`expected=${math.expectedTotal}`,`total=${math.total}`],acceptedBecause:math.balanced?'reconciliação documental fechada':'reconciliação documental não fechada',rejectionReason:math.balanced?'':'diferença não explicada'})
    };
  }

  function duplicateFingerprint(receipt){
    const key=cleanDigits(receipt?.nfceKey||receipt?.fiscalKey||'');
    if(key.length===44)return{type:'FISCAL_KEY',value:key};
    const cnpj=cleanDigits(receipt?.market?.cnpj||receipt?.cnpj||'');
    const date=String(receipt?.date||'');
    const time=String(receipt?.time||'').slice(0,8);
    const total=round2(num(receipt?.total)).toFixed(2);
    const itemSig=(receipt?.items||[]).map(it=>`${cleanDigits(it.barcode)}|${normalize(it.name)}|${canonicalUnit(it.unit)}|${num(it.quantity).toFixed(3)}|${num(it.unitPrice).toFixed(4)}|${num(it.total).toFixed(2)}|${num(it.discount).toFixed(2)}`).sort().join('~');
    return{type:'CONTEXT',value:[cnpj,date,time,total,itemSig].join('|'),coarse:[cnpj,date,total].join('|')};
  }

  function findDuplicate(receipt,history){
    const fp=duplicateFingerprint(receipt);
    if(fp.type==='FISCAL_KEY'){
      const hit=(history||[]).find(p=>cleanDigits(p.nfceKey||p.fiscalKey)===fp.value);
      return hit?{level:'EXACT',record:hit,reason:'mesma chave fiscal'}:null;
    }
    const cnpj=cleanDigits(receipt?.market?.cnpj||receipt?.cnpj||'');
    const date=receipt?.date||'';
    const total=round2(num(receipt?.total));
    const candidates=(history||[]).filter(p=>cleanDigits(p.cnpj||p.market?.cnpj)===cnpj&&p.date===date&&Math.abs(num(p.total)-total)<=DOC_TOLERANCE);
    if(!candidates.length)return null;
    const time=String(receipt?.time||'').slice(0,8);
    const exactTime=candidates.find(p=>String(p.time||'').slice(0,8)===time);
    if(exactTime)return{level:'HIGH',record:exactTime,reason:'mesmo CNPJ + data + hora + total'};
    if(candidates.length===1)return{level:'MEDIUM',record:candidates[0],reason:'mesmo CNPJ + data + total'};
    return{level:'REVIEW',record:null,reason:`${candidates.length} candidatos com mesmo CNPJ, data e total`};
  }

  function auditReceipt(receipt={},history=[]){
    const items=Array.isArray(receipt.items)?receipt.items:[];
    const itemAudits=items.map(auditLine);
    const issues=[],warnings=[];
    if(!items.length)issues.push('Nenhuma linha de produto foi identificada.');
    itemAudits.forEach(a=>{if(a.status==='BLOCK')issues.push(`${a.lineId}: ${a.rejectionReasons.join('; ')||a.missing.map(x=>'campo ausente: '+x).join('; ')}`);});
    const declared=Number(receipt.itemCountDeclared||0);
    if(declared&&declared!==items.length)issues.push(`Quantidade declarada (${declared}) difere das linhas auditadas (${items.length}).`);

    const grossSum=round2(itemAudits.reduce((s,a)=>s+(a.grossCalculated??0),0));
    const lineDiscountSum=round2(itemAudits.reduce((s,a)=>s+(a.discount||0),0));
    const discountEvidence=round2(Math.max(0,num(receipt.discountTotal)));
    const receiptDiscount=round2(Math.max(0,discountEvidence-lineDiscountSum));
    const surcharge=round2(Math.max(0,num(receipt.surchargeTotal||receipt.feesTotal)));
    const expectedTotal=round2(grossSum-lineDiscountSum-receiptDiscount+surcharge);
    const total=hasValue(receipt.total)?num(receipt.total):null;
    const totalDelta=total===null?null:round2(total-expectedTotal);
    const netLineSum=round2(itemAudits.reduce((s,a)=>s+(a.expectedLineNet??0),0));
    const balanced=total!==null&&Math.abs(totalDelta)<=DOC_TOLERANCE&&itemAudits.every(a=>a.status==='PASS')&&(!declared||declared===items.length);

    if(total===null||total<=0)issues.push('Total da compra ausente ou inválido.');
    if(discountEvidence>grossSum+DOC_TOLERANCE)issues.push(`Desconto informado (${discountEvidence.toFixed(2)}) é maior que a soma bruta calculada (${grossSum.toFixed(2)}).`);
    let varianceKind='BALANCED';
    if(total!==null&&Math.abs(totalDelta)>DOC_TOLERANCE){
      if(totalDelta<0){varianceKind='POSSIBLE_DISCOUNT_OR_ERROR';issues.push(`Total do documento (${total.toFixed(2)}) é menor que o total auditado (${expectedTotal.toFixed(2)}) em ${Math.abs(totalDelta).toFixed(2)}; falta explicar a diferença.`);}
      else{varianceKind='POSSIBLE_OVERCHARGE_OR_MISSING_SURCHARGE';issues.push(`Total do documento (${total.toFixed(2)}) é maior que o total auditado (${expectedTotal.toFixed(2)}) em ${Math.abs(totalDelta).toFixed(2)}; verificar cobrança a maior ou acréscimo não identificado.`);}
    }

    const paid=hasValue(receipt.paymentAmount)?num(receipt.paymentAmount):null;
    const method=normalize(receipt.paymentMethod||'');
    const change=hasValue(receipt.changeAmount)?num(receipt.changeAmount):null;
    if(paid!==null&&total!==null){
      if(/dinheiro|cash/.test(method)&&change!==null){if(Math.abs(round2(paid-change)-total)>DOC_TOLERANCE)issues.push('Valor entregue - troco não coincide com o total.');}
      else if(Math.abs(paid-total)>DOC_TOLERANCE)issues.push('Valor pago difere do total da compra.');
    }

    const duplicate=findDuplicate(receipt,history);
    if(duplicate?.level==='EXACT'||duplicate?.level==='HIGH')issues.push(`Duplicidade forte: ${duplicate.reason}.`);
    else if(duplicate)warnings.push(`Revisão de duplicidade: ${duplicate.reason}.`);
    if(itemAudits.some(a=>['AMBIGUOUS','REVIEW','WEAK'].includes(a.match.status)))warnings.push('Há itens cuja associação ao catálogo requer revisão.');

    const receiptEvidence=buildReceiptEvidence(receipt,itemAudits,{grossSum,lineDiscountSum,receiptDiscount,surcharge,expectedTotal,total,balanced});
    const allFieldEvidence=[...Object.values(receiptEvidence),...itemAudits.flatMap(a=>Object.values(a.evidence))];
    const requiredFieldEvidence=allFieldEvidence.filter(e=>e.required);
    const missingRequired=requiredFieldEvidence.filter(e=>e.status==='MISSING');
    const conflictRequired=requiredFieldEvidence.filter(e=>e.status==='CONFLICT');
    if(missingRequired.length)issues.push(`${missingRequired.length} evidência(s) obrigatória(s) ausente(s).`);
    if(conflictRequired.length)issues.push(`${conflictRequired.length} evidência(s) obrigatória(s) em conflito.`);

    let status='PASS';
    if(issues.length)status='BLOCK';
    else if(warnings.length)status='REVIEW';
    const canPublish=status==='PASS';
    const canAutoLaunch=status==='PASS'&&!duplicate;
    return {
      engine:'receipt-auditor-3.0', status, canPublish, canAutoLaunch,
      duplicate,
      math:{grossSum,lineDiscountSum,receiptDiscount,discountTotal:discountEvidence,surcharge,expectedTotal,netLineSum,total,totalDelta,varianceKind,balanced},
      itemAudits,
      evidence:{receipt:receiptEvidence,items:Object.fromEntries(itemAudits.map(a=>[a.lineId,a.evidence])),requiredCoverage:requiredFieldEvidence.length?requiredFieldEvidence.filter(e=>e.status!=='MISSING'&&e.status!=='CONFLICT').length/requiredFieldEvidence.length:0},
      trace:{documentStage:'audited',lineOrder:itemAudits.map(a=>a.lineId),itemCount:items.length,processedIndependently:true,publicationAfterAudit:true},
      coverage:{itemsTotal:items.length,itemsPassed:itemAudits.filter(a=>a.status==='PASS').length,itemsBlocked:itemAudits.filter(a=>a.status==='BLOCK').length,itemsReview:itemAudits.filter(a=>a.status!=='PASS'&&a.status!=='BLOCK').length,requiredFields:REQUIRED_ITEM_FIELDS},
      issues,warnings,checkedAt:new Date().toISOString()
    };
  }

  global.ReceiptAuditor={normalize,parsePack,inferUnit,reconcileItems,contextualProductMatch,auditReceipt,auditLine,duplicateFingerprint,findDuplicate,buildFieldEvidence};
})(typeof window!=='undefined'?window:globalThis);
