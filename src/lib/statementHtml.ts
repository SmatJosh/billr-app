import { esc, multiline, PDF_CSS } from './invoiceHtml.ts';
import { formatMoney } from './format.ts';
import { formatDay } from './dates.ts';
import type { Statement } from './statement.ts';
import type { Business, Client } from './types.ts';

export type StatementHtmlInput = { business: Business; client: Client; statement: Statement; now: string };

export function renderStatementHtml({ business, client, statement: s, now }: StatementHtmlInput): string {
  const money = (k: number) => formatMoney(k, s.currency, { decimals: true });
  const rows = s.entries
    .map(
      (e) => `<tr>
        <td>${formatDay(e.day)}</td>
        <td><span class="mono">${esc(e.number)}</span> · ${esc(e.label)}</td>
        <td class="num">${e.kind === 'invoice' ? money(e.kobo) : ''}</td>
        <td class="num">${e.kind === 'payment' ? money(e.kobo) : ''}</td>
        <td class="num">${money(e.balanceKobo)}</td>
      </tr>`,
    )
    .join('');
  const opening = s.from && s.openingKobo
    ? `<tr><td>${formatDay(s.from)}</td><td class="muted">Balance brought forward</td><td></td><td></td><td class="num">${money(s.openingKobo)}</td></tr>`
    : '';
  const hasBank = s.closingKobo > 0 && (business.paymentBankName || business.paymentAccountNumber || business.paymentAccountName);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${PDF_CSS}</style></head>
<body>
  <div class="top">
    <div>
      <div class="biz">${esc(business.name) || 'Your business'}</div>
      ${business.address ? `<div class="muted">${multiline(business.address)}</div>` : ''}
      ${business.phone ? `<div class="muted mono">${esc(business.phone)}</div>` : ''}
      ${business.email ? `<div class="muted">${esc(business.email)}</div>` : ''}
    </div>
    <div>
      <div class="title">Statement</div>
      <div style="text-align:right">${s.from ? `${formatDay(s.from)} to ${formatDay(now)}` : `To ${formatDay(now)}`}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="k">For</div>
      <div><b>${esc(client.name) || '—'}</b></div>
      ${client.phone ? `<div class="mono">${esc(client.phone)}</div>` : ''}
      ${client.email ? `<div>${esc(client.email)}</div>` : ''}
      ${client.address ? `<div>${multiline(client.address)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr><th>Date</th><th>Details</th><th class="num">Billed</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
    <tbody>${opening}${rows || '<tr><td colspan="5" class="muted">Nothing in this period</td></tr>'}</tbody>
  </table>

  <div class="totals">
    ${opening ? `<div><span>Brought forward</span><span class="mono">${money(s.openingKobo)}</span></div>` : ''}
    <div><span>Billed</span><span class="mono">${money(s.invoicedKobo)}</span></div>
    <div><span>Paid</span><span class="mono">-${money(s.paidKobo)}</span></div>
    <div class="grand"><span>Balance due</span><span class="mono">${money(s.closingKobo)}</span></div>
  </div>

  ${
    hasBank
      ? `<div class="box"><div class="k">Pay by bank transfer</div>
      <div>${esc(business.paymentBankName)}</div>
      <div class="mono" style="font-size:13pt">${esc(business.paymentAccountNumber)}</div>
      <div>${esc(business.paymentAccountName)}</div></div>`
      : ''
  }

  <div class="foot">Made with Billr</div>
</body></html>`;
}
