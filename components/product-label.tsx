import {useEffect,useRef,useState} from 'react';
import {printedMRPCandidates,productNameSuggestions,parseProductCode,LabelDraft} from '@/lib/product-label';
import {prepareBillImage,defaultImageOptions} from '@/lib/bill-image';
export function ProductLabel({apply}:{apply:(draft:LabelDraft)=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[draft,setDraft]=useState<LabelDraft>({source:'label'}),[raw,setRaw]=useState('');
 const [file,setFile]=useState<File>(),[preview,setPreview]=useState(''),[rotation,setRotation]=useState(0),[names,setNames]=useState<string[]>([]),[prices,setPrices]=useState<number[]>([]);
 const generation=useRef(0),worker=useRef<any>(null);
 useEffect(()=>()=>{generation.current++;worker.current?.terminate().catch(()=>{})},[]);
 useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
 function choose(f?:File){if(!f||busy)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>12*1024*1024){setStatus('Choose JPG, PNG or WebP under 12 MB.');return}setFile(f);setRotation(0);setStatus('Check the photo, then select Read label. Existing reviewed details are kept when you add another photo.')}
 async function scan(){
  if(!file||busy)return;
  const session=++generation.current;setBusy(true);setStatus('Reading product name, MRP and barcode…');let w:any;
  try{
   const image=await prepareBillImage(file,{...defaultImageOptions,rotation});
   let code:LabelDraft={source:'label'};
   try{const {BrowserMultiFormatReader}=await import('@zxing/browser');const r=await new BrowserMultiFormatReader().decodeFromImageUrl(preview);code=parseProductCode(r.getText())}catch{/* Printed text can still be read. */}
   if(session!==generation.current)return;
   const {createWorker,PSM}=await import('tesseract.js');w=await createWorker('eng');worker.current=w;
   if(session!==generation.current)return;
   const texts:string[]=[];
   for(const mode of [PSM.AUTO,PSM.SPARSE_TEXT]){
    await w.setParameters({tessedit_pageseg_mode:mode});
    const result=await w.recognize(image,{rotateAuto:true});
    if(session!==generation.current)return;texts.push(result.data.text);
   }
   const text=texts.join('\n');const foundNames=productNameSuggestions(text),foundPrices=printedMRPCandidates(text);
   if(code.name)foundNames.unshift(code.name);if(code.mrp!==undefined&&!foundPrices.includes(code.mrp))foundPrices.push(code.mrp);
   setRaw(text);setNames([...new Set(foundNames)]);setPrices(foundPrices);
   // Never replace a reviewed value with another photo's guess.
   setDraft(old=>({...old,barcode:old.barcode||code.barcode,name:old.name||code.name||(foundNames.length===1?foundNames[0]:undefined),mrp:old.mrp??(foundPrices.length===1?foundPrices[0]:undefined),source:'label'}));
   setStatus(foundPrices.length>1?'Multiple MRP values found. Select the correct pack price and review the product name.':'Choose or edit the product name and check MRP. You can add a front or back photo to read missing details.');
  }catch(e){if(session===generation.current)setStatus('Could not read this photo. Try a closer, well-lit photo or enter the details below.')}
  finally{if(w)await w.terminate().catch(()=>{});if(worker.current===w)worker.current=null;if(session===generation.current)setBusy(false)}
 }
 const valid=(!draft.mrp||(Number.isFinite(draft.mrp)&&draft.mrp>0&&draft.mrp<=10000000))&&(draft.mrp===undefined||draft.mrp>0)&&!!(draft.name?.trim()||draft.barcode?.trim()||draft.mrp);
 return <section className="label-capture">
  <b>Scan product name & MRP</b><p className="muted small">Barcode scanning identifies a saved product. For a new product, photograph its name and printed MRP. Use separate front and back photos if needed. English text recognition; always review the results.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <label className="btn">Take photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/></label>
   <label className="btn">Upload photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value=''}}/></label>
  </div>
  {file&&<div><img src={preview} alt="Product label to read" style={{display:'block',maxWidth:'100%',height:200,objectFit:'contain',margin:'12px auto'}}/><label>Text rotation<select disabled={busy} value={rotation} onChange={e=>setRotation(Number(e.target.value))}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label><button type="button" className="btn" disabled={busy} onClick={()=>void scan()}>{busy?'Reading…':'Read label'}</button></div>}
  {status&&<p role="status">{status}</p>}
  <div className="form">
   {!!names.length&&<label>Name suggestions<select disabled={busy} value="" onChange={e=>setDraft({...draft,name:e.target.value})}><option value="">Choose text from the label</option>{names.map(n=><option key={n}>{n}</option>)}</select></label>}
   <label>Product name (review / edit)<input disabled={busy} maxLength={199} value={draft.name??''} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   {prices.length>1&&<label>MRP candidates<select disabled={busy} value="" onChange={e=>setDraft({...draft,mrp:Number(e.target.value)})}><option value="">Select correct MRP</option>{prices.map(n=><option key={n} value={n}>₹{n.toFixed(2)}</option>)}</select></label>}
   <label>MRP (₹)<input disabled={busy} type="number" min="0.01" max="10000000" step=".01" value={draft.mrp??''} onChange={e=>setDraft({...draft,mrp:e.target.value===''?undefined:Number(e.target.value)})}/></label>
   <label>Barcode<input disabled={busy} maxLength={199} value={draft.barcode??''} onChange={e=>setDraft({...draft,barcode:e.target.value})}/></label>
   <button type="button" className="btn" disabled={busy||!valid} onClick={()=>{apply({...draft,name:draft.name?.trim(),barcode:draft.barcode?.trim()});setStatus('Reviewed details copied into the product form. Enter cost and stock, check the selling price, then save.')}}>Use reviewed details</button>
  </div>
  {raw&&<details><summary>Extracted label text</summary><pre style={{whiteSpace:'pre-wrap'}}>{raw}</pre></details>}
 </section>;
}
