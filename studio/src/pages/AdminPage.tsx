import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  MailWarning,
  RefreshCw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { api, ApiRequestError, jsonBody } from "../lib/api";
import type { Plan } from "../types";
import type { Route } from "../hooks/useRoute";

const TABS = [
  "overview",
  "users",
  "subscriptions",
  "payments",
  "webhooks",
  "emails",
  "plans",
  "settings",
  "audit",
] as const;

type Tab = (typeof TABS)[number];
type Row = Record<string, unknown>;

interface TabMeta {
  label: string;
  description: string;
  icon: LucideIcon;
}

const TAB_META: Record<Tab, TabMeta> = {
  overview: {
    label: "Overview",
    description: "A live summary of customers, revenue, and operational health.",
    icon: LayoutDashboard,
  },
  users: {
    label: "Users",
    description: "Find accounts, review access, and manage operator roles.",
    icon: Users,
  },
  subscriptions: {
    label: "Subscriptions",
    description: "Monitor active plans, renewal windows, and cancellations.",
    icon: BadgeCheck,
  },
  payments: {
    label: "Payments",
    description: "Review captured revenue, reversals, and payment status.",
    icon: CreditCard,
  },
  webhooks: {
    label: "Webhooks",
    description: "Investigate failed deliveries and replay recoverable events.",
    icon: Webhook,
  },
  emails: {
    label: "Emails",
    description: "Inspect failed transactional messages and retry delivery.",
    icon: MailWarning,
  },
  plans: {
    label: "Plans",
    description: "Review the product catalog, quotas, and active offerings.",
    icon: BadgeDollarSign,
  },
  settings: {
    label: "Settings",
    description: "Maintain operational controls shared across the product.",
    icon: Settings2,
  },
  audit: {
    label: "Audit log",
    description: "Trace sensitive actions back to an operator and target.",
    icon: ScrollText,
  },
};

const NAV_GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Workspace", tabs: ["overview", "users"] },
  { label: "Revenue", tabs: ["subscriptions", "payments", "plans"] },
  { label: "Reliability", tabs: ["webhooks", "emails", "audit"] },
  { label: "Configuration", tabs: ["settings"] },
];

interface Overview {
  users: number;
  activeSubscriptions: number;
  netRevenueCents: number;
  failedWebhooks: number;
  failedEmails: number;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function columnLabel(column: string): string {
  if (column === "id") return "ID";
  return column.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value: string): "positive" | "danger" | "neutral" | "warning" {
  const normalized = value.toLowerCase();
  if (["active", "paid", "sent", "resolved", "admin"].includes(normalized)) return "positive";
  if (["failed", "banned", "refunded", "disputed"].includes(normalized)) return "danger";
  if (["past_due", "pending", "trialing"].includes(normalized)) return "warning";
  return "neutral";
}

function CellValue({ column, row }: { column: string; row: Row }) {
  const value = row[column];
  if (column.endsWith("_cents") && typeof value === "number") {
    const currency = typeof row.currency === "string" ? row.currency.toUpperCase() : "USD";
    return <span className="admin-money">{new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value / 100)}</span>;
  }
  const booleanColumns = ["banned", "email_verified", "cancel_at_period_end", "is_active"];
  if (typeof value === "boolean" || (booleanColumns.includes(column) && (value === 0 || value === 1))) {
    const enabled = value === true || value === 1;
    return <span className="admin-status" data-tone={enabled ? "positive" : "neutral"}>{enabled ? "Yes" : "No"}</span>;
  }
  if (["status", "role", "subscription_status"].includes(column) && typeof value === "string") {
    return <span className="admin-status" data-tone={statusTone(value)}>{value.replaceAll("_", " ")}</span>;
  }
  const display = cell(value);
  return <span className={column === "id" || column.endsWith("_id") ? "admin-identifier" : undefined} title={display}>{display}</span>;
}

