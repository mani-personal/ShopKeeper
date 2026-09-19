import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {testDatabase} from './pg-helper.mjs';import {migrate,transaction} from '../server/db.mjs';import {bootstrap} from '../server/bootstrap.mjs';import {createApp} from '../server/app.mjs';
import {pricing,validity} from '../server/subscriptions.mjs';
test('Subscription pricing, quotes, owner approval, extensions, expiry and isolation',async()=>{
 const db=await testDatabase();await migrate(db);await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  let r=await call('/api/auth/login',{email:'owner@example.test',password:'Owner-test-password-123',portal:'admin'});const owner={cookie:r.cookie,csrf:r.data.csrf};
  r=await call('/api/store',{type:'invite_vendor',vendorId:'main',email:'vendor@example.test'},owner);
  r=await call('/api/auth/activate',{email:'vendor@example.test',password:'Vendor-password-123',token:r.data.accessCode});const vendor={cookie:r.cookie,csrf:r.data.csrf};
  assert.equal((await call('/api/auth/login',{email:'vendor@example.test',password:'Vendor-password-123',portal:'admin'})).status,403);
  const cfg={...(await pricing(db)),upiId:'merchant@test',payee:'Test shop'};
  assert.equal((await call('/api/store',{type:'pricing_update',vendorId:'main',version:0,pricing:cfg},vendor)).status,403);
  assert.equal((await call('/api/store',{type:'pricing_update',vendorId:'main',version:0,pricing:cfg},owner)).status,200);
  assert.equal((await call('/api/pricing')).data.upiId,'merchant@test');
  const id=randomUUID();r=await call('/api/store',{type:'subscription_order',vendorId:'main',id,plan:'monthly'},vendor);assert.equal(r.status,200);assert.equal(Number(r.data.subscription.history[0].amount),1000);
  assert.equal((await call('/api/store',{type:'subscription_order',vendorId:'main',id,plan:'monthly'},vendor)).data.subscription.history.length,1);
  assert.equal((await call('/api/store',{type:'pricing_update',vendorId:'main',version:1,pricing:{...cfg,monthly:1200}},owner)).status,200);
  assert.equal((await call('/api/store',{type:'subscription_reference',vendorId:'main',id,reference:'UPI123456'},vendor)).status,200);
  assert.equal((await call('/api/store',{type:'subscription_approve',vendorId:'main',id},vendor)).status,403);
  r=await call('/api/store',{type:'subscription_approve',vendorId:'main',id},owner);assert.equal(r.status,200);const until=r.data.subscription.validUntil;assert.equal(Number(r.data.subscription.history[0].amount),1000);assert(r.data.subscription.daysRemaining>=30);
  r=await call('/api/store',{type:'subscription_approve',vendorId:'main',id},owner);assert.equal(r.data.subscription.validUntil,until);
  const extension={type:'subscription_extend',vendorId:'main',id:randomUUID(),days:7,reference:'Support extension'};
  assert.equal((await call('/api/store',extension,vendor)).status,403);
  r=await call('/api/store',extension,owner);assert.equal(r.data.subscription.validUntil,until+7*86400000);
  assert.equal((await call('/api/store',extension,owner)).data.subscription.validUntil,until+7*86400000);
  const foreign='vendor-'+randomUUID();await call('/api/store',{type:'vendor_create',vendorId:'main',id:foreign,name:'Other',owner:'Other',phone:'',businessType:'General store'},owner);
  assert.equal((await call('/api/store',{type:'subscription_order',vendorId:foreign,id:randomUUID(),plan:'yearly'},vendor)).status,403);
  assert.equal((await call('/api/store',{type:'subscription_reference',vendorId:foreign,id,reference:'CROSS'},owner)).status,400);
  await call('/api/store',{type:'vendor_suspend',vendorId:'main',expectedSuspended:false},owner);
  const next=randomUUID();await call('/api/store',{type:'subscription_order',vendorId:'main',id:next,plan:'yearly'},owner);
  r=await call('/api/store',{type:'subscription_approve',vendorId:'main',id:next},owner);assert.equal(r.data.vendors.find(v=>v.id==='main').suspended,false);
  assert.equal(validity({data:'{}',valid_until:Date.now()-86400000}).daysRemaining,0);
 }finally{await new Promise(r=>server.close(r));await db.close()}
});
