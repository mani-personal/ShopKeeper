export type Product={id:string;name:string;barcode:string;category:string;price:number;cost:number;stock:number;min:number;unit:string;target?:number;discountMode?:"auto"|"custom"|"none";customDiscount?:number;discountBasis?:"cost"|"price";mrp?:number};
export type Sale={id:string;date:string;customer:string;payment:string;items:(Product&{qty:number})[];total:number;discount:number;productDiscount?:number;billDiscount?:number};
export const roundMoney=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function productDiscount(p:Product):number{
 const mode=p.discountMode??'auto';const basis=p.discountBasis==='price'?p.price:p.cost;
 return roundMoney(Math.min(p.price,Math.max(0,mode==='none'?0:mode==='custom'?(p.customDiscount??0):basis>100?10:basis>50?3:0)));
}
export const netPrice=(p:Product)=>roundMoney(p.price-productDiscount(p));
export type Contact={id:string;name:string;phone:string};
export type Purchase={id:string;date:string;product:string;productId?:string;qty:number;total:number;supplier:string;paidAmount?:number};
export type SupplierReturn={id:string;date:string;purchaseId:string;productId:string;supplier:string;product:string;qty:number;amount:number;reason:string};
export type SupplierPayment={id:string;date:string;supplier:string;amount:number;direction:'payment'|'refund';reference:string};
export type State={products:Product[];sales:Sale[];purchases:Purchase[];customers:Contact[];suppliers:Contact[];expenses:{id:string;date:string;name:string;amount:number}[];settings:{name:string;phone:string;address:string;lowPercent?:number};imports?:string[];supplierReturns?:SupplierReturn[];supplierPayments?:SupplierPayment[];trialStartedAt?:string;subscriptionRequest?:{plan:'monthly'|'yearly';date:string};demo:boolean};
export const trialDaysLeft=(s:State,now=Date.now())=>s.trialStartedAt?Math.max(0,Math.ceil((new Date(s.trialStartedAt).getTime()+10*86400000-now)/86400000)):10;
export const supplierKey=(name:string)=>name.trim().toLowerCase();
export function supplierAccounts(s:State){
 const names=new Map<string,string>();
 [...s.suppliers.map(x=>x.name),...s.purchases.map(x=>x.supplier)].forEach(name=>names.set(supplierKey(name),name.trim()));
 return [...names].map(([key,name])=>{
  const buys=s.purchases.filter(p=>supplierKey(p.supplier)===key),known=buys.filter(p=>p.paidAmount!==undefined);
  const returns=(s.supplierReturns??[]).filter(p=>supplierKey(p.supplier)===key);
  const moves=(s.supplierPayments??[]).filter(p=>supplierKey(p.supplier)===key);
  const purchases=roundMoney(known.reduce((t,p)=>t+p.total,0)),paid=roundMoney(known.reduce((t,p)=>t+(p.paidAmount??0),0)+moves.filter(p=>p.direction==='payment').reduce((t,p)=>t+p.amount,0));
  const credits=roundMoney(returns.reduce((t,p)=>t+p.amount,0)),refunded=roundMoney(moves.filter(p=>p.direction==='refund').reduce((t,p)=>t+p.amount,0));
  const balance=roundMoney(purchases-credits-paid+refunded);
  return {key,name,purchases,paid,credits,refunded,balance,pending:Math.max(0,balance),credit:Math.max(0,-balance),unknown:buys.length-known.length};
 });
}
export const saleCost=(sale:Sale)=>roundMoney(sale.items.reduce((t,p)=>t+p.cost*p.qty,0));
export function financialSummary(s:State,from='',to='9999-12-31'){
 const day=(date:string)=>new Date(date).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 const sales=s.sales.filter(x=>day(x.date)>=from&&day(x.date)<=to);
 const revenue=roundMoney(sales.reduce((t,x)=>t+x.total,0));
 const cost=roundMoney(sales.reduce((t,x)=>t+saleCost(x),0)),gross=roundMoney(revenue-cost);
 const expenses=roundMoney(s.expenses.filter(x=>day(x.date)>=from&&day(x.date)<=to).reduce((t,x)=>t+x.amount,0));
 return {sales,revenue,cost,gross,expenses,net:roundMoney(gross-expenses),margin:revenue?roundMoney(gross/revenue*100):0,discounts:roundMoney(sales.reduce((t,x)=>t+x.discount,0)),units:sales.reduce((t,x)=>t+x.items.reduce((n,p)=>n+p.qty,0),0)};
}
export function initial():State{return {products:[],sales:[],purchases:[],customers:[],suppliers:[],expenses:[],supplierReturns:[],supplierPayments:[],settings:{name:'My General Store',phone:'',address:''},demo:false}}
export function demoProducts():Product[]{return [['Aashirvaad Atta','Staples',275,240,42,'5 kg'],['Tata Salt','Staples',28,23,8,'1 kg'],['Amul Taaza Milk','Dairy',28,25,24,'500 ml'],['Fortune Sunflower Oil','Staples',145,125,6,'1 L'],['Maggi 2-Minute Noodles','Snacks',14,11,72,'70 g'],['Britannia Good Day','Snacks',30,24,48,'120 g'],['Surf Excel Easy Wash','Household',135,115,4,'1 kg'],['Colgate Strong Teeth','Personal care',110,92,18,'200 g'],['Tata Tea Premium','Beverages',140,118,22,'250 g'],['Parle-G Biscuits','Snacks',10,8,96,'80 g'],['Dove Beauty Bar','Personal care',62,50,14,'100 g'],['Dettol Handwash','Household',99,82,0,'200 ml']].map((p,i)=>({id:'sample-'+i,name:p[0] as string,category:p[1] as string,price:p[2] as number,cost:p[3] as number,stock:p[4] as number,unit:p[5] as string,min:10,barcode:String(8901000000000+i)}))}
export const stockTarget=(p:Product)=>p.target??Math.max(p.stock,p.min*5,1);
export const stockThreshold=(p:Product,s:State)=>Math.floor(stockTarget(p)*(s.settings.lowPercent??20)/100);
export const isLow=(p:Product,s:State)=>p.stock<=stockThreshold(p,s);
export const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
export function mutate(s:State,a:any):State{const id=()=>crypto.randomUUID();const num=(n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000000;const txt=(x:any)=>typeof x==='string'&&x.trim().length>0&&x.length<200;switch(a.type){
case 'demo':if(s.products.length||s.sales.length)throw Error('Sample items can only be loaded into an empty store.');s.products=demoProducts();s.demo=true;break;
case 'product':{const p=a.product;if(!p||!txt(p.name)||!txt(p.barcode)||!txt(p.category)||!txt(p.unit)||!['price','cost','stock','min'].every(k=>num(p[k]))||!Number.isInteger(p.stock)||!Number.isInteger(p.min))throw Error('Enter valid product details and whole-number stock.');if(s.products.some(x=>x.barcode===p.barcode.trim()&&x.id!==p.id))throw Error('This barcode belongs to another item.');const i=s.products.findIndex(x=>x.id===p.id);if(p.target!==undefined&&(!Number.isInteger(p.target)||p.target<1||p.target>10000000))throw Error('Target stock must be a positive whole number.');const mode=p.discountMode??'auto';const basis=p.discountBasis==='price'?p.price:p.cost;
if(p.discountBasis!==undefined&&!['cost','price'].includes(p.discountBasis))throw Error('Invalid discount basis.');if(p.mrp!==undefined&&(!num(p.mrp)||p.mrp<p.price))throw Error('MRP must be at least the selling price.');if(!['auto','custom','none'].includes(mode))throw Error('Choose a valid discount mode.');
if(mode==='custom'&&(!num(p.customDiscount)||p.customDiscount>p.price||Math.abs(p.customDiscount*100-Math.round(p.customDiscount*100))>0.000001))throw Error('Custom discount must be between zero and selling price, with at most two decimal places.');
const clean={...(p.mrp!==undefined?{mrp:p.mrp}:{}),discountBasis:p.discountBasis??"cost",discountMode:mode,customDiscount:mode==='custom'?p.customDiscount:0,target:p.target??Math.max(p.stock,p.min*5,1),id:i>=0?p.id:id(),name:p.name.trim(),barcode:p.barcode.trim(),category:p.category,unit:p.unit,price:p.price,cost:p.cost,stock:p.stock,min:p.min};if(i>=0)s.products[i]=clean;else s.products.push(clean);break;}
case 'sale':{if(s.sales.some(x=>x.id===a.id))break;if(!txt(a.id)||!Array.isArray(a.items)||!a.items.length||!num(a.discount)||!['Cash','UPI','Card'].includes(a.payment))throw Error('Invalid sale.');if(a.items.length>200)throw Error('A bill can contain up to 200 different products.');const seen=new Set();const items=a.items.map((line:any)=>{const p=s.products.find(x=>x.id===line.id);if(!p||seen.has(line.id)||!Number.isInteger(line.qty)||line.qty<1||line.qty>1000000||line.qty>p.stock)throw Error('Stock changed. Refresh and check bill quantities.');seen.add(line.id);return {...p,discountMode:"custom",customDiscount:productDiscount(p),qty:line.qty}});const subtotal=roundMoney(items.reduce((t:number,p:any)=>t+p.price*p.qty,0));const savings=roundMoney(items.reduce((t:number,p:any)=>t+productDiscount(p)*p.qty,0));if(a.discount>roundMoney(subtotal-savings))throw Error('Bill discount cannot exceed the total after product discounts.');items.forEach((p:any)=>{s.products.find(x=>x.id===p.id)!.stock-=p.qty});s.sales.unshift({id:a.id,date:new Date().toISOString(),customer:typeof a.customer==='string'?a.customer.slice(0,200):'Walk-in customer',payment:a.payment,items,total:roundMoney(subtotal-savings-a.discount),discount:roundMoney(savings+a.discount),productDiscount:savings,billDiscount:a.discount});break;}
case 'contact':{if(!['customers','suppliers'].includes(a.kind)||!txt(a.name)||typeof a.phone!=='string'||a.phone.length>30)throw Error('Enter valid contact details.');(s[a.kind as 'customers'|'suppliers']).push({id:id(),name:a.name.trim(),phone:a.phone});break;}
case 'purchase':{if(s.purchases.some(x=>x.id===a.id))break;const p=s.products.find(x=>x.id===a.product);if(!p||!Number.isInteger(a.qty)||a.qty<1||a.qty>1000000||!num(a.cost)||!txt(a.id)||!txt(a.supplier))throw Error('Enter a product, supplier and valid quantity/cost.');if(p.stock+a.qty>10000000)throw Error('Stock exceeds the supported limit.');const total=roundMoney(a.qty*a.cost),paid=a.paidAmount??0;if(!num(paid)||paid>total||roundMoney(paid)!==paid)throw Error('Amount paid must be between zero and purchase total.');p.stock+=a.qty;p.cost=a.cost;s.purchases.unshift({id:a.id,date:new Date().toISOString(),product:p.name,productId:p.id,qty:a.qty,total,paidAmount:paid,supplier:a.supplier.trim()});break;}
case 'inventory_import':{
 if(!txt(a.id)||!Array.isArray(a.items)||a.items.length<1||a.items.length>500)throw Error('Import 1–500 products at a time.');
 const copy=structuredClone(s);const seen=new Set(copy.products.map(p=>p.barcode));
 for(const item of a.items){if(!item||!txt(item.barcode)||seen.has(item.barcode.trim()))throw Error('A barcode already exists or is duplicated in this file. Import adds new products only.');seen.add(item.barcode.trim());mutate(copy,{type:'product',product:{...item,id:''}});}
 Object.assign(s,copy);break;
}
case 'bill_import':{if(!txt(a.id)||!txt(a.supplier)||!Array.isArray(a.items)||a.items.length<1||a.items.length>100)throw Error('Review 1–100 items and enter the supplier.');s.imports??=[];if(s.imports.includes(a.id))break;const copy=structuredClone(s);for(const line of a.items){if(!txt(line.name)||!txt(line.barcode)||!Number.isInteger(line.qty)||line.qty<1||line.qty>1000000||!num(line.cost)||!num(line.price))throw Error('Check every item name, barcode, quantity, cost and selling price.');const code=line.barcode.trim();let p=copy.products.find(x=>x.barcode===code);if(!p){mutate(copy,{type:'product',product:{id:'',name:line.name,barcode:code,category:typeof line.category==='string'&&line.category.trim()?line.category:'Imported',unit:typeof line.unit==='string'&&line.unit.trim()?line.unit.trim():'piece',stock:0,min:10,target:Math.max(line.qty,50),price:line.price,cost:line.cost}});p=copy.products.find(x=>x.barcode===code)!;}mutate(copy,{type:'purchase',id:a.id+'-'+copy.purchases.length,product:p.id,qty:line.qty,cost:line.cost,paidAmount:a.paid===true?roundMoney(line.qty*line.cost):0,supplier:a.supplier});}copy.imports!.push(a.id);Object.assign(s,copy);break;}
case 'purchase_settlement':{
 const p=s.purchases.find(p=>p.id===a.purchaseId);
 if(!txt(a.id)||!p||p.paidAmount!==undefined)throw Error('Only purchases with unknown payment status can be reconciled.');
 if(!num(a.paidAmount)||a.paidAmount>p.total||roundMoney(a.paidAmount)!==a.paidAmount)throw Error('Enter the actual amount paid, no greater than purchase total.');
 p.paidAmount=roundMoney(a.paidAmount);break;
}
case 'supplier_return':{
 s.supplierReturns??=[];
 if(s.supplierReturns.some(x=>x.id===a.id))break;
 const purchase=s.purchases.find(p=>p.id===a.purchaseId);
 if(!purchase||purchase.paidAmount===undefined||!txt(a.id)||!txt(a.reason)||!Number.isInteger(a.qty)||a.qty<1)throw Error('Choose a reconciled purchase, quantity and return reason.');
 const candidates=s.products.filter(p=>purchase.productId?p.id===purchase.productId:p.name===purchase.product);
 const p=candidates.length===1?candidates[0]:undefined;
 if(!p)throw Error('The original product cannot be matched uniquely.');
 const prior=s.supplierReturns.filter(x=>x.purchaseId===purchase.id);
 const returned=prior.reduce((t,x)=>t+x.qty,0);
 if(a.qty>purchase.qty-returned||a.qty>p.stock)throw Error('Return exceeds purchased quantity remaining or available stock.');
 const credited=prior.reduce((t,x)=>t+x.amount,0);
 const amount=roundMoney(Math.min(purchase.total-credited,roundMoney(purchase.total/purchase.qty*a.qty)));
 p.stock-=a.qty;
 s.supplierReturns.unshift({id:a.id,date:new Date().toISOString(),purchaseId:purchase.id,productId:p.id,product:purchase.product,supplier:purchase.supplier,qty:a.qty,amount,reason:a.reason.trim()});break;
}
case 'supplier_payment':{
 s.supplierPayments??=[];if(s.supplierPayments.some(x=>x.id===a.id))break;
 const account=supplierAccounts(s).find(x=>x.key===supplierKey(String(a.supplier??'')));
 if(!account||account.unknown||!txt(a.id)||!num(a.amount)||a.amount<=0||!['payment','refund'].includes(a.direction))throw Error('Reconcile unknown purchases and enter a valid payment or refund.');
 if(roundMoney(a.amount)!==a.amount)throw Error('Use at most two decimal places.');
 if(a.amount>(a.direction==='payment'?account.pending:account.credit))throw Error('Amount exceeds the pending balance or available credit.');
 s.supplierPayments.unshift({id:a.id,date:new Date().toISOString(),supplier:account.name,amount:a.amount,direction:a.direction,reference:typeof a.reference==='string'?a.reference.slice(0,200):''});break;
}
case 'start_trial':{s.trialStartedAt??=new Date().toISOString();break;}
case 'subscription_request':{
 if(!['monthly','yearly'].includes(a.plan))throw Error('Choose monthly or yearly.');
 s.subscriptionRequest={plan:a.plan,date:new Date().toISOString()};break;
}
case 'expense':if(!txt(a.name)||!num(a.amount)||!a.amount)throw Error('Enter a description and amount.');s.expenses.unshift({id:id(),date:new Date().toISOString(),name:a.name,amount:a.amount});break;
case 'settings':if(!txt(a.name)||typeof a.phone!=='string'||typeof a.address!=='string'||a.address.length>500)throw Error('Enter valid store details.');if(!num(a.lowPercent)||a.lowPercent>100)throw Error('Low-stock percentage must be between 0 and 100.');s.settings={name:a.name.trim(),phone:a.phone.slice(0,30),address:a.address,lowPercent:a.lowPercent};break;
default:throw Error('Unknown action.');}return s}
