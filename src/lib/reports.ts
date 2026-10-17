// The sums behind Home, Quotes and Reports. Pure functions over documents, so they are tested without a phone.
import { parseDay, toDay, today } from './dates.ts';
import type { Currency } from './format.ts';
import { DOC_LABEL, type BillrDocument } from './types.ts';

export type ReportDoc = Pick<
  BillrDocument,
  'type' | 'number' | 'status' | 'totalKobo' | 'currency' | 'issueDate' | 'dueDate' | 'sentAt' | 'updatedAt'
> & { clientName: string | null };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// SQLite's datetime('now') is UTC, "YYYY-MM-DD HH:MM:SS". Returns the calendar day on this phone.
export function localDay(stamp: string): string {
  const iso = stamp.includes('T') ? stamp : stamp.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? stamp.slice(0, 10) : toDay(d);
}

// Billr does not record payments on their own yet, so a paid invoice counts as paid on the day it was
// last changed: the day it was marked paid, unless it was edited after. Use the payment date once payments exist.
export function paidDay(d: Pick<ReportDoc, 'updatedAt'>): string {
  return localDay(d.updatedAt);
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

const isPaidInvoice = (d: ReportDoc, currency: Currency) => d.type === 'invoice' && d.status === 'paid' && d.currency === currency;

// Money in this month (by week) or this year (by month), with the previous month or year for comparison.
export function moneyIn(docs: ReportDoc[], currency: Currency, period: Period, now: string = today()): MoneyIn {
  const [y, m] = now.split('-').map(Number);
  const paid = docs.filter((d) => isPaidInvoice(d, currency)).map((d) => ({ d, day: paidDay(d) }));
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
      }).reduce((s, { d }) => s + d.totalKobo, 0);
      return { label: `${start} ${short}`, kobo, current: dayOfMonth >= start && dayOfMonth <= end };
    });
  } else {
    bars = MONTHS.map((name, i) => ({
      label: name[0],
      kobo: inPeriod.filter(({ day }) => Number(day.slice(5, 7)) === i + 1).reduce((s, { d }) => s + d.totalKobo, 0),
      current: i + 1 === m,
    }));
  }

  const byClient = new Map<string, number>();
  for (const { d } of inPeriod) {
    const name = d.clientName?.trim() || 'No client';
    byClient.set(name, (byClient.get(name) ?? 0) + d.totalKobo);
  }
  const topClients = [...byClient.entries()]
    .map(([name, kobo]) => ({ name, kobo }))
    .sort((a, b) => b.kobo - a.kobo || a.name.localeCompare(b.name))
    .slice(0, 3);

  const waits = inPeriod.filter(({ d }) => d.sentAt).map(({ d, day }) => Math.max(0, daysBetween(localDay(d.sentAt!), day)));

  return {
    totalKobo: inPeriod.reduce((s, { d }) => s + d.totalKobo, 0),
    previousKobo: previous.reduce((s, { d }) => s + d.totalKobo, 0),
    previousLabel: period === 'month' ? MONTHS[prevMonthDate.getMonth()] : String(y - 1),
    bars,
    topClients,
    avgDaysToPay: waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : null,
  };
}

export function periodLabel(period: Period, now: string = today()): string {
  return period === 'month' ? MONTHS[Number(now.slice(5, 7)) - 1] : now.slice(0, 4);
}

// Sent invoices not yet paid, split into not yet due and overdue.
export function outstanding(docs: ReportDoc[], currency: Currency, now: string = today()) {
  const unpaid = docs.filter((d) => d.type === 'invoice' && d.status === 'sent' && d.currency === currency);
  const overdue = unpaid.filter((d) => d.dueDate < now);
  const pending = unpaid.filter((d) => d.dueDate >= now);
  const sum = (list: ReportDoc[]) => list.reduce((s, d) => s + d.totalKobo, 0);
  return { pendingKobo: sum(pending), pendingCount: pending.length, overdueKobo: sum(overdue), overdueCount: overdue.length };
}

export function paidThisMonth(docs: ReportDoc[], currency: Currency, now: string = today()): number {
  const month = now.slice(0, 7);
  return docs.filter((d) => isPaidInvoice(d, currency) && paidDay(d).startsWith(month)).reduce((s, d) => s + d.totalKobo, 0);
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
  const header = ['Number', 'Type', 'Client', 'Issue date', 'Due or valid until', 'Status', 'Paid on', 'Currency', 'Total'];
  const rows = [...docs]
    .sort((a, b) => (a.issueDate === b.issueDate ? a.number.localeCompare(b.number) : a.issueDate.localeCompare(b.issueDate)))
    .map((d) => [
      d.number,
      DOC_LABEL[d.type],
      d.clientName ?? '',
      d.issueDate,
      d.dueDate,
      STATUS_WORD[d.status] ?? d.status,
      d.type === 'invoice' && d.status === 'paid' ? paidDay(d) : '',
      d.currency,
      amount(d.totalKobo),
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
