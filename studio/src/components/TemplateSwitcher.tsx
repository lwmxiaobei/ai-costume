import { ChevronDown, PanelsTopLeft } from "lucide-react";
import { FRONTEND_TEMPLATES, type FrontendTemplate } from "../hooks/useFrontendTemplate";
import { useI18n } from "../i18n/I18nProvider";
import { TEMPLATE_MESSAGES } from "../i18n/templates";

export function TemplateSwitcher({ template, onChange }: {
  template: FrontendTemplate;
  onChange: (template: FrontendTemplate) => void;
}) {
  const { locale } = useI18n();
  const copy = TEMPLATE_MESSAGES[locale];

  return (
    <label className="template-switcher" title={copy.label}>
      <PanelsTopLeft size={16} aria-hidden="true" />
      <span className="template-current" aria-hidden="true">{copy[template]}</span>
      <select aria-label={copy.label} value={template} onChange={(event) => onChange(event.target.value as FrontendTemplate)}>
        {FRONTEND_TEMPLATES.map((item) => <option key={item} value={item}>{copy[item]}</option>)}
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  );
}
