export const APP_ROUTES = [
  "/",
  "/pricing",
  "/account",
  "/generate",
  "/tryon",
  "/admin",
  "/signin",
  "/terms",
  "/privacy",
  "/refund",
  "/cookies",
] as const;

export type Route = (typeof APP_ROUTES)[number];

export const LEGAL_ROUTES = ["/terms", "/privacy", "/refund", "/cookies"] as const;
export type LegalRoute = (typeof LEGAL_ROUTES)[number];

export const INDEXABLE_ROUTES: Route[] = ["/", "/pricing", ...LEGAL_ROUTES];

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.includes(normalizePath(pathname) as Route);
}

export function isLegalRoute(pathname: string): pathname is LegalRoute {
  return LEGAL_ROUTES.includes(normalizePath(pathname) as LegalRoute);
}
