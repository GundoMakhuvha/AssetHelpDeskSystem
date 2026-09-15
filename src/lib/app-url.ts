/** The public address of the live site. All email links point here. */
export const PUBLIC_APP_URL = "https://asset-help-desk-system.vercel.app";

export function appLink(path: string) {
  const base = PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
