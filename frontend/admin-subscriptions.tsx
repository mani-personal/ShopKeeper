import {useEffect,useState} from 'react';
import {api} from './api';
import {money} from '@/lib/store';

const date=(value:unknown)=>value?new Date(Number(value)).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'—';

export function AdminSubscriptionDashboard({onOpen}:{onOpen:(kind:'vendor'|'wholesale',id:string)=>void}){
 const [data,setData]=useState<any>(),[error,setError]=useState(''),[search,setSearch]=useState('');
 async function reload(){try{setData(await api('/api/admin/subscriptions/dashboard'));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void reload()},[]);
 const summary=data?.summary;
 return <section className="admin-subscription-dashboard">
  <div className="panel padded"><div className="panel-heading"><div><h2>Subscription revenue</h2><p>Approved vendor and wholesale subscriptions. This month follows India time.</p></div><button className="btn" onClick={()=>void reload()}>Refresh</button></div>
   {error&&<p role="alert">{error}</p>}{summary&&<div className="metrics admin-revenue-metrics"><div className="metric"><span>Total received</span><strong>{money(summary.vendorRevenue+summary.wholesaleRevenue)}</strong></div><div className="metric"><span>Vendor subscriptions</span><strong>{money(summary.vendorRevenue)}</strong><small>This month: {money(summary.vendorMonthRevenue)}</small></div><div className="metric"><span>Wholesale subscriptions</span><strong>{money(summary.wholesaleRevenue)}</strong><small>This month: {money(summary.wholesaleMonthRevenue)}</small></div><div className="metric"><span>This month received</span><strong>{money(summary.vendorMonthRevenue+summary.wholesaleMonthRevenue)}</strong></div></div>}</div>
  {data&&<><label className="form admin-subscription-search">Search businesses<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Business name"/></label>{([['Vendors',data.vendors,'vendor'],['Wholesalers',data.wholesalers,'wholesale']] as const).map(([label,rows,kind])=><section key={label} className="panel padded"><h2>{label} ({rows.length})</h2><div className="admin-business-list">{rows.filter((r:any)=>r.name.toLowerCase().includes(search.toLowerCase())).map((r:any)=><button key={r.id} className="admin-business-row admin-subscription-row" onClick={()=>onOpen(kind,r.id)}><span><b>{r.name}</b><small>{r.period} · Valid until {date(r.validUntil)} · {r.payments} approved payments</small></span><span className="badge">{r.daysRemaining} days left</span><b>{money(r.revenue)} received</b></button>)}{!rows.length&&<p className="empty-inline">No businesses yet.</p>}</div></section>)}</>}
 </section>;
}

export function AdminSubscriptionHistory({kind}:{kind:'vendor'|'wholesale'}){
 const [result,setResult]=useState<any>(),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(0),[error,setError]=useState('');
 async function reload(){try{const params=new URLSearchParams({kind,status,search,page:String(page)});setResult(await api('/api/admin/subscriptions/history?'+params));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{const timer=setTimeout(()=>void reload(),200);return()=>clearTimeout(timer)},[kind,status,search,page]);
 return <section className="panel padded admin-subscription-history"><div className="panel-heading"><div><h2>Subscription history</h2><p>Payments, extension requests, approvals and rejections are recorded here.</p></div><button className="btn" onClick={()=>void reload()}>Refresh history</button></div>
  <div className="admin-history-filters"><label className="form">Search business or reference<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Search subscriptions"/></label><label className="form">Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label></div>
  {error&&<p role="alert">{error}</p>}<div className="admin-business-list">{result?.rows?.map((row:any)=><div key={row.id} className="admin-business-row admin-history-row"><span><b>{row.business_name} · {row.plan||row.kind.replaceAll('_',' ')}</b><small>Requested {date(row.created_at)} · {row.days} days · Reference: {row.reference||'—'}</small><small>Reviewed {date(row.approved_at)} · Valid until {date(row.valid_until)}</small></span><span className="badge">{row.status}</span><b>{money(Number(row.amount||0))}</b></div>)}{result&&!result.rows.length&&<p className="empty-inline">No subscriptions match these filters.</p>}</div>
  {result?.total>50&&<div className="actions"><button className="btn" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1} of {Math.ceil(result.total/50)}</span><button className="btn" disabled={(page+1)*50>=result.total} onClick={()=>setPage(page+1)}>Next</button></div>}
 </section>;
}
