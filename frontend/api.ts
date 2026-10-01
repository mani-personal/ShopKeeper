let csrf='';
export function setCsrf(value:string){csrf=value;}
function requestHeaders(path:string, body:unknown){
 const headers:Record<string,string>={};
 if(body!==undefined) headers['Content-Type']='application/json';
 if(body!==undefined) headers['X-CSRF-Token']=csrf;
 if(path.startsWith('/api/wholesale')||path.startsWith('/api/marketplace')){
   const store=localStorage.getItem('shopkeeper-wholesale-store-id');
   if(store) headers['X-Wholesale-Store-ID']=store;
 }
 return headers;
}
export async function api(path:string,body?:unknown){const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:requestHeaders(path,body),...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(data.code==='VENDOR_SUSPENDED')window.dispatchEvent(new CustomEvent('session-expired',{detail:data.error}));if(response.status===401&&path!=='/api/auth/login'&&path!=='/api/auth/me')window.dispatchEvent(new Event('session-expired'));if(!response.ok)throw Error(data.error||'Request failed.');if(data.csrf)setCsrf(data.csrf);return data;}
export async function storeFetch(path:string,init?:RequestInit){const response=await fetch(path,{...init,credentials:'same-origin',headers:{...init?.headers,...(init?.method==='POST'?{'X-CSRF-Token':csrf}:{})}});if(response.status===403){const data=await response.clone().json().catch(()=>({}));if(data.code==='VENDOR_SUSPENDED')window.dispatchEvent(new CustomEvent('session-expired',{detail:data.error}));}if(response.status===401)window.dispatchEvent(new Event('session-expired'));return response;}
export async function logout(){try{await api('/api/auth/logout',{})}finally{location.assign('/')}}
