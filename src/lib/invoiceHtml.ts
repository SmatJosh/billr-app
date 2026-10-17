import { computeTotals, lineTotalKobo, VAT_RATE_PERCENT } from './money.ts';
import { formatMoney, formatQuantity } from './format.ts';
import { formatDay } from './dates.ts';
import { DOC_LABEL, PAYMENT_METHOD_LABEL, type BillrDocument, type Business, type Client, type DocumentLine, type Payment } from './types.ts';

function esc(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function multiline(text: string): string {
  return esc(text).replace(/\n/g, '<br>');
}

export type InvoiceHtmlInput = {
  doc: BillrDocument;
  lines: DocumentLine[];
  business: Business;
  client: Client | null;
  // Money received so far. An invoice shows it under the total; a receipt is built around it.
  payments?: Payment[];
  receipt?: boolean;
};

// The one HTML template behind the PDF, the print preview, the receipt and (later) the image export,
// so terms, notes and payment details can never appear on one and be missing on another.
export function renderInvoiceHtml({ doc, lines, business, client, payments = [], receipt = false }: InvoiceHtmlInput): string {
  const money = (k: number) => formatMoney(k, doc.currency, { decimals: true });
  const totals = computeTotals({
    lines,
    discountType: doc.discountType,
    discountFlatKobo: doc.discountFlatKobo,
    discountPercent: doc.discountPercent,
    vatEnabled: doc.vatEnabled,
  });

  const rows = lines
    .filter((l) => l.description.trim() !== '' || l.unitPriceKobo !== 0)
    .map(
      (l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${formatQuantity(l.quantity)}</td>
        <td class="num">${money(l.unitPriceKobo)}</td>
        <td class="num">${money(lineTotalKobo(l))}</td>
      </tr>`,
    )
    .join('');

  const paidKobo = payments.reduce((sum, p) => sum + p.amountKobo, 0);
  const balanceKobo = Math.max(0, totals.totalKobo - paidKobo);
  const lastPaid = payments.length ? payments[payments.length - 1].paidOn : null;
  // Bank details are for paying, so a receipt or invoice with nothing left to pay leaves them off.
  const hasPayment = (business.paymentBankName || business.paymentAccountNumber || business.paymentAccountName) && (balanceKobo > 0 || paidKobo === 0);
  const title = receipt ? 'Receipt' : DOC_LABEL[doc.type];
  const paymentRows = payments
    .map(
      (p) => `<tr>
        <td>${formatDay(p.paidOn)}</td>
        <td>${PAYMENT_METHOD_LABEL[p.method] ?? esc(p.method)}${p.note.trim() ? ` · ${esc(p.note)}` : ''}</td>
        <td class="num">${money(p.amountKobo)}</td>
      </tr>`,
    )
    .join('');
  const discountLabel = doc.discountType === 'percent' ? `Discount (${formatQuantity(doc.discountPercent)}%)` : 'Discount';
  const isQuote = doc.type === 'quote';
  const due = doc.termsDays === 0 && !isQuote ? 'On receipt' : formatDay(doc.dueDate);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1C1915; font-size: 11pt; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .biz { font-size: 16pt; font-weight: 700; }
  .muted { color: #6A6356; }
  .title { font-size: 24pt; font-weight: 400; font-family: Georgia, serif; text-align: right; }
  .meta { margin-top: 18px; display: flex; gap: 32px; }
  .k { font-size: 8pt; letter-spacing: .06em; color: #6A6356; font-weight: 700; text-transform: uppercase; }
  .mono { font-family: 'Courier New', monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th { text-align: left; font-size: 8pt; letter-spacing: .06em; color: #6A6356; border-bottom: 1px solid #DCD3BF; padding: 8px 6px; text-transform: uppercase; }
  td { padding: 9px 6px; border-bottom: 1px solid #F1ECE0; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 55%; margin-top: 12px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 6px; }
  .grand { border-top: 2px solid #1C1915; font-size: 14pt; font-weight: 700; margin-top: 4px; padding-top: 8px !important; }
  .box { margin-top: 24px; padding: 12px 14px; border: 1px solid #DCD3BF; border-radius: 8px; }
  .foot { margin-top: 32px; font-size: 8pt; color: #6A6356; text-align: center; }
  .stamp { margin-top: 24px; padding: 14px; border-radius: 8px; text-align: center; font-size: 14pt; font-weight: 700; }
  .stamp.full { background: #E3F3EA; color: #17633D; }
  .stamp.part { background: #FFE6D2; color: #8F3B00; }
</style></head>
<body>
  <div class="top">
    <div>
      <div class="biz">${esc(business.name) || 'Your business'}</div>
      ${business.address ? `<div class="muted">${multiline(business.address)}</div>` : ''}
      ${business.phone ? `<div class="muted mono">${esc(business.phone)}</div>` : ''}
      ${business.email ? `<div class="muted">${esc(business.email)}</div>` : ''}
      ${business.taxId ? `<div class="muted">TIN ${esc(business.taxId)}</div>` : ''}
    </div>
    <div>
      <div class="title">${title}</div>
      <div class="mono" style="text-align:right">${receipt ? `for ${esc(doc.number)}` : esc(doc.number)}</div>
    </div>
  </div>

  <div class="meta">
    <div><div class="k">${receipt ? 'Received from' : 'Bill to'}</div>
      <div><b>${esc(client?.name) || '—'}</b></div>
      ${client?.phone ? `<div class="mono">${esc(client.phone)}</div>` : ''}
      ${client?.email ? `<div>${esc(client.email)}</div>` : ''}
      ${client?.address ? `<div>${multiline(client.address)}</div>` : ''}
    </div>
    ${
      receipt
        ? `<div><div class="k">Paid on</div><div>${lastPaid ? formatDay(lastPaid) : '—'}</div></div>`
        : `<div><div class="k">Issue date</div><div>${formatDay(doc.issueDate)}</div></div>
    <div><div class="k">${isQuote ? 'Valid until' : 'Due date'}</div><div>${due}</div></div>`
    }
  </div>

  ${
    receipt
      ? `<table>
    <thead><tr><th>Payment</th><th>Method</th><th class="num">Amount</th></tr></thead>
    <tbody>${paymentRows || '<tr><td colspan="3" class="muted">No payments yet</td></tr>'}</tbody>
  </table>
  <div class="stamp ${balanceKobo === 0 ? 'full' : 'part'}">${balanceKobo === 0 ? 'Paid in full' : `Balance still due: ${money(balanceKobo)}`}</div>
  <div class="k" style="margin-top:28px">For these items</div>`
      : ''
  }

  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span class="mono">${money(totals.subtotalKobo)}</span></div>
    ${totals.discountKobo ? `<div><span>${discountLabel}</span><span class="mono">-${money(totals.discountKobo)}</span></div>` : ''}
    ${doc.vatEnabled ? `<div><span>VAT (${VAT_RATE_PERCENT}%)</span><span class="mono">${money(totals.vatKobo)}</span></div>` : ''}
    <div class="grand"><span>Total ${doc.currency}</span><span class="mono">${money(totals.totalKobo)}</span></div>
    ${
      paidKobo
        ? `<div><span>Paid so far</span><span class="mono">-${money(paidKobo)}</span></div>
    <div style="font-weight:700"><span>Balance due</span><span class="mono">${money(balanceKobo)}</span></div>`
        : ''
    }
  </div>

  ${
    hasPayment
      ? `<div class="box"><div class="k">Pay by bank transfer</div>
      <div>${esc(business.paymentBankName)}</div>
      <div class="mono" style="font-size:13pt">${esc(business.paymentAccountNumber)}</div>
      <div>${esc(business.paymentAccountName)}</div></div>`
      : ''
  }
  ${doc.notes.trim() ? `<div class="box"><div class="k">Notes and terms</div><div>${multiline(doc.notes)}</div></div>` : ''}

  <div class="foot">Made with Billr</div>
</body></html>`;
}
