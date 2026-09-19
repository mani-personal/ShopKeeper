import test from 'node:test';import assert from 'node:assert/strict';import {initial,mutate} from '../server/domain/store.mjs';
test('Inventory imports are atomic, reject duplicates and preserve existing stock',()=>{
 const s=initial();const p={name:'No barcode product',barcode:'ITEM-1',price:50,cost:20,stock:5,min:10,target:50,category:'General',unit:'piece'};
 mutate(s,{type:'inventory_import',id:'i1',items:[p]});assert.equal(s.products.length,1);
 assert.throws(()=>mutate(s,{type:'inventory_import',id:'i2',items:[{...p,barcode:'ITEM-2'},p]}));assert.equal(s.products.length,1);assert.equal(s.products[0].stock,5);
 assert.throws(()=>mutate(s,{type:'inventory_import',id:'i3',items:[{...p,barcode:'ITEM-3',mrp:10}]}));assert.equal(s.products.length,1);
});
