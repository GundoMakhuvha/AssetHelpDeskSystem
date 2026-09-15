function secret(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

export function fromAddress() {
  return secret('RESEND_FROM') || 'Tipp Focus Help Desk <helpdesk@capvtal.com>';
}

export async function sendMail(to: string[], subject: string, html: string) {
  const recipients = Array.from(new Set(to.filter(Boolean)));
  if (recipients.length === 0) return;

  const lovableKey = secret('LOVABLE_API_KEY');
  const resendKey = secret('RESEND_API_KEY');
  if (!resendKey) {
    throw new Error(
      'RESEND_API_KEY is missing from this deployment. Add it to the Production environment and redeploy.',
    );
  }

  const body = JSON.stringify({ from: fromAddress(), to: recipients, subject, html });
  const res = lovableKey
    ? await fetch(`${GATEWAY_URL}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': resendKey,
        },
        body,
      })
    : await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body,
      });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email send failed [${res.status}]: ${text}`);
  }
}

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
    return map[c] ?? c;
  });

export function brandLayout(opts: {
  badgeLabel: string;
  badgeBg: string;
  badgeFg: string;
  title: string;
  intro: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const esc = escapeHtml;
  return `
<div style="margin:0;padding:24px 12px;background:#f4f6f9">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <tr>
      <td style="background:#0b2f52;padding:20px 24px">
        <div style="font:700 18px/1.2 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:.04em">TIPP FOCUS</div>
        <div style="font:600 11px/1.4 Arial,Helvetica,sans-serif;color:#9dc2e6;letter-spacing:.14em;margin-top:2px">HELP DESK</div>
      </td>
    </tr>
    <tr><td style="height:3px;background:#1d9e75;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr>
      <td style="padding:24px 24px 8px">
        <span style="display:inline-block;background:${opts.badgeBg};color:${opts.badgeFg};font:700 10px/1 Arial,Helvetica,sans-serif;letter-spacing:.1em;padding:7px 10px;border-radius:999px">${esc(opts.badgeLabel)}</span>
        <h1 style="margin:14px 0 6px;font:700 20px/1.3 Arial,Helvetica,sans-serif;color:#111827">${esc(opts.title)}</h1>
        <p style="margin:0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#4b5563">${esc(opts.intro)}</p>
      </td>
    </tr>
    ${opts.bodyHtml ? `<tr><td style="padding:16px 24px 0">${opts.bodyHtml}</td></tr>` : ''}
    ${
      opts.ctaHref
        ? `<tr><td style="padding:20px 24px 4px">
        <a href="${opts.ctaHref}" style="display:inline-block;background:#0b2f52;color:#ffffff;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;padding:13px 22px;border-radius:8px">${esc(opts.ctaLabel ?? 'Open')}</a>
      </td></tr>`
        : ''
    }
    <tr>
      <td style="padding:20px 24px 24px">
        <p style="margin:0;font:400 11px/1.5 Arial,Helvetica,sans-serif;color:#9aa1aa">Tipp Focus Help Desk &middot; This is an automated message</p>
      </td>
    </tr>
  </table>
</div>`;
}
