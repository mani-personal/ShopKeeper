import type {Sale,State} from './store';
export type ReceiptPaper='58'|'80'|'A4';
export const escapeReceipt=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00';
export function receiptMarkup(sale:Sale,settings:State['settings'],demo=false):string{
 const e=escapeReceipt;
 const subtotal=sale.items.reduce((t,p)=>t+p.price*p.qty,0);
 // Each sale keeps a snapshot of its products. Older sales may not have an MRP.
 const mrp=(p:Sale['items'][number])=>Number.isFinite(Number(p.mrp))&&Number(p.mrp)>=p.price&&Number(p.mrp)>0?Number(p.mrp):null;
 const saved=Math.max(0,Number(sale.discount||0))+sale.items.reduce((t,p)=>t+(mrp(p)===null?0:(mrp(p)!-p.price)*p.qty),0);
 const hasAllMrp=sale.items.length>0&&sale.items.every(p=>mrp(p)!==null);
 const row=(label:string,n:number,cls='')=>'<div class="receipt-summary '+cls+'"><span>'+e(label)+'</span><strong>'+e(amount(n))+'</strong></div>';
 return '<article class="receipt-document"><header><h1>'+e(settings.name)+'</h1>'+
 (settings.address?'<p class="receipt-address">'+e(settings.address)+'</p>':'')+
 (settings.phone?'<p>'+e(settings.phone)+'</p>':'')+
 '<h2>SALES RECEIPT</h2></header><dl class="receipt-meta"><dt>Receipt</dt><dd>'+e(sale.id)+'</dd><dt>Date</dt><dd>'+e(new Date(sale.date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))+' IST</dd><dt>Customer</dt><dd>'+e(sale.customer)+'</dd><dt>Payment</dt><dd>'+e(sale.payment)+'</dd></dl>'+
 (demo?'<p class="receipt-demo">DEMO — NOT A REAL TRANSACTION</p>':'')+
 '<p class="receipt-currency">All amounts in INR</p><table class="receipt-lines"><colgroup><col style="width:44%"><col style="width:26%"><col style="width:30%"></colgroup><thead><tr><th>Item / Qty</th><th class="numeric">Rate</th><th class="numeric">Amount</th></tr></thead>'+
 sale.items.map((p,i)=>'<tbody class="receipt-item"><tr><td colspan="3" class="receipt-name">'+e(i+1)+'. '+e(p.name)+'</td></tr><tr><td>'+e(p.qty)+' × '+e(p.unit)+(mrp(p)!==null?'<br/><small>MRP '+e(amount(mrp(p)!))+' / '+e(p.unit)+'</small>':'')+'</td><td class="numeric">'+e(amount(p.price))+'</td><td class="numeric">'+e(amount(p.price*p.qty))+'</td></tr></tbody>').join('')+
 '</table><section class="receipt-totals">'+row('Subtotal',subtotal)+
 (hasAllMrp?row('MRP total',sale.items.reduce((t,p)=>t+mrp(p)!*p.qty,0)):'')+
 (sale.productDiscount!==undefined?row('Product discounts',-sale.productDiscount)+row('Extra bill discount',-(sale.billDiscount??sale.discount-sale.productDiscount)):row('Discount',-sale.discount))+
 row('TOTAL PAID',sale.total,'receipt-grand')+row('You saved'+(hasAllMrp?' vs MRP':''),saved)+'</section><footer><p>Thank you for shopping with us!</p><p>Please keep this receipt.</p></footer></article>';
}
export function receiptCSS(paper:ReceiptPaper):string{
 const width=paper==='58'?'48mm':paper==='80'?'72mm':'186mm';
 return `
 *{box-sizing:border-box}
 html,body{margin:0;padding:0;background:#fff!important;color:#000!important;color-scheme:light}
 .receipt-document{width:${width};max-width:100%;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:${paper==='58'?'10':'12'}px;line-height:1.4;font-variant-numeric:tabular-nums;color:#000!important;background:#fff!important}
 .receipt-document *{color:#000!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important}
 .receipt-document header{text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px}
 .receipt-document h1{font-size:${paper==='58'?'15':'19'}px;line-height:1.25;margin:0 0 6px;font-weight:700;letter-spacing:0;overflow-wrap:anywhere}
 .receipt-document h2{font-size:12px;margin:9px 0 0;letter-spacing:1px}
 .receipt-document p{margin:4px 0;overflow-wrap:anywhere}
 .receipt-address{white-space:pre-line}
 .receipt-meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:0 0 8px}
 .receipt-meta dt{font-weight:700}.receipt-meta dd{margin:0;text-align:right;overflow-wrap:anywhere;min-width:0}
 .receipt-currency{text-align:right;font-size:9px}
 .receipt-lines{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}
 .receipt-lines th{padding:5px 2px;text-align:left;border-top:1px solid #000;border-bottom:1px solid #000;font-weight:700}
 .receipt-lines td{padding:2px;vertical-align:top;overflow-wrap:anywhere}
 .receipt-lines .numeric{text-align:right}
 .receipt-lines .receipt-name{padding-top:7px;font-weight:700}
 .receipt-item{break-inside:avoid;page-break-inside:avoid}
 .receipt-lines thead{display:table-header-group}
 .receipt-totals{margin-top:10px;border-top:1px dashed #000;padding-top:6px;break-inside:avoid;page-break-inside:avoid}
 .receipt-summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:10px;margin:5px 0}
 .receipt-summary strong{text-align:right;overflow-wrap:anywhere}
 .receipt-grand{border-top:1px solid #000;padding-top:7px;margin-top:7px;font-size:${paper==='58'?'12':'15'}px;font-weight:700}
 .receipt-document footer{text-align:center;margin-top:12px;border-top:1px dashed #000;padding-top:8px;break-inside:avoid}
 .receipt-demo{text-align:center;font-weight:700}
 @page{size:${paper==='A4'?'A4':'auto'};margin:${paper==='58'?'5mm':paper==='80'?'4mm':'12mm'}}
 @media print{html,body{width:auto!important;min-height:0!important;overflow:visible!important}.receipt-document{margin:0 auto}}
 `;
}
