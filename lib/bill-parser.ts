import type {Product} from './store';
export type BillItem={name:string;barcode:string;category:string;qty:number;cost:number;price:number;lineTotal?:number;warnings?:string[];source?:string;confidence?:number;unit?:string;taxPercent?:number};
export type BillWord={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
export type BillLayout='auto'|'qty-rate-total'|'rate-qty-total'|'qty-total'|'qty-unit-rate-tax-total';
export type BillParseResult={items:BillItem[];unparsed:string[];warnings:string[];method:string};
type Col='name'|'qty'|'cost'|'total'|'hsn'|'barcode'|'mrp'|'tax'|'discount'|'serial'|'unit';
type Header={col:Col;x:number};
const cleanName=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const footer=/^(?:sub\s*total|grand\s*total|net\s*(?:amount|total|payable)|total\b|amount\s*(?:due|payable|in\s*words)|gst(?:in)?\b|[cs i]?gst\b|tax\b|discount\b|balance\b|cash\b|change\b|round\s*off|invoice\b|bill\s*(?:no|number)|date\b|phone\b|mobile\b|thank\b|bank\b|ifsc\b|account\b)/i;
function number(text:string):number|undefined{
 const t=text.trim().replace(/^(?:₹|Rs\.?|INR)\s*/i,'').replace(/,/g,'');
 if(!/^\d+(?:\.\d{1,3})?$/.test(t))return;
 const n=Number(t);return Number.isFinite(n)&&n<=10000000?n:undefined;
}
function kind(word:string):Col|undefined{
 const t=word.toLowerCase().replace(/[^a-z]/g,'');
 if(['description','particulars','product','item','name','goods'].includes(t))return 'name';
 if(['qty','quantity','qnty','units'].includes(t))return 'qty';
 if(['rate','cost','price'].includes(t))return 'cost';
 if(['amount','total','value','amt'].includes(t))return 'total';
 if(['hsn','sac'].includes(t))return 'hsn';
 if(['barcode','sku','code'].includes(t))return 'barcode';
 if(t==='mrp')return 'mrp';
 if(['gst','cgst','sgst','igst','tax'].includes(t))return 'tax';
 if(['disc','discount'].includes(t))return 'discount';
 if(['sr','sl','sno','no','serial'].includes(t))return 'serial';
 if(['uom','unit','pack'].includes(t))return 'unit';
}
function isHeader(cols:Col[]){return cols.includes('qty')&&(cols.includes('cost')||cols.includes('total'))}
function item(name:string,fields:Partial<Record<Col,string>>,products:Product[],source:string,confidence?:number):BillItem|undefined{
 name=name.replace(/^\s*\d+[.)]?\s+/,'').trim();
 if(!/[\p{L}]/u.test(name)||footer.test(name))return;
 const qty=number(fields.qty??''),rate=number(fields.cost??''),total=number(fields.total??'');
 if(qty===undefined||qty<=0||(rate===undefined&&total===undefined))return;
 const warnings:string[]=[];
 let cost=rate;
 if(cost===undefined){cost=Math.round(total!/qty*100)/100;warnings.push('Unit cost calculated from line amount / quantity. Check discounts and tax.')}
 if(!Number.isInteger(qty))warnings.push('Fractional quantity: this inventory supports whole units only.');
 if(qty>1000000)warnings.push('Quantity exceeds the supported limit.');
 const percent=fields.tax?.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];const taxPercent=percent?Number(percent):undefined;
 const calculated=qty*cost*(taxPercent!==undefined?1+taxPercent/100:1);
 if(total!==undefined&&Math.abs(calculated-total)>0.05)warnings.push('Amount mismatch: expected '+calculated.toFixed(2)+(taxPercent!==undefined?' including '+taxPercent+'% tax':' before tax')+', printed '+total.toFixed(2)+'. Verify this row.');
 if(fields.tax||fields.discount)warnings.push('Tax / discount columns found. Verify the unit cost you want recorded.');
 if(confidence!==undefined&&confidence<75)warnings.push('Low OCR confidence. Compare this row with the photo.');
 const code=fields.barcode?.trim();
 const candidates=products.filter(p=>code?p.barcode===code:cleanName(p.name)===cleanName(name));
 const known=candidates.length===1?candidates[0]:undefined;
 if(!known)warnings.push('Choose an inventory match or enter barcode and selling price for a new item.');
 if(candidates.length>1)warnings.push('Multiple products match this name. Choose the exact product.');
 if(known&&fields.unit&&cleanName(known.unit)!==cleanName(fields.unit))warnings.push('Bill unit differs from saved pack/unit. Check quantity conversion.');
 return {unit:fields.unit??known?.unit??'piece',taxPercent,name:known?.name??name,barcode:known?.barcode??code??'',category:known?.category??'Imported',qty,cost,price:known?.price??NaN,lineTotal:total,warnings,source,confidence};
}
function wordRows(words:BillWord[]):BillWord[][]{
 const sorted=words.filter(w=>w.text.trim()&&w.bbox).sort((a,b)=>(a.bbox.y0+a.bbox.y1)/2-(b.bbox.y0+b.bbox.y1)/2);
 const rows:{y:number;h:number;words:BillWord[]}[]=[];
 for(const w of sorted){
  const y=(w.bbox.y0+w.bbox.y1)/2,h=w.bbox.y1-w.bbox.y0;
  let row=rows.slice(-4).find(r=>Math.abs(r.y-y)<=Math.max(4,Math.min(r.h,h)*0.6));
  if(!row){row={y,h,words:[]};rows.push(row)}
  row.words.push(w);
 }
 return rows.map(r=>r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0));
}
function geometry(words:BillWord[],products:Product[]):BillParseResult|undefined{
 const rows=wordRows(words);let header:Header[]|undefined;
 const items:BillItem[]=[],unparsed:string[]=[];let pending='';
 for(const row of rows){
  const text=row.map(w=>w.text).join(' ');
  const headerWords=row.map(w=>({col:kind(w.text),x:(w.bbox.x0+w.bbox.x1)/2})).filter((h):h is Header=>h.col!==undefined);
  if(isHeader(headerWords.map(h=>h.col))){
   // Avoid interpreting a normal row containing a product called "Rice" as a header.
   header=headerWords.filter((h,i,a)=>i===a.findIndex(x=>x.col===h.col)).sort((a,b)=>a.x-b.x);pending='';continue;
  }
  if(!header)continue;
  if(footer.test(text)){pending='';continue}
  const fields:Partial<Record<Col,string>>={};
  for(const word of row){
   const center=(word.bbox.x0+word.bbox.x1)/2;
   const col=header.reduce((best,h)=>Math.abs(h.x-center)<Math.abs(best.x-center)?h:best).col;
   fields[col]=(fields[col]?fields[col]+' ':'')+word.text;
  }
  const qtyUnit=fields.qty?.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/i);if(qtyUnit){fields.qty=qtyUnit[1];fields.unit=qtyUnit[2].toLowerCase()}
  const rawName=fields.name??'';
  if(rawName&&!fields.qty&&!fields.cost&&!fields.total){pending=(pending+' '+rawName).trim();continue}
  const name=(pending+' '+rawName).trim();
  const parsed=item(name,fields,products,text,row.reduce((n,w)=>n+w.confidence,0)/row.length);
  if(parsed){items.push(parsed);pending=''}
  else if(/\d/.test(text)){unparsed.push((pending+' '+text).trim());pending=''}
 }
 if(pending)unparsed.push(pending);
 if(!header)return;
 return {items,unparsed,warnings:[],method:'Detected table columns'};
}
function tokens(line:string){return line.replace(/[₹]/g,'').replace(/\b(?:Rs\.?|INR)\s*/gi,'').split(/\s+/).filter(Boolean)}
function textRows(text:string,products:Product[],layout:BillLayout):BillParseResult{
 const items:BillItem[]=[],unparsed:string[]=[];
 let header:Col[]|undefined,pending='';
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  const parts=tokens(line.replace(/\|/g,' '));
  const headerParts=tokens(line.replace(/\bunit\s+(?:cost|price|rate)\b/gi,'Rate').replace(/\bitem\s+name\b/gi,'Description'));
  const detected=headerParts.map(kind).filter((x):x is Col=>!!x);
  if(isHeader(detected)){header=detected.filter((c,i,a)=>i===a.indexOf(c));continue}
  if(footer.test(line)){pending='';continue}
  let fields:Partial<Record<Col,string>>={},name='',quantityWarning='';
  const unitPattern=/^(.*?)\s+([0-9SOIl]+(?:\.\d+)?)\s*(KG|KGS|G|GM|GMS|L|LTR|ML|PCS|PC|NOS|BOX|PKT|PACK)\s+(\d[\d,]*(?:\.\d{1,3})?)\s+(\d[\d,]*(?:\.\d{1,3})?)\s*\(?\s*(\d+(?:\.\d+)?)\s*%\s*\)?\s+(\d[\d,]*(?:\.\d{1,3})?)\s*$/i;
  const unitMatch=parts.join(' ').match(unitPattern);
  if((layout==='auto'||layout==='qty-unit-rate-tax-total')&&unitMatch){
   name=unitMatch[1];let quantity=unitMatch[2];
   if(!/^\d+(?:\.\d+)?$/.test(quantity)){
    const rate=number(unitMatch[4]),printed=number(unitMatch[7]),percent=Number(unitMatch[6]);
    const choices=[quantity.replace(/S/gi,'5').replace(/O/gi,'0').replace(/[Il]/g,'1'),quantity.replace(/[SOIl]/g,'')];
    const candidates=[...new Set(choices.map(number).filter((q):q is number=>q!==undefined&&q>0&&Number.isInteger(q)))].filter(q=>rate!==undefined&&printed!==undefined&&Math.abs(q*rate*(1+percent/100)-printed)<.05);
    if(candidates.length===1){quantityWarning='OCR quantity "'+quantity+'" interpreted as '+candidates[0]+' using printed rate, tax and amount. Verify against the image.';quantity=String(candidates[0])}
   }
   fields={qty:quantity,unit:unitMatch[3].toLowerCase(),cost:unitMatch[4],tax:unitMatch[5]+' ('+unitMatch[6]+'%)',total:unitMatch[7]};
  }
  else 
  if(layout==='auto'&&header&&header.includes('name')){
   const nameAt=header.indexOf('name'),before=header.slice(0,nameAt),after=header.slice(nameAt+1);
   const end=parts.length-after.length;
   if(end>before.length||(pending&&end===before.length)){
    before.forEach((c,i)=>fields[c]=parts[i]);
    name=parts.slice(before.length,end).join(' ');
    after.forEach((c,i)=>fields[c]=parts[end+i]);
   }
  }else{
   const schema:Col[]=layout==='rate-qty-total'?['cost','qty','total']:layout==='qty-total'?['qty','total']:['qty','cost','total'];
   // Conservative fallback: 3 numeric columns (or explicit 2-column layout).
   // Two numbers with no header are ambiguous and require the user's column choice.
   const count=schema.length,tail=parts.slice(-count);
   if((parts.length>count||!!pending)&&tail.every(t=>number(t)!==undefined)){
    name=parts.slice(0,-count).join(' ');schema.forEach((c,i)=>fields[c]=tail[i]);
   }
  }
  if(name||pending){
   const parsed=item((pending+' '+name).trim(),fields,products,line);
   if(parsed){if(quantityWarning)parsed.warnings?.unshift(quantityWarning);items.push(parsed);pending='';continue}
  }
  // Wrapped name immediately preceding a numeric row; retain it, don't invent prices.
  if(!/\d/.test(line)&&/[\p{L}]/u.test(line)&&line.length<160){if(header||items.length){if(pending)unparsed.push(pending);pending=line}else unparsed.push(line);continue}
  if(pending){unparsed.push(pending);pending=''}
  if(/\d/.test(line)&&!/^[-=\s]+$/.test(line))unparsed.push(line);
 }
 if(pending)unparsed.push(pending);
 return {items,unparsed,warnings:[],method:header&&layout==='auto'?'Header-based text columns':'Selected text layout'};
}
export function parseBillDocument(text:string,products:Product[],options:{words?:BillWord[];layout?:BillLayout}={}):BillParseResult{
 const layout=options.layout??'auto';
 const result=layout==='auto'&&options.words?.length?geometry(options.words,products)??textRows(wordRows(options.words).map(row=>row.map(w=>w.text).join(' ')).join('\n'),products,layout):textRows(text,products,layout);
 result.unparsed=[...new Set(result.unparsed)].slice(0,200);
 if(!result.items.length)result.warnings.push('No reliable item rows found. Crop to the item table, choose the column order, or add rows manually.');
 if(result.unparsed.length)result.warnings.push(result.unparsed.length+' lines were not imported. Check for missing items.');
 if(result.items.length>100)result.warnings.push('More than 100 rows found. Import in batches of up to 100.');
 return result;
}
export function parseBill(text:string,products:Product[]):BillItem[]{return parseBillDocument(text,products).items}
export function billWords(data:{blocks?:any[]|null}):BillWord[]{
 return (data.blocks??[]).flatMap(b=>(b.paragraphs??[]).flatMap((p:any)=>(p.lines??[]).flatMap((l:any)=>l.words??[]))).map((w:any)=>({text:w.text,confidence:w.confidence??0,bbox:w.bbox}));
}
