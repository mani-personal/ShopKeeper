import { useEffect, useState } from "react";
import { Trash2, Users } from "lucide-react";
import { api } from "./api";
import { PasswordInput } from "./password-input";

const accessOptions = [
  ["dashboard", "Dashboard"],
  ["sales", "Sales / point of sale"],
  ["inventory", "Inventory"],
  ["purchases", "Purchases / supply orders"],
  ["customers", "Customers"],
  ["returns", "Returns / refunds"],
  ["payments", "Payments"],
  ["reports", "Reports"],
  ["settings", "Business settings"],
  ["employees", "Employee management"],
] as const;

export function Employees({
  vendorId,
  onMessage,
}: {
  vendorId?: string;
  onMessage?: (value: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [accountType, setAccountType] = useState<"vendor" | "wholesale">("vendor"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint =
    "/api/employees" +
    (vendorId ? "?vendor=" + encodeURIComponent(vendorId) : "");
  async function load() {
    try {
      const result = await api(endpoint);
      setRows(result.employees);
      setAccountType(result.accountType || "vendor");
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
        permissions: f.getAll("permissions"),
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
          <fieldset className="permission-picker">
            <legend>Allowed access</legend>
            {accessOptions
              .filter(([value]) => accountType !== "wholesale" || value !== "sales")
              .map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  name="permissions"
                  value={value}
                  defaultChecked={["dashboard", "sales", "inventory"].includes(value)}
                />
                <span>{label}</span>
              </label>
              ))}
          </fieldset>
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
                <small>
                  {(row.permissions || [])
                    .map((value: string) =>
                      accessOptions.find(([key]) => key === value)?.[1],
                    )
                    .filter(Boolean)
                    .join(" · ") || "No access"}
                </small>
              </div>
              <div className="actions">
                <EmployeeAccessEditor
                  row={row}
                  vendorId={vendorId}
                  disabled={busy}
                  saved={(employees) => {
                    setRows(employees);
                    onMessage?.("Employee access updated. They must sign in again.");
                  }}
                  failed={setError}
                  accountType={accountType}
                />
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
              </div>
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

function EmployeeAccessEditor({
  row,
  vendorId,
  disabled,
  saved,
  failed,
  accountType,
}: {
  row: any;
  vendorId?: string;
  disabled: boolean;
  saved: (rows: any[]) => void;
  failed: (message: string) => void;
  accountType: "vendor" | "wholesale";
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>(row.permissions || []),
    [saving, setSaving] = useState(false);
  return (
    <details className="employee-access-editor" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="text-button">Edit access</summary>
      <div className="employee-access-popover">
        <b>Access for {row.name}</b>
        {accessOptions
          .filter(([value]) => accountType !== "wholesale" || value !== "sales")
          .map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, value]
                    : selected.filter((item) => item !== value),
                )
              }
            />
            {label}
          </label>
          ))}
        <button
          type="button"
          className="btn primary"
          disabled={disabled || saving || !selected.length}
          onClick={async () => {
            setSaving(true);
            try {
              const result = await api("/api/employees/" + row.id + "/permissions", {
                vendorId,
                permissions: selected,
              });
              saved(result.employees);
              setOpen(false);
            } catch (error) {
              failed((error as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save access"}
        </button>
      </div>
    </details>
  );
}
