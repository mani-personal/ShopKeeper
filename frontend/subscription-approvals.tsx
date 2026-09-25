import {useEffect,useState} from 'react';
import {api} from './api';
import {PaymentProof} from './store-assets';
import {money} from '@/lib/store';

type Kind='vendor'|'wholesale';
type Request={id:string;vendor_id?:string;vendorName?:string;business_name?:string;plan:string;amount:number;days:number;reference:string;created_at:number;has_proof:boolean};
export function SubscriptionApprovals({kind}:{kind:Kind}) {
 const [requests,setRequests]=useState<Request[]>([]),[extensions,setExtensions]=useState<any[]>([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
 const prefix=kind==='vendor'?'/api/subscriptions':'/api/wholesale/subscriptions';
 async function load(){try{const [payments,days]=await Promise.all([api(prefix+'/pending'),api(prefix+'/extensions/pending')]);setRequests(payments.requests);setExtensions(days.requests)}catch(error){setMessage((error as Error).message)}}
 useEffect(()=>{void load()},[kind]);
 async function approve(row:Request){
  const name=row.vendorName||row.business_name;
  const missing=!row.has_proof||!row.reference;
  if(!confirm(missing?`Screenshot or payment reference missing. Verify payment independently in your bank account before approving ${name}. Confirm payment received?`:`Confirm payment from ${name} was received in your bank account?`))return;
  setBusy(row.id);try{await api(prefix+'/'+row.id+'/approve',{});setMessage('Subscription approved and remaining days preserved.');await load()}catch(error){setMessage((error as Error).message)}finally{setBusy('')}
 }
 async function reject(row:Request){
  const reason=prompt('Why are you declining this payment? The business will see your reason.');
  if(reason===null)return;
  if(!reason.trim()||reason.trim().length>150){setMessage('Enter a reason up to 150 characters.');return}
  setBusy(row.id);try{await api(prefix+'/'+row.id+'/reject',{reason:reason.trim()});setMessage('Payment request declined. Subscription days were not changed.');await load()}catch(error){setMessage((error as Error).message)}finally{setBusy('')}
 }
 async function review(row:any,action:'approve'|'reject'){
  if(action==='approve'&&!confirm(`Grant ${row.days} days to ${row.businessName||row.business_name}?`))return;
  setBusy(row.id);try{await api(prefix+'/extensions/'+row.id+'/review',{action});setMessage('Extension request '+(action==='approve'?'approved':'declined')+'.');await load()}catch(error){setMessage((error as Error).message)}finally{setBusy('')}
 }
 return <div className="approval-stack"><header className="panel-heading"><div><h2>{kind==='vendor'?'Vendor':'Wholesale'} subscriptions</h2><p>Review payment and extension requests. Check your payment records before approval.</p></div><button className="btn" onClick={()=>void load()}>Refresh</button></header><p role="status">{message}</p>
  <section className="panel padded"><h2>Payment approvals</h2><div className="table-scroll"><table className="ledger-table"><thead><tr>{['Account','Plan','Amount','Submitted','Reference','Proof','Actions'].map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{requests.map(row=><tr key={row.id}><td><b>{row.vendorName||row.business_name}</b></td><td>{row.plan} · {row.days} days</td><td>{money(Number(row.amount))}</td><td>{new Date(Number(row.created_at)).toLocaleDateString('en-IN')}</td><td>{row.reference||'Not provided'}</td><td>{row.has_proof?<PaymentProof wholesale={kind==='wholesale'} vendorId={row.vendor_id} paymentId={row.id} hasProof/>:'No screenshot'}</td><td><div className="actions subscription-review-actions"><button className="btn primary" disabled={busy===row.id} onClick={()=>void approve(row)}>{busy===row.id?'Working…':'Approve'}</button><button className="btn" disabled={busy===row.id} onClick={()=>void reject(row)}>Decline</button></div>{(!row.reference||!row.has_proof)&&<small className="block-text">Verify payment independently before approving.</small>}</td></tr>)}</tbody></table>{!requests.length&&<p className="empty-inline">No {kind} payments are waiting for approval.</p>}</div></section>
  <section className="panel padded"><h2>Extension requests</h2>{extensions.map(row=><div className="record-row" key={row.id}><span><b>{row.businessName||row.business_name}</b><small>{row.days} days · {row.reference} · {new Date(Number(row.created_at)).toLocaleDateString('en-IN')}</small></span><span className="actions"><button className="btn primary" disabled={busy===row.id} onClick={()=>void review(row,'approve')}>Approve</button><button className="btn" disabled={busy===row.id} onClick={()=>void review(row,'reject')}>Decline</button></span></div>)}{!extensions.length&&<p className="empty-inline">No extension requests awaiting review.</p>}</section>
 </div>;
}
