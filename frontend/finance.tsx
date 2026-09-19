import {useState} from 'react';
import {State,financialSummary,money,roundMoney,saleCost,supplierAccounts} from '@/lib/store';
export function FinanceCards({s,from='',to='9999-12-31',dashboard=false}:{s:State;from?:string;to?:string;dashboard?:boolean}){
 const f=financialSummary(s,from,to);
 return <><div className="metrics">{[
  ['Net sales',money(f.revenue),f.sales.length+' bills · '+f.units+' units, after discounts'],
  dashboard?['Expenses',money(f.expenses),'Expenses recorded in this period']:['Cost of goods sold',money(f.cost),'Cost recorded when each sale was made'],
  ['Gross profit',money(f.gross),f.margin.toFixed(2)+'% margin on net sales'],
  ['Profit after expenses',money(f.net),money(f.expenses)+' recorded expenses']
 ].map(([label,value,note])=><div className="metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><p className="muted small">Gross profit = net sales − cost of goods sold. Profit after expenses = gross profit − recorded expenses. These figures depend on entered costs and expenses; tax is not calculated.</p></>;
}
export function FinanceReport({s}:{s:State}){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const [from,setFrom]=useState(today.slice(0,8)+'01'),[to,setTo]=useState(today);
 const f=financialSummary(s,from,to),accounts=supplierAccounts(s);
 function download(){
  const rows=[['Invoice','Date','Customer','Net sales','Cost of goods sold','Gross profit','Margin %','Discounts'],...f.sales.map(x=>{const cost=saleCost(x),profit=roundMoney(x.total-cost);return [x.id,x.date,x.customer,x.total,cost,profit,x.total?roundMoney(profit/x.total*100):0,x.discount]})];
  const quote=(v:unknown)=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\n')],{type:'text/csv'}));
  const a=document.createElement('a');a.href=url;a.download='sales-margin-'+from+'-'+to+'.csv';a.click();URL.revokeObjectURL(url);
 }
 return <div className="finance-report"><div className="toolbar form report-dates"><label>From (India time)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label><button className="btn" onClick={download} disabled={!from||!to||from>to}>Export filtered report</button></div>
 {from>to?<div className="notice error">Start date must be on or before end date.</div>:<><FinanceCards s={s} from={from} to={to}/><div className="notice">Discounts given: <b>{money(f.discounts)}</b> · Current supplier payable: <b>{money(accounts.reduce((t,a)=>t+a.pending,0))}</b> · Supplier credit / refund due: <b>{money(accounts.reduce((t,a)=>t+a.credit,0))}</b>{accounts.some(a=>a.unknown>0)&&<p>Some older purchases have unknown payment status. Reconcile them under Supplier accounts for complete balances.</p>}</div>
 <section className="panel table-scroll"><table className="ledger-table"><thead><tr>{['Date','Invoice','Net sales','Cost','Gross profit','Margin'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{f.sales.map(x=>{const cost=saleCost(x),gross=roundMoney(x.total-cost);return <tr key={x.id}><td>{new Date(x.date).toLocaleDateString('en-IN')}</td><td>{x.id.slice(0,12)}</td><td>{money(x.total)}</td><td>{money(cost)}</td><td>{money(gross)}</td><td>{x.total?(gross/x.total*100).toFixed(2):'0.00'}%</td></tr>})}</tbody></table>{!f.sales.length&&<p className="empty-inline">No sales in this period.</p>}</section></>}
 </div>;
}
