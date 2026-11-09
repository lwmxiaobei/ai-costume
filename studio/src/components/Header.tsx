import { useState } from "react";
import { Cloud, Menu, Moon, Sun, X } from "lucide-react";
import type { Theme } from "../hooks/useTheme";
import type { FrontendTemplate } from "../hooks/useFrontendTemplate";
import type { ResolvedRoute, Route } from "../hooks/useRoute";
import { useI18n } from "../i18n/I18nProvider";
import { interpolate } from "../i18n/utils";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AuthButton } from "./AuthButton";
import { TemplateSwitcher } from "./TemplateSwitcher";

interface HeaderProps {
  appName: string;
  theme: Theme;
  template: FrontendTemplate;
  route: ResolvedRoute;
  isAdmin: boolean;
  signInEnabled: boolean;
  onNavigate: (route: Route) => void;
  onToggleTheme: () => void;
  onTemplateChange: (template: FrontendTemplate) => void;
}

export function Header({
  appName,
  theme,
  template,
  route,
  isAdmin,
  signInEnabled,
  onNavigate,
  onToggleTheme,
  onTemplateChange,
}: HeaderProps) {
  const { messages } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const themeLabel = theme === "light" ? messages.theme.toDark : messages.theme.toLight;
  const links: { route: Route; label: string }[] = [
    { route: "/", label: "虚拟试穿" },
    { route: "/account", label: messages.nav.account },
  ];
  if (isAdmin) links.push({ route: "/admin", label: messages.nav.admin });

  return (
    <header className="site-header" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
      <a
        className="brand"
        href="/"
        aria-label={interpolate(messages.brandHome, { appName })}
        onClick={(event) => {
          event.preventDefault();
          setMenuOpen(false);
          onNavigate("/");
        }}
      >
        <span className="brand-mark"><Cloud size={21} strokeWidth={2.4} aria-hidden="true" /></span>
        <span>{appName}</span>
      </a>
      <nav className={"site-nav" + (menuOpen ? " is-open" : "")} id="site-navigation" aria-label={messages.nav.menu}>
        {links.map((link) => (
          <a
            key={link.route}
            href={link.route}
            className={route === link.route ? "active" : ""}
            aria-current={route === link.route ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setMenuOpen(false);
              onNavigate(link.route);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <TemplateSwitcher template={template} onChange={onTemplateChange} />
        <LanguageSwitcher />
        <AuthButton enabled={signInEnabled} onSignIn={() => onNavigate("/signin")} />
        <button
          className="icon-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
        </button>
        <button
          className="icon-button menu-toggle"
          type="button"
          aria-label={messages.nav.menu}
          aria-controls="site-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
