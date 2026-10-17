// The sums behind Home, Quotes and Reports. Pure functions over documents, so they are tested without a phone.
import { parseDay, toDay, today } from './dates.ts';
import type { Currency } from './format.ts';
import { DOC_LABEL, type BillrDocument } from './types.ts';

export type ReportDoc = Pick<
  BillrDocument,
  'type' | 'number' | 'status' | 'totalKobo' | 'currency' | 'issueDate' | 'dueDate' | 'sentAt' | 'updatedAt'
> & { clientName: string | null; payments?: { amountKobo: number; paidOn: string }[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// SQLite's datetime('now') is UTC, "YYYY-MM-DD HH:MM:SS". Returns the calendar day on this phone.
export function localDay(stamp: string): string {
  const iso = stamp.includes('T') ? stamp : stamp.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? stamp.slice(0, 10) : toDay(d);
}

// Invoices marked paid before Billr recorded payments have none, so they count as paid in full on the day
// they were last changed: the day they were marked paid, unless edited after.
export function paidDay(d: Pick<ReportDoc, 'updatedAt'>): string {
  return localDay(d.updatedAt);
}

// The money received on an invoice, each with the day it came in.
export function paymentsOf(d: ReportDoc): { kobo: number; day: string }[] {
  if (d.type !== 'invoice') return [];
  if (d.payments?.length) return d.payments.map((p) => ({ kobo: p.amountKobo, day: p.paidOn }));
  return d.status === 'paid' ? [{ kobo: d.totalKobo, day: paidDay(d) }] : [];
}

export function paidSoFar(d: ReportDoc): number {
  return paymentsOf(d).reduce((s, p) => s + p.kobo, 0);
}

// The day an invoice was paid off: its last payment.
function settledDay(d: ReportDoc): string | null {
  const days = paymentsOf(d).map((p) => p.day).sort();
  return d.status === 'paid' && days.length ? days[days.length - 1] : null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

export type Period = 'month' | 'year';
export type Bar = { label: string; kobo: number; current: boolean };
export type MoneyIn = {
  totalKobo: number;
  previousKobo: number;
  previousLabel: string;
  bars: Bar[];
  topClients: { name: string; kobo: number }[];
  avgDaysToPay: number | null;
};

const received = (docs: ReportDoc[], currency: Currency) =>
  docs.filter((d) => d.currency === currency).flatMap((d) => paymentsOf(d).map((p) => ({ d, ...p })));

// Money in this month (by week) or this year (by month), with the previous month or year for comparison.
export function moneyIn(docs: ReportDoc[], currency: Currency, period: Period, now: string = today()): MoneyIn {
  const [y, m] = now.split('-').map(Number);
  const paid = received(docs, currency);
  const ym = (day: string) => day.slice(0, 7);
  const thisMonth = now.slice(0, 7);
  const prevMonthDate = new Date(y, m - 2, 1);
  const prevMonth = toDay(prevMonthDate).slice(0, 7);

  const inPeriod = paid.filter(({ day }) => (period === 'month' ? ym(day) === thisMonth : day.startsWith(`${y}-`)));
  const previous = paid.filter(({ day }) => (period === 'month' ? ym(day) === prevMonth : day.startsWith(`${y - 1}-`)));

  let bars: Bar[];
  if (period === 'month') {
    const lastDay = new Date(y, m, 0).getDate();
    const short = MONTHS[m - 1].slice(0, 3);
    const starts = [1, 8, 15, 22, 29].filter((s) => s <= lastDay);
    const dayOfMonth = Number(now.slice(8, 10));
    bars = starts.map((start, i) => {
      const end = starts[i + 1] ? starts[i + 1] - 1 : lastDay;
      const kobo = inPeriod.filter(({ day }) => {
        const n = Number(day.slice(8, 10));
        return n >= start && n <= end;
      }).reduce((s, p) => s + p.kobo, 0);
      return { label: `${start} ${short}`, kobo, current: dayOfMonth >= start && dayOfMonth <= end };
    });
  } else {
    bars = MONTHS.map((name, i) => ({
      label: name[0],
      kobo: inPeriod.filter(({ day }) => Number(day.slice(5, 7)) === i + 1).reduce((s, p) => s + p.kobo, 0),
      current: i + 1 === m,
    }));
  }

  const byClient = new Map<string, number>();
  for (const { d, kobo } of inPeriod) {
    const name = d.clientName?.trim() || 'No client';
    byClient.set(name, (byClient.get(name) ?? 0) + kobo);
  }
  const topClients = [...byClient.entries()]
    .map(([name, kobo]) => ({ name, kobo }))
    .sort((a, b) => b.kobo - a.kobo || a.name.localeCompare(b.name))
    .slice(0, 3);

  // Days from sending to the last payment, for invoices paid off in this period.
  const inThis = (day: string) => (period === 'month' ? ym(day) === thisMonth : day.startsWith(`${y}-`));
  const waits = docs
    .filter((d) => d.type === 'invoice' && d.currency === currency && d.sentAt)
    .map((d) => ({ d, end: settledDay(d) }))
    .filter((x): x is { d: ReportDoc; end: string } => !!x.end && inThis(x.end))
    .map(({ d, end }) => Math.max(0, daysBetween(localDay(d.sentAt!), end)));

  return {
    totalKobo: inPeriod.reduce((s, p) => s + p.kobo, 0),
    previousKobo: previous.reduce((s, p) => s + p.kobo, 0),
    previousLabel: period === 'month' ? MONTHS[prevMonthDate.getMonth()] : String(y - 1),
    bars,
    topClients,
    avgDaysToPay: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : null,
  };
}

export function periodLabel(period: Period, now: string = today()): string {
  return period === 'month' ? MONTHS[Number(now.slice(5, 7)) - 1] : now.slice(0, 4);
}

// What sent invoices still owe after any deposits, split into not yet due and overdue.
export function outstanding(docs: ReportDoc[], currency: Currency, now: string = today()) {
  const unpaid = docs.filter((d) => d.type === 'invoice' && d.status === 'sent' && d.currency === currency && balanceOf(d) > 0);
  const overdue = unpaid.filter((d) => d.dueDate < now);
  const pending = unpaid.filter((d) => d.dueDate >= now);
  const sum = (list: ReportDoc[]) => list.reduce((s, d) => s + balanceOf(d), 0);
  return { pendingKobo: sum(pending), pendingCount: pending.length, overdueKobo: sum(overdue), overdueCount: overdue.length };
}

export function balanceOf(d: ReportDoc): number {
  return Math.max(0, d.totalKobo - paidSoFar(d));
}

export function paidThisMonth(docs: ReportDoc[], currency: Currency, now: string = today()): number {
  const month = now.slice(0, 7);
  return received(docs, currency).filter((p) => p.day.startsWith(month)).reduce((s, p) => s + p.kobo, 0);
}

// Awaiting: quotes and proformas sent and not yet answered.
// Won: quotes accepted or converted this month. Proformas are left out of "won" because one made from a
// quote would count the same job twice.
export function quoteSummary(docs: ReportDoc[], currency: Currency, now: string = today()) {
  const month = now.slice(0, 7);
  const mine = docs.filter((d) => d.currency === currency);
  const awaitingKobo = mine.filter((d) => d.type !== 'invoice' && d.status === 'sent').reduce((s, d) => s + d.totalKobo, 0);
  const wonKobo = mine
    .filter((d) => d.type === 'quote' && (d.status === 'accepted' || d.status === 'converted') && localDay(d.updatedAt).startsWith(month))
    .reduce((s, d) => s + d.totalKobo, 0);
  return { awaitingKobo, wonKobo };
}

// Currencies that appear on invoices, the business's own first, for the Reports currency switch.
export function currenciesUsed(docs: ReportDoc[], preferred: Currency): Currency[] {
  const found = new Set<Currency>(docs.filter((d) => d.type === 'invoice').map((d) => d.currency));
  found.delete(preferred);
  return [preferred, ...[...found].sort()];
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function amount(kobo: number): string {
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(kobo);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const STATUS_WORD: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', accepted: 'Accepted', declined: 'Declined', converted: 'Converted',
};

// A spreadsheet of every invoice, quote and proforma, for an accountant. Amounts are plain numbers so they add up in Excel.
export function toCsv(docs: ReportDoc[]): string {
  const header = ['Number', 'Type', 'Client', 'Issue date', 'Due or valid until', 'Status', 'Paid on', 'Currency', 'Total', 'Paid so far'];
  const rows = [...docs]
    .sort((a, b) => (a.issueDate === b.issueDate ? a.number.localeCompare(b.number) : a.issueDate.localeCompare(b.issueDate)))
    .map((d) => [
      d.number,
      DOC_LABEL[d.type],
      d.clientName ?? '',
      d.issueDate,
      d.dueDate,
      STATUS_WORD[d.status] ?? d.status,
      settledDay(d) ?? '',
      d.currency,
      amount(d.totalKobo),
      d.type === 'invoice' ? amount(paidSoFar(d)) : '',
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
