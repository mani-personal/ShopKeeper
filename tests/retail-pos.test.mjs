import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,mutate,saleReceiptNumber,saleCost} from '../server/domain/store.mjs';
import {receiptMarkup} from '../server/domain/receipt.mjs';

test('Store receipts use independent sequential numbers, including legacy sales',()=>{
 const first=initial(),second=initial();
 first.products.push({id:'stock',name:'Tea',barcode:'8901234567890',category:'Food',unit:'piece',price:20,cost:12,stock:5,min:0});
 first.sales.push({id:'legacy',date:'2025-01-01T00:00:00Z',customer:'Walk-in',payment:'Cash',items:[],total:0,discount:0});
 assert.equal(saleReceiptNumber(first.sales,first.sales[0]),1);
 mutate(first,{type:'sale',id:'sale-a',items:[{id:'stock',qty:1}],discount:0,payment:'Cash'});
 assert.deepEqual(first.sales.map(s=>s.receiptNumber),[2,1]);
 mutate(first,{type:'sale',id:'sale-a',items:[{id:'stock',qty:1}],discount:0,payment:'Cash'});
 assert.equal(first.products[0].stock,4);
 mutate(second,{type:'sale',id:'manual-other',items:[{manual:true,id:'manual:12345678-1234-1234-1234-123456789abc',name:'Loose rice',qty:2,unitPrice:30,cost:20}],discount:0,payment:'Cash'});
 assert.equal(second.sales[0].receiptNumber,1);
 const html=receiptMarkup(first.sales[0],first.settings);
 assert.match(html,/Bill No:<\/b> 2<\/p>/);
 assert.doesNotMatch(html,/8901234567890|SKU|sale-a/);
});

test('Manual sale rows record cost without changing inventory and reject invalid input',()=>{
 const s=initial();const line={manual:true,id:'manual:12345678-1234-1234-1234-123456789abc',name:'Loose grain',qty:3,unitPrice:50,cost:35};
 mutate(s,{type:'sale',id:'manual-sale',items:[line],discount:0,payment:'Cash'});
 assert.equal(s.products.length,0);assert.equal(saleCost(s.sales[0]),105);assert.equal(s.sales[0].total,150);
 const invalid=initial();assert.throws(()=>mutate(invalid,{type:'sale',id:'invalid',items:[{...line,cost:-1}],discount:0,payment:'Cash'}));assert.equal(invalid.sales.length,0);
});
