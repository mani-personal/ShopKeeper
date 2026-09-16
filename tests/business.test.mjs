import test from 'node:test';import assert from 'node:assert/strict';
import {initial,mutate,supplierAccounts,financialSummary,productDiscount,trialDaysLeft} from '../server/domain/store.mjs';
import {parseProductCode,parsePrintedMRP} from '../server/domain/product-label.mjs';
function fixture(){const s=initial();mutate(s,{type:'product',product:{id:'',name:'Polish',barcode:'8901860032427',price:150,cost:110,mrp:160,stock:0,min:1,category:'General',unit:'piece'}});return {s,id:s.products[0].id}}
test('QR metadata and printed MRP preserve barcode and distinguish unit prices',()=>{
 assert.deepEqual(parseProductCode('{"barcode":"0012345678905","mrp":50,"name":"Polish"}'),{barcode:'0012345678905',mrp:50,name:'Polish',source:'qr'});
 assert.equal(parseProductCode('https://example.test/product?barcode=00123&mrp=99.50').mrp,99.5);
 assert.equal(parseProductCode('8901860032427').mrp,undefined);
 assert.equal(parsePrintedMRP('Net Quantity 50 ml\nMRP ₹ 50.00 incl. of all taxes\nUnit Sale Price Rs. 1.00 per ml'),50);
 assert.equal(parsePrintedMRP('Unit Sale Price Rs. 1.00 per ml'),undefined);
 assert.equal(parsePrintedMRP('MRP 50\nMRP 60'),undefined);
 assert.equal(parseProductCode('{"barcode":"123","mrp":-2}').mrp,undefined);
 assert.throws(()=>parseProductCode('https://example.test/product'));
});
test('Supplier partial payments, credits, refunds, limits and cost snapshots',()=>{
 const {s,id}=fixture();
 mutate(s,{type:'purchase',id:'p1',product:id,qty:10,cost:110,supplier:'Supplier A',paidAmount:400});
 assert.equal(supplierAccounts(s)[0].pending,700);
 mutate(s,{type:'supplier_return',id:'r1',purchaseId:'p1',qty:2,reason:'Damaged'});
 assert.equal(s.products[0].stock,8);assert.equal(supplierAccounts(s)[0].pending,480);
 mutate(s,{type:'supplier_payment',id:'pay1',supplier:'supplier a',direction:'payment',amount:480});
 assert.equal(supplierAccounts(s)[0].pending,0);
 mutate(s,{type:'supplier_return',id:'r2',purchaseId:'p1',qty:1,reason:'Wrong delivery'});
 assert.equal(supplierAccounts(s)[0].credit,110);
 mutate(s,{type:'supplier_payment',id:'refund1',supplier:'Supplier A',direction:'refund',amount:110});
 assert.equal(supplierAccounts(s)[0].balance,0);
 assert.throws(()=>mutate(s,{type:'supplier_payment',id:'bad',supplier:'Supplier A',direction:'refund',amount:1}));
 assert.throws(()=>mutate(s,{type:'supplier_return',id:'bad2',purchaseId:'p1',qty:8,reason:'Too many'}));
 mutate(s,{type:'sale',id:'sale1',items:[{id,qty:2}],discount:5,payment:'Cash'});
 mutate(s,{type:'expense',name:'Delivery',amount:15});
 const f=financialSummary(s);assert.equal(f.revenue,275);assert.equal(f.cost,220);assert.equal(f.gross,55);assert.equal(f.margin,20);assert.equal(f.net,40);
 mutate(s,{type:'purchase',id:'p2',product:id,qty:1,cost:90,supplier:'Supplier A',paidAmount:90});
 assert.equal(financialSummary(s).gross,55); // historical sold cost is immutable
});
test('Old purchase balances remain unknown until reconciled',()=>{
 const {s,id}=fixture();s.products[0].stock=4;
 s.purchases.push({id:'old',product:'Polish',qty:4,total:440,supplier:'A',date:new Date().toISOString()});
 assert.equal(supplierAccounts(s)[0].unknown,1);assert.equal(supplierAccounts(s)[0].pending,0);
 assert.throws(()=>mutate(s,{type:'supplier_return',id:'no',purchaseId:'old',qty:1,reason:'Damaged'}));
 mutate(s,{type:'purchase_settlement',id:'reconcile',purchaseId:'old',paidAmount:200});
 assert.equal(supplierAccounts(s)[0].pending,240);
 mutate(s,{type:'supplier_return',id:'yes',purchaseId:'old',qty:1,reason:'Damaged'});
 assert.equal(supplierAccounts(s)[0].pending,130);assert.equal(s.products[0].stock,3);
});
test('Cost-based discounts, MRP validation and trial start remain server-owned',()=>{
 const {s}=fixture();assert.equal(productDiscount({price:150,cost:30}),0);assert.equal(productDiscount({price:150,cost:30,discountBasis:'price'}),10);
 assert.throws(()=>mutate(s,{type:'product',product:{...s.products[0],mrp:100}}));
 mutate(s,{type:'start_trial'});const start=s.trialStartedAt;mutate(s,{type:'start_trial'});assert.equal(s.trialStartedAt,start);
 assert.equal(trialDaysLeft(s,new Date(start).getTime()),10);assert.equal(trialDaysLeft(s,new Date(start).getTime()+10*86400000),0);
 mutate(s,{type:'subscription_request',plan:'yearly'});assert.equal(s.subscriptionRequest.plan,'yearly');
});
