import {useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
export function PasswordInput(props:React.InputHTMLAttributes<HTMLInputElement>){const [show,setShow]=useState(false);return <span className="password-field"><input {...props} type={show?'text':'password'}/><button type="button" className="password-toggle" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>}
