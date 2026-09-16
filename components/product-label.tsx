import {useEffect,useRef,useState} from 'react';
import {parsePrintedMRP,parseProductCode,LabelDraft} from '@/lib/product-label';
export function ProductLabel({apply}:{apply:(draft:LabelDraft)=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[draft,setDraft]=useState<LabelDraft|null>(null),[raw,setRaw]=useState('');
 const generation=useRef(0),worker=useRef<any>(null);
 useEffect(()=>()=>{generation.current++;worker.current?.terminate().catch(()=>{})},[]);
 async function scan(file?:File){
  if(!file||busy)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){setStatus('Choose JPG, PNG or WebP under 12 MB.');return}
  const session=++generation.current;setBusy(true);setDraft(null);setStatus('Reading barcode and printed MRP…');
  let url='',w:any;
  try{
   url=URL.createObjectURL(file);
   let code:LabelDraft={source:'label'};
   try{const {BrowserMultiFormatReader}=await import('@zxing/browser');const r=await new BrowserMultiFormatReader().decodeFromImageUrl(url);code=parseProductCode(r.getText())}catch{/* OCR can still read printed MRP */}
   const {createWorker}=await import('tesseract.js');
   w=await createWorker('eng');worker.current=w;
   if(session!==generation.current)return;
   const result=await w.recognize(file);
   if(session!==generation.current)return;
   setRaw(result.data.text);
   const mrp=parsePrintedMRP(result.data.text)??code.mrp;
   setDraft({...code,mrp,source:'label'});
   setStatus(mrp!==undefined?'Review the MRP against the label before using it.':'MRP not clear or multiple prices found. Enter the correct value below.');
  }catch{if(session===generation.current)setStatus('Could not read the image. Enter MRP manually or try a sharper photo.')}
  finally{if(url)URL.revokeObjectURL(url);if(w)await w.terminate().catch(()=>{});if(worker.current===w)worker.current=null;if(session===generation.current)setBusy(false)}
 }
 return <section className="label-capture">
  <b>Read MRP from a product label</b><p className="muted small">A normal barcode has no price. Photograph the printed MRP or scan a QR containing an MRP field. Review before saving.</p>
  <label className="btn">Photograph / upload label<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void scan(e.target.files?.[0]);e.target.value=''}}/></label>
  {status&&<p role="status">{status}</p>}
  {draft&&<div className="form"><label>MRP detected (₹)<input type="number" min="0.01" step=".01" value={draft.mrp??''} onChange={e=>setDraft({...draft,mrp:e.target.value===''?undefined:Number(e.target.value)})}/></label><label>Barcode detected<input value={draft.barcode??''} onChange={e=>setDraft({...draft,barcode:e.target.value})}/></label><button type="button" className="btn" disabled={busy||(!draft.mrp&&!draft.barcode)} onClick={()=>{apply(draft);setDraft(null);setStatus('Details copied into product form. Check all values and save.')}}>Use reviewed details</button></div>}
  {raw&&<details><summary>Extracted label text</summary><pre style={{whiteSpace:'pre-wrap'}}>{raw}</pre></details>}
 </section>;
}
