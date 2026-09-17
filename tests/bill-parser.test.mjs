import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBillDocument} from '../server/domain/bill-parser.mjs';
import {initial,mutate} from '../server/domain/store.mjs';
const sample=JSON.parse(readFileSync(new URL('./fixtures/bill-ocr-sample.json',import.meta.url),'utf8'));
test('Actual submitted bill OCR preserves all rows and flags printed discrepancy',()=>{
 const r=parseBillDocument(sample.text,[],{words:sample.words});
 assert.deepEqual(r.items.map(x=>[x.name,x.qty,x.unit,x.cost,x.lineTotal]),[
  ['Apple normal',5,'kg',100,525],['Orange',10,'kg',40,525],['Orange',5,'kg',40,210]
 ]);
 assert.equal(r.unparsed.length,0);
 assert(r.items[0].warnings.some(w=>w.startsWith('OCR quantity')));
 assert(r.items[1].warnings.some(w=>w.includes('expected 420.00')));
 assert(r.items.every(x=>Number.isNaN(x.price))); // never invent selling prices
});
test('Text parser follows header order and preserves pack numbers',()=>{
 let r=parseBillDocument('Description Rate Qty Amount\nMilk 500 ml 24.50 2 49.00\nGrand Total 49.00',[]);
 assert.equal(r.items.length,1);assert.equal(r.items[0].name,'Milk 500 ml');assert.equal(r.items[0].qty,2);assert.equal(r.items[0].cost,24.5);
 r=parseBillDocument('Item name Qty Unit cost Amount\nTata Salt 2 23 46',[]);assert.equal(r.items[0].cost,23);
 r=parseBillDocument('Sr Description HSN Qty Rate Amount\n1 Test Soap 3401 4 20 80',[]);
 assert.equal(r.items[0].name,'Test Soap');assert.equal(r.items[0].qty,4);
});
test('Ambiguous rows stay visible; wrapped names and explicit layouts work',()=>{
 let r=parseBillDocument('Milk 2 40',[]);assert.equal(r.items.length,0);assert.equal(r.unparsed.length,1);
 r=parseBillDocument('Milk 2 40',[],{layout:'qty-total'});assert.equal(r.items[0].cost,20);
 r=parseBillDocument('Description Qty Rate Amount\nPremium Rice\n2 50 100',[]);assert.equal(r.items[0].name,'Premium Rice');
 r=parseBillDocument('Bill header\nMilk 2 20 40',[]);assert.equal(r.items[0].name,'Milk');
});
test('Fractional quantities and uncertain numeric OCR require review',()=>{
 const r=parseBillDocument('Apple 2.5 KG 100 5 (5%) 262.50\nApple S5KG 100 5 (5%) 888',[]);
 assert.equal(r.items.length,1);assert(r.items[0].warnings.some(w=>w.includes('Fractional')));
 assert.equal(r.unparsed.length,1);
});
test('Existing product matches retain actual selling price and import uses units',()=>{
 const p={id:'p',name:'Orange',barcode:'123',category:'Fruit',unit:'kg',price:55,cost:40,stock:2,min:1};
 const r=parseBillDocument('Orange 5KG 40 2 (5%) 210',[p]);
 assert.equal(r.items[0].barcode,'123');assert.equal(r.items[0].price,55);
 const s=initial();mutate(s,{type:'bill_import',id:'reviewed',supplier:'Test',items:[{...r.items[0],barcode:'NEW'}]});
 assert.equal(s.products[0].unit,'kg');assert.equal(s.products[0].stock,5);
});
