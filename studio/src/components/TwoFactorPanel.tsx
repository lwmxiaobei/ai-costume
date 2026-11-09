import { useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import {
  confirmTwoFactor,
  disableTwoFactor,
  enableTwoFactor,
  type TwoFactorSetup,
} from "../lib/auth-client";

export function TwoFactorPanel({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const { messages } = useI18n();
  const copy = messages.account.twoFactor;
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setNotice("");
    const result = await action().catch(() => ({ ok: false, message: undefined }));
    if (!result.ok) setNotice(result.message || messages.errors.create);
    setBusy(false);
    return result.ok;
  }

  if (setup) {
    return (
      <div className="panel">
        <h3>{copy.title}</h3>
        <p className="hint">{copy.setupHint}</p>

        <label htmlFor="totp-secret">{copy.secret}</label>
        <input id="totp-secret" value={setup.secret} readOnly onFocus={(event) => event.target.select()} />
        <p className="hint">
          <a href={setup.totpUri}>{setup.totpUri.slice(0, 48)}…</a>
        </p>

        <h4>{copy.backupTitle}</h4>
        <p className="hint">{copy.backupHint}</p>
        <ul className="backup-codes">
          {setup.backupCodes.map((backupCode) => <li key={backupCode}>{backupCode}</li>)}
        </ul>

        <label htmlFor="totp-code">{copy.code}</label>
        <input
          id="totp-code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        <div className="button-row">
          <button
            type="button"
            className="auth-primary"
            disabled={busy || code.length !== 6}
            onClick={() => {
              void (async () => {
                if (!await run(() => confirmTwoFactor(code))) return;
                setSetup(null);
                setPassword("");
                setCode("");
                await onChanged();
              })();
            }}
          >
            {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
            {copy.confirm}
          </button>
          <button
            type="button"
            className="auth-secondary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                await run(() => disableTwoFactor(password));
                setSetup(null);
                setCode("");
                await onChanged();
              })();
            }}
          >
            {copy.cancel}
          </button>
        </div>
        {notice && <p className="message" role="status">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <h3>{copy.title}</h3>
        <span className={enabled ? "badge" : "badge badge-muted"}>
          {enabled ? copy.on : copy.off}
        </span>
      </div>

      <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="totp-password">{copy.password}</label>
      <input
        id="totp-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
      />
      <button
        type="submit"
        className={enabled ? "auth-secondary" : "auth-primary"}
        disabled={busy || password.length === 0}
        onClick={() => {
          void (async () => {
            if (enabled) {
              if (await run(() => disableTwoFactor(password))) {
                setPassword("");
                await onChanged();
              }
              return;
            }
            setBusy(true);
            setNotice("");
            const result = await enableTwoFactor(password).catch(() => ({ ok: false } as const));
            setBusy(false);
            if (!result.ok || !("setup" in result) || !result.setup) {
              setNotice(("message" in result && result.message) || messages.errors.create);
              return;
            }
            setSetup(result.setup);
          })();
        }}
      >
        {busy
          ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
          : <ShieldCheck size={16} aria-hidden="true" />}
        {enabled ? copy.disable : copy.enable}
      </button>
      </form>
      {notice && <p className="message" role="status">{notice}</p>}
    </div>
  );
}
