import {type Sale,type State} from './store';

export type ReceiptPaper='58'|'80'|'A4';
export const escapeReceipt=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'0.00';
const rupees=(n:number)=>'₹ '+amount(n);

export function receiptMarkup(sale:Sale,settings:State['settings'],demo=false):string{
 const e=escapeReceipt;
 const subtotal=sale.items.reduce((sum,p)=>sum+p.price*p.qty,0);
 const mrp=(p:Sale['items'][number])=>Number.isFinite(Number(p.mrp))&&Number(p.mrp)>=p.price&&Number(p.mrp)>0?Number(p.mrp):null;
 const mrpTotal=sale.items.reduce((sum,p)=>sum+(mrp(p)??p.price)*p.qty,0);
 const allMrp=sale.items.length>0&&sale.items.every(p=>mrp(p)!==null);
 const productSavings=sale.items.reduce((sum,p)=>sum+(mrp(p)===null?0:(mrp(p)!-p.price)*p.qty),0);
 const discount=Math.max(0,subtotal-Number(sale.total));
 const saved=discount+productSavings;
 const totalQty=sale.items.reduce((sum,p)=>sum+p.qty,0);
 const row=(label:string,value:string,cls='')=>'<div class="receipt-summary '+cls+'"><span>'+e(label)+'</span><strong>'+e(value)+'</strong></div>';
 const lines=sale.items.map((p,i)=>{
  const metadata=p.weight?.trim()??'';
  return '<tbody class="receipt-item"><tr class="receipt-item-title"><td colspan="6">'+e(i+1)+'. '+e(p.name)+(metadata?'<small>'+e(metadata)+'</small>':'')+'</td></tr>'+ 
   '<tr class="receipt-values"><td>'+e(p.unit)+'</td><td class="numeric receipt-item-qty">'+e(p.qty)+'</td><td class="numeric">'+(mrp(p)===null?'—':e(amount(mrp(p)!)))+'</td><td class="numeric">'+e(amount(p.price))+'</td><td class="numeric receipt-tax">—</td><td class="numeric">'+e(amount(p.price*p.qty))+'</td></tr></tbody>';
 }).join('');
 return '<article class="receipt-document"><header><h1>'+e(settings.name)+'</h1>'+
  (settings.address?'<p class="receipt-address">'+e(settings.address)+'</p>':'')+
  (settings.phone?'<p>Phone: '+e(settings.phone)+'</p>':'')+
  '<h2>BILL RECEIPT</h2></header><section class="receipt-meta"><p><b>Bill No:</b> '+e(sale.receiptNumber??'—')+'</p><p><b>Date:</b> '+e(new Date(sale.date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:true}))+'</p>'+
  (sale.customer?'<p><b>Customer:</b> '+e(sale.customer)+'</p>':'')+'</section>'+ 
  (demo?'<p class="receipt-demo">DEMO — NOT A REAL TRANSACTION</p>':'')+
  '<table class="receipt-lines"><colgroup><col class="receipt-product-col"><col class="receipt-qty-col"><col class="receipt-mrp-col"><col class="receipt-rate-col"><col class="receipt-tax-col"><col class="receipt-total-col"></colgroup><thead><tr><th>Product</th><th class="numeric">Qty</th><th class="numeric">MRP</th><th class="numeric">Rate</th><th class="numeric receipt-tax">Tax</th><th class="numeric">Total</th></tr></thead>'+lines+'</table>'+ 
  '<section class="receipt-totals">'+row('SUM',rupees(subtotal),'receipt-sum')+row('Total Qty',String(totalQty))+row('MRP total'+(allMrp?'':' *'),rupees(mrpTotal))+
  row('Discount','− '+rupees(discount))+
  row('Round off',rupees(0))+row('Total Amount',rupees(sale.total),'receipt-grand')+row('Customer saved'+(allMrp?' vs MRP':' (known MRP)'),rupees(saved),'receipt-savings')+
  (allMrp?'':'<p class="receipt-mrp-note">* Missing MRP uses selling price in the MRP total. Savings include recorded MRP and discounts only.</p>')+'</section>'+ 
  '<section class="receipt-payment"><div class="receipt-payment-heading"><b>Pay Mode Received</b><b>Amount</b></div>'+row(sale.payment,rupees(sale.total))+'</section>'+ 
  '<section class="receipt-tax-note"><b>Tax details</b><p>GST not recorded for this sale.</p></section>'+ 
  '<footer><p>Thank you for shopping with us!</p><p>Please keep this receipt.</p></footer></article>';
}

