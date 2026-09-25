import { useState } from "react";
import { api } from "./api";
import { PasswordInput } from "./password-input";

export function AccountPassword() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <section className="panel padded"><h2>Change password</h2><p>Enter your current password to update this account. Other sessions will be signed out.</p>
    <form className="form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);if(f.get("password")!==f.get("confirm")){setMessage("Passwords do not match.");return}setBusy(true);try{await api("/api/auth/password",{currentPassword:f.get("current"),password:f.get("password")});form.reset();setMessage("Password changed. Other sessions have been signed out.")}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}}>
      <label>Current password<PasswordInput name="current" autoComplete="current-password" required /></label>
      <label>New password<PasswordInput name="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <label>Confirm new password<PasswordInput name="confirm" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <button className="btn primary" disabled={busy}>Save password</button>
    </form><p role="status">{message}</p>
  </section>;
}
