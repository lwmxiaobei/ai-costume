import { useI18n } from "../i18n/I18nProvider";
import type { Route } from "../routes";

export function NotFoundPage({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { messages } = useI18n();
  return (
    <section className="auth-page">
      <div className="panel auth-panel">
        <p className="section-label">404</p>
        <h2>{messages.notFound.title}</h2>
        <p className="hint">{messages.notFound.body}</p>
        <button type="button" className="auth-primary" onClick={() => onNavigate("/")}>
          {messages.notFound.home}
        </button>
      </div>
    </section>
  );
}
