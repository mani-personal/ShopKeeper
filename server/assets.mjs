import sharp from 'sharp';
import {transaction} from './db.mjs';
import {requireVendor,limit} from './security.mjs';
const bad=message=>Object.assign(Error(message),{status:400});
async function raster(value,logo){
 if(typeof value!=='string'||value.length>2400000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))throw bad('Upload a JPG, PNG or WebP image under 1.8 MB.');
 try{const source=Buffer.from(value.split(',')[1],'base64');if(source.length>1800000)throw Error();const image=sharp(source,{limitInputPixels:24000000,animated:false});const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format)||!meta.width||!meta.height)throw Error();const result=await image.rotate().resize({width:logo?320:1600,height:logo?320:2000,fit:'inside',withoutEnlargement:true}).webp({quality:logo?88:85}).toBuffer();if(result.length>(logo?150000:1500000))throw Error();return result;}catch{throw bad('Image is invalid or too large. Choose a smaller, clear photo.');}
}
export function registerAssetRoutes(app,db){
 app.post('/api/vendors/:id/logo',async(req,res)=>{
  await requireVendor(db,req.user,req.params.id);await limit(db,'logo:'+req.user.id,30);const bytes=req.body.remove===true?null:await raster(req.body.image,true);const logo=bytes?'data:image/webp;base64,'+bytes.toString('base64'):null;
  await transaction(db,async()=>{await requireVendor(db,req.user,req.params.id);await db.prepare('UPDATE vendors SET logo_image=? WHERE id=?').run(logo,req.params.id);await db.prepare('INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)').run(Date.now(),req.user.id,req.params.id,'logo_update');});res.json({logo});
 });
 app.post('/api/vendors/:id/payment-proof/:payment',async(req,res)=>{
  await requireVendor(db,req.user,req.params.id);await limit(db,'proof:'+req.user.id,30);const bytes=await raster(req.body.image,false);
  await transaction(db,async()=>{await requireVendor(db,req.user,req.params.id);const order=await db.prepare('SELECT status FROM subscription_history WHERE id=? AND vendor_id=? FOR UPDATE').get(req.params.payment,req.params.id);if(!order||order.status!=='pending')throw bad('Only a pending payment can receive a screenshot.');
   await db.prepare('INSERT INTO payment_proofs(payment_id,image,mime,uploaded_at,uploaded_by) VALUES(?,?,?,?,?) ON CONFLICT(payment_id) DO UPDATE SET image=EXCLUDED.image,mime=EXCLUDED.mime,uploaded_at=EXCLUDED.uploaded_at,uploaded_by=EXCLUDED.uploaded_by').run(req.params.payment,bytes,'image/webp',Date.now(),req.user.id);await db.prepare('INSERT INTO audit(created_at,user_id,vendor_id,action) VALUES(?,?,?,?)').run(Date.now(),req.user.id,req.params.id,'payment_proof_upload:'+req.params.payment);
  });res.json({ok:true});
 });
 app.get('/api/vendors/:id/payment-proof/:payment',async(req,res)=>{await requireVendor(db,req.user,req.params.id);const proof=await db.prepare('SELECT p.image,p.mime FROM payment_proofs p JOIN subscription_history h ON h.id=p.payment_id WHERE p.payment_id=? AND h.vendor_id=?').get(req.params.payment,req.params.id);if(!proof)return res.status(404).json({error:'Screenshot not found.'});res.set('Content-Type',proof.mime);res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.send(Buffer.from(proof.image));});
}
