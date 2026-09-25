import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "./api";

type Activity = {
  id: string;
  title: string;
  detail: string;
  category: string;
  route?: string;
  created_at: number;
  actor_name?: string;
  is_read: boolean;
};
const fallbackRoute: Record<string, string> = {
  order: "Orders",
  payment: "Payments",
  inventory: "Inventory",
  subscription: "Pricing",
  sale: "Dashboard",
  purchase: "Supply hub",
  supplier_return: "Supply hub",
  supplier_payment: "Supply hub",
  return: "Returns",
  employee: "Employees",
  profile: "Settings",
  settings: "Settings",
};
export function Notifications({
  onNavigate,
}: {
  onNavigate?: (page: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [events, setEvents] = useState<Activity[]>([]),
    [unread, setUnread] = useState(0),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  async function load() {
    try {
      const d = await api("/api/activities?limit=50");
      setEvents(d.events);
      setUnread(d.unread);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    const focus = () => void load(),
      click = (e: MouseEvent) => {
        if (root.current && !root.current.contains(e.target as Node))
          setOpen(false);
      };
    window.addEventListener("focus", focus);
    document.addEventListener("mousedown", click);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("mousedown", click);
    };
  }, []);
  async function markAll() {
    await api("/api/activities/read", {});
    setEvents((x) => x.map((e) => ({ ...e, is_read: true })));
    setUnread(0);
  }
  return (
    <div className="notifications" ref={root}>
      <button
        className="icon-button notification-button"
        aria-label="Activity notifications"
        title="Activity notifications"
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        <Bell size={18} />
        {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <section className="notification-panel">
          <header>
            <div>
              <b>Activity</b>
              <small>Latest updates across your workspace</small>
            </div>
            <button
              className="text-button"
              disabled={!unread}
              onClick={() => void markAll()}
            >
              <CheckCheck size={15} /> Mark read
            </button>
          </header>
          {error && <p className="notice error">{error}</p>}
          <div className="notification-list">
            {events.map((e) => {
              const target = e.route || fallbackRoute[e.category] || "";
              return (
                <button
                  type="button"
                  className={
                    "notification-entry " + (e.is_read ? "" : "unread")
                  }
                  key={e.id}
                  onClick={async () => {
                    await api("/api/activities/read", { id: e.id });
                    setEvents((rows) =>
                      rows.map((row) =>
                        row.id === e.id ? { ...row, is_read: true } : row,
                      ),
                    );
                    if (!e.is_read)
                      setUnread((value) => Math.max(0, value - 1));
                    setOpen(false);
                    if (target && onNavigate) onNavigate(target);
                  }}
                >
                  <i />
                  <div>
                    <b>{e.title}</b>
                    {e.detail && <p>{e.detail}</p>}
                    <small>
                      {e.actor_name ? e.actor_name + " · " : ""}
                      {new Date(Number(e.created_at)).toLocaleString("en-IN")}
                    </small>
                  </div>
                  {target && <span aria-hidden="true">›</span>}
                </button>
              );
            })}
            {!events.length && !error && (
              <p className="empty-inline">No activity yet.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
