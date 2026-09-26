import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,mutate,productDiscount} from '../server/domain/store.mjs';
const product=(price,extra={})=>({id:'',name:'Item',barcode:'123',category:'General',unit:'piece',price,cost:price,stock:10,min:1,discountMode:'auto',...extra});
test('New products default to no discount and use MRP when selling price is blank',()=>{
 const s=initial();
 mutate(s,{type:'product',product:product('',{mrp:99,discountMode:undefined,cost:70})});
 assert.equal(s.products[0].price,99);
 assert.equal(s.products[0].discountMode,'none');
 mutate(s,{type:'sale',id:'mrp-sale',items:[{id:s.products[0].id,qty:1}],discount:0,payment:'Cash'});
 assert.equal(s.sales[0].total,99);
});
test('Automatic boundaries, custom override and explicit no discount',()=>{
 for(const [price,expected] of [[0,0],[39,0],[40,0],[49.99,0],[50,0],[50.01,3],[100,3],[100.01,10],[150,10]])assert.equal(productDiscount(product(price)),expected);
 assert.equal(productDiscount(product(30,{discountMode:'custom',customDiscount:2})),2);
 assert.equal(productDiscount(product(150,{discountMode:'none'})),0);
 for(const amount of [-1,51,NaN,1.001])assert.throws(()=>mutate(initial(),{type:'product',product:product(50,{discountMode:'custom',customDiscount:amount})}));
});
test('Per-unit product discounts and extra bill discounts are counted once and preserved',()=>{
 const s=initial();
 mutate(s,{type:'product',product:product(120)});
 const id=s.products[0].id;
 mutate(s,{type:'sale',id:'new-sale',items:[{id,qty:2}],discount:5,payment:'Cash'});
 const sale=s.sales[0];
 assert.equal(sale.total,215);assert.equal(sale.productDiscount,20);assert.equal(sale.billDiscount,5);assert.equal(sale.discount,25);assert.equal(s.products[0].stock,8);
 mutate(s,{type:'product',product:{...s.products[0],price:200,discountMode:'custom',customDiscount:30}});
 assert.equal(productDiscount(sale.items[0]),10);assert.equal(sale.total,215);
 const before=JSON.stringify(s);
 assert.throws(()=>mutate(s,{type:'sale',id:'bad-sale',items:[{id,qty:1}],discount:171,payment:'Cash'}));
 assert.equal(JSON.stringify(s),before);
});
test('Checkout price edits apply only to this bill and cannot exceed MRP',()=>{
 const s=initial();
 mutate(s,{type:'product',product:product(120,{mrp:130,unit:'1 kg',subcategory:'Rice'})});
 const id=s.products[0].id;
 mutate(s,{type:'sale',id:'edited-price',items:[{id,qty:2,unitPrice:105}],discount:0,payment:'UPI'});
 assert.equal(s.sales[0].total,210);
 assert.equal(s.sales[0].items[0].unit,'1 kg');
 assert.equal(s.sales[0].items[0].subcategory,'Rice');
 assert.equal(s.products[0].price,120);
 assert.equal(s.products[0].stock,8);
 for (const unitPrice of [131,-1,105.001])
  assert.throws(()=>mutate(s,{type:'sale',id:'bad-'+unitPrice,items:[{id,qty:1,unitPrice}],discount:0,payment:'Cash'}));
});
test('store default discount changes inherited items while preserving explicit overrides and receipt snapshots',()=>{
 const s=initial();
 mutate(s,{type:'settings',name:'Store',phone:'',address:'',lowPercent:20,discountMode:'custom',customDiscount:4});
 mutate(s,{type:'product',product:product(60,{discountMode:'inherit',specialDiscount:true})});
 const id=s.products[0].id;
 assert.equal(productDiscount(s.products[0],s.settings),4);
 mutate(s,{type:'sale',id:'discounted',items:[{id,qty:2}],discount:0,payment:'Cash'});
 assert.equal(s.sales[0].total,112);
 assert.equal(s.sales[0].productDiscount,8);
 assert.equal(s.sales[0].items[0].specialDiscount,true);
 mutate(s,{type:'settings',name:'Store',phone:'',address:'',lowPercent:20,discountMode:'none',customDiscount:0});
 assert.equal(productDiscount(s.products[0],s.settings),0);
 assert.equal(productDiscount(s.sales[0].items[0]),4,'an old receipt keeps its charged discount');
 mutate(s,{type:'product',product:{...s.products[0],discountMode:'auto',specialDiscount:false}});
 assert.equal(productDiscount(s.products[0],s.settings),3,'explicit product mode overrides global setting');
});
