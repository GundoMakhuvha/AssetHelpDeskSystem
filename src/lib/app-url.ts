import { ORG } from "@/lib/org-config";

/** The public address of the live site (VITE_APP_URL). All email links point here. */
export const PUBLIC_APP_URL = ORG.appUrl;

export function appLink(path: string) {
  const base = PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
