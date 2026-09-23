import {randomUUID} from 'node:crypto';

const bad=(message,status=400)=>Object.assign(Error(message),{status});

export async function recordActivity(db,{actorId=null,vendorId=null,wholesalerId=null,scope='all',category='general',title,detail=''}){
 if(!title)return;
 await db.prepare('INSERT INTO activity_events(id,actor_id,vendor_id,wholesaler_id,scope,category,title,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),actorId,vendorId,wholesalerId,scope,category,String(title).slice(0,160),String(detail||'').slice(0,500),Date.now());
}

async function visible(db,user,limit=50){
 const fields=`e.*,u.name AS actor_name,EXISTS(SELECT 1 FROM activity_reads ar WHERE ar.event_id=e.id AND ar.user_id=?) AS is_read`;
 if(user.role==='owner'||user.role==='admin')return db.prepare(`SELECT ${fields} FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id ORDER BY e.created_at DESC LIMIT ?`).all(user.id,limit);
 if(user.role==='wholesale')return db.prepare(`SELECT ${fields} FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.scope='all' OR e.wholesaler_id=? ORDER BY e.created_at DESC LIMIT ?`).all(user.id,user.id,limit);
 return db.prepare(`SELECT ${fields} FROM activity_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.scope='all' OR e.vendor_id IN (SELECT vendor_id FROM memberships WHERE user_id=?) ORDER BY e.created_at DESC LIMIT ?`).all(user.id,user.id,limit);
}

export function registerActivityRoutes(app,db){
 app.get('/api/activities',async(req,res)=>{const limit=Math.min(100,Math.max(1,Number(req.query.limit)||40));const events=await visible(db,req.user,limit);res.json({events,unread:events.filter(x=>!x.is_read).length});});
 app.post('/api/activities/read',async(req,res)=>{const events=await visible(db,req.user,100);const ids=req.body.id?[String(req.body.id)]:events.map(x=>x.id);if(req.body.id&&!events.some(x=>x.id===req.body.id))throw bad('Activity not found.',404);for(const id of ids)await db.prepare('INSERT INTO activity_reads(event_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET read_at=EXCLUDED.read_at').run(id,req.user.id,Date.now());res.json({ok:true});});
}
