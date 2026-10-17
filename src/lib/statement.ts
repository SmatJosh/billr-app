// A client's statement: every invoice and payment in date order, with the balance after each one.
// Pure, like reports.ts, so the sums are tested without a phone.
import { formatMoney, type Currency } from './format.ts';
import { formatDay } from './dates.ts';
import { paidDay, type ReportDoc } from './reports.ts';
import { PAYMENT_METHOD_LABEL, type BillrDocument, type Business, type Client, type Payment } from './types.ts';

export type StatementDoc = Omit<ReportDoc, 'payments'> &
  Pick<BillrDocument, 'id'> & { payments?: (Pick<Payment, 'amountKobo' | 'paidOn'> & Partial<Pick<Payment, 'method' | 'note'>>)[] };

export type StatementEntry = {
  day: string;
  kind: 'invoice' | 'payment';
  docId: number;
  number: string;
  label: string;
  kobo: number;
  balanceKobo: number;
};

export type Statement = {
  currency: Currency;
  from: string | null;
  openingKobo: number;
  invoicedKobo: number;
  paidKobo: number;
  closingKobo: number;
  entries: StatementEntry[];
  // Invoices still owed at the end, oldest due first, for the WhatsApp message.
  open: { docId: number; number: string; dueDate: string; leftKobo: number }[];
};

// Drafts were never sent, so the client has not been billed for them.
const billed = (d: StatementDoc) => d.type === 'invoice' && d.status !== 'draft';

function entriesOf(d: StatementDoc): Omit<StatementEntry, 'balanceKobo'>[] {
  const invoice = { day: d.issueDate, kind: 'invoice' as const, docId: d.id, number: d.number, label: 'Invoice', kobo: d.totalKobo };
  const pays = d.payments?.length
    ? d.payments.map((p) => ({
        day: p.paidOn,
        kind: 'payment' as const,
        docId: d.id,
        number: d.number,
        label: [p.method ? PAYMENT_METHOD_LABEL[p.method] : 'Payment', p.note?.trim()].filter(Boolean).join(' · '),
        kobo: p.amountKobo,
      }))
    : d.status === 'paid'
      ? [{ day: paidDay(d), kind: 'payment' as const, docId: d.id, number: d.number, label: 'Marked paid', kobo: d.totalKobo }]
      : [];
  return [invoice, ...pays];
}

// from = null means all time. Entries before `from` are folded into the opening balance.
export function buildStatement(docs: StatementDoc[], currency: Currency, from: string | null): Statement {
  const mine = docs.filter((d) => billed(d) && d.currency === currency);
  const all = mine
    .flatMap(entriesOf)
    // Same day: the invoice comes before the payment against it.
    .sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? a.docId - b.docId : a.kind === 'invoice' ? -1 : 1));

  const signed = (e: Omit<StatementEntry, 'balanceKobo'>) => (e.kind === 'invoice' ? e.kobo : -e.kobo);
  const before = from ? all.filter((e) => e.day < from) : [];
  const openingKobo = before.reduce((s, e) => s + signed(e), 0);
  let balance = openingKobo;
  const entries = all
    .filter((e) => !from || e.day >= from)
    .map((e) => {
      balance += signed(e);
      return { ...e, balanceKobo: balance };
    });

  const open = mine
    .map((d) => {
      const paid = entriesOf(d).filter((e) => e.kind === 'payment').reduce((s, e) => s + e.kobo, 0);
      return { docId: d.id, number: d.number, dueDate: d.dueDate, leftKobo: Math.max(0, d.totalKobo - paid) };
    })
    .filter((o) => o.leftKobo > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    currency,
    from,
    openingKobo,
    invoicedKobo: entries.filter((e) => e.kind === 'invoice').reduce((s, e) => s + e.kobo, 0),
    paidKobo: entries.filter((e) => e.kind === 'payment').reduce((s, e) => s + e.kobo, 0),
    closingKobo: balance,
    entries,
    open,
  };
}

// The currencies this client has been billed in, Naira first.
export function statementCurrencies(docs: StatementDoc[]): Currency[] {
  const seen = new Set(docs.filter(billed).map((d) => d.currency));
  return (['NGN', 'USD'] as Currency[]).filter((c) => seen.has(c));
}

// The statement as a WhatsApp message: totals, then each invoice still owed, then how to pay.
export function statementMessage(business: Business, client: Client, s: Statement): string {
  const money = (k: number) => formatMoney(k, s.currency, { decimals: true });
  const first = client.name.trim().split(' ')[0];
  const parts = [`Hello${first ? ' ' + first : ''},`, `here is your statement from ${business.name}.`, ''];
  if (s.closingKobo <= 0) {
    parts.push(`You have paid everything billed: ${money(s.paidKobo)}. Thank you!`);
    return parts.join('\n');
  }
  parts.push(`Balance due: ${money(s.closingKobo)}`);
  for (const o of s.open) parts.push(`${o.number}: ${money(o.leftKobo)}, due ${formatDay(o.dueDate)}`);
  if (business.paymentAccountNumber) {
    parts.push('', 'Pay by transfer:', business.paymentBankName, business.paymentAccountNumber, business.paymentAccountName);
  }
  parts.push('', 'Thank you.');
  return parts.filter((p) => p !== undefined).join('\n');
}
