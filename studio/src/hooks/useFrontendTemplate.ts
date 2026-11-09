import { useEffect, useState } from "react";

export const FRONTEND_TEMPLATES = ["classic", "ozil"] as const;
export type FrontendTemplate = (typeof FRONTEND_TEMPLATES)[number];

function isTemplate(value: unknown): value is FrontendTemplate {
  return FRONTEND_TEMPLATES.includes(value as FrontendTemplate);
}

function initialTemplate(): FrontendTemplate {
  const requested = new URLSearchParams(window.location.search).get("template");
  if (isTemplate(requested)) return requested;
  const saved = localStorage.getItem("app_template");
  if (isTemplate(saved)) return saved;
  const configured = import.meta.env.VITE_FRONTEND_TEMPLATE;
  return isTemplate(configured) ? configured : "classic";
}

export function useFrontendTemplate() {
  const [template, setTemplate] = useState<FrontendTemplate>(initialTemplate);

  useEffect(() => {
    document.documentElement.dataset.template = template;
    localStorage.setItem("app_template", template);
  }, [template]);

  function changeTemplate(next: FrontendTemplate) {
    const url = new URL(window.location.href);
    url.searchParams.set("template", next);
    window.history.replaceState({}, "", url);
    setTemplate(next);
  }

  return { template, changeTemplate };
}
