import {requireOwner} from './security.mjs';
const bad=message=>Object.assign(Error(message),{status:400});
export async function pricing(db){const row=await db.prepare('SELECT * FROM pricing_config WHERE id=1').get();return {...JSON.parse(row.data),version:row.version};}
export function validity(v,trialDays=10){const s=JSON.parse(v.data);const until=Number(v.valid_until)||(s.trialStartedAt?Date.parse(s.trialStartedAt)+(v.trial_days??trialDays)*86400000:0);return {validUntil:until||null,daysRemaining:until?Math.max(0,Math.ceil((until-Date.now())/86400000)):0,period:v.valid_until?'Subscription':'Trial'};}
export async function subscriptionInfo(db,v,config){return {vendorId:v.id,...validity(v,config.trialDays),history:await db.prepare('SELECT h.*,EXISTS(SELECT 1 FROM payment_proofs p WHERE p.payment_id=h.id) AS has_proof FROM subscription_history h WHERE vendor_id=? ORDER BY created_at DESC,id DESC LIMIT 200').all(v.id)};}
export async function savePricing(db,user,a){requireOwner(user);const row=await db.prepare('SELECT * FROM pricing_config WHERE id=1 FOR UPDATE').get();if(a.version!==row.version)throw bad('Pricing changed. Refresh before saving.');
 const p=a.pricing;if(!p||![p.monthly,p.yearly].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=1000000&&Math.round(n*100)/100===n)||!Number.isInteger(p.trialDays)||p.trialDays<1||p.trialDays>90||typeof p.upiId!=='string'||(p.upiId&&!/^[a-zA-Z0-9.\-_]{2,128}@[a-zA-Z0-9]{2,64}$/.test(p.upiId))||typeof p.payee!=='string'||!p.payee.trim()||p.payee.length>100||typeof p.headline!=='string'||!p.headline.trim()||p.headline.length>150)throw bad('Enter valid prices, trial days, payee, UPI ID and heading.');
 await db.prepare('UPDATE pricing_config SET data=?,version=version+1 WHERE id=1').run(JSON.stringify({monthly:p.monthly,yearly:p.yearly,trialDays:p.trialDays,upiId:p.upiId,payee:p.payee.trim(),headline:p.headline.trim()}));
}
export async function subscriptionAction(db,user,v,a){
 const config=await pricing(db);
 if(a.type==='subscription_order'){
  if(!['monthly','yearly'].includes(a.plan)||typeof a.id!=='string'||!/^[a-f0-9-]{36}$/.test(a.id))throw bad('Choose a plan.');
  if(!config.upiId)throw bad('Payment QR is not configured. Contact the administrator.');
  const prior=await db.prepare('SELECT * FROM subscription_history WHERE id=?').get(a.id);if(prior){if(prior.vendor_id!==v.id||prior.plan!==a.plan)throw bad('Request ID is already used.');return;}
  await db.prepare('INSERT INTO subscription_history(id,vendor_id,kind,plan,amount,days,status,created_at,actor) VALUES(?,?,?,?,?,?,?,?,?)').run(a.id,v.id,'payment',a.plan,config[a.plan],a.plan==='monthly'?30:365,'pending',Date.now(),user.id);return;
 }
 if(a.type==='subscription_reference'){
  if(typeof a.reference!=='string'||a.reference.trim().length<4||a.reference.length>100)throw bad('Enter the payment transaction reference.');
  const row=await db.prepare("SELECT * FROM subscription_history WHERE id=? AND vendor_id=? AND status='pending' FOR UPDATE").get(a.id,v.id);if(!row)throw bad('Pending payment not found.');
  await db.prepare('UPDATE subscription_history SET reference=? WHERE id=?').run(a.reference.trim(),a.id);return;
 }
 requireOwner(user);
 if(a.type==='subscription_approve'){
  const row=await db.prepare('SELECT * FROM subscription_history WHERE id=? AND vendor_id=? FOR UPDATE').get(a.id,v.id);if(!row)throw bad('Payment request not found.');if(row.status==='approved')return;if(row.status!=='pending')throw bad('Payment is not pending.');
  const until=Math.max(Date.now(),validity(v,config.trialDays).validUntil||0)+row.days*86400000;
  await db.prepare("UPDATE subscription_history SET status='approved',approved_at=?,valid_until=?,actor=? WHERE id=?").run(Date.now(),until,user.id,row.id);
  await db.prepare("UPDATE vendors SET valid_until=?,suspended=FALSE,suspension_reason='',access_changed_at=?,access_changed_by=?,version=version+1 WHERE id=?").run(until,Date.now(),user.id,v.id);return;
 }
 if(a.type==='subscription_extend'){
  if(!Number.isInteger(a.days)||a.days<1||a.days>3650||typeof a.reference!=='string'||!a.reference.trim()||a.reference.length>100||typeof a.id!=='string'||!/^[a-f0-9-]{36}$/.test(a.id))throw bad('Enter 1–3650 days and a reason.');
  const prior=await db.prepare('SELECT * FROM subscription_history WHERE id=?').get(a.id);if(prior){if(prior.vendor_id!==v.id||prior.days!==a.days||prior.reference!==a.reference.trim())throw bad('Request ID is already used.');return;}
  const until=Math.max(Date.now(),validity(v,config.trialDays).validUntil||0)+a.days*86400000;
  await db.prepare('INSERT INTO subscription_history(id,vendor_id,kind,days,status,reference,created_at,approved_at,valid_until,actor) VALUES(?,?,?,?,?,?,?,?,?,?)').run(a.id,v.id,'extension',a.days,'approved',a.reference.trim(),Date.now(),Date.now(),until,user.id);
  await db.prepare('UPDATE vendors SET valid_until=?,version=version+1 WHERE id=?').run(until,v.id);return;
 }
 throw bad('Unknown subscription action.');
}
