import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { renderInvoiceHtml, type InvoiceHtmlInput } from './invoiceHtml';
import { formatMoney } from './format';
import { formatDay } from './dates';
import { DOC_LABEL } from './types';

export async function previewDocument(input: InvoiceHtmlInput): Promise<void> {
  await Print.printAsync({ html: renderInvoiceHtml(input) });
}

// Makes the PDF on the phone (no internet needed) and opens the share sheet, where WhatsApp is one tap.
// expo-print saves to a folder the share sheet is not allowed to read in Expo Go, so we take the PDF as
// base64 and write it into our own cache folder, named after the invoice (INV-0001.pdf) so the client sees a real name.
export async function sharePdf(input: InvoiceHtmlInput): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const { uri: printUri, base64 } = await Print.printToFileAsync({ html: renderInvoiceHtml(input), base64: true });
  if (!base64) throw new Error('The PDF came back empty');
  const file = new File(Paths.cache, `${input.doc.number}.pdf`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  try {
    new File(printUri).delete();
  } catch {
    // Not ours to delete in Expo Go; the system clears its cache.
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${DOC_LABEL[input.doc.type]} ${input.doc.number}`,
  });
  return true;
}

// 0803 123 4567 -> 2348031234567, the format wa.me links need.
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  if (digits.length === 10 && /^[789]/.test(digits)) return '234' + digits;
  return digits.length >= 10 ? digits : null;
}

function dueText(doc: InvoiceHtmlInput['doc']): string {
  if (doc.type === 'quote') return `, valid until ${formatDay(doc.dueDate)}`;
  return doc.termsDays === 0 ? ', due on receipt' : `, due ${formatDay(doc.dueDate)}`;
}

export function whatsAppMessage({ doc, business, client }: Pick<InvoiceHtmlInput, 'doc' | 'business' | 'client'>, totalKobo: number): string {
  const parts = [
    `Hello${client?.name ? ' ' + client.name.split(' ')[0] : ''},`,
    `here is ${DOC_LABEL[doc.type].toLowerCase()} ${doc.number} from ${business.name} for ${formatMoney(totalKobo, doc.currency, { decimals: true })}${dueText(doc)}.`,
  ];
  if (business.paymentAccountNumber) {
    parts.push('', 'Pay by transfer:', business.paymentBankName, business.paymentAccountNumber, business.paymentAccountName);
  }
  parts.push('', 'Thank you.');
  return parts.filter((p) => p !== undefined).join('\n');
}

export async function openWhatsApp(phone: string, message: string): Promise<boolean> {
  const number = toWhatsAppNumber(phone);
  const url = `https://wa.me/${number ?? ''}?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

// Saves a spreadsheet file in our cache folder and opens the share sheet (email, WhatsApp, Drive).
export async function shareCsv(fileName: string, csv: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: fileName });
  return true;
}
