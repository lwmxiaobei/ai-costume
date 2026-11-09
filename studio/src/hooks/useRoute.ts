import { useCallback, useEffect, useState } from "react";
import { APP_ROUTES, normalizePath, type Route } from "../routes";

export const NOT_FOUND = "/404" as const;
export type ResolvedRoute = Route | typeof NOT_FOUND;

export function resolveRoute(pathname: string): ResolvedRoute {
  const normalized = normalizePath(pathname);
  return APP_ROUTES.includes(normalized as Route) ? normalized as Route : NOT_FOUND;
}

export function useRoute() {
  const [route, setRoute] = useState<ResolvedRoute>(() => resolveRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(resolveRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: Route) => {
    if (window.location.pathname !== next) window.history.pushState({}, "", next);
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  return { route, navigate };
}

export type { Route };
