import {useState} from 'react';
import {State,trialDaysLeft} from '@/lib/store';
import {ThemeToggle} from './theme';
export function Pricing({s,busy=false,save}:{s?:State;busy?:boolean;save?:(a:any)=>Promise<unknown>}){
 const [message,setMessage]=useState('');
 const start=s?.trialStartedAt?new Date(s.trialStartedAt).getTime():undefined;
 const remaining=s?trialDaysLeft(s):10;
 async function choose(plan:'trial'|'monthly'|'yearly'){
  if(!save){location.href=plan==='trial'?'/#activate=':'/';return}
  if(await save(plan==='trial'?{type:'start_trial'}:{type:'subscription_request',plan})){
   setMessage(plan==='trial'?'Your 10-day trial has started.':'Plan request saved. Contact your workspace administrator to arrange payment.');
  }
 }
 return <section className="pricing-page"><header className="pricing-heading"><div><span className="eyebrow">SIMPLE PRICING FOR LOCAL SHOPS</span><h1>One store. Everything in order.</h1><p>Try Shopkeeper free for 10 days, then choose the plan that suits your business.</p></div>{!s&&<ThemeToggle/>}</header>
 <div className="pricing-grid">{[
  {key:'trial',name:'Free trial',price:'₹0',term:'for 10 days',note:'Explore inventory, billing and reports',button:start===undefined?'Start free trial':remaining?remaining+' trial days left':'Trial ended'},
  {key:'monthly',name:'Monthly',price:'₹1,000',term:'per month / store',note:'Flexible monthly plan',button:'Request monthly plan'},
  {key:'yearly',name:'Yearly',price:'₹10,000',term:'per year / store',note:'Save ₹2,000 compared with 12 monthly payments',button:'Request yearly plan'}
 ].map(plan=><article className={'panel price-card '+(plan.key==='yearly'?'featured':'')} key={plan.key}>{plan.key==='yearly'&&<span className="badge green">₹2,000 yearly savings</span>}<h2>{plan.name}</h2><strong className="plan-price">{plan.price}</strong><p>{plan.term}</p><p>{plan.note}</p><ul><li>Inventory and barcode billing</li><li>Product discounts and MRP capture</li><li>Supplier returns and balances</li><li>Sales, profit and margin reports</li><li>Mobile access and light/dark themes</li></ul><button className="btn primary" disabled={busy||(plan.key==='trial'&&start!==undefined)} onClick={()=>void choose(plan.key as 'trial'|'monthly'|'yearly')}>{s?plan.button:plan.key==='trial'?'Activate your trial account':'Sign in to choose'}</button></article>)}</div>
 {message&&<div className="notice" role="status">{message}</div>}
 {s?.subscriptionRequest&&<div className="notice">Requested plan: <b>{s.subscriptionRequest.plan}</b> · {new Date(s.subscriptionRequest.date).toLocaleDateString('en-IN')} · Awaiting administrator confirmation.</div>}
 <p className="muted">Plans are per store. No automatic charge is made on this page. Your administrator handles account activation and payment confirmation.</p>
 {!s&&<p><a className="text-button" href="/">Already have an account? Sign in</a></p>}
 </section>;
}
