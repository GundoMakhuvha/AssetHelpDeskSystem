/**
 * Central organisation / branding settings.
 *
 * Every organisation-specific value lives here and is read from environment
 * variables (VITE_ORG_*), so a new deployment (e.g. SITA) can be rebranded
 * without editing code. The defaults below keep the original Tipp Focus
 * deployment working when no variables are set.
 *
 * Safe on both browser and server: VITE_* values are public, never secrets.
 */
import defaultLogo from "@/assets/tipp-focus-logo.png";

function v(name: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[name];
  return (raw ?? "").trim();
}

const name = v("VITE_ORG_NAME") || "Tipp Focus";

export const ORG = {
  /** Full display name, e.g. "SITA". */
  name,
  /** Short uppercase label used in email headers. */
  shortName: v("VITE_ORG_SHORT_NAME") || name.toUpperCase(),
  /** Product name shown in titles and emails. */
  productName: v("VITE_ORG_PRODUCT_NAME") || "Asset Management & Help Desk",
  /** Help desk label used in email subjects and footers. */
  helpdeskName: v("VITE_ORG_HELPDESK_NAME") || `${name} Help Desk`,
  /** Logo URL (absolute or /public path). Falls back to the bundled logo. */
  logoUrl: v("VITE_ORG_LOGO_URL") || defaultLogo,
  /** Public site address — every email link points here. */
  appUrl: v("VITE_APP_URL") || "https://asset-help-desk-system.vercel.app",
  /** Example email domain for form placeholders. */
  emailDomain: v("VITE_ORG_EMAIL_DOMAIN") || "tippfocus.co.za",
  /** Default service desk mailbox for new-ticket alerts (server may override). */
  serviceDeskEmail: v("VITE_ORG_SERVICE_DESK_EMAIL") || "servicedesk@tippfocus.co.za",
  /** Prefix for exported report filenames. */
  filePrefix:
    v("VITE_ORG_FILE_PREFIX") || name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  /** Colour theme: "blue" (Tipp Focus default) or "orange" (SITA). */
  theme: ((v("VITE_ORG_THEME").toLowerCase() ||
    (name.toUpperCase().includes("SITA") ? "orange" : "blue")) === "orange"
    ? "orange"
    : "blue") as "orange" | "blue",
} as const;

/** Email colours matching the theme. */
export const EMAIL_COLORS =
  ORG.theme === "orange"
    ? { header: "#c2410c", sub: "#fed7aa", stripe: "#f97316", button: "#ea580c" }
    : { header: "#0b2f52", sub: "#9dc2e6", stripe: "#1d9e75", button: "#0b2f52" };

export const ORG_TITLE = `${ORG.name} — ${ORG.productName}`;
