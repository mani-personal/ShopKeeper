import test from 'node:test';import assert from 'node:assert/strict';
import {migrate} from '../server/db.mjs';import {testDatabase} from './pg-helper.mjs';import {bootstrap} from '../server/bootstrap.mjs';import {createApp} from '../server/app.mjs';
const origin='http://shop.test';
test('Authentication, vendor isolation, stock transactions, OCR import and account lifecycle',async()=>{
 const db=await testDatabase();await migrate(db);await migrate(db);await bootstrap(db,{email:'owner@example.test',password:'Owner-test-password-123',seedDemo:false});const app=createApp(db,{appOrigin:origin,frontend:'missing-test-dist'});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,session,extra={}){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(email,password){const r=await call('/api/auth/login',{email,password});assert.equal(r.status,200,JSON.stringify(r));return {cookie:r.cookie,csrf:r.data.csrf};}
 try{
 assert.equal((await call('/api/store')).status,401);assert.equal((await call('/api/auth/login',{email:'owner@example.test',password:'bad'})).status,401);
 const owner=await login('owner@example.test','Owner-test-password-123');assert(!owner.cookie.includes('Owner-test-password'));let r=await call('/api/store',undefined,owner);assert.equal(r.data.role,'owner');assert.equal(r.data.vendors.length,1);
 const vendorId='vendor-12345678-1234-1234-1234-123456789012';r=await call('/api/store',{type:'vendor_create',id:vendorId,vendorId:'main',name:'Vendor A',owner:'A',businessType:'General store',phone:''},owner);assert.equal(r.status,200);
 r=await call('/api/store',{type:'invite_vendor',vendorId,email:'a@example.test'},owner);assert.equal(r.status,200);const activation=r.data.accessCode;assert(activation);assert.equal(r.data.access.invites[0].vendorId,vendorId);assert(!JSON.stringify(await db.prepare('SELECT * FROM tokens').all()).includes(activation));
 r=await call('/api/auth/activate',{email:'a@example.test',password:'Vendor-A-password-123',token:activation});assert.equal(r.status,200);const a={cookie:r.cookie,csrf:r.data.csrf};assert.equal((await call('/api/auth/activate',{email:'a@example.test',password:'Vendor-A-password-123',token:activation})).status,400);
 r=await call('/api/store',undefined,a);assert.equal(r.data.vendors.length,1);assert.equal(r.data.vendorId,vendorId);assert.equal(r.data.access,undefined);assert.equal((await call('/api/store?vendor=main',undefined,a)).status,403);assert.equal((await call('/api/store',{type:'vendor_create'},a)).status,403);assert.equal((await call('/api/store',{type:'settings',vendorId:'main'},a)).status,403);
 const product={id:'',name:'Test Milk',barcode:'8901234567890',category:'Dairy',unit:'piece',stock:2,min:10,target:100,price:50,cost:30};r=await call('/api/store',{type:'product',vendorId,version:0,product},a);assert.equal(r.status,200);const pid=r.data.state.products[0].id;
 assert.equal((await call('/api/store',{type:'product',vendorId,version:0,product},a)).status,409);
 assert.equal((await call('/api/vendors/'+vendorId+'/barcode/8901234567890',undefined,a)).data.product.id,pid);
 assert.equal((await call('/api/vendors/main/products',undefined,a)).status,403);
 assert.equal((await call('/api/store',{type:'expense',vendorId,name:'X',amount:1},a,{'X-CSRF-Token':'wrong'})).status,403);assert.equal((await call('/api/store',{type:'expense',vendorId,name:'X',amount:1},a,{Origin:'https://evil.example'})).status,403);
 const sale={type:'sale',vendorId,id:'sale-1',items:[{id:pid,qty:1}],discount:5,payment:'Cash'};r=await call('/api/store',sale,a);assert.equal(r.status,200);assert.equal(r.data.state.sales[0].total,45);assert.equal(r.data.state.products[0].stock,1);r=await call('/api/store',sale,a);assert.equal(r.data.state.products[0].stock,1);assert.equal((await call('/api/store',{...sale,discount:0},a)).status,409);
 const [one,two]=await Promise.all([call('/api/store',{...sale,id:'race-1'},a),call('/api/store',{...sale,id:'race-2'},a)]);assert.deepEqual([one.status,two.status].sort(),[200,400]);
 r=await call('/api/store',{type:'bill_import',vendorId,id:'invalid-import',supplier:'Supplier',items:[{name:'New',barcode:'NEW',qty:2,cost:10,price:15},{name:'Bad',barcode:'BAD',qty:-1,cost:1,price:2}]},a);assert.equal(r.status,400);r=await call('/api/store',undefined,a);assert.equal(r.data.state.products.length,1);
 const bill={type:'bill_import',vendorId,id:'bill-1',supplier:'Supplier',items:[{name:'Test Milk',barcode:'8901234567890',qty:3,cost:30,price:50},{name:'Notebook',barcode:'NOTE',qty:4,cost:10,price:15}]};r=await call('/api/store',bill,a);assert.equal(r.status,200);assert.equal(r.data.state.products.length,2);assert.equal(r.data.state.products[0].stock,3);assert.equal((await call('/api/store',bill,a)).data.state.purchases.length,2);
 // Supplier API actions share vendor isolation, transactions and idempotency.
 r=await call('/api/store',{type:'purchase',vendorId,id:'supplier-buy',product:pid,qty:4,cost:30,supplier:'API Supplier',paidAmount:60},a);assert.equal(r.status,200);
 const beforeReturn=r.data.state.products.find(p=>p.id===pid).stock;
 const ret={type:'supplier_return',vendorId,id:'supplier-return',purchaseId:'supplier-buy',qty:2,reason:'Damaged'};
 const returns=await Promise.all([call('/api/store',ret,a),call('/api/store',ret,a)]);assert(returns.every(x=>x.status===200));
 r=await call('/api/store',undefined,a);assert.equal(r.data.state.products.find(p=>p.id===pid).stock,beforeReturn-2);assert.equal(r.data.state.supplierReturns.length,1);
 assert.equal((await call('/api/store',{...ret,qty:3},a)).status,409);
 assert.equal((await call('/api/store',{...ret,vendorId:'main',id:'cross-store'},a)).status,403);
 assert.equal((await call('/api/store',{type:'supplier_payment',vendorId,id:'excess-payment',supplier:'API Supplier',direction:'payment',amount:1},a)).status,400);
 assert.equal((await call('/api/store',{type:'start_trial',vendorId},a)).status,200);
 r=await call('/api/store',{type:'subscription_request',vendorId,plan:'yearly'},a);assert.equal(r.status,200);assert.equal(r.data.state.subscriptionRequest.plan,'yearly');
 r=await call('/api/store',{type:'settings',vendorId,name:'Vendor A',phone:'',address:'',lowPercent:25},a);assert.equal(r.status,200);assert.equal(r.data.state.settings.lowPercent,25);assert.equal((await call('/api/store',{type:'settings',vendorId,name:'A',phone:'',address:'',lowPercent:101},a)).status,400);
 r=await call('/api/store',{type:'reset_vendor_password',vendorId,email:'a@example.test'},owner);assert.equal(r.status,200);const reset=r.data.accessCode;assert.equal((await call('/api/auth/reset',{email:'a@example.test',token:reset,password:'Vendor-new-password-123'})).status,200);assert.equal((await call('/api/store',undefined,a)).status,401);const newA=await login('a@example.test','Vendor-new-password-123');
 assert.equal((await call('/api/store',{type:'revoke_access',vendorId,email:'a@example.test'},owner)).status,200);assert.equal((await call('/api/store?vendor='+vendorId,undefined,newA)).status,403);assert.equal((await call('/api/store',undefined,newA)).data.vendors.length,0);
 assert.equal((await call('/api/auth/logout',{},owner)).status,200);assert.equal((await call('/api/store',undefined,owner)).status,401);
 console.log('Verified login, activation, cross-store denial, CSRF, stale edits, concurrent stock handling, idempotency, atomic import, settings, reset, revocation and logout.');
 }finally{await new Promise(r=>server.close(r));await db.close()}
});
