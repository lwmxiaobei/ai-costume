import { ArrowUpRight, Image, Sparkles, Video } from "lucide-react";
import type { Route } from "../hooks/useRoute";
import { useI18n } from "../i18n/I18nProvider";
import { TEMPLATE_MESSAGES } from "../i18n/templates";

export function OzilPreview({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { locale, messages } = useI18n();
  const copy = TEMPLATE_MESSAGES[locale];

  return (
    <div className="ozil-preview">
      <div className="ozil-preview-heading"><span /><p>{copy.preview}</p><span /></div>
      <a className="ozil-preview-stage" href="/generate" aria-label={messages.generation.title} onClick={(event) => { event.preventDefault(); onNavigate("/generate"); }}>
        <div className="ozil-frame ozil-frame-left">
          <img src="/images/templates/ozil/coast.webp" width="420" height="700" alt="" />
          <span className="ozil-media-type"><Image size={15} aria-hidden="true" /> 01</span>
          <span className="ozil-frame-label">{messages.generation.prompt}</span>
        </div>
        <div className="ozil-frame ozil-frame-right">
          <img src="/images/templates/ozil/dunes.webp" width="420" height="700" alt="" />
          <span className="ozil-media-type"><Video size={15} aria-hidden="true" /> 03</span>
          <span className="ozil-frame-label">{messages.generation.result}</span>
        </div>
        <div className="ozil-frame ozil-frame-center">
          <img src="/images/templates/ozil/mountain.webp" width="420" height="700" alt="" fetchPriority="high" />
          <span className="ozil-frame-badge"><Sparkles size={13} aria-hidden="true" />{messages.generation.title}</span>
          <div className="ozil-frame-bottom"><span>02 / {messages.generation.model}</span><strong>{copy.idea}</strong><span className="ozil-frame-action">{messages.generation.title}<ArrowUpRight size={16} aria-hidden="true" /></span></div>
        </div>
        <div className="ozil-note" aria-hidden="true"><Sparkles size={24} /><span>{copy.idea}</span></div>
      </a>
      <p className="ozil-preview-caption">{copy.caption}<ArrowUpRight size={16} aria-hidden="true" /></p>
    </div>
  );
}
