export type LabelDraft={barcode?:string;name?:string;mrp?:number;source:'barcode'|'qr'|'label'};
function amount(value:unknown):number|undefined{
 if(typeof value!=='string'&&typeof value!=='number')return;
 const raw=String(value).replace(/^(?:INR|Rs\.?|₹)\s*/i,'').replace(/,/g,'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return;
 const n=Number(raw);return n>0&&n<=10000000?n:undefined;
}
export function parseProductCode(raw:string):LabelDraft{
 const text=raw.trim();if(!text||text.length>4000)throw Error('Code is empty or too long.');
 let record:Record<string,unknown>|undefined;
 try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))record=parsed}catch{/* not JSON */}
 if(!record&&/^https?:\/\//i.test(text)){
  const url=new URL(text);record=Object.fromEntries(url.searchParams);
  // GS1 Digital Link identifier, without making a network request.
  const gtin=url.pathname.match(/\/01\/(\d{14})(?:\/|$)/)?.[1];if(gtin)record.barcode??=gtin;
 }
 if(record){
  const normalized=Object.fromEntries(Object.entries(record).map(([k,v])=>[k.toLowerCase(),v]));
  if(normalized.currency!==undefined&&String(normalized.currency).toUpperCase()!=='INR')throw Error('Only INR MRP values are supported.');
  const code=normalized.barcode??normalized.gtin??normalized.code??normalized.sku;
  const barcode=typeof code==='string'&&code.trim().length<=199?code.trim():undefined;
  const name=typeof normalized.name==='string'?normalized.name.slice(0,199):undefined;
  const mrp=amount(normalized.mrp);
  if(!barcode&&!mrp)throw Error('QR has no supported barcode or MRP. Use a label photo or enter details manually.');
  return {barcode,name,mrp,source:'qr'};
 }
 if(text.length>199||/[\r\n]/.test(text))throw Error('Unsupported QR data. Use JSON with barcode and mrp fields.');
 return {barcode:text,source:'barcode'};
}
export function parsePrintedMRP(text:string):number|undefined{
 // Deliberately anchored to MRP to avoid mistaking unit price, dates or quantities.
 const hits=[...text.matchAll(/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?\s*(?:\([^\n)]{0,45}\))?\s*[:=\-]?\s*(?:₹|RS\.?|INR)?\s*(\d[\d,]*(?:\.\d{1,2})?)/gi)];
 const values=[...new Set(hits.map(m=>amount(m[1])).filter((n):n is number=>n!==undefined))];
 return values.length===1?values[0]:undefined;
}
