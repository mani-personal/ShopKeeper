import test from 'node:test';import assert from 'node:assert/strict';
import {receiptMarkup,receiptCSS} from '../server/domain/receipt.mjs';
const sale={id:'sale-1',date:'2026-09-17T00:00:00Z',customer:'A < B',payment:'Cash',items:[{name:'Soap <script>alert(1)</script>',qty:2,unit:'piece',price:120}],discount:25,productDiscount:20,billDiscount:5,total:215};
test('Receipts escape names and present separate discounts without changing totals',()=>{
 const html=receiptMarkup(sale,{name:'My & Store',address:'Hosur\nTamil Nadu',phone:'123'});
 assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('My &amp; Store'));
 assert(html.includes('240.00'));assert(html.includes('20.00'));assert(html.includes('5.00'));assert(html.includes('215.00'));
 assert(html.includes('BILL RECEIPT'));assert(html.includes('Bill No:'));assert(html.includes('Total Qty'));assert(html.includes('Pay Mode Received'));
 assert(html.includes('GST not recorded for this sale.'));assert(!html.includes('CGST 9%'));
 assert(html.includes('receipt-lines'));assert(html.includes('numeric'));
});
test('Receipt layouts use printable widths without fixed-position content',()=>{
 for(const paper of ['58','80','A4']){
  const css=receiptCSS(paper);
  assert(!css.includes('position:fixed'));assert(css.includes('table-layout:fixed'));assert(css.includes('break-inside:avoid'));
 }
 assert(receiptCSS('58').includes('48mm'));assert(receiptCSS('80').includes('72mm'));assert(receiptCSS('A4').includes('186mm'));
});
test('MRP and discount savings use the saved sale snapshot without double counting',()=>{
 const html=receiptMarkup({...sale,items:[{...sale.items[0],mrp:150}]},{name:'Shop',address:'',phone:''});
 assert(html.includes('>150.00</td>'));assert(html.includes('MRP total'));assert(html.includes('300.00'));
 assert(html.includes('Customer saved vs MRP'));assert(html.includes('85.00'));
 const previous=receiptMarkup(sale,{name:'Shop',address:'',phone:''});
 assert(previous.includes('Customer saved'));assert(previous.includes('MRP total *'));assert(previous.includes('Missing MRP uses selling price'));
 const discounted=receiptMarkup({...sale,items:[{...sale.items[0],mrp:150,cost:90,discountMode:'custom',customDiscount:10}]},{name:'Shop',address:'',phone:''});
 assert(discounted.includes('Discount ₹ 10.00 × 2 = ₹ 20.00'));
});
