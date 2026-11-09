import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { useI18n } from "../i18n/I18nProvider";
import {
  requestPasswordReset,
  resetPassword,
  sendMagicLink,
  signInWithGoogle,
  submitTwoFactorChallenge,
  signInWithPassword,
  signUpWithPassword,
} from "../lib/auth-client";
import type { PublicConfig } from "../types";

type Mode = "signIn" | "signUp" | "reset";

function resetTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export function AuthPage({ config }: { config: PublicConfig | null }) {
  const { messages } = useI18n();
  const [mode, setMode] = useState<Mode>(
    new URLSearchParams(window.location.search).get("mode") === "reset" ? "reset" : "signIn",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const resetToken = resetTokenFromUrl();

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    setBusy(true);
    setNotice("");
    const result = await action().catch(() => ({ ok: false, message: undefined }));
    setNotice(result.ok ? success : result.message || messages.errors.create);
    setBusy(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const token = captchaToken || undefined;
    if (mode === "reset" && resetToken) {
      await run(() => resetPassword(password, resetToken), messages.account.saved);
      return;
    }
    if (mode === "reset") {
      await run(() => requestPasswordReset(email, token), messages.authPage.resetSent);
      return;
    }
    if (mode === "signUp") {
      await run(
        () => signUpWithPassword(name, email, password, token),
        config?.emailEnabled ? messages.authPage.verifySent : messages.account.saved,
      );
      return;
    }
    await run(async () => {
      const result = await signInWithPassword(email, password, token);
      if (!result.ok) return result;
      if (result.twoFactorRequired) {
        setTwoFactorRequired(true);
        return result;
      }
      window.location.assign("/account");
      return result;
    }, twoFactorRequired ? "" : messages.account.saved);
  }

  const title = twoFactorRequired
    ? messages.authPage.twoFactorTitle
    : mode === "signUp" ? messages.authPage.signUpTitle : messages.authPage.signInTitle;
  const showPassword = mode !== "reset" || Boolean(resetToken);

  if (twoFactorRequired) {
    return (
      <section className="auth-page">
        <div className="panel auth-panel">
          <p className="section-label">{messages.nav.account}</p>
          <h2>{title}</h2>
          <p className="hint">{messages.authPage.twoFactorHint}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await submitTwoFactorChallenge(twoFactorCode);
                if (result.ok) window.location.assign("/account");
                return result;
              }, "");
            }}
          >
            <label htmlFor="auth-totp">{messages.account.twoFactor.code}</label>
            <input
              id="auth-totp"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.trim().slice(0, 16))}
              autoComplete="one-time-code"
              autoFocus
              required
            />
            <button className="auth-primary" type="submit" disabled={busy || twoFactorCode.length < 6}>
              {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
              {messages.account.twoFactor.confirm}
            </button>
          </form>
          {notice && <p className="message" role="status">{notice}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <div className="panel auth-panel">
        <p className="section-label">{messages.nav.account}</p>
        <h2>{title}</h2>

        {config?.googleSignInEnabled && (
          <button
            className="auth-secondary"
            type="button"
            onClick={() => { void signInWithGoogle(); }}
          >
            {messages.auth.google}
          </button>
        )}

        <form onSubmit={submit}>
          {mode === "signUp" && (
            <>
              <label htmlFor="auth-name">{messages.authPage.name}</label>
              <input
                id="auth-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </>
          )}

          {!(mode === "reset" && resetToken) && (
            <>
              <label htmlFor="auth-email">{messages.authPage.email}</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </>
          )}

          {showPassword && (
            <>
              <label htmlFor="auth-password">{messages.authPage.password}</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                minLength={12}
                required
              />
              <p className="hint">{messages.authPage.passwordHint}</p>
            </>
          )}

          <TurnstileWidget siteKey={config?.turnstileSiteKey || null} onToken={setCaptchaToken} />

          <button className="auth-primary" type="submit" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
            {mode === "signUp" ? messages.authPage.signUp : messages.authPage.signIn}
          </button>
        </form>

        {config?.magicLinkEnabled && mode !== "reset" && (
          <button
            className="auth-secondary"
            type="button"
            disabled={busy || !email}
            onClick={() => {
              void run(
                () => sendMagicLink(email, captchaToken || undefined),
                messages.authPage.magicLinkSent,
              );
            }}
          >
            {messages.authPage.magicLink}
          </button>
        )}

        {notice && <p className="message" role="status">{notice}</p>}

        <div className="auth-links">
          {mode === "signIn" && (
            <>
              <button type="button" onClick={() => setMode("reset")}>{messages.authPage.forgot}</button>
              <button type="button" onClick={() => setMode("signUp")}>
                {messages.authPage.noAccount} {messages.authPage.signUp}
              </button>
            </>
          )}
          {mode !== "signIn" && (
            <button type="button" onClick={() => setMode("signIn")}>
              {messages.authPage.haveAccount} {messages.authPage.signIn}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
