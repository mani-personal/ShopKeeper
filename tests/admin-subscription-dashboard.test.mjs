import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './pg-helper.mjs';
import {migrate} from '../server/db.mjs';
import {bootstrap} from '../server/bootstrap.mjs';
import {createApp} from '../server/app.mjs';

test('subscription dashboard counts approved payments only and protects business history',async()=>{
 const db=await testDatabase(); await migrate(db); await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing'}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}}
 async function login(email,password,portal){const r=await call('/api/auth/login',{email,password,portal});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf}}
 try{
  const owner=await login('owner@example.test','Owner-test-password-123','super-admin');
  const v=await call('/api/admin/businesses',{kind:'vendor',name:'Village Mart',owner:'Mani',category:'General store',email:'village@example.test',password:'Village-password-123'},owner);
  const w=await call('/api/admin/businesses',{kind:'wholesale',name:'Market Supplier',owner:'Seller',category:'General store',email:'seller@example.test',password:'Supplier-password-123'},owner);
  assert.equal(v.status,200);assert.equal(w.status,200);
  const now=Date.now(),until=now+30*86400000;
  await db.prepare('UPDATE vendors SET valid_until=? WHERE id=?').run(until,v.data.id);
  await db.prepare('UPDATE wholesalers SET valid_until=? WHERE user_id=?').run(until,w.data.id);
  for(const [id,kind,status,amount] of [['vendor-paid','payment','approved',1000],['vendor-pending','payment','pending',1000],['vendor-free','extension','approved',0]]) await db.prepare('INSERT INTO subscription_history(id,vendor_id,kind,plan,amount,days,status,reference,created_at,approved_at,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,v.data.id,kind,'monthly',amount,30,status,'Ref '+id,now,status==='approved'?now:null,'owner');
  await db.prepare('INSERT INTO wholesale_subscription_history(id,wholesaler_id,kind,plan,amount,days,status,reference,created_at,approved_at,actor) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('wholesale-paid',w.data.id,'payment','monthly',2999,30,'approved','Wholesale ref',now,now,'owner');
  const dashboard=await call('/api/admin/subscriptions/dashboard',undefined,owner);
  assert.equal(dashboard.status,200);assert.equal(dashboard.data.summary.vendorRevenue,1000);assert.equal(dashboard.data.summary.wholesaleRevenue,2999);
  assert.equal(dashboard.data.summary.vendorMonthRevenue,1000);assert.equal(dashboard.data.summary.wholesaleMonthRevenue,2999);
  assert.equal(dashboard.data.vendors[0].daysRemaining,30);assert.equal(dashboard.data.wholesalers[0].daysRemaining,30);
  const lists=await call('/api/admin/businesses',undefined,owner);assert.equal(lists.data.vendors[0].daysRemaining,30);assert.equal(lists.data.wholesalers[0].daysRemaining,30);
  const history=await call('/api/admin/subscriptions/history?kind=vendor&status=approved&search=Village',undefined,owner);
  assert.equal(history.status,200);assert.equal(history.data.total,2);assert.equal(history.data.rows[0].business_name,'Village Mart');
  const wholesale=await call('/api/admin/subscriptions/history?kind=wholesale',undefined,owner);assert.equal(wholesale.data.total,1);
  const vendor=await login('village@example.test','Village-password-123','vendor');
  assert.equal((await call('/api/admin/subscriptions/dashboard',undefined,vendor)).status,403);
  assert.equal((await call('/api/admin/subscriptions/history?kind=wholesale',undefined,vendor)).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close()}
});
