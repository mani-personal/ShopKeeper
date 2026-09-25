import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './pg-helper.mjs';
import {migrate} from '../server/db.mjs';
import {bootstrap} from '../server/bootstrap.mjs';
import {createApp} from '../server/app.mjs';

test('direct accounts, scoped wholesale expenses and self-service password recovery',async()=>{
 const db=await testDatabase(), mail=[];
 await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});
 const server=createApp(db,{appOrigin:'http://shop.test',frontend:'missing',resetMailer:async message=>mail.push(message)}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://shop.test','Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}}
 async function login(email,password,portal){const response=await call('/api/auth/login',{email,password,portal});assert.equal(response.status,200);return {cookie:response.cookie,csrf:response.data.csrf}}
 try{
  const owner=await login('owner@example.test','Owner-test-password-123','super-admin');
  const vendor=await call('/api/admin/businesses',{kind:'vendor',name:'Village Mart',owner:'Mani',category:'General store',phone:'8122187039',email:'village@example.test',password:'Village-password-123'},owner);
  assert.equal(vendor.status,200);
  const retailer=await login('village@example.test','Village-password-123','vendor');
  assert.equal((await call('/api/store',undefined,retailer)).data.vendorId,vendor.data.id,'new vendor is assigned directly without an activation token');
  const wholesaler=await call('/api/admin/businesses',{kind:'wholesale',name:'Green Goods',owner:'Owner',category:'General store',phone:'',email:'green@example.test',password:'Wholesale-password-123'},owner);
  assert.equal(wholesaler.status,200);
  const wholesale=await login('green@example.test','Wholesale-password-123','wholesale');
  assert.equal((await call('/api/wholesale/portal',undefined,wholesale)).data.expenses.length,0);
  const expense=await call('/api/wholesale/expenses',{category:'Rent',description:'September',amount:1500.5,expenseDate:'2026-09-25'},wholesale);
  assert.equal(expense.status,200);assert.equal(Number(expense.data.expenses[0].amount),1500.5);
  const expenseId=expense.data.expenses[0].id;
  assert.equal((await call('/api/wholesale/expenses',{id:expenseId,category:'Rent',description:'Corrected',amount:1600,expenseDate:'2026-09-25'},wholesale)).status,200);
  assert.equal((await call('/api/wholesale/portal',undefined,wholesale)).data.expenses[0].description,'Corrected');
  const second=await call('/api/admin/businesses',{kind:'wholesale',name:'Another Seller',owner:'Other',category:'General store',phone:'',email:'other-wholesale@example.test',password:'Other-password-123'},owner);
  assert.equal(second.status,200);
  const other=await login('other-wholesale@example.test','Other-password-123','wholesale');
  assert.equal((await call('/api/wholesale/portal',undefined,other)).data.expenses.length,0);
  assert.equal((await call('/api/wholesale/expenses',{id:expenseId,category:'Rent',description:'Tamper',amount:10,expenseDate:'2026-09-25'},other)).status,404);
  assert.equal((await call('/api/wholesale/expenses/'+expenseId+'/delete',{},other)).status,404);
  assert.equal((await call('/api/wholesale/expenses',{category:'Rent',description:'Bad date',amount:5,expenseDate:'2026-02-31'},wholesale)).status,400);
  assert.equal((await call('/api/admin/businesses/wholesale/'+wholesaler.data.id,undefined,retailer)).status,403);
  assert.equal((await call('/api/admin/businesses/vendor/'+vendor.data.id,undefined,owner)).data.name,'Village Mart');
  assert.equal((await call('/api/admin/businesses/wholesale/'+wholesaler.data.id,undefined,owner)).data.name,'Green Goods');
  assert.equal((await call('/api/admin/businesses/vendor/'+vendor.data.id,{name:'Village Mart Updated',owner:'Mani',category:'General store',phone:'8122187039'},owner)).status,200);
  assert.equal((await call('/api/admin/businesses/vendor/'+vendor.data.id,undefined,owner)).data.name,'Village Mart Updated');
  assert.equal((await call('/api/admin/businesses/wholesale/'+wholesaler.data.id,{name:'Green Goods Updated',owner:'Owner',category:'General store',phone:'9876543210'},owner)).status,200);
  assert.equal((await call('/api/admin/businesses/wholesale/'+wholesaler.data.id,undefined,owner)).data.name,'Green Goods Updated');
  assert.equal((await call('/api/admins',{name:'Stores Admin',email:'stores@example.test',password:'Stores-password-123',permissions:['stores']},owner)).status,200);
  const limited=await login('stores@example.test','Stores-password-123','admin');
  const summary=await call('/api/admin/businesses',undefined,limited);
  assert.equal(summary.status,200);assert.equal(summary.data.wholesalers.length,0);
  assert.equal((await call('/api/admin/businesses/wholesale/'+wholesaler.data.id,undefined,limited)).status,403);
  assert.equal((await call('/api/marketplace/admin',undefined,limited)).status,403);
  assert.equal((await call('/api/admin/businesses',{kind:'wholesale',name:'Blocked',owner:'X',category:'General store',phone:'',email:'blocked@example.test',password:'Blocked-password-123'},limited)).status,403);
  assert.equal((await call('/api/auth/forgot',{email:'unknown@example.test'})).status,200);
  const requested=await call('/api/auth/forgot',{email:'green@example.test'});
  assert.equal(requested.status,200);assert.equal(JSON.stringify(requested.data).includes('reset='),false);
  assert.equal(mail.length,1);assert.equal(mail[0].to,'green@example.test');
  const token=new URL(mail[0].link).hash.slice('#reset='.length);
  assert.equal((await call('/api/auth/reset',{email:'green@example.test',token,password:'New-wholesale-password-123'})).status,200);
  assert.equal((await call('/api/auth/reset',{email:'green@example.test',token,password:'Reuse-password-123'})).status,400);
  assert.equal((await call('/api/wholesale/portal',undefined,wholesale)).status,401);
  const signed=await login('green@example.test','New-wholesale-password-123','wholesale');
  assert.equal((await call('/api/auth/password',{currentPassword:'wrong',password:'Another-password-123'},signed)).status,403);
  assert.equal((await call('/api/auth/password',{currentPassword:'New-wholesale-password-123',password:'Another-password-123'},signed)).status,200);
  assert.equal((await call('/api/wholesale/expenses/'+expenseId+'/delete',{},await login('green@example.test','Another-password-123','wholesale'))).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close()}
});
