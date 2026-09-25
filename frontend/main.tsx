import {createRoot} from "react-dom/client";
import {useEffect,useState} from "react";
import {BadgeCheck,ShieldCheck,Store,Truck} from "lucide-react";
import {Toaster} from "sonner";
import App from "./App";
import {Pricing} from "./pricing";
import {ThemeToggle,initializeTheme} from "./theme";
import {api} from "./api";
import {PasswordInput} from "./password-input";
import {WholesalePortal} from "./wholesale-portal";
import {AdminConsole} from "./admin-console";
import "./styles.css";
initializeTheme();
const superPortal=location.pathname==="/super-admin/login",wholesalePortal=location.pathname==="/wholesale/login",adminPortal=superPortal||location.pathname==="/admin/login";
type Mode="login"|"forgot"|"reset";
function Root(){
  const [ready,setReady]=useState(false),[signed,setSigned]=useState(false),[user,setUser]=useState<any>(null),[error,setError]=useState(""),[mode,setMode]=useState<Mode>(location.hash.startsWith("#reset=")?"reset":"login"),[busy,setBusy]=useState(false),[code,setCode]=useState(decodeURIComponent(location.hash.split("=")[1]??""));
  useEffect(()=>{history.replaceState(null,"",location.pathname+location.search);api("/api/auth/me").then(d=>{const wrong=(superPortal&&d.user.role!=="owner")||(adminPortal&&!["owner","admin"].includes(d.user.role))||(wholesalePortal&&d.user.role!=="wholesale");if(wrong)setError("Sign in with the correct account for this portal.");else {setUser(d.user);setSigned(true)}}).catch(()=>{}).finally(()=>setReady(true));const expired=(event:Event)=>{setSigned(false);setError((event as CustomEvent<string>).detail||"Your session ended. Please sign in again.");setMode("login")};window.addEventListener("session-expired",expired);return()=>window.removeEventListener("session-expired",expired)},[]);
  if(!ready)return <main className="account-gate">Loading Shopkeeper…</main>;
  if(signed&&mode==="login")return user?.role==="wholesale"?<WholesalePortal/>:["owner","admin"].includes(user?.role)?<AdminConsole role={user.role} permissions={user.permissions||[]}/>:<App/>;
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const f=new FormData(e.currentTarget);try{
    if(mode==="forgot"){const result=await api("/api/auth/forgot",{email:f.get("email")});setError(result.message);setMode("login");return}
    const result=await api("/api/auth/"+mode,{email:f.get("email"),password:f.get("password"),...(mode==="reset"?{token:code}:{portal:superPortal?"super-admin":wholesalePortal?"wholesale":adminPortal?"admin":"vendor"})});
    if(mode==="reset"){setMode("login");setCode("");setError("Password updated. Sign in with your new password.")}else{setUser(result.user);if(["owner","admin"].includes(result.user.role)){const profile=await api("/api/auth/me");setUser(profile.user)}setSigned(true)}
  }catch(error){setError((error as Error).message)}finally{setBusy(false)}}
  return <main className="account-gate"><Toaster richColors/><section className="panel"><ThemeToggle/><Store size={36}/><h1>{mode==="login"?(superPortal?"Super admin sign in":wholesalePortal?"Wholesale seller sign in":adminPortal?"Administrator sign in":"Sign in to Shopkeeper"):mode==="forgot"?"Recover your password":"Reset your password"}</h1><p>{mode==="forgot"?"Enter your account email. If it exists, we’ll send a private reset link.":"Manage your business in one place."}</p>
    {mode==="login"&&!adminPortal&&!wholesalePortal&&<div className="portal-choices"><a className="portal-choice active" href="/"><Store/><span><b>Retail vendor</b><small>POS, inventory and supply orders</small></span></a><a className="portal-choice" href="/wholesale/login"><Truck/><span><b>Wholesaler</b><small>Catalogue and deliveries</small></span></a><a className="portal-choice" href="/admin/login"><ShieldCheck/><span><b>Administrator</b><small>Global management</small></span></a></div>}
    {error&&<div role="status" className="notice">{error}</div>}<form className="form" onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" defaultValue={new URLSearchParams(location.search).get("email")||""} required/></label>{mode==="reset"&&<label>Reset code<input value={code} onChange={e=>setCode(e.target.value)} required autoComplete="off"/></label>}{mode!=="forgot"&&<label>{mode==="reset"?"New password":"Password"}<PasswordInput name="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="login"?1:12} maxLength={128} required/></label>}<button className="btn primary" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="forgot"?"Email reset link":"Set new password"}</button></form>
    <div className="actions"><button className="text-button" onClick={()=>{setMode(mode==="login"?"forgot":"login");setError("")}}>{mode==="login"?"Forgot password?":"Back to sign in"}</button></div><a href="/pricing" className="trust-link"><BadgeCheck size={16}/>View subscription plans</a></section></main>;
}
createRoot(document.getElementById("root")!).render(location.pathname==="/pricing"?<Pricing/>:<Root/>);
