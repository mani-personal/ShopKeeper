import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './pg-helper.mjs';
import {migrate} from '../server/db.mjs';
import {bootstrap} from '../server/bootstrap.mjs';
import {createApp} from '../server/app.mjs';

test('wholesale offer is priced on the server, saved to an order, and scoped to the retailer',async()=>{
 const db=await testDatabase();await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function login(email,password,portal){const r=await call('/api/auth/login',{email,password,portal});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf}}
 try{
  const admin=await login('owner@example.test','Owner-test-password-123','super-admin');
  const vendor=await call('/api/admin/businesses',{kind:'vendor',name:'Corner Store',owner:'Shopkeeper',email:'store@example.test',password:'Vendor-password-123',category:'General store'},admin);
  const wholesale=await call('/api/admin/businesses',{kind:'wholesale',name:'Bulk Goods',owner:'Seller',email:'seller@example.test',password:'Seller-password-123',category:'General store'},admin);
  assert.equal(vendor.status,200);assert.equal(wholesale.status,200);
  const retailer=await login('store@example.test','Vendor-password-123','vendor');const seller=await login('seller@example.test','Seller-password-123','wholesale');
  assert.equal((await call('/api/marketplace/profile',{name:'Seller',businessName:'Bulk Goods',phone:'',address:'',minOrder:0,deliveryDays:1,visibilityMode:'public'},seller)).status,200);
  const item={name:'Coffee pack',sku:'COFFEE-01',unit:'pack',category:'General',price:100,mrp:120,stock:20,minQty:1,bulkQty:10,bulkPrice:90,specialActive:true,specialDiscount:15,active:true};
  assert.equal((await call('/api/marketplace/products',{...item,specialDiscount:100},seller)).status,400);
  assert.equal((await call('/api/marketplace/products',item,seller)).status,200);
  const catalog=await call('/api/marketplace/catalog?vendor='+encodeURIComponent(vendor.data.id),undefined,retailer);
  assert.equal(catalog.status,200);const product=catalog.data.products.find(p=>p.sku==='COFFEE-01');assert(product);assert.equal(product.special_active,true);
  const request=await call('/api/marketplace/requests',{vendorId:vendor.data.id,items:[{productId:product.id,quantity:2}]},retailer);
  assert.equal(request.status,200);
  const saved=await db.prepare('SELECT r.quoted_total,i.unit_price FROM wholesale_requests r JOIN wholesale_request_items i ON i.request_id=r.id WHERE r.vendor_id=? AND i.product_id=?').get(vendor.data.id,product.id);
  assert.equal(Number(saved.quoted_total),170);assert.equal(Number(saved.unit_price),85);
  assert.equal((await call('/api/activities',undefined,retailer)).data.events.some(x=>x.category==='order'),true);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close()}
});
