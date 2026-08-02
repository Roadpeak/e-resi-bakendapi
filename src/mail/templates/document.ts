/**
 * Invoice and receipt email templates.
 *
 * Written as inlined-style tables rather than modern CSS on purpose: Outlook
 * renders through Word, Gmail strips <style> blocks, and neither supports flex
 * or grid. Every rule here has to survive that, which is why the markup looks
 * older than the rest of the codebase.
 */

const INK = '#202124';
const MUTED = '#5f6368';
const LINE = '#dadce0';
const BLUE = '#1a73e8';
const SURFACE = '#f8f9fa';

export interface DocumentLine {
  description: string;
  quantity?: number;
  unitAmount?: number;
  amount: number;
}

export interface DocumentParams {
  /** "Invoice" or "Receipt" — shown as the document type. */
  heading: string;
  number: string;
  /** Recipient's display name. */
  billedToName: string;
  billedToEmail: string;
  lines: DocumentLine[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  currency: string;
  /** Label/value pairs shown beside the document number (dates, status…). */
  meta: { label: string; value: string }[];
  /**
   * Label for the reference field. Defaults to the heading, which is wrong
   * whenever the heading is not the document type — a reminder still quotes an
   * invoice number, not a "payment reminder number".
   */
  numberLabel?: string;
  /** Optional coloured callout above the table — used for warnings. */
  callout?: { tone: 'info' | 'warn' | 'danger'; text: string };
  /** Intro sentence under the heading. */
  intro: string;
  cta?: { label: string; url: string };
  /** Small print under the table. */
  footnote?: string;
}

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CALLOUT_TONES = {
  info: { bg: '#e8f0fe', fg: '#174ea6' },
  warn: { bg: '#fef7e0', fg: '#b06000' },
  danger: { bg: '#fce8e6', fg: '#c5221f' },
};

/**
 * The e-resi mark, drawn in table cells. Inlined rather than linked because
 * most clients block remote images by default, and a billing document that
 * renders without its logo looks like a phishing attempt.
 */
function logo(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="width:34px;height:34px;background:#4A80F5;border-radius:9px;text-align:center;vertical-align:middle;font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:600;color:#ffffff;line-height:34px;">e</td>
        <td style="padding-left:9px;font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:500;color:${INK};letter-spacing:-0.3px;">e<span style="color:#4A80F5;">-</span>resi</td>
      </tr>
    </table>`;
}

/**
 * Wrap a fragment in a minimal HTML document.
 *
 * The charset declaration is not optional: without it many clients fall back to
 * Latin-1 and every em-dash and × in the document renders as mojibake. Nodemailer
 * labels the MIME part correctly, but Outlook and several webmail clients trust
 * the meta tag over the header.
 */
function wrapDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
${body}
</body>
</html>`;
}

export function renderDocument(p: DocumentParams): string {
  const lineRows = p.lines.map((l) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f1f3f4;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};">
        ${escapeHtml(l.description)}
        ${l.quantity && l.unitAmount !== undefined
          ? `<div style="font-size:12px;color:${MUTED};padding-top:2px;">${l.quantity} × ${money(l.unitAmount, p.currency)}</div>`
          : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f1f3f4;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};text-align:right;white-space:nowrap;">
        ${money(l.amount, p.currency)}
      </td>
    </tr>`).join('');

  const metaRows = p.meta.map((m) => `
    <tr>
      <td style="padding:2px 16px 2px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">${escapeHtml(m.label)}</td>
      <td style="padding:2px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK};text-align:right;white-space:nowrap;">${escapeHtml(m.value)}</td>
    </tr>`).join('');

  const callout = p.callout
    ? `<tr><td style="padding:0 0 24px;">
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
           <tr><td style="background:${CALLOUT_TONES[p.callout.tone].bg};border-radius:12px;padding:14px 16px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${CALLOUT_TONES[p.callout.tone].fg};">
             ${escapeHtml(p.callout.text)}
           </td></tr>
         </table>
       </td></tr>`
    : '';

  const cta = p.cta
    ? `<tr><td style="padding:28px 0 0;">
         <a href="${p.cta.url}" style="display:inline-block;background:${BLUE};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;text-decoration:none;padding:12px 28px;border-radius:24px;">${escapeHtml(p.cta.label)}</a>
       </td></tr>`
    : '';

  const taxRow = p.taxAmount > 0
    ? `<tr>
         <td style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${MUTED};">VAT (${p.taxPercent}%)</td>
         <td style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};text-align:right;">${money(p.taxAmount, p.currency)}</td>
       </tr>`
    : '';

  return wrapDocument(`${p.heading} ${p.number}`, `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;">
        <tr>
          <td style="padding:36px 40px 0;">
            ${logo()}
          </td>
        </tr>

