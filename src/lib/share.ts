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
export async function sharePdf(input: InvoiceHtmlInput): Promise<boolean> {
  const { uri } = await Print.printToFileAsync({ html: renderInvoiceHtml(input) });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
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

export function whatsAppMessage({ doc, business, client }: Pick<InvoiceHtmlInput, 'doc' | 'business' | 'client'>, totalKobo: number): string {
  const parts = [
    `Hello${client?.name ? ' ' + client.name.split(' ')[0] : ''},`,
    `here is ${DOC_LABEL[doc.type].toLowerCase()} ${doc.number} from ${business.name} for ${formatMoney(totalKobo, doc.currency, { decimals: true })}${doc.termsDays === 0 ? ', due on receipt' : `, due ${formatDay(doc.dueDate)}`}.`,
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
