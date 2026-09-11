/*
 * ReceiptEngine 2.6 — Anti-Fail OCR pipeline
 *
 * Principles:
 *   - QR/NFC-e identity is evidence, never a substitute for item data.
 *   - OCR is an evidence generator, not a truth source.
 *   - Multiple OCR passes are clustered by value/content; never merged blindly by ordinal position.
 *   - Incomplete/contradictory readings are escalated or blocked.
 *   - No business seed/fallback is produced by this module.
 */
(function(global){
  'use strict';
  const state={jsqr:null};
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
  async function fileToImage(file){
    const url=URL.createObjectURL(file);
    try{
      const img=new Image(); img.decoding='async';
      await new Promise((r,j)=>{img.onload=r;img.onerror=()=>j(new Error('Imagem inválida'));img.src=url});
      return img;
    }finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
  }
  function canvasFromImage(img,maxDim=3600){
    const nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height;
    const scale=Math.min(4,maxDim/Math.max(nw,nh));
    const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(nw*scale));c.height=Math.max(1,Math.round(nh*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,c.width,c.height);
    return c;
  }
  function grayArray(ctx,w,h){
    const src=ctx.getImageData(0,0,w,h),d=src.data,g=new Uint8Array(w*h);
    for(let i=0,p=0;i<d.length;i+=4,p++)g[p]=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);
    return {src,g};
  }
  function enhance(canvas,mode){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,{src,g}=grayArray(ctx,w,h);
    let min=255,max=0;for(const v of g){if(v<min)min=v;if(v>max)max=v}const span=Math.max(1,max-min);
    const cell=48,cols=Math.ceil(w/cell),rows=Math.ceil(h/cell),sum=new Float64Array(cols*rows),cnt=new Uint32Array(cols*rows);
    for(let y=0;y<h;y++){const cy=(y/cell)|0;for(let x=0;x<w;x++){const k=cy*cols+((x/cell)|0);sum[k]+=g[y*w+x];cnt[k]++}}
    for(let i=0;i<sum.length;i++)sum[i]/=cnt[i]||1;
    const mean=sum.reduce((a,b)=>a+b,0)/Math.max(1,sum.length),d=src.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const idx=y*w+x,k=((y/cell)|0)*cols+((x/cell)|0),v=g[idx],local=sum[k];let z;
      if(mode==='gray') z=v;
      else if(mode==='soft') z=Math.max(0,Math.min(255,(v-128)*1.45+128));
      else if(mode==='contrast') z=(v-min)*255/span;
      else if(mode==='shadow') z=Math.max(0,Math.min(255,(v-(local-mean*.70))*1.35+128));
      else z=v<(local-10)?0:255;
      const p=idx*4;d[p]=d[p+1]=d[p+2]=z;d[p+3]=255;
    }
    ctx.putImageData(src,0,0);return canvas;
  }
  function sharpen(canvas){
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height,src=ctx.getImageData(0,0,w,h),out=ctx.createImageData(w,h),a=src.data,b=out.data;b.set(a);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++){const v=5*a[i+c]-a[i-4+c]-a[i+4+c]-a[i-w*4+c]-a[i+w*4+c];b[i+c]=Math.max(0,Math.min(255,v))}b[i+3]=255}ctx.putImageData(out,0,0);return canvas;
  }
  function toBlob(canvas){return new Promise((r,j)=>canvas.toBlob(b=>b?r(b):j(new Error('Falha ao preparar imagem OCR')),'image/png',1))}
  async function imageBlob(file,mode,maxDim=3600){const img=await fileToImage(file),c=canvasFromImage(img,maxDim);enhance(c,mode);if(mode!=='adaptive')sharpen(c);return toBlob(c)}
  async function regionBlob(file,top,bottom,mode='soft'){
    const img=await fileToImage(file),nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height,scale=Math.min(4,3600/nw);
    const w=Math.round(nw*scale),h=Math.round(nh*(bottom-top)*scale),c=document.createElement('canvas');c.width=w;c.height=h;
    const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(img,0,nh*top,nw,nh*(bottom-top),0,0,w,h);enhance(c,mode);if(mode!=='adaptive')sharpen(c);return toBlob(c);
  }
  async function loadJsQR(){
    if(state.jsqr)return state.jsqr;if(global.jsQR)return(state.jsqr=global.jsQR);
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';s.crossOrigin='anonymous';const t=setTimeout(()=>{s.remove();reject(new Error('jsQR indisponível'))},12000);s.onload=()=>{clearTimeout(t);global.jsQR?resolve(state.jsqr=global.jsQR):reject(new Error('jsQR não carregou'))};s.onerror=()=>{clearTimeout(t);s.remove();reject(new Error('Falha ao carregar jsQR'));};document.head.appendChild(s)});
  }
  function keyCheckDigit(key){
    const x=String(key||'').replace(/\D/g,'');if(x.length!==44)return false;let sum=0,w=2;for(let i=42;i>=0;i--){sum+=Number(x[i])*w;w=w===9?2:w+1}const d=11-(sum%11);return(d>=10?0:d)===Number(x[43]);
  }
  function extractKeyFromText(text){
    const raw=String(text||'');
    const candidates=[];
    const lines=raw.split(/\r?\n/);
    const fixChar=c=>({O:'0',Q:'0',D:'0',I:'1',L:'1',Z:'2',S:'5',B:'8',G:'6'}[c.toUpperCase()]||c);
    for(const line of lines){
      const compact=line.toUpperCase().split('').map(fixChar).join('').replace(/[^0-9]/g,'');
      if(compact.length>=44){
        for(let i=0;i<=compact.length-44;i++){const k=compact.slice(i,i+44);if(keyCheckDigit(k))candidates.push(k)}
      }
      const groups=line.match(/(?:[0-9OQDI LZSBG]{2,6}\s+){5,}[0-9OQDI LZSBG]{2,6}/ig)||[];
      for(const g of groups){const c=g.split('').map(fixChar).join('').replace(/\D/g,'');if(c.length===44&&keyCheckDigit(c))candidates.push(c)}
    }
    const joined=raw.toUpperCase().split('').map(fixChar).join('');
    const all=joined.replace(/[^0-9]/g,'');
    if(all.length>=44)for(let i=0;i<=all.length-44;i++){const k=all.slice(i,i+44);if(keyCheckDigit(k))candidates.push(k)}
    return candidates[0]||'';
  }
  function parseQr(raw){
    const url=String(raw||'').trim();let key='';
    try{const dec=decodeURIComponent(url);const m=dec.match(/(?:^|[?&])p=([^&#]+)/i);if(m){const digits=(m[1].split('|')[0]||'').replace(/\D/g,'');if(digits.length===44&&keyCheckDigit(digits))key=digits}}catch{}
    if(!key){const m=url.replace(/\s/g,'').match(/\d{44}/);if(m&&keyCheckDigit(m[0]))key=m[0]}
    return {key,url,validKey:!!key,confidence:key?.length===44?.99:0};
  }
  async function qr(file){
    let jsqr;try{jsqr=await loadJsQR()}catch(e){return{source:'qr',ok:false,error:e.message,confidence:0}};
    const img=await fileToImage(file),nw=img.naturalWidth||img.width,nh=img.naturalHeight||img.height;
    const specs=[[0.60,1.00,3200],[0.45,1.00,2800],[0,1,2400]];
    for(const [top,bottom,max] of specs){
      let scale=Math.min(4,max/nw);
      // QR precisa de uma matriz com largura suficiente. Fontes muito estreitas
      // (miniaturas/preview/crops quebrados) geravam o erro "Image too small to scale".
      if(!Number.isFinite(scale)||scale<=0) continue;
      let cw=Math.max(64,Math.round(nw*scale));
      let ch=Math.max(64,Math.round(nh*(bottom-top)*scale));
      // Nunca distorcer abaixo do tamanho mínimo do decodificador.
      const c=document.createElement('canvas');c.width=cw;c.height=ch;
      const x=c.getContext('2d',{willReadFrequently:true});
      x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
      x.drawImage(img,0,nh*top,nw,nh*(bottom-top),0,0,c.width,c.height);
      if(c.width<3||c.height<3) continue;
      const d=x.getImageData(0,0,c.width,c.height),code=jsqr(d.data,d.width,d.height,{inversionAttempts:'attemptBoth'});
      if(code?.data){const p=parseQr(code.data);if(p.key)return{source:'qr',ok:true,raw:code.data,...p}}
    }
    return{source:'qr',ok:false,confidence:0};
  }
  function buildJobs(file){
    return (async()=>{
      const variants=[];
      for(const mode of ['gray','soft','contrast','shadow','adaptive'])variants.push({label:`full/${mode}`,input:mode==='gray'?file:await imageBlob(file,mode),psm:6,region:'full'});
      const regions=[['header',0,.24],['items',.18,.86],['footer',.72,1]];
      for(const [name,t,b] of regions){for(const mode of ['soft','adaptive'])variants.push({label:`${name}/${mode}`,input:await regionBlob(file,t,b,mode),psm:4,region:name});}
      return variants;
    })();
  }
  async function tesseract(file,loadTesseract,onProgress){
    const T=await loadTesseract(),jobs=await buildJobs(file),readings=[];
    for(let i=0;i<jobs.length;i++){
      const j=jobs[i];
      for(const psm of j.region==='full'?[4,6]:[4]){
        try{
          const r=await T.recognize(j.input,'por',{logger:m=>{if(m.status==='recognizing text'&&onProgress)onProgress((i+m.progress)/(jobs.length+2))},config:{tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'}});
          const words=r.data?.words||[],conf=words.length?words.reduce((a,w)=>a+Math.max(0,Number(w.confidence??w.conf??0)),0)/words.length/100:Number(r.data?.confidence||0)/100;
          const text=String(r.data?.text||'').trim();if(text)readings.push({source:'tesseract',label:`${j.label}/psm${psm}`,region:j.region,text,confidence:clamp(conf),data:r.data||{}});
        }catch(e){readings.push({source:'tesseract',label:`${j.label}/psm${psm}`,region:j.region,text:'',confidence:0,error:String(e?.message||e)})}
      }
    }
    return readings;
  }
  function textSignature(text){return String(text||'').toUpperCase().replace(/\s+/g,' ').trim().slice(0,240)}
  function audit(readings,qrEvidence){
    return {engine:'receipt-engine-2.6',qr:qrEvidence||null,sources:readings.map(r=>({source:r.source,label:r.label||'',region:r.region||'',confidence:Number(r.confidence||0),chars:String(r.text||'').length,signature:textSignature(r.text)}))};
  }
  async function run(file,ctx={}){
    const out={readings:[],errors:[],qr:null,audit:null};
    try{out.qr=await qr(file);out.readings.push(out.qr)}catch(e){out.errors.push({stage:'qr',message:String(e?.message||e)})}
    try{const rs=await tesseract(file,ctx.loadTesseract,p=>ctx.onProgress?.(clamp(p)));out.readings.push(...rs)}catch(e){out.errors.push({stage:'tesseract',message:String(e?.message||e)})}
    out.audit=audit(out.readings,out.qr);
    return out;
  }
  global.ReceiptEngine={run,keyCheckDigit,parseQr,extractKeyFromText,preprocessVariants:async file=>{
    const out=[];for(const mode of ['gray','soft','contrast','shadow','adaptive'])out.push({label:mode,blob:mode==='gray'?file:await imageBlob(file,mode)});return out;
  }};
})(typeof window!=='undefined'?window:globalThis);
