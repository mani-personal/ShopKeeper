import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import sharp from 'sharp';
import {testDatabase} from './pg-helper.mjs';import {migrate} from '../server/db.mjs';import {bootstrap} from '../server/bootstrap.mjs';import {createApp} from '../server/app.mjs';
test('Super admin lifecycle, scoped logos, private proof and immutable approved screenshots',async()=>{
 const db=await testDatabase();await migrate(db);await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:r.headers.get('content-type')?.startsWith('image/')?await r.arrayBuffer():await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(mail,password,portal='admin'){const r=await call('/api/auth/login',{email:mail,password,portal});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf};}
 try{
  const owner=await login('owner@example.test','Owner-test-password-123','super-admin');
  assert.equal((await call('/api/admins',{name:'Ops admin',email:'ops@example.test',password:'Ops-admin-password-123',role:'owner'},owner)).status,200);
  assert.equal((await db.prepare('SELECT role FROM users WHERE email=?').get('ops@example.test')).role,'admin');
  const admin=await login('ops@example.test','Ops-admin-password-123');const list=await call('/api/admins',undefined,owner);const id=list.data.admins[0].id;
  assert.equal((await call('/api/admins',undefined,admin)).status,403);assert.equal((await call('/api/admins',{name:'bad'},admin)).status,403);
  assert.equal((await call('/api/auth/login',{email:'ops@example.test',password:'Ops-admin-password-123',portal:'super-admin'})).status,403);
  assert.equal((await call('/api/store',undefined,admin)).data.access.members.length,0);
  const cfg=(await call('/api/pricing')).data;assert.equal((await call('/api/store',{type:'pricing_update',vendorId:'main',version:cfg.version,pricing:{...cfg,upiId:'demo@test'}},admin)).status,200);
  let r=await call('/api/store',{type:'invite_vendor',vendorId:'main',email:'vendor@example.test'},admin);r=await call('/api/auth/activate',{email:'vendor@example.test',password:'Vendor-password-123',token:r.data.accessCode});const vendor={cookie:r.cookie,csrf:r.data.csrf};
  assert.equal((await call('/api/admins',undefined,vendor)).status,403);
  const other='vendor-'+randomUUID();assert.equal((await call('/api/store',{type:'vendor_create',vendorId:'main',id:other,name:'Other',owner:'Other',businessType:'General store',phone:''},admin)).status,200);
  const bytes=await sharp({create:{width:60,height:60,channels:3,background:'#16745d'}}).png().toBuffer();const image='data:image/png;base64,'+bytes.toString('base64');
  assert.equal((await call('/api/vendors/'+other+'/logo',{image},vendor)).status,403);
  assert.equal((await call('/api/vendors/main/logo',{image:'data:image/svg+xml;base64,PHN2Zy8+'},vendor)).status,400);
  r=await call('/api/vendors/main/logo',{image},vendor);assert.equal(r.status,200);assert(r.data.logo.startsWith('data:image/webp;base64,'));assert.equal((await call('/api/store',undefined,vendor)).data.logo,r.data.logo);
  const payment=randomUUID();await call('/api/store',{type:'subscription_order',vendorId:'main',id:payment,plan:'monthly'},vendor);
  const path='/api/vendors/main/payment-proof/'+payment;
  assert.equal((await call(path,{image},vendor)).status,200);
  assert.equal((await call(path)).status,401);
  r=await call(path,undefined,admin);assert.equal(r.status,200);assert(r.data.byteLength>0);
  assert.equal((await call('/api/vendors/'+other+'/payment-proof/'+payment,undefined,admin)).status,404);
  assert.equal((await call('/api/vendors/'+other+'/payment-proof/'+payment,{image},vendor)).status,403);
  r=await call('/api/store',undefined,vendor);assert.equal(r.data.subscription.history[0].has_proof,true);assert.equal(r.data.subscription.history[0].status,'pending');
  assert.equal((await call('/api/store',{type:'subscription_approve',vendorId:'main',id:payment},admin)).status,200);
  assert.equal((await call(path,{image},vendor)).status,400);
  assert.equal((await call('/api/admins/'+id,{action:'disable'},owner)).status,200);assert.equal((await call('/api/store',undefined,admin)).status,401);
  assert.equal((await call('/api/auth/login',{email:'ops@example.test',password:'Ops-admin-password-123'})).status,401);
  assert.equal((await call('/api/admins/'+id,{action:'enable'},owner)).status,200);await login('ops@example.test','Ops-admin-password-123');
  const ownerId=(await db.prepare("SELECT id FROM users WHERE role='owner'").get()).id;assert.equal((await call('/api/admins/'+ownerId,{action:'disable'},owner)).status,404);
  r=await call('/api/admins/'+id,{action:'reset'},owner);assert.equal(r.status,200);assert.equal((await call('/api/auth/reset',{email:'ops@example.test',token:r.data.code,password:'New-admin-password-123'})).status,200);await login('ops@example.test','New-admin-password-123');
 }finally{await new Promise(r=>server.close(r));await db.close()}
});
