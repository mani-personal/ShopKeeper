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
 const values=printedMRPCandidates(text);
 return values.length===1?values[0]:undefined;
}

/** Suggestions only: packaging also contains manufacturers and advertising. */
export function productNameSuggestions(text:string):string[]{
 const excluded=/\b(?:mrp|m\s*\.\s*r\s*\.\s*p|maximum retail|unit sale|price|inclusive|taxes|manufactur\w*|marketed|distributed|ingredients|directions|how to|caution|warning|customer|consumer|care cell|batch|expiry|best before|packed|address|www|https|email|recycl\w*|net quantity|net weight|made in|mfd|licence|license)\b/i;
 const lines=text.split(/\r?\n/).map(s=>s.replace(/^[^\p{L}\p{N}]+/u,'').replace(/\s+/g,' ').trim()).filter(s=>s.length>=3&&s.length<=100&&/[a-z]{3}/i.test(s)&&!excluded.test(s)&&!/[@:;]|\d{6}/.test(s));
 return [...new Set(lines)].slice(0,12);
}
export function printedMRPCandidates(text:string):number[]{
 const normalized=text.replace(/maximum\s+retail\s+price/gi,'MRP');
 const pattern=/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?\s*(?:\([^)]{0,60}\))?\s*[:=\-]?\s*(?:₹|RS\.?|INR)?\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
 return [...new Set([...normalized.matchAll(pattern)].map(m=>amount(m[1])).filter((n):n is number=>n!==undefined))];
}
