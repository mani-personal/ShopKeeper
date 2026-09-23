import {useState} from 'react';
import {Sun,Moon} from 'lucide-react';
function preferred(){try{return localStorage.getItem('shopkeeper-theme')==='dark'?'dark':'light'}catch{return 'light'}}
export function initializeTheme(){document.documentElement.classList.toggle('dark',preferred()==='dark')}
export function ThemeToggle(){
 const [theme,setTheme]=useState(preferred);
 function toggle(){const next=theme==='dark'?'light':'dark';setTheme(next);document.documentElement.classList.toggle('dark',next==='dark');try{localStorage.setItem('shopkeeper-theme',next)}catch{/* preference still works for this page */}}
 return <button type="button" className="btn theme-toggle" title={'Switch to '+(theme==='dark'?'light':'dark')+' theme'} aria-label={'Switch to '+(theme==='dark'?'light':'dark')+' theme'} onClick={toggle}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
}
