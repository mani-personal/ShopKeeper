import { useEffect, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { api } from "./api";
import { PasswordInput } from "./password-input";

export function Employees({
  vendorId,
  onMessage,
}: {
  vendorId?: string;
  onMessage?: (value: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint =
    "/api/employees" +
    (vendorId ? "?vendor=" + encodeURIComponent(vendorId) : "");
  async function load() {
    try {
      setRows((await api(endpoint)).employees);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [endpoint]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const result = await api("/api/employees", {
        vendorId,
        name: f.get("name"),
        email: f.get("email"),
        password: f.get("password"),
      });
      setRows(result.employees);
      form.reset();
      onMessage?.("Employee account added.");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="employee-layout">
      <section className="panel padded">
        <div className="panel-heading">
          <div>
            <h2>Add employee</h2>
            <p>Create a separate login so business activity stays traceable.</p>
          </div>
          <Users />
        </div>
        <form className="form" onSubmit={submit}>
          <label>
            Employee name
            <input name="name" maxLength={100} required />
          </label>
          <label>
            Login email
            <input name="email" type="email" required />
          </label>
          <label>
            Temporary password
            <PasswordInput
              name="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <small>
            Use at least 12 characters. Share it privately and ask the employee
            to change it after sign-in.
          </small>
          <button className="btn primary" disabled={busy}>
            {busy ? "Adding…" : "Add employee"}
          </button>
        </form>
        {error && <p className="notice error">{error}</p>}
      </section>
      <section className="panel padded">
        <div className="panel-heading">
          <div>
            <h2>Employee accounts</h2>
            <p>
              Removing access signs the employee out but keeps business records.
            </p>
          </div>
          <span className="badge green">{rows.length} employees</span>
        </div>
        <div className="employee-list">
          {rows.map((row) => (
            <article className="record-row" key={row.id}>
              <div>
                <b>{row.name}</b>
                <small>{row.email}</small>
              </div>
              <button
                className="text-button danger"
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Remove access for " + row.name + "?")) return;
                  setBusy(true);
                  try {
                    const result = await api(
                      "/api/employees/" + row.id + "/remove",
                      { vendorId },
                    );
                    setRows(result.employees);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={15} />
                Remove
              </button>
            </article>
          ))}
          {!rows.length && (
            <p className="empty-inline">No employee accounts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