function EmptyState({ title = "No records found", detail = "There is nothing to review in this section yet." }) {
  return (
    <div className="admin-empty">
      <Inbox size={22} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function DataTable({
  rows,
  columns,
  actions,
  emptyTitle,
  emptyDetail,
}: {
  rows: Row[];
  columns: string[];
  actions?: (row: Row) => ReactNode;
  emptyTitle?: string;
  emptyDetail?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} detail={emptyDetail} />;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}
            {actions && <th><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={cell(row.id) + String(index)}>
              {columns.map((column) => <td key={column}><CellValue column={column} row={row} /></td>)}
              {actions && <td className="admin-table-actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextTab: Tab, search: string) => {
    setBusy(true);
    setMessage("");
    try {
      if (nextTab === "overview") {
        setOverview(await api<Overview>("/api/admin/overview"));
        return;
      }
      if (nextTab === "plans") {
        setPlans((await api<{ plans: Plan[] }>("/api/admin/plans")).plans);
        return;
      }
      const endpoints: Record<Exclude<Tab, "overview" | "plans">, string> = {
        users: "/api/admin/users?limit=50&query=" + encodeURIComponent(search),
        subscriptions: "/api/admin/subscriptions?limit=50",
        payments: "/api/admin/payments?limit=50",
        webhooks: "/api/admin/webhooks?status=failed&limit=50",
        emails: "/api/admin/emails?status=failed&limit=50",
        settings: "/api/admin/settings",
        audit: "/api/admin/audit-logs?limit=50",
      };
      const payload = await api<Record<string, Row[]>>(endpoints[nextTab as Exclude<Tab, "overview" | "plans">]);
      const key = Object.keys(payload).find((name) => Array.isArray(payload[name]));
      setRows(key ? payload[key] : []);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        onNavigate("/signin");
        return;
      }
      if (error instanceof ApiRequestError && error.status === 403) {
        setMessage("You do not have administrator access.");
        return;
      }
      setMessage(error instanceof ApiRequestError ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [onNavigate]);

  useEffect(() => {
    void load(tab, query);
  }, [load, query, tab]);

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await load(tab, query);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  const current = TAB_META[tab];
  const CurrentIcon = current.icon;
  const failedTasks = (overview?.failedWebhooks || 0) + (overview?.failedEmails || 0);

  return (
    <section className="admin-page" aria-busy={busy}>
      <aside className="admin-sidebar">
        <button type="button" className="admin-back-home" onClick={() => onNavigate("/")}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to home</span>
        </button>

        <div className="admin-sidebar-heading">
          <span className="admin-sidebar-mark"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <strong>Operations</strong>
            <span>Admin workspace</span>
          </div>
        </div>

        <div className="admin-nav-scroll">
          {NAV_GROUPS.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-label">{group.label}</span>
              <nav aria-label={group.label}>
                {group.tabs.map((name) => {
                  const item = TAB_META[name];
                  const Icon = item.icon;
                  return (
                    <button
                      key={name}
                      type="button"
                      className={name === tab ? "active" : ""}
                      aria-current={name === tab ? "page" : undefined}
                      onClick={() => setTab(name)}
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="admin-sidebar-foot">
          <ShieldCheck size={17} aria-hidden="true" />
          <div>
            <strong>Protected workspace</strong>
            <span>Admin access is checked on every request.</span>
          </div>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-toolbar">
          <div className="admin-breadcrumb">
            <span>Operations</span>
            <span aria-hidden="true">/</span>
            <strong>{current.label}</strong>
          </div>
          <button
            type="button"
            className="admin-refresh"
            onClick={() => { void load(tab, query); }}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            <span>Refresh</span>
          </button>
        </header>

        {busy && <span className="admin-progress" aria-hidden="true" />}

        <div className="admin-content">
          <header className="admin-content-heading">
            <div className="admin-heading-icon"><CurrentIcon size={20} aria-hidden="true" /></div>
            <div>
              <p className="section-label">Admin console</p>
              <h2>{current.label}</h2>
              <p>{current.description}</p>
            </div>
          </header>

          {tab === "overview" && overview && (
            <div className="admin-overview">
              <article className="admin-stat admin-stat-revenue">
                <div><span>Net revenue</span><Banknote size={18} aria-hidden="true" /></div>
                <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(overview.netRevenueCents / 100)}</strong>
                <small>Captured payments after reversals</small>
              </article>
              <article className="admin-stat">
                <div><span>Users</span><Users size={18} aria-hidden="true" /></div>
                <strong>{overview.users.toLocaleString()}</strong>
                <small>Active customer accounts</small>
              </article>
              <article className="admin-stat">
                <div><span>Subscriptions</span><BadgeCheck size={18} aria-hidden="true" /></div>
                <strong>{overview.activeSubscriptions.toLocaleString()}</strong>
                <small>Active, trialing, or past due</small>
              </article>
              <article className="admin-stat admin-stat-health" data-attention={failedTasks > 0}>
                <div>
                  <span>Delivery health</span>
                  <strong>{failedTasks === 0 ? "Clear" : failedTasks + " need attention"}</strong>
                </div>
                <dl>
                  <div><dt>Failed webhooks</dt><dd>{overview.failedWebhooks}</dd></div>
                  <div><dt>Failed emails</dt><dd>{overview.failedEmails}</dd></div>
                </dl>
              </article>
            </div>
          )}

          {tab === "overview" && !overview && busy && (
            <div className="admin-surface"><EmptyState title="Loading overview" detail="Collecting the latest operational metrics." /></div>
          )}

          {tab === "users" && (
            <div className="admin-surface">
              <div className="admin-table-toolbar">
                <label className="admin-search" htmlFor="admin-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Search by email, name or ID</span>
                  <input
                    id="admin-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search users"
                  />
                </label>
                <span>{rows.length} records</span>
              </div>
              <DataTable
                rows={rows}
                columns={["email", "name", "role", "banned", "plan_id", "subscription_status"]}
                emptyTitle="No matching users"
                emptyDetail={query ? "Try a different email, name, or account ID." : "New customer accounts will appear here."}
                actions={(row) => (
                  <div className="admin-row-actions">
                    <button
                      type="button"
                      className={row.banned === 1 ? "" : "danger"}
                      onClick={() => {
                        void mutate(() => api(
                          "/api/admin/users/" + String(row.id) + "/ban",
                          jsonBody({ banned: row.banned !== 1, reason: "Reviewed by an operator" }),
                        ));
                      }}
                    >
                      {row.banned === 1 ? "Unban" : "Ban"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void mutate(() => api(
                          "/api/admin/users/" + String(row.id) + "/role",
                          jsonBody({ role: row.role === "admin" ? "user" : "admin" }),
                        ));
                      }}
                    >
                      {row.role === "admin" ? "Make user" : "Make admin"}
                    </button>
                  </div>
                )}
              />
            </div>
          )}

          {tab === "subscriptions" && (
            <div className="admin-surface">
              <DataTable
                rows={rows}
                columns={["user_email", "plan_id", "status", "quantity", "current_period_end", "cancel_at_period_end"]}
                emptyTitle="No subscriptions yet"
                emptyDetail="Active and historical subscription records will appear here."
              />
            </div>
          )}

          {tab === "payments" && (
            <div className="admin-surface">
              <DataTable
                rows={rows}
                columns={["order_id", "user_email", "amount_cents", "reversed_cents", "currency", "status", "payment_provider", "paid_at"]}
                emptyTitle="No payments yet"
                emptyDetail="Completed and reversed payment records will appear here."
              />
            </div>
          )}

          {tab === "webhooks" && (
            <div className="admin-surface">
              <DataTable
                rows={rows}
                columns={["payment_provider", "event_id", "event_type", "attempts", "error_code", "created_at"]}
                emptyTitle="Webhook queue is clear"
                emptyDetail="There are no failed payment events waiting for review."
                actions={(row) => (
                  <button
                    type="button"
                    className="admin-row-primary"
                    onClick={() => {
                      void mutate(() => api("/api/admin/webhooks/" + String(row.id) + "/replay", { method: "POST" }));
                    }}
                  >
                    Replay
                  </button>
                )}
              />
            </div>
          )}

          {tab === "emails" && (
            <div className="admin-surface">
              <div className="admin-table-toolbar admin-table-toolbar-action">
                <span>{rows.length} failed messages</span>
                <button
                  type="button"
                  className="admin-action-button"
                  onClick={() => { void mutate(() => api("/api/admin/emails/retry", { method: "POST" })); }}
                  disabled={busy || rows.length === 0}
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Retry failed emails
                </button>
              </div>
              <DataTable
                rows={rows}
                columns={["to_email", "template", "locale", "status", "attempts", "last_error", "created_at"]}
                emptyTitle="Email queue is clear"
                emptyDetail="There are no failed transactional emails to retry."
              />
            </div>
          )}

          {tab === "plans" && (
            <div className="admin-plan-grid">
              {plans.length === 0 && <div className="admin-surface"><EmptyState title="No plans configured" detail="Seed the plan catalog to manage offers here." /></div>}
              {plans.map((plan) => (
                <article className="admin-plan" key={plan.id}>
                  <div className="admin-plan-heading">
                    <div>
                      <span>{plan.id}</span>
                      <h3>{plan.name}</h3>
                    </div>
                    {plan.isDefault && <span className="admin-status" data-tone="positive">Default</span>}
                  </div>
                  <p>{plan.description || "No description provided."}</p>
                  <div className="admin-plan-meta">
                    <span>{plan.trialDays} day trial</span>
                    <span>{plan.seatBased ? "Seat based" : "Account based"}</span>
                  </div>
                  <div className="admin-plan-section">
                    <strong>Features</strong>
                    <p>{plan.features.join(", ") || "No features configured"}</p>
                  </div>
                  <div className="admin-plan-section">
                    <strong>Quotas</strong>
                    <p>{Object.entries(plan.quotas).map(([key, value]) => key + ": " + value).join(" · ") || "No quotas configured"}</p>
                  </div>
                  <button
                    type="button"
                    className="admin-row-button"
                    onClick={() => {
                      void mutate(() => api(
                        "/api/admin/plans/" + plan.id,
                        { method: "PATCH", body: JSON.stringify({ isActive: false }) },
                      ));
                    }}
                    disabled={plan.isDefault}
                  >
                    {plan.isDefault ? "Required default plan" : "Deactivate plan"}
                  </button>
                </article>
              ))}
            </div>
          )}

          {tab === "settings" && (
            <div className="admin-surface admin-settings">
              {rows.length === 0 && <EmptyState title="No settings configured" detail="Application controls will appear here when they are created." />}
              {rows.map((row) => (
                <div className="setting-row" key={String(row.key)}>
                  <div>
                    <label htmlFor={"setting-" + String(row.key)}>{columnLabel(String(row.key))}</label>
                    <span>{cell(row.key)}</span>
                  </div>
                  <input
                    id={"setting-" + String(row.key)}
                    defaultValue={cell(row.value)}
                    onBlur={(event) => {
                      const value = event.target.value;
                      if (value === cell(row.value)) return;
                      void mutate(() => api(
                        "/api/admin/settings/" + String(row.key),
                        { method: "PUT", body: JSON.stringify({ value }) },
                      ));
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {tab === "audit" && (
            <div className="admin-surface">
              <DataTable
                rows={rows}
                columns={["created_at", "actor_email", "actor_role", "action", "target_type", "target_id", "ip_address"]}
                emptyTitle="No audit activity"
                emptyDetail="Sensitive operator actions will be recorded here."
              />
            </div>
          )}

          {message && <p className="admin-message" role="status">{message}</p>}
        </div>
      </div>
    </section>
  );
}
