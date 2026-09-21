import {randomUUID} from 'node:crypto';
import {requireSuperAdmin,email,hashPassword,token,digest,limit} from './security.mjs';
import {transaction} from './db.mjs';
const bad=(message,status=400)=>Object.assign(Error(message),{status});
export function registerAdminRoutes(app,db){
 app.get('/api/admins',async(req,res)=>{requireSuperAdmin(req.user);res.json({admins:await db.prepare("SELECT id,email,name,disabled,created_at FROM users WHERE role='admin' ORDER BY created_at DESC").all()})});
 app.post('/api/admins',async(req,res)=>{
  requireSuperAdmin(req.user);await limit(db,'admin-create:'+req.user.id,20);
  const mail=email(req.body.email);if(typeof req.body.name!=='string'||!req.body.name.trim()||req.body.name.length>100)throw bad('Enter an administrator name.');const hash=await hashPassword(req.body.password);
  await transaction(db,async()=>{await db.query('SELECT pg_advisory_xact_lock(78146323)');if(await db.prepare('SELECT id FROM users WHERE email=?').get(mail))throw bad('An account already uses this email.',409);
   const id=randomUUID();await db.prepare('INSERT INTO users(id,email,password_hash,role,name,created_at) VALUES(?,?,?,?,?,?)').run(id,mail,hash,'admin',req.body.name.trim(),Date.now());await db.prepare('INSERT INTO audit(created_at,user_id,action) VALUES(?,?,?)').run(Date.now(),req.user.id,'admin_created:'+id);
  });res.json({ok:true});
 });
 app.post('/api/admins/:id',async(req,res)=>{requireSuperAdmin(req.user);let code;
  await transaction(db,async()=>{const target=await db.prepare("SELECT id,email,disabled FROM users WHERE id=? AND role='admin' FOR UPDATE").get(req.params.id);if(!target)throw bad('Administrator not found.',404);
   if(req.body.action==='reset'){code=token();await db.prepare("DELETE FROM tokens WHERE email=? AND kind='reset'").run(target.email);await db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?)').run(digest(code),target.email,null,'reset',Date.now()+3600000);}
   else if(['enable','disable'].includes(req.body.action)){await db.prepare('UPDATE users SET disabled=? WHERE id=?').run(req.body.action==='disable',target.id);await db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);}
   else throw bad('Choose enable, disable or reset.');
   await db.prepare('INSERT INTO audit(created_at,user_id,action) VALUES(?,?,?)').run(Date.now(),req.user.id,'admin_'+req.body.action+':'+target.id);
  });res.json({ok:true,...(code?{code}:{})});
 });
}
