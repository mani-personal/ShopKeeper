import {useEffect,useRef,useState} from 'react';
import {Printer} from 'lucide-react';
import {receiptMarkup,receiptCSS,ReceiptPaper} from '@/lib/receipt';
import type {Sale,State} from '@/lib/store';
export function SaleReceipt({sale,settings,demo}:{sale:Sale;settings:State['settings'];demo:boolean}){
 const [paper,setPaper]=useState<ReceiptPaper>(()=>{try{const p=localStorage.getItem('shopkeeper-receipt-paper');return p==='58'||p==='A4'?p:'80'}catch{return '80'}});
 const [error,setError]=useState(''),[printing,setPrinting]=useState(false);
 const frame=useRef<HTMLIFrameElement|null>(null);
 useEffect(()=>()=>{frame.current?.remove()},[]);
 const markup=receiptMarkup(sale,settings,demo),css=receiptCSS(paper);
 function print(){
  if(printing)return;setError('');setPrinting(true);frame.current?.remove();
  const iframe=document.createElement('iframe');frame.current=iframe;
  iframe.title='Receipt print document';iframe.style.cssText='position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
  iframe.onload=()=>{
   const win=iframe.contentWindow,doc=iframe.contentDocument;
   if(!win||!doc){setError('Print preview could not open. Please retry.');setPrinting(false);return}
   if(paper!=='A4'){
    const height=doc.querySelector('.receipt-document')!.getBoundingClientRect().height;
    const mm=Math.min(1000,Math.max(50,Math.ceil(height*25.4/96)+(paper==='58'?10:8)+3));
    const style=doc.createElement('style');style.textContent='@page{size:'+paper+'mm '+mm+'mm;margin:'+(paper==='58'?'5mm':'4mm')+'}';doc.head.appendChild(style);
   }
   win.addEventListener('afterprint',()=>{setPrinting(false);setTimeout(()=>{if(frame.current===iframe){iframe.remove();frame.current=null}},0)},{once:true});
   try{win.focus();win.print();setPrinting(false)}catch{setPrinting(false);setError('Your browser could not open printing. Try Chrome or Safari and allow printing.')}
  };
  iframe.srcdoc='<!doctype html><html><head><meta charset="utf-8"><title>Sales receipt</title><style>'+css+'</style></head><body>'+markup+'</body></html>';
  document.body.appendChild(iframe);
 }
 return <>
  <label className="form">Receipt paper size<select aria-label="Receipt paper size" value={paper} onChange={e=>{const value=e.target.value as ReceiptPaper;setPaper(value);try{localStorage.setItem('shopkeeper-receipt-paper',value)}catch{}}}><option value="58">58 mm thermal</option><option value="80">80 mm thermal</option><option value="A4">A4</option></select></label>
  <p className="muted small">Choose the same paper width in your printer settings. Use 100% scale and turn off browser headers and footers.</p>
  <div className="receipt-preview"><iframe title="Receipt preview" srcDoc={'<!doctype html><html><head><meta charset="utf-8"><style>'+css+'body{padding:12px}</style></head><body>'+markup+'</body></html>'} style={{width:'100%',height:'420px',border:'1px solid #d1d5db',background:'white'}}/></div>
  {error&&<div role="alert" className="notice error">{error}</div>}
  <button className="btn primary" disabled={printing} onClick={print}><Printer size={16}/>{printing?'Opening print preview…':'Print receipt'}</button>
 </>;
}
