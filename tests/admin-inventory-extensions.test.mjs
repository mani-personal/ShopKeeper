import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './pg-helper.mjs';
import {migrate} from '../server/db.mjs';
import {bootstrap} from '../server/bootstrap.mjs';
import {createApp} from '../server/app.mjs';

test('admin exports scoped inventory and reviews isolated extension requests without duplicate days',async()=>{
 const db=await testDatabase(); await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing'}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.text(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
 async function json(path,body,session){const r=await call(path,body,session);return {...r,data:JSON.parse(r.data)}}
 async function login(email,password,portal){const r=await json('/api/auth/login',{email,password,portal});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf}}
 try{
  const admin=await login('owner@example.test','Owner-test-password-123','super-admin');
  const created=await json('/api/admin/businesses',{kind:'vendor',name:'Country Foods',owner:'Mani',category:'General store',phone:'',email:'country@example.test',password:'Vendor-password-123'},admin);
  const vendor=await login('country@example.test','Vendor-password-123','vendor');
  const store=await db.prepare('SELECT data FROM vendors WHERE id=?').get(created.data.id);const state=JSON.parse(store.data);
  state.products.push({id:'one',name:'=HYPERLINK("evil")',barcode:'8900000000001',category:'Grocery',subcategory:'Rice',weight:'1kg',unit:'piece',mrp:90,price:80,cost:65,stock:5,min:1});
  await db.prepare('UPDATE vendors SET data=? WHERE id=?').run(JSON.stringify(state),created.data.id);
  const ownerCSV=await call('/api/admin/inventory/export?kind=vendor',undefined,admin);
  assert.equal(ownerCSV.status,200);assert(ownerCSV.data.includes("'=HYPERLINK"));assert(ownerCSV.data.includes('Rice'));
  assert.equal((await call('/api/admin/inventory/export?kind=vendor',undefined,vendor)).status,403);
  assert.equal((await call('/api/admin/inventory/export?kind=wholesale',undefined,vendor)).status,403);
  const retailRequest=await json('/api/subscriptions/extension-request',{vendorId:created.data.id,days:4,reason:'Need more time'},vendor);
  assert.equal(retailRequest.status,200);
  assert.equal((await json('/api/subscriptions/extension-request',{vendorId:created.data.id,days:5,reason:'again'},vendor)).status,409);
  const notices=await json('/api/activities',undefined,admin);assert(notices.data.events.some(x=>x.title==='Vendor extension requested'));
  const pending=await json('/api/subscriptions/extensions/pending',undefined,admin);assert.equal(pending.data.requests.length,1);
  const id=pending.data.requests[0].id;
  assert.equal((await json('/api/subscriptions/'+id+'/approve',{},admin)).status,404,'extension cannot be approved as a payment');
  assert.equal((await json('/api/subscriptions/extensions/'+id+'/review',{action:'approve'},admin)).status,200);
  assert.equal((await json('/api/subscriptions/extensions/'+id+'/review',{action:'approve'},admin)).status,404,'approval cannot be repeated');
  const validity=await db.prepare('SELECT valid_until FROM vendors WHERE id=?').get(created.data.id);assert(validity.valid_until>Date.now()+3*86400000);
  const createdWholesale=await json('/api/admin/businesses',{kind:'wholesale',name:'Big Supply',owner:'Owner',category:'General store',phone:'',email:'big@example.test',password:'Wholesale-password-123'},admin);
  const wholesale=await login('big@example.test','Wholesale-password-123','wholesale');
  assert.equal((await json('/api/wholesale/subscriptions/extension-request',{days:3,reason:'Help'},wholesale)).status,200);
  const wholesalePending=await json('/api/wholesale/subscriptions/extensions/pending',undefined,admin);assert.equal(wholesalePending.data.requests[0].wholesaler_id,createdWholesale.data.id);
  assert.equal((await json('/api/wholesale/subscriptions/extensions/'+wholesalePending.data.requests[0].id+'/review',{action:'approve'},admin)).status,200);
  assert.equal((await call('/api/admin/inventory/export?kind=wholesale',undefined,admin)).status,200);
  const completed=await db.prepare('SELECT valid_until FROM wholesalers WHERE user_id=?').get(createdWholesale.data.id);assert(completed.valid_until>Date.now()+2*86400000);
  await db.prepare('INSERT INTO wholesale_products(id,wholesaler_id,name,sku,unit,price,stock,active,created_at,updated_at,category,subcategory,weight,description,mrp,min_qty,bulk_qty,bulk_price,hsn_code,gst_rate) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('wholesale-item',createdWholesale.data.id,'Farm rice','8902345678912','bag',95,18,true,Date.now(),Date.now(),'Grocery','Rice','1 kg','Premium rice',110,2,10,88,'1006',5);
  const csv=await call('/api/admin/inventory/export?kind=wholesale',undefined,admin);
  assert.equal(csv.status,200);for(const value of ['Farm rice','Bulk unit price','HSN / SAC','Premium rice','1006','88','1 kg']) assert(csv.data.includes(value));
  assert.equal((await call('/api/admin/inventory/export?kind=wholesale',undefined,wholesale)).status,403);
  const vendorUntil=(await db.prepare('SELECT valid_until FROM vendors WHERE id=?').get(created.data.id)).valid_until;
  await db.prepare('INSERT INTO subscription_history(id,vendor_id,kind,plan,amount,days,status,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)').run('without-proof',created.data.id,'payment','monthly',1000,30,'pending',Date.now(),created.data.id);
  assert.equal((await json('/api/subscriptions/pending',undefined,admin)).data.requests.find(x=>x.id==='without-proof').has_proof,false);
  assert.equal((await json('/api/subscriptions/without-proof/approve',{},admin)).status,200,'admin may verify independently without a screenshot or reference');
  assert((await db.prepare('SELECT valid_until FROM vendors WHERE id=?').get(created.data.id)).valid_until>vendorUntil);
  await db.prepare('INSERT INTO subscription_history(id,vendor_id,kind,plan,amount,days,status,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)').run('reject-me',created.data.id,'payment','monthly',1000,30,'pending',Date.now(),created.data.id);
  const beforeReject=(await db.prepare('SELECT valid_until FROM vendors WHERE id=?').get(created.data.id)).valid_until;
  assert.equal((await json('/api/subscriptions/reject-me/reject',{reason:'Bank transfer not received'},admin)).status,200);
  assert.equal((await db.prepare('SELECT status FROM subscription_history WHERE id=?').get('reject-me')).status,'rejected');
  assert.equal((await db.prepare('SELECT valid_until FROM vendors WHERE id=?').get(created.data.id)).valid_until,beforeReject);
  assert.equal((await json('/api/subscriptions/reject-me/reject',{reason:'Repeat'},admin)).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close()}
});