        <tr>
          <td style="padding:28px 40px 0;">
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:400;color:${INK};">${escapeHtml(p.heading)}</div>
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${MUTED};padding-top:8px;">${escapeHtml(p.intro)}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
                  <div style="text-transform:uppercase;letter-spacing:0.6px;font-size:11px;">Billed to</div>
                  <div style="color:${INK};font-size:14px;padding-top:4px;">${escapeHtml(p.billedToName)}</div>
                  <div style="padding-top:2px;">${escapeHtml(p.billedToEmail)}</div>
                </td>
                <td valign="top" align="right">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:2px 16px 2px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">${escapeHtml(p.numberLabel ?? p.heading)} no.</td>
                      <td style="padding:2px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK};text-align:right;white-space:nowrap;font-weight:500;">${escapeHtml(p.number)}</td>
                    </tr>
                    ${metaRows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="padding:28px 40px 0;">
          ${callout ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${callout}</table>` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 0 8px;border-bottom:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED};">Description</td>
              <td style="padding:0 0 8px;border-bottom:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED};text-align:right;">Amount</td>
            </tr>
            ${lineRows}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:12px;">
            <tr>
              <td style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${MUTED};">Subtotal</td>
              <td style="padding:4px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${INK};text-align:right;">${money(p.subtotal, p.currency)}</td>
            </tr>
            ${taxRow}
            <tr>
              <td style="padding:12px 0 0;border-top:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;color:${INK};">Total</td>
              <td style="padding:12px 0 0;border-top:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:500;color:${INK};text-align:right;white-space:nowrap;">${money(p.total, p.currency)}</td>
            </tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0">${cta}</table>
        </td></tr>

        <tr>
          <td style="padding:32px 40px 36px;">
            ${p.footnote
              ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #f1f3f4;padding-top:16px;">${escapeHtml(p.footnote)}</div>`
              : ''}
          </td>
        </tr>
      </table>

      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};padding-top:20px;max-width:600px;">
        e-resi · Immersive real estate · Nairobi, Kenya
      </div>
    </td>
  </tr>
</table>`);
}

/** Company names and descriptions are user-supplied and land in an HTML email. */
function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain-text alternative — some clients show it, and spam filters expect it. */
export function renderDocumentText(p: DocumentParams): string {
  const lines = p.lines.map((l) => `  ${l.description}  ${money(l.amount, p.currency)}`).join('\n');
  const meta = p.meta.map((m) => `  ${m.label}: ${m.value}`).join('\n');
  return [
    `e-resi — ${p.heading} ${p.number}`,
    '',
    p.intro,
    '',
    `Billed to: ${p.billedToName} <${p.billedToEmail}>`,
    meta,
    '',
    lines,
    '',
    `Subtotal: ${money(p.subtotal, p.currency)}`,
    p.taxAmount > 0 ? `VAT (${p.taxPercent}%): ${money(p.taxAmount, p.currency)}` : '',
    `Total: ${money(p.total, p.currency)}`,
    p.callout ? `\n${p.callout.text}` : '',
    p.cta ? `\n${p.cta.label}: ${p.cta.url}` : '',
    p.footnote ? `\n${p.footnote}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * A plain transactional note — no line items, no totals. Same shell as the
 * billing documents so the two read as coming from one system.
 */
export function renderNotice(p: {
  heading: string;
  body: string;
  callout?: { tone: 'info' | 'warn' | 'danger'; text: string };
  cta?: { label: string; url: string };
  footnote?: string;
}): string {
  const callout = p.callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
         <tr><td style="background:${CALLOUT_TONES[p.callout.tone].bg};border-radius:12px;padding:14px 16px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${CALLOUT_TONES[p.callout.tone].fg};">
           ${escapeHtml(p.callout.text)}
         </td></tr>
       </table>`
    : '';

  const cta = p.cta
    ? `<div style="padding-top:28px;">
         <a href="${p.cta.url}" style="display:inline-block;background:${BLUE};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;text-decoration:none;padding:12px 28px;border-radius:24px;">${escapeHtml(p.cta.label)}</a>
       </div>`
    : '';

  return wrapDocument(p.heading, `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;">
        <tr><td style="padding:36px 40px 0;">${logo()}</td></tr>
        <tr><td style="padding:28px 40px 36px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:400;color:${INK};">${escapeHtml(p.heading)}</div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${MUTED};padding-top:10px;">${escapeHtml(p.body)}</div>
          ${callout}
          ${cta}
          ${p.footnote
            ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #f1f3f4;margin-top:28px;padding-top:16px;">${escapeHtml(p.footnote)}</div>`
            : ''}
        </td></tr>
      </table>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};padding-top:20px;max-width:600px;">
        e-resi · Immersive real estate · Nairobi, Kenya
      </div>
    </td>
  </tr>
</table>`);
}
