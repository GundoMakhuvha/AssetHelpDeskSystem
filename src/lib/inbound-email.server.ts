/**
 * Email replies -> ticket comments (Resend inbound).
 *
 * Outgoing ticket emails carry a Reply-To address that identifies the ticket:
 *   ticket-<ticket uuid>@<INBOUND_REPLY_DOMAIN>      (public reply)
 *   ticket-<ticket uuid>-i@<INBOUND_REPLY_DOMAIN>    (reply to an internal note)
 * Resend receives the reply and calls /api/inbound-email, which records it
 * on the ticket. The ticket uuid cannot be guessed, so it doubles as the
 * proof that the sender actually received an email about this ticket.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Domain Resend receives on, e.g. "reply.tippfocus.co.za" or "abc123.resend.app". */
export function inboundDomain(): string {
  return secret('INBOUND_REPLY_DOMAIN').replace(/^@/, '').toLowerCase();
}

/** Reply-To address for a ticket, or undefined when inbound email is not set up. */
export function ticketReplyTo(ticketId: string, opts: { internal?: boolean } = {}): string | undefined {
  const domain = inboundDomain();
  if (!domain || !ticketId) return undefined;
  return `ticket-${ticketId.toLowerCase()}${opts.internal ? '-i' : ''}@${domain}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TOKEN_RE = new RegExp(`ticket-(${UUID})(-i)?@`, 'i');

/** Finds the ticket token in any of the recipient addresses. */
export function ticketFromAddresses(addresses: string[]): { ticketId: string; internal: boolean } | null {
  for (const a of addresses) {
    const m = TOKEN_RE.exec(a ?? '');
    if (m) return { ticketId: m[1]!.toLowerCase(), internal: !!m[2] };
  }
  return null;
}

/** "#00065" in a subject -> 65. Only trusted for senders who have an account. */
export function ticketNumberFromSubject(subject: string): number | null {
  const m = /#0*(\d{1,9})\b/.exec(subject ?? '');
  return m ? Number(m[1]) : null;
}

/** "Matumelo Leseba <matumelol@tippfocus.co.za>" -> "matumelol@tippfocus.co.za" */
export function bareAddress(value: string): string {
  const m = /<([^>]+)>/.exec(value ?? '');
  return (m ? m[1]! : value ?? '').trim().toLowerCase();
}

export function displayName(value: string): string | null {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(value ?? '');
  return m ? m[1]!.trim() : null;
}

/** Very small HTML -> text conversion for emails that have no text part. */
export function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Keeps only the new part of a reply: drops the quoted earlier message that
 * Outlook, Gmail and Apple Mail append underneath.
 */
export function stripQuotedReply(text: string): string {
  const lines = (text ?? '').replace(/\r/g, '').split('\n');
  const cutPatterns = [
    /^\s*-{2,}\s*Original Message\s*-{2,}/i,
    /^\s*_{10,}\s*$/, // Outlook's divider line
    /^\s*From:\s.+/i, // Outlook header block ("From: ... Sent: ...")
    /^\s*On .{5,200}wrote:\s*$/i, // Gmail / Apple Mail
    /^\s*>/, // classic quoting
  ];
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Gmail often wraps "On <date>, <name> <address>\nwrote:" over 2-3 lines.
    if (/^\s*On\s/i.test(line)) {
      const joined = lines.slice(i, i + 3).join(' ');
      if (/^\s*On .{5,300}?wrote:/i.test(joined)) {
        cut = i;
        break;
      }
    }
    if (cutPatterns.some((re) => re.test(line))) {
      // "From:" only counts when it starts Outlook's header block.
      if (/^\s*From:/i.test(line)) {
        const next = lines.slice(i + 1, i + 5).join('\n');
        if (!/^\s*(Sent|Date|To|Subject):/im.test(next)) continue;
      }
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return kept || (text ?? '').trim();
}

/** Verifies a Resend (Svix) webhook signature. */
export function verifyWebhook(payload: string, headers: Headers, signingSecret: string): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!id || !timestamp || !signatures || !signingSecret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const key = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64'),
  );
  return signatures.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Reads a header from Resend's headers field, whether it is an object or a list. */
export function headerValue(headers: unknown, name: string): string | null {
  const wanted = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const n = (h?.name ?? h?.key ?? '').toString().toLowerCase();
      if (n === wanted) return String(h?.value ?? '');
    }
    return null;
  }
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === wanted) return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
    }
  }
  return null;
}

/** Out-of-office and other automatic replies should never become comments. */
export function isAutoReply(headers: unknown, subject: string): boolean {
  const autoSubmitted = (headerValue(headers, 'auto-submitted') ?? '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (headerValue(headers, 'x-autoreply') || headerValue(headers, 'x-autorespond')) return true;
  const precedence = (headerValue(headers, 'precedence') ?? '').toLowerCase();
  if (['bulk', 'junk', 'auto_reply', 'list'].includes(precedence)) return true;
  return /^(automatic reply|auto(-|\s)?reply|out of (the )?office)\b/i.test((subject ?? '').trim());
}

/** Calls the Resend REST API with the server key. */
export async function resendGet<T>(path: string): Promise<T> {
  const key = secret('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not configured.');
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Resend GET ${path} failed [${res.status}]: ${await res.text()}`);
  return (await res.json()) as T;
}

export function webhookSecret(): string {
  return secret('RESEND_WEBHOOK_SECRET');
}
