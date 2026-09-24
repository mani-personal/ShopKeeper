import { useEffect, useRef, type ComponentType } from "react";
import { ArrowRight, LogOut, UserRound } from "lucide-react";

export type ProfileLink = {
  label: string;
  page: string;
  icon: ComponentType<{ size?: number }>;
};

export function ProfileMenu({ name, detail, logo, links, onNavigate, onLogout }: {
  name: string;
  detail: string;
  logo?: string | null;
  links: ProfileLink[];
  onNavigate: (page: string) => void;
  onLogout: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current) menu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const avatar = logo ? <img src={logo} alt="" /> : <UserRound size={20} />;
  return <details ref={menu} className="account-menu">
    <summary aria-label="Open profile and account menu" title="Profile">{avatar}</summary>
    <div className="account-menu-panel">
      <div className="account-menu-identity"><span className="account-menu-avatar">{avatar}</span>
        <span><b>{name}</b><small>{detail}</small></span><ArrowRight size={15} /></div>
      <span className="account-menu-heading">MY ACCOUNT</span>
      {links.map(({label,page,icon:Icon}) => <button key={label} type="button" onClick={() => {
        if (menu.current) menu.current.open = false;
        onNavigate(page);
      }}><Icon size={18}/><span>{label}</span></button>)}
      <button type="button" className="account-menu-logout" onClick={() => {
        if (menu.current) menu.current.open = false;
        onLogout();
      }}><LogOut size={18}/><span>Logout</span></button>
    </div>
  </details>;
}
