import {useState} from 'react';
import {Subscription,SubscriptionHistory} from './pricing';
import type {VendorSummary} from '@/lib/vendors';
export function VendorSubscription({vendor,busy,save,info}:{info?:Subscription;vendor:VendorSummary;busy:boolean;save:(a:any)=>Promise<unknown>}){
 const [confirm,setConfirm]=useState(false);const [operation,setOperation]=useState(()=>crypto.randomUUID());
 return <section className="panel" style={{marginBottom:20}}>
  <h2>Subscription access</h2><p><b>{info?.daysRemaining??0} days remaining</b>{info?.validUntil?' · Valid until '+new Date(info.validUntil).toLocaleDateString('en-IN'):''}</p>
  <form className="form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);if(await save({type:'subscription_extend',id:operation,days:Number(f.get('days')),reference:f.get('reason')})){form.reset();setOperation(crypto.randomUUID())}}}><label>Extend validity by days<input name="days" type="number" required min="1" max="3650"/></label><label>Reason / payment note<input name="reason" required maxLength={100}/></label><button className="btn primary" disabled={busy}>Extend validity</button><p className="muted small">Adds days after the current expiry, or from today if expired. A suspended store stays suspended until you reactivate it below.</p></form>
  <SubscriptionHistory info={info} admin save={save} busy={busy}/>
  <p><b>{vendor.suspended?'Suspended — payment pending':'Active'}</b></p>
  <p>{vendor.suspended?'Store access is blocked for all assigned vendor accounts. Inventory, sales and all other records are retained.':'Suspend this store if its subscription has not been paid. Only an administrator can restore access.'}</p>
  {vendor.accessChangedAt&&<p className="muted small">Last changed: {new Date(Number(vendor.accessChangedAt)).toLocaleString('en-IN')}</p>}
  {confirm?<><p>{vendor.suspended?'Have you verified the subscription payment? Reactivating lets assigned vendors sign in and use their saved store data.':'Suspend access for this store now? Existing sessions will be blocked from further store requests. Data will be kept.'}</p><div className="actions"><button className="btn primary" disabled={busy} onClick={async()=>{if(await save({type:vendor.suspended?'vendor_reactivate':'vendor_suspend',expectedSuspended:!!vendor.suspended}))setConfirm(false)}}>{vendor.suspended?'Payment verified — reactivate':'Confirm suspension'}</button><button className="btn" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></div></>:<button className="btn" disabled={busy} onClick={()=>setConfirm(true)}>{vendor.suspended?'Reactivate after payment':'Suspend for unpaid subscription'}</button>}
  <p className="muted small">Payment verification and suspension are manual. This control does not collect payments or automatically check monthly renewals.</p>
 </section>;
}