export function receiptCSS(paper:ReceiptPaper):string{
 const width=paper==='58'?'48mm':paper==='80'?'72mm':'186mm';
 return `
 *{box-sizing:border-box}
 html,body{margin:0;padding:0;background:#fff!important;color:#000!important;color-scheme:light}
 .receipt-document{width:${width};max-width:100%;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:${paper==='58'?'9':'11'}px;line-height:1.35;font-variant-numeric:tabular-nums;color:#000!important;background:#fff!important}
 .receipt-document *{color:#000!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important}
 .receipt-document header{text-align:center;border-top:1px solid #000;border-bottom:1px solid #000;padding:5px 0;margin-bottom:5px}
 .receipt-document h1{font-size:${paper==='58'?'13':'17'}px;line-height:1.2;margin:2px 0 4px;font-weight:700;overflow-wrap:anywhere}
 .receipt-document h2{font-size:${paper==='58'?'10':'12'}px;letter-spacing:.03em;margin:5px 0 1px}
 .receipt-document p{margin:3px 0;overflow-wrap:anywhere}
 .receipt-address{white-space:pre-line}
 .receipt-meta{margin:0 0 5px;overflow-wrap:anywhere}
 .receipt-meta p{margin:2px 0}
 .receipt-lines{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}
 .receipt-product-col{width:21%}.receipt-qty-col{width:9%}.receipt-mrp-col{width:17%}.receipt-rate-col{width:17%}.receipt-tax-col{width:11%}.receipt-total-col{width:25%}
 .receipt-lines th{padding:4px 1px;text-align:left;border-top:1px solid #000;border-bottom:1px solid #000;font-weight:700}
 .receipt-lines td{padding:2px 1px;vertical-align:top;overflow-wrap:anywhere}
 .receipt-lines .numeric{text-align:right;white-space:nowrap}
 .receipt-item-title td{padding-top:6px;font-weight:700;overflow-wrap:anywhere}
 .receipt-item-title small{display:block;font-size:9px;font-weight:400}
 .receipt-values td{padding-bottom:5px;border-bottom:1px solid #aaa}
 .receipt-item-qty{font-weight:700}
 .receipt-item-discount{text-align:right;font-size:9px;padding:2px!important}
 .receipt-item{break-inside:avoid;page-break-inside:avoid}
 .receipt-lines thead{display:table-header-group}
 .receipt-totals{margin-top:4px;break-inside:avoid;page-break-inside:avoid}
 .receipt-summary{display:flex;justify-content:space-between;align-items:baseline;gap:5px;margin:3px 0}
 .receipt-summary span{min-width:0;overflow-wrap:anywhere}.receipt-summary strong{text-align:right;white-space:nowrap}
 .receipt-sum,.receipt-grand{border-top:1px solid #000;padding-top:4px;font-weight:700}
 .receipt-grand{border-bottom:1px solid #000;padding-bottom:4px;font-size:${paper==='58'?'11':'13'}px}
 .receipt-savings{font-weight:700}
 .receipt-mrp-note{font-size:9px;line-height:1.25;margin-top:6px!important}
 .receipt-payment,.receipt-tax-note{border-top:1px solid #000;margin-top:8px;padding-top:4px;break-inside:avoid}
 .receipt-payment-heading{display:flex;justify-content:space-between}
 .receipt-document footer{text-align:center;margin-top:10px;border-top:1px solid #000;padding-top:6px;break-inside:avoid}
 .receipt-demo{text-align:center;font-weight:700}
 ${paper==='58'?'.receipt-tax{display:none}.receipt-product-col{width:23%}.receipt-qty-col{width:10%}.receipt-mrp-col{width:19%}.receipt-rate-col{width:20%}.receipt-tax-col{width:0}.receipt-total-col{width:28%}':''}
 @page{size:${paper==='A4'?'A4':'auto'};margin:${paper==='58'?'5mm':paper==='80'?'4mm':'12mm'}}
 @media print{html,body{width:auto!important;min-height:0!important;overflow:visible!important}.receipt-document{margin:0 auto}}
 `;
}
