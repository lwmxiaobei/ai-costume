import { AlertTriangle } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { LEGAL_DOCUMENTS } from "../content/legal";
import type { LegalRoute } from "../routes";

export function LegalPage({ route }: { route: LegalRoute }) {
  const { messages } = useI18n();
  const document = LEGAL_DOCUMENTS[route];

  return (
    <section className="legal-page">
      <div className="page-heading">
        <p className="section-label">{document.updated}</p>
        <h2>{document.title}</h2>
        <p className="lede">{document.intro}</p>
      </div>

      <p className="legal-notice" role="note">
        <AlertTriangle size={16} aria-hidden="true" />
        {messages.legal.notice}
      </p>

      <div className="panel legal-body">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </div>
    </section>
  );
}
