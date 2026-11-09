import { useEffect, useState } from "react";
import type { FrontendTemplate } from "./useFrontendTemplate";

export type Theme = "light" | "dark";

function themeStorageKey(template: FrontendTemplate): string {
  return template === "classic" ? "app_theme" : "app_theme_ozil";
}

function initialTheme(template: FrontendTemplate): Theme {
  const saved = localStorage.getItem(themeStorageKey(template));
  if (saved === "light" || saved === "dark") return saved;
  return template === "ozil" ? "light" : "dark";
}

export function useTheme(template: FrontendTemplate) {
  const [themes, setThemes] = useState(() => ({ classic: initialTheme("classic"), ozil: initialTheme("ozil") }));
  const theme = themes[template];
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const color = template === "ozil"
      ? theme === "dark" ? "#14151b" : "#f7f6f0"
      : theme === "dark" ? "#0a0506" : "#f8f4f0";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    localStorage.setItem(themeStorageKey(template), theme);
  }, [theme, template]);
  return {
    theme,
    toggleTheme: () => setThemes((current) => ({ ...current, [template]: current[template] === "light" ? "dark" : "light" })),
  };
}
