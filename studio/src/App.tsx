import { useCallback, useEffect, useState } from "react";
import { AgentLinks } from "./components/AgentLinks";
import { Header } from "./components/Header";
import { NOT_FOUND, useRoute } from "./hooks/useRoute";
import { useSession } from "./hooks/useSession";
import { useTheme } from "./hooks/useTheme";
import { useFrontendTemplate } from "./hooks/useFrontendTemplate";
import { useI18n } from "./i18n/I18nProvider";
import { useDocumentMetadata } from "./i18n/useDocumentMetadata";
import { interpolate } from "./i18n/utils";
import { api } from "./lib/api";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { AuthPage } from "./pages/AuthPage";
import { GenerationPage } from "./pages/GenerationPage";
import { TryOnPage } from "./pages/TryOnPage";
import { LegalPage } from "./pages/LegalPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PricingPage } from "./pages/PricingPage";
import { isLegalRoute, type LegalRoute } from "./routes";
import type { PublicConfig } from "./types";

export default function App() {
  const { template, changeTemplate } = useFrontendTemplate();
  const { theme, toggleTheme } = useTheme(template);
  const { locale, messages } = useI18n();
  const { route, navigate } = useRoute();
  const { user } = useSession();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const appName = config?.appName || "衣装集 试穿";

  useDocumentMetadata(
    interpolate(messages.meta.title, { appName }),
    messages.meta.description,
    locale,
  );

  useEffect(() => {
    api<PublicConfig>("/api/config").then(setConfig).catch(() => setConfig(null));
  }, []);

  const onNavigate = useCallback(navigate, [navigate]);
  const isAdminRoute = route === "/admin";

  return (
    <div className={isAdminRoute ? "app-shell admin-app-shell" : `app-shell marketing-shell template-${template}`}>
      {!isAdminRoute && (
        <Header
          appName={appName}
          theme={theme}
          template={template}
          route={route}
          isAdmin={user?.role === "admin"}
          signInEnabled={Boolean(config?.emailPasswordEnabled || config?.googleSignInEnabled)}
          onNavigate={onNavigate}
          onToggleTheme={toggleTheme}
          onTemplateChange={changeTemplate}
        />
      )}
      {config?.maintenanceMessage && (
        <p className="maintenance" role="status">{config.maintenanceMessage}</p>
      )}
      <main>
        {(route === "/" || route === "/tryon") && <TryOnPage onNavigate={onNavigate} />}
        {route === "/pricing" && <PricingPage config={config} onNavigate={onNavigate} />}
        {route === "/signin" && <AuthPage config={config} />}
        {route === "/account" && <AccountPage config={config} onNavigate={onNavigate} />}
        {route === "/generate" && <GenerationPage onNavigate={onNavigate} />}
        {route === "/admin" && <AdminPage onNavigate={onNavigate} />}
        {isLegalRoute(route) && <LegalPage route={route as LegalRoute} />}
        {route === NOT_FOUND && <NotFoundPage onNavigate={onNavigate} />}
      </main>
      {!isAdminRoute && (
        <footer className="site-footer">
          <div className="footer-intro">
            <a className="footer-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}>{appName}</a>
            <p>{messages.footer}</p>
            <span>React / Hono / Cloudflare D1</span>
          </div>
          <nav aria-label={messages.nav.home}>
            <span className="footer-label">{messages.nav.home}</span>
            <a href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}>{messages.nav.home}</a>
            <a href="/pricing" onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>{messages.nav.pricing}</a>
            <a href="/account" onClick={(event) => { event.preventDefault(); onNavigate("/account"); }}>{messages.nav.account}</a>
          </nav>
          <nav aria-label={messages.nav.terms}>
            <span className="footer-label">{messages.nav.terms}</span>
            <a href="/terms" onClick={(event) => { event.preventDefault(); onNavigate("/terms"); }}>
              {messages.nav.terms}
            </a>
            <a href="/privacy" onClick={(event) => { event.preventDefault(); onNavigate("/privacy"); }}>
              {messages.nav.privacy}
            </a>
            <a href="/refund" onClick={(event) => { event.preventDefault(); onNavigate("/refund"); }}>
              {messages.nav.refund}
            </a>
            <a href="/cookies" onClick={(event) => { event.preventDefault(); onNavigate("/cookies"); }}>
              {messages.nav.cookies}
            </a>
          </nav>
          <AgentLinks appName={appName} />
          <div className="footer-bottom"><span>© {new Date().getFullYear()} {appName}</span><span>Cloudflare Workers</span></div>
        </footer>
      )}
    </div>
  );
}
