import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Cloud,
  Database,
  KeyRound,
  LoaderCircle,
  Plus,
  Radio,
  Repeat,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { OzilPreview } from "../components/OzilPreview";
import type { FrontendTemplate } from "../hooks/useFrontendTemplate";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../i18n/I18nProvider";
import { apiErrorMessage, interpolate } from "../i18n/utils";
import { api, ApiRequestError } from "../lib/api";
import type { Project, PublicConfig } from "../types";
import type { Route } from "../hooks/useRoute";

export function HomePage({
  config,
  onNavigate,
  template,
}: {
  config: PublicConfig | null;
  onNavigate: (route: Route) => void;
  template: FrontendTemplate;
}) {
  const { messages, formatNumber } = useI18n();
  const { user } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [url, setUrl] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const features = [
    {
      icon: KeyRound,
      title: messages.landing.feature1Title,
      body: messages.landing.feature1Body,
    },
    {
      icon: Repeat,
      title: messages.landing.feature2Title,
      body: messages.landing.feature2Body,
    },
    {
      icon: ShieldCheck,
      title: messages.landing.feature3Title,
      body: messages.landing.feature3Body,
    },
    {
      icon: Radio,
      title: messages.landing.feature4Title,
      body: messages.landing.feature4Body,
    },
  ];

  const refresh = useCallback(async () => {
    const payload = await api<{ projects: Project[] }>("/api/projects");
    setProjects(payload.projects);
  }, []);

  useEffect(() => {
    refresh().catch(() => setMessage(messages.errors.load));
  }, [messages.errors.load, refresh]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!user) {
      onNavigate("/signin");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          url,
          turnstileToken: captchaToken || undefined,
        }),
      });
      setUrl("");
      setMessage(messages.form.saved);
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError
          ? apiErrorMessage(error.code, messages)
          : messages.errors.create,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="trend-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span aria-hidden="true" />
            {messages.hero.eyebrow}
          </p>
          <h1 id="hero-title">
            {messages.hero.title.slice(0, -messages.hero.accent.length)}
            <span>{messages.hero.accent}</span>
          </h1>
          <p className="lede">{messages.hero.description}</p>
          <div className="hero-actions">
            <a className="trend-button" href="#create">
              {messages.form.title}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a
              className="trend-text-link"
              href="/pricing"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/pricing");
              }}
            >
              {messages.landing.ctaButton}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="panel create-panel" id="create">
            <div className="create-heading">
              <span className="step-number">01</span>
              <h2>{messages.form.title}</h2>
              <Plus size={16} aria-hidden="true" />
            </div>
            <form onSubmit={createProject}>
              <label htmlFor="project-url">{messages.form.domain}</label>
              <div className="input-row">
                <input
                  id="project-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={messages.form.placeholder}
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  required
                />
                <button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                  {busy ? messages.form.saving : messages.form.save}
                </button>
              </div>
              <TurnstileWidget
                siteKey={config?.turnstileSiteKey || null}
                onToken={setCaptchaToken}
              />
            </form>
            {message && (
              <p className="message" role="status">
                {message}
              </p>
            )}
          </div>
          <div className="status-row">
            <span>
              <Check size={13} aria-hidden="true" />
              {messages.status.api}
            </span>
            <span>
              <Check size={13} aria-hidden="true" />
              {messages.status.database}
            </span>
            <span>
              <Check size={13} aria-hidden="true" />
              {config?.paymentsEnabled && config.paymentProvider
                ? interpolate(messages.status.providerReady, {
                    provider: config.paymentProvider,
                  })
                : messages.status.paymentsOptional}
            </span>
          </div>
        </div>
        {template === "ozil" ? <OzilPreview onNavigate={onNavigate} /> : <div className="product-preview">
          <div className="preview-frames">
            <a
              className="preview-frame preview-foundation"
              href="/account"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/account");
              }}
            >
              <div className="preview-topline">
                <span>01 / {messages.nav.account}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </div>
              <div className="foundation-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="foundation-symbol">
                  <Cloud size={62} strokeWidth={1.3} />
                </div>
                <span className="orbit-node node-key">
                  <KeyRound size={17} />
                </span>
                <span className="orbit-node node-database">
                  <Database size={17} />
                </span>
                <span className="orbit-node node-zap">
                  <Zap size={17} />
                </span>
              </div>
              <div className="preview-content">
                <span className="preview-kicker">React / Hono / D1</span>
                <h2>{messages.landing.feature1Title}</h2>
                <p>{messages.landing.feature1Body}</p>
                <span className="preview-link">
                  {messages.nav.account}
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </div>
            </a>
            <a
              className="preview-frame preview-billing"
              href="/pricing"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/pricing");
              }}
            >
              <div className="preview-topline">
                <span>02 / {messages.nav.pricing}</span>
                <span className="live-dot" aria-hidden="true" />
              </div>
              <div className="billing-art" aria-hidden="true">
                <span className="billing-ring ring-one" />
                <span className="billing-ring ring-two" />
                <span className="billing-ring ring-three" />
                <Repeat size={54} strokeWidth={1.3} />
              </div>
              <div className="preview-content">
                <span className="preview-kicker">Stripe / Polar / Creem</span>
                <h2>{messages.landing.feature2Title}</h2>
                <p>{messages.landing.feature2Body}</p>
                <span className="preview-link">
                  {messages.nav.pricing}
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </div>
            </a>
          </div>
          <div className="preview-caption">
            <span>React 19</span>
            <span>Hono</span>
            <span>Cloudflare Workers</span>
          </div>
        </div>}
      </section>

      {template === "ozil" && <div className="ozil-ribbon" aria-label={messages.hero.eyebrow}>
        {[messages.landing.feature1Title, messages.landing.feature2Title, messages.landing.feature3Title, messages.landing.feature4Title].map((title) => <span key={title}>{title}<span aria-hidden="true">✦</span></span>)}
      </div>}

      <section
        className="features trend-features"
        aria-labelledby="features-title"
      >
        <div className="section-heading">
          <p className="section-label">02 / {messages.hero.eyebrow}</p>
          <h2 id="features-title">{messages.landing.featuresTitle}</h2>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, body }, index) => (
            <article className="feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <div>
                <Icon size={21} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="project-section" aria-labelledby="projects-title">
        <div className="section-heading">
          <p className="section-label">03 / {messages.landing.demoTitle}</p>
          <h2 id="projects-title">{messages.projects.title}</h2>
        </div>
        <div className="panel project-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">{messages.projects.section}</p>
              <h3>{messages.form.domain}</h3>
            </div>
            <span className="project-count">
              {formatNumber(projects.length)}
            </span>
          </div>
          <div className="project-list">
            {projects.length === 0 && (
              <div className="project-empty">
                <Cloud size={30} strokeWidth={1.3} aria-hidden="true" />
                <p className="empty">{messages.projects.empty}</p>
                <a className="trend-text-link" href="#create">
                  {messages.form.title}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            )}
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <img src={project.imageUrl || "/favicon.svg"} alt="" />
                <div>
                  <h3>{project.name}</h3>
                  <p>{project.description || project.url}</p>
                </div>
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={interpolate(messages.projects.open, {
                    name: project.name,
                  })}
                >
                  <ArrowUpRight size={18} />
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-panel trend-cta">
        <p className="section-label">04 / Cloudflare SaaS</p>
        <div>
          <h2>{messages.landing.ctaTitle}</h2>
          <p>{messages.landing.ctaBody}</p>
        </div>
        <a
          className="trend-button"
          href="/pricing"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/pricing");
          }}
        >
          {messages.landing.ctaButton}
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </section>
    </>
  );
}
