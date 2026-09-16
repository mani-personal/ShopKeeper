import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,mutate,productDiscount} from '../server/domain/store.mjs';
const product=(price,extra={})=>({id:'',name:'Item',barcode:'123',category:'General',unit:'piece',price,cost:price,stock:10,min:1,...extra});
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
