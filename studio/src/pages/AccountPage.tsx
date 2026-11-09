import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { TwoFactorPanel } from "../components/TwoFactorPanel";
import { useI18n } from "../i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "../i18n/config";
import { apiErrorMessage, interpolate } from "../i18n/utils";
import { api, ApiRequestError, jsonBody } from "../lib/api";
import { signOut } from "../lib/auth-client";
import type { AccountProfile, BillingState, DeviceSession, PublicConfig } from "../types";
import type { Route } from "../hooks/useRoute";

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function AccountPage({
  config,
  onNavigate,
}: {
  config: PublicConfig | null;
  onNavigate: (route: Route) => void;
}) {
  const { messages, setLocale } = useI18n();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [locale, setProfileLocale] = useState<Locale>("en");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [profilePayload, billingPayload, sessionPayload] = await Promise.all([
      api<{ user: AccountProfile }>("/api/account/profile"),
      api<BillingState>("/api/billing/subscription"),
      api<{ sessions: DeviceSession[] }>("/api/account/sessions"),
    ]);
    setProfile(profilePayload.user);
    setDisplayName(profilePayload.user.name);
    setProfileLocale((profilePayload.user.locale || "en") as Locale);
    setBilling(billingPayload);
    setSessions(sessionPayload.sessions);
  }, []);

  useEffect(() => {
    load().catch((error: unknown) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        onNavigate("/signin");
        return;
      }
      setMessage(messages.errors.load);
    });
  }, [load, messages.errors.load, onNavigate]);

  async function act(key: string, action: () => Promise<void>, success = "") {
    setBusy(key);
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof ApiRequestError
        ? apiErrorMessage(error.code, messages)
        : messages.errors.create);
    } finally {
      setBusy("");
    }
  }

  if (!profile) {
    return (
      <section className="account-page">
        <p className="empty">{messages.auth.loading}</p>
      </section>
    );
  }

  const subscription = billing?.subscription;
  const entitlement = billing?.entitlement;

  return (
    <section className="account-page">
      <div className="page-heading">
        <p className="section-label">{messages.account.section}</p>
        <h2>{messages.account.title}</h2>
      </div>

      <div className="account-grid">
        <div className="panel">
          <h3>{messages.account.profile}</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act("profile", async () => {
                await api("/api/account/profile", {
                  method: "PATCH",
                  body: JSON.stringify({ name: displayName, locale }),
                });
                setLocale(locale);
                await load();
              }, messages.account.saved);
            }}
          >
            <label htmlFor="account-name">{messages.account.displayName}</label>
            <input
              id="account-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
            />
            <label htmlFor="account-locale">{messages.account.language}</label>
            <select
              id="account-locale"
              value={locale}
              onChange={(event) => setProfileLocale(event.target.value as Locale)}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
              ))}
            </select>
            <p className="hint">{profile.email}</p>
            <button className="auth-primary" type="submit" disabled={busy === "profile"}>
              {busy === "profile" && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
              {messages.account.save}
            </button>
          </form>
        </div>

        <div className="panel">
          <h3>{messages.account.subscription}</h3>
          <p className="plan-price">{entitlement?.planName || messages.pricing.free}</p>
          {subscription ? (
            <p className="hint">
              {subscription.cancelAtPeriodEnd
                ? interpolate(messages.account.willCancel, { date: formatDate(subscription.currentPeriodEnd) })
                : interpolate(messages.account.renews, { date: formatDate(subscription.currentPeriodEnd) })}
            </p>
          ) : (
            <p className="hint">{messages.account.noPlan}</p>
          )}

          <div className="button-row">
            <button type="button" className="auth-secondary" onClick={() => onNavigate("/pricing")}>
              {messages.pricing.section}
            </button>
            {config?.subscriptionsEnabled && subscription && (
              <button
                type="button"
                className="auth-secondary"
                disabled={busy === "portal"}
                onClick={() => {
                  void act("portal", async () => {
                    const payload = await api<{ portalUrl: string }>("/api/billing/portal", { method: "POST" });
                    window.location.assign(payload.portalUrl);
                  });
                }}
              >
                {messages.account.manageBilling}
              </button>
            )}
            {subscription && !subscription.cancelAtPeriodEnd && (
              <button
                type="button"
                className="auth-secondary"
                disabled={busy === "cancel"}
                onClick={() => {
                  void act("cancel", async () => {
                    await api("/api/billing/cancel", jsonBody({ atPeriodEnd: true }));
                    await load();
                  });
                }}
              >
                {messages.account.cancel}
              </button>
            )}
            {subscription?.cancelAtPeriodEnd && (
              <button
                type="button"
                className="auth-secondary"
                disabled={busy === "resume"}
                onClick={() => {
                  void act("resume", async () => {
                    await api("/api/billing/resume", { method: "POST" });
                    await load();
                  });
                }}
              >
                {messages.account.resume}
              </button>
            )}
          </div>

          <h4>{messages.account.usage}</h4>
          <ul className="usage-list">
            {Object.entries(entitlement?.quotas || {}).map(([metric, limit]) => (
              <li key={metric}>
                <span>{metric}</span>
                <span>{(billing?.usage.metrics[metric] || 0) + " / " + (limit < 0 ? "∞" : limit)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>{messages.account.sessions}</h3>
            <button
              type="button"
              className="auth-secondary"
              disabled={busy === "revokeOthers"}
              onClick={() => {
                void act("revokeOthers", async () => {
                  await api("/api/account/sessions/revoke-others", { method: "POST" });
                  await load();
                });
              }}
            >
              {messages.account.revokeOthers}
            </button>
          </div>
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <div>
                  <strong>{session.device}</strong>
                  <span>{session.ipAddress || ""} · {formatDate(session.lastActiveAt)}</span>
                </div>
                {session.current ? (
                  <span className="badge">{messages.account.current}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void act("session-" + session.id, async () => {
                        await api("/api/account/sessions/" + session.id, { method: "DELETE" });
                        await load();
                      });
                    }}
                  >
                    {messages.account.revoke}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <TwoFactorPanel enabled={profile.twoFactorEnabled} onChanged={load} />

        <div className="panel danger-panel">
          <h3>{messages.account.danger}</h3>
          <a className="auth-secondary" href="/api/account/export">
            <Download size={16} aria-hidden="true" />
            {messages.account.exportData}
          </a>
          <p className="hint">{messages.account.deleteHint}</p>
          <input
            aria-label={messages.account.deleteAccount}
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={profile.email}
          />
          <button
            type="button"
            className="danger-button"
            disabled={busy === "delete" || confirmEmail.trim().toLowerCase() !== profile.email.toLowerCase()}
            onClick={() => {
              void act("delete", async () => {
                await api("/api/account/delete", jsonBody({ confirm: confirmEmail }));
                await signOut().catch(() => undefined);
                window.location.assign("/");
              });
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            {messages.account.deleteAccount}
          </button>
        </div>
      </div>
      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}
