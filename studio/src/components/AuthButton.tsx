import { LoaderCircle, LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n/I18nProvider";
import { interpolate } from "../i18n/utils";
import { signOut } from "../lib/auth-client";

interface AuthButtonProps {
  enabled: boolean;
  onSignIn: () => void;
}

export function AuthButton({ enabled, onSignIn }: AuthButtonProps) {
  const { messages } = useI18n();
  if (!enabled) {
    return <span className="auth-unavailable">{messages.auth.optional}</span>;
  }
  return <ConfiguredAuthButton onSignIn={onSignIn} />;
}

function ConfiguredAuthButton({ onSignIn }: Omit<AuthButtonProps, "enabled">) {
  const { messages } = useI18n();
  const { user, isPending } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (isPending) {
    return (
      <button className="auth-button" type="button" disabled aria-label={messages.auth.loading}>
        <LoaderCircle className="spin" size={16} aria-hidden="true" />
      </button>
    );
  }

  if (user) {
    const label = failed
      ? messages.auth.failed
      : interpolate(messages.auth.signOutAs, { name: user.name });
    return (
      <button
        className="auth-button auth-user"
        type="button"
        disabled={busy}
        aria-label={label}
        title={label}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await signOut();
            window.location.assign("/");
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : <LogOut size={16} aria-hidden="true" />}
        <span>{user.name}</span>
      </button>
    );
  }

  return (
    <button
      className="auth-button"
      type="button"
      aria-label={failed ? messages.auth.failed : messages.authPage.signIn}
      disabled={busy}
      onClick={() => {
        setFailed(false);
        onSignIn();
      }}
    >
      {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
      <span>{failed ? messages.auth.failed : messages.authPage.signIn}</span>
    </button>
  );
}
