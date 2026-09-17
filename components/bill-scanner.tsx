'use client';
import {useRef,useState,useEffect} from 'react';
import {Camera,Upload,Plus,Trash2,FileScan,Check,RotateCw} from 'lucide-react';
import {toast} from 'sonner';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
import {Checkbox} from '@/components/ui/checkbox';
import {Progress} from '@/components/ui/progress';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {parseBillDocument,billWords,BillItem,BillLayout,BillWord,BillParseResult} from '@/lib/bill-parser';
import {prepareBillImage,defaultImageOptions,BillImageOptions} from '@/lib/bill-image';
import {money,roundMoney} from '@/lib/store';
import type {Product} from '@/lib/store';
const empty:BillParseResult={items:[],unparsed:[],warnings:[],method:''};
export function BillScanner({products,storeName,busy,save}:{products:Product[];storeName:string;busy:boolean;save:(a:any)=>Promise<boolean>}){
 const [paid,setPaid]=useState(false),[text,setText]=useState(''),[items,setItems]=useState<BillItem[]>([]);
 const [supplier,setSupplier]=useState(''),[working,setWorking]=useState(false),[progress,setProgress]=useState(0),[status,setStatus]=useState('');
 const [reviewed,setReviewed]=useState(false),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState('');
 const [options,setOptions]=useState<BillImageOptions>(defaultImageOptions),[layout,setLayout]=useState<BillLayout>('auto');
 const [parsed,setParsed]=useState<BillParseResult>(empty),[expected,setExpected]=useState(''),[expectedCount,setExpectedCount]=useState('');
 const [preparing,setPreparing]=useState(false),[dirty,setDirty]=useState(false);
 const worker=useRef<any>(null),generation=useRef(0),op=useRef(crypto.randomUUID()),words=useRef<BillWord[]>([]),alive=useRef(true),locked=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;worker.current?.terminate().catch(()=>{})}},[]);
 useEffect(()=>{
  if(!file)return;
  let valid=true;setPreparing(true);setPreview('');setReviewed(false);
  prepareBillImage(file,options).then(value=>{if(valid){setPreview(value);setDirty(true)}}).catch(e=>{if(valid)toast.error((e as Error).message)}).finally(()=>{if(valid)setPreparing(false)});
  return()=>{valid=false};
 },[file,options]);
 function select(file?:File){
  if(!file||locked.current)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024){toast.error('Use a JPG, PNG or WebP under 15 MB. For PDF, export the bill page as an image.');return}
  setFile(file);setOptions({...defaultImageOptions});setReviewed(false);setStatus('Check orientation and crop, then read the bill.');setDirty(true);
 }
 function load(result:BillParseResult){setParsed(result);setItems(result.items);setReviewed(false);setDirty(false)}
 async function scan(){
  if(!preview||locked.current)return;
  locked.current=true;const session=++generation.current;setWorking(true);setReviewed(false);setProgress(0);setStatus('Loading the OCR engine…');
  let w:any;
  try{
   const {createWorker,PSM}=await import('tesseract.js');
   w=await createWorker('eng',1,{logger:m=>{if(alive.current&&generation.current===session&&m.status==='recognizing text')setProgress(Math.round(m.progress*100))}});
   if(!alive.current||session!==generation.current){await w.terminate();return}
   worker.current=w;
   await w.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1',user_defined_dpi:'300'});
   setStatus('Reading rows and columns…');
   const first=await w.recognize(preview,{rotateAuto:true},{text:true,blocks:true});
   if(!alive.current||session!==generation.current)return;
   let best={text:first.data.text,words:billWords(first.data)};
   let result=parseBillDocument(best.text,products,{words:best.words,layout});
   // A second segmentation pass is valuable for border-heavy and headerless tables.
   setStatus('Checking the table with a second reading…');setProgress(0);
   await w.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
   const second=await w.recognize(preview,{rotateAuto:true},{text:true,blocks:true});
   if(!alive.current||session!==generation.current)return;
   const secondWords=billWords(second.data),other=parseBillDocument(second.data.text,products,{words:secondWords,layout});
   const score=(r:BillParseResult)=>r.items.length*10-r.items.filter(x=>x.warnings?.some(w=>w.startsWith('Amount mismatch'))).length*2-r.unparsed.length*.1;
   if(score(other)>score(result)){result=other;best={text:second.data.text,words:secondWords}}
   words.current=best.words;setText(best.text);load(result);
   setStatus('Found '+result.items.length+' item rows. Compare every row with the bill before importing.');
  }catch(e){if(alive.current&&session===generation.current){setStatus('Reading failed. Check the image or paste the bill text.');toast.error((e as Error).message||'Could not read bill.')}}
  finally{if(w)await w.terminate().catch(()=>{});if(worker.current===w)worker.current=null;if(alive.current&&generation.current===session){setWorking(false);locked.current=false}}
 }
 function cancel(){generation.current++;worker.current?.terminate().catch(()=>{});worker.current=null;locked.current=false;setWorking(false);setReviewed(false);setStatus('Reading cancelled. Your existing review rows are unchanged.')}
 function edit(i:number,key:keyof BillItem,value:string|number){setReviewed(false);setItems(rows=>rows.map((r,n)=>n===i?{...r,[key]:value}:r))}
 const valid=items.length>0&&items.length<=100&&items.every(x=>x.name.trim()&&x.barcode.trim()&&Number.isInteger(x.qty)&&x.qty>0&&x.qty<=1000000&&Number.isFinite(x.cost)&&x.cost>=0&&Number.isFinite(x.price)&&x.price>=0);
 const subtotal=roundMoney(items.reduce((t,p)=>t+(Number.isFinite(p.cost)?p.qty*p.cost:0),0));
 const countMismatch=expectedCount!==''&&Number(expectedCount)!==items.length;
 const amountMismatch=expected!==''&&Math.abs(Number(expected)-subtotal)>.05;
 const mismatch=countMismatch||amountMismatch;
 function resetReview(){setItems([]);setText('');setParsed(empty);setReviewed(false);setExpected('');setExpectedCount('');setPaid(false);setFile(null);setPreview('');setDirty(false);words.current=[];op.current=crypto.randomUUID()}
 return <div className="bill-scan">
 <div className="notice">Importing into <b>{storeName}</b>. Matching barcodes increase saved stock. Prices and quantities are never saved until you confirm.</div>
 <div className="scan-upload"><FileScan size={32}/><h2>Read a supplier bill</h2><p>Use a straight, sharp image with the item table and column headings visible. Printed English bills are supported. Readings must be checked.</p>
 <div className="actions"><label className="btn primary"><Camera size={17}/>Take photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={working||busy} onChange={e=>{select(e.target.files?.[0]);e.target.value=''}}/></label>
 <label className="btn"><Upload size={17}/>Upload bill image<input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={working||busy} onChange={e=>{select(e.target.files?.[0]);e.target.value=''}}/></label></div>
 {file&&<><small>{file.name}</small><div className="bill-image-controls form">
 <button className="btn" disabled={working||busy} onClick={()=>setOptions({...options,rotation:(options.rotation+90)%360})}><RotateCw size={16}/>Rotate 90°</button>
 <label>Image cleanup<select aria-label="Image cleanup" disabled={working||busy} value={options.mode} onChange={e=>setOptions({...options,mode:e.target.value as BillImageOptions['mode']})}><option value="original">Original colour</option><option value="contrast">Grayscale + contrast</option><option value="threshold">Black and white</option></select></label>
 {(['top','bottom','left','right'] as const).map(edge=><label key={edge}>Trim {edge} (%)<input type="number" min="0" max="40" step="1" disabled={working||busy} value={options[edge]} onChange={e=>setOptions({...options,[edge]:Math.max(0,Math.min(40,Number(e.target.value)))})}/></label>)}</div>
 <p className="muted small">Trim empty margins and unrelated text. Keep all item rows and headings. Use original colour if cleanup removes faint text.</p>
 {preview&&<details open className="bill-preview"><summary>Bill image preview</summary><img src={preview} alt="Prepared supplier bill for comparison"/></details>}
 <button className="btn primary" disabled={working||busy||preparing||!preview} onClick={()=>void scan()}>{preparing?'Preparing image…':items.length?'Read again and replace rows':'Read bill'}</button></>}
 {status&&<p role="status">{status}</p>}{working&&<><Progress value={progress}/><button className="btn" onClick={cancel}>Cancel reading</button></>}
 </div>
 <div className="form"><label>Column layout<select aria-label="Column layout" value={layout} disabled={working||busy} onChange={e=>{setLayout(e.target.value as BillLayout);setDirty(true);setReviewed(false)}}><option value="auto">Automatic (use headings when available)</option><option value="qty-rate-total">Name · Quantity · Unit cost · Amount</option><option value="rate-qty-total">Name · Unit cost · Quantity · Amount</option><option value="qty-total">Name · Quantity · Amount (derive cost)</option><option value="qty-unit-rate-tax-total">Name · Quantity + unit · Rate · Tax (%) · Amount</option></select></label>
 <label>Extracted text / paste bill text<textarea rows={7} disabled={working||busy} value={text} onChange={e=>{setText(e.target.value);words.current=[];setDirty(true);setReviewed(false)}} placeholder={'Description  Qty  Rate  Amount\nTata Salt  10  23.00  230.00'}/></label></div>
 <div className="actions"><button className="btn" disabled={!text.trim()||working||busy} onClick={()=>load(parseBillDocument(text,products,{words:words.current,layout}))}>{items.length?'Re-extract and replace rows':'Extract item rows'}</button>
 <button className="btn" disabled={busy||working||items.length>=100} onClick={()=>{setItems([...items,{name:'',barcode:'',category:'Imported',unit:'piece',qty:1,cost:NaN,price:NaN,warnings:['Manual row: enter all item details.']}]);setReviewed(false)}}><Plus size={16}/>Add missing row</button></div>
 {dirty&&items.length>0&&<div className="notice">The image, text or layout changed. Read / re-extract before confirming, or continue editing the current rows using the button below.<button className="btn" onClick={()=>{setDirty(false);setReviewed(false)}}>Keep current rows</button></div>}
 {parsed.method&&<p className="muted small">{parsed.method} · {items.length} rows in review</p>}
 {parsed.warnings.map(w=><div className="notice" key={w}>{w}</div>)}
 {parsed.unparsed.length>0&&<details className="bill-unparsed"><summary>{parsed.unparsed.length} unrecognized lines — check for missing items</summary><ul>{parsed.unparsed.map((line,i)=><li key={i}><code>{line}</code></li>)}</ul></details>}
 <div className="form"><label>Supplier<input value={supplier} disabled={busy||working} onChange={e=>{setSupplier(e.target.value);setReviewed(false)}} placeholder="Supplier name" required/></label></div>
 <div className="bill-review"><Table><TableHeader><TableRow>{['Product / match','Barcode','Unit','Qty','Unit cost ₹','Selling price ₹','Printed amount ₹','Checks',''].map(x=><TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>{items.map((p,i)=><TableRow key={i}>
 <TableCell><input aria-label={'Item '+(i+1)+' name'} disabled={busy||working} value={p.name} onChange={e=>edit(i,'name',e.target.value)}/>
 <Select disabled={busy||working} value={products.find(x=>x.barcode===p.barcode)?.id??'new'} onValueChange={id=>{const match=products.find(p=>p.id===id);if(match){setItems(rows=>rows.map((r,n)=>n===i?{...r,name:match.name,barcode:match.barcode,price:match.price,category:match.category,unit:match.unit}:r));setReviewed(false)}else edit(i,'barcode','')}}><SelectTrigger aria-label={'Match item '+(i+1)}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">New product</SelectItem>{products.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>
 {p.source&&<details><summary>Source row</summary><p>{p.source}</p></details>}</TableCell>
 <TableCell><input aria-label={'Item '+(i+1)+' barcode'} disabled={busy||working} value={p.barcode} onChange={e=>edit(i,'barcode',e.target.value)}/>{!p.barcode&&<button className="text-button" disabled={busy||working} onClick={()=>edit(i,'barcode','ITEM-'+crypto.randomUUID().slice(0,8).toUpperCase())}>Generate code</button>}</TableCell>
 <TableCell><input aria-label={'Item '+(i+1)+' unit'} disabled={busy||working} value={p.unit??'piece'} onChange={e=>edit(i,'unit',e.target.value)}/></TableCell>
 {(['qty','cost','price'] as const).map(k=><TableCell key={k}><input aria-label={'Item '+(i+1)+' '+k} disabled={busy||working} type="number" min={k==='qty'?1:0} step={k==='qty'?1:'.01'} value={Number.isFinite(p[k])?p[k]:''} onChange={e=>edit(i,k,e.target.value===''?NaN:Number(e.target.value))}/></TableCell>)}
 <TableCell>{p.lineTotal!==undefined?money(p.lineTotal):'Not read'}{p.taxPercent!==undefined&&<small style={{display:'block'}}>{p.taxPercent}% tax shown</small>}</TableCell>
 <TableCell className="bill-checks">{p.warnings?.map(w=><p key={w}>{w}</p>)}</TableCell>
 <TableCell><button className="icon-button" aria-label={'Remove row '+(i+1)} disabled={busy||working} onClick={()=>{setItems(items.filter((_,n)=>n!==i));setReviewed(false)}}><Trash2 size={16}/></button></TableCell>
 </TableRow>)}</TableBody></Table></div>
 {!items.length&&<p className="muted">No rows yet. Read an image, paste text or add rows manually.</p>}
 <p className="muted small">Unit cost defaults to the printed rate before tax, not the tax-inclusive line amount. Correct it if your inventory uses tax-inclusive costs. New products require a selling price; the scanner does not assume one. Fractional quantities need manual conversion to whole stock units.</p>
 <div className="bill-totals form"><b>Stock purchase total: {money(subtotal)}</b>
 <label>Expected item rows (optional)<input type="number" min="1" step="1" value={expectedCount} onChange={e=>{setExpectedCount(e.target.value);setReviewed(false)}}/></label>
 <label>Expected stock purchase total ₹ (optional)<input type="number" min="0" step=".01" value={expected} onChange={e=>{setExpected(e.target.value);setReviewed(false)}}/></label></div>
 {mismatch&&<div className="notice error">Expected row count or stock purchase total does not match. Correct the rows or the expected value before importing. Use a total on the same tax basis as the unit costs above.</div>}
 <label className="review-confirm"><Checkbox disabled={busy||working} checked={paid} onCheckedChange={v=>{setPaid(v===true);setReviewed(false)}}/>The imported purchase amount is already fully paid. Otherwise record payments later in Supplier accounts.</label>
 <label className="review-confirm"><Checkbox disabled={busy||working||dirty||!valid||mismatch} checked={reviewed} onCheckedChange={v=>setReviewed(v===true)}/>I compared every row, checked omitted lines and resolved tax/amount warnings against the original bill.</label>
 <button className="btn primary" disabled={busy||working||dirty||!reviewed||!supplier.trim()||!valid||mismatch} onClick={async()=>{
  const payload=items.map(({name,barcode,category,unit,qty,cost,price})=>({name,barcode,category,unit,qty,cost,price}));
  if(await save({type:'bill_import',id:op.current,supplier,items:payload,paid})){resetReview();setStatus('Bill imported. Ready for another bill.')}
 }}><Check size={17}/>{busy?'Saving…':'Import '+items.length+' reviewed items'}</button>
 </div>;
}
