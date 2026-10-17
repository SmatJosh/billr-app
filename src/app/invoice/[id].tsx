import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { convertDocument, deleteDocument, deletePayment, ensureBusiness, getClient, getDocument, getLines, listPayments, markSent, updateDocument } from '../../db/repo';
import { DOC_LABEL, PAYMENT_METHOD_LABEL, type BillrDocument, type Business, type Client, type DocType, type DocumentLine, type Payment } from '../../lib/types';
import { computeTotals, parseNairaToKobo, parsePercent, VAT_RATE_PERCENT } from '../../lib/money';
import { addDays, formatDayShort, PAYMENT_TERMS, QUOTE_VALIDITY } from '../../lib/dates';
import { formatMoney, formatQuantity, initials, koboToInput } from '../../lib/format';
import { useAutosave, type SaveStatus } from '../../lib/useAutosave';
import { openWhatsApp, previewDocument, receiptMessage, sharePdf, whatsAppMessage } from '../../lib/share';
import { Avatar, Button, Card, Chip, ChipRow, Divider, Field, LinkButton, pillFor, Row, SaveState, Segmented, StatusPill, T, WhatsAppButton, styles as ui } from '../../components/ui';
import { DayPicker } from '../../components/DayPicker';
import { LineEditor } from '../../components/LineEditor';
import { color, font, space } from '../../theme';

export default function InvoiceEditor() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const docId = Number(id);

  const [business, setBusiness] = useState<Business | null>(null);
  const [doc, setDoc] = useState<BillrDocument | null>(null);
  const [lines, setLines] = useState<DocumentLine[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [discountText, setDiscountText] = useState('');
  const [lineStatus, setLineStatus] = useState<SaveStatus>('idle');
  const [busy, setBusy] = useState<'pdf' | 'wa' | 'preview' | 'convert' | 'receipt' | null>(null);
  const loadedOnce = useRef(false);

  const autosave = useAutosave<BillrDocument>(async (patch) => {
    await updateDocument(db, docId, patch);
  });

  const load = useCallback(async () => {
    const [b, d, l, p] = await Promise.all([ensureBusiness(db), getDocument(db, docId), getLines(db, docId), listPayments(db, docId)]);
    setBusiness(b);
    setDoc(d);
    setLines(l);
    setPayments(p);
    setClient(d?.clientId ? await getClient(db, d.clientId) : null);
    if (d && !loadedOnce.current) {
      setDiscountText(d.discountType === 'flat' ? koboToInput(d.discountFlatKobo) : d.discountPercent ? formatQuantity(d.discountPercent) : '');
      loadedOnce.current = true;
    }
  }, [db, docId]);

  // Reload when coming back from the client or item picker, or after recording a payment.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!doc || !business) return null;

  function set(patch: Partial<BillrDocument>) {
    setDoc((prev) => (prev ? { ...prev, ...patch } : prev));
    autosave.change(patch);
  }

  const totals = computeTotals({ ...doc, lines });
  const isInvoice = doc.type === 'invoice';
  const isQuote = doc.type === 'quote';
  const paidKobo = payments.reduce((s, p) => s + p.amountKobo, 0);
  const balanceKobo = Math.max(0, computeTotals({ ...doc, lines }).totalKobo - paidKobo);
  const legacyPaid = isInvoice && doc.status === 'paid' && payments.length === 0;
  const readyToConvert = !isInvoice && doc.status === 'accepted';
  const label = DOC_LABEL[doc.type].toLowerCase();
  const status: SaveStatus = autosave.status === 'error' || lineStatus === 'error' ? 'error' : autosave.status === 'saving' || lineStatus === 'saving' ? 'saving' : autosave.status === 'saved' || lineStatus === 'saved' ? 'saved' : 'idle';
  const money = (k: number) => formatMoney(k, doc.currency);
  const discountError =
    discountText.trim() === ''
      ? null
      : doc.discountType === 'flat'
        ? parseNairaToKobo(discountText) === null
          ? 'Enter an amount'
          : null
        : parsePercent(discountText) === null
          ? 'Enter 0 to 100'
          : null;

  async function go(path: string) {
    await autosave.flush();
    router.push(path as never);
  }

  function readyToSend(): boolean {
    if (!lines.some((l) => l.description.trim() && l.unitPriceKobo > 0)) {
      Alert.alert('Add an item first', `A ${label} needs at least one item with a price.`);
      return false;
    }
    return true;
  }

  async function sharePdfNow() {
    if (!readyToSend() || !business || !doc) return;
    setBusy('pdf');
    try {
      await autosave.flush();
      const ok = await sharePdf({ doc, lines, business, client });
      if (ok) {
        await markSent(db, doc.id);
        setDoc({ ...doc, status: doc.status === 'draft' ? 'sent' : doc.status, sentAt: doc.sentAt ?? 'now' });
      } else {
        Alert.alert('Sharing is not available on this phone');
      }
    } catch (e) {
      Alert.alert('Could not make the PDF', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function whatsAppNow() {
    if (!readyToSend() || !business || !doc) return;
    if (!client?.phone) {
      Alert.alert('No phone number', 'Add a phone number to this client to send on WhatsApp, or use Share PDF.');
      return;
    }
    setBusy('wa');
    try {
      await autosave.flush();
      const ok = await openWhatsApp(client.phone, whatsAppMessage({ doc, business, client }, totals.totalKobo));
      if (ok) {
        await markSent(db, doc.id);
        setDoc({ ...doc, status: doc.status === 'draft' ? 'sent' : doc.status, sentAt: doc.sentAt ?? 'now' });
      } else {
        Alert.alert('WhatsApp did not open', 'Check that WhatsApp is installed, or use Share PDF.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!business || !doc) return;
    setBusy('preview');
    try {
      await autosave.flush();
      await previewDocument({ doc, lines, business, client });
    } catch {
      // The user closed the print preview.
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    Alert.alert(`Delete ${doc!.number}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDocument(db, doc!.id);
          router.back();
        },
      },
    ]);
  }

  // The client's answer to a quote or proforma. "No reply yet" goes back to sent, or draft if it was never shared.
  function setAnswer(answer: 'none' | 'accepted' | 'declined') {
    set({ status: answer === 'none' ? (doc!.sentAt ? 'sent' : 'draft') : answer });
  }

  async function convert(type: DocType) {
    if (!readyToSend() || busy) return;
    setBusy('convert');
    try {
      await autosave.flush();
      const newId = await convertDocument(db, doc!.id, type);
      router.replace(`/invoice/${newId}`);
    } catch (e) {
      Alert.alert('Could not convert', String(e));
      setBusy(null);
    }
  }

  async function recordPayment() {
    if (!readyToSend()) return;
    await go(`/invoice/record-payment?doc=${doc!.id}`);
  }

  function removePayment(p: Payment) {
    Alert.alert(`Remove the ${money(p.amountKobo)} payment?`, `Received ${formatDayShort(p.paidOn)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deletePayment(db, p);
          await load();
        },
      },
    ]);
  }

  // A receipt goes as a PDF (looks official, good for records) or as a short WhatsApp thank-you.
  function sendReceipt() {
    if (!business || !doc || !payments.length) return;
    const last = payments[payments.length - 1].amountKobo;
    const options: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'PDF receipt',
        onPress: async () => {
          setBusy('receipt');
          try {
            await autosave.flush();
            if (!(await sharePdf({ doc, lines, business, client, payments, receipt: true }))) Alert.alert('Sharing is not available on this phone');
          } catch (e) {
            Alert.alert('Could not make the receipt', String(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ];
    if (client?.phone) {
      options.push({
        text: 'WhatsApp message',
        onPress: async () => {
          if (!(await openWhatsApp(client.phone, receiptMessage({ doc, business, client }, last, balanceKobo)))) {
            Alert.alert('WhatsApp did not open', 'Check that WhatsApp is installed, or send the PDF receipt.');
          }
        },
      });
    }
    Alert.alert('Send a receipt', `For ${doc.number}`, options);
  }

  // Invoices marked paid before payments could be recorded can still be set back.
  function markNotPaid() {
    set({ status: doc!.sentAt ? 'sent' : 'draft' });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: doc.number,
          headerTitleStyle: { fontFamily: font.mono, fontSize: 18 },
          headerRight: () => (
            <Pressable onPress={autosave.flush} hitSlop={8} accessibilityRole="button">
              <SaveState state={status} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Card style={{ marginTop: space.md, padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T style={{ fontFamily: font.semibold }}>{DOC_LABEL[doc.type]}</T>
            <StatusPill status={pillFor({ ...doc, paidKobo })} />
          </View>
          {isInvoice && legacyPaid ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T variant="sub">Marked as paid in full.</T>
              <LinkButton label="Not paid yet" onPress={markNotPaid} />
            </View>
          ) : isInvoice ? (
            <>
              {payments.length ? (
                <View style={{ gap: space.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <T variant="sub">
                      Paid <T style={{ fontFamily: font.semibold }}>{money(paidKobo)}</T> of {money(totals.totalKobo)}
                    </T>
                    {balanceKobo > 0 ? <T variant="sub">{money(balanceKobo)} left</T> : null}
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: color.muted, overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, totals.totalKobo ? (paidKobo / totals.totalKobo) * 100 : 0)}%`, backgroundColor: balanceKobo ? color.accent : color.paidTx }} />
                  </View>
                  {payments.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityHint="Remove this payment"
                      onPress={() => removePayment(p)}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, alignItems: 'center' }}
                    >
                      <T variant="sub" style={{ flex: 1 }} numberOfLines={1}>
                        {formatDayShort(p.paidOn)} · {PAYMENT_METHOD_LABEL[p.method]}
                        {p.note ? ` · ${p.note}` : ''}
                      </T>
                      <T variant="mono">{money(p.amountKobo)}</T>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <T variant="sub">When money comes in, record it here: a deposit, part payment or the full amount.</T>
              )}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {balanceKobo > 0 ? <Button kind="secondary" label="Add payment" onPress={recordPayment} /> : null}
                {payments.length ? <Button kind="secondary" label="Send receipt" onPress={sendReceipt} busy={busy === 'receipt'} /> : null}
              </View>
            </>
          ) : doc.status === 'converted' ? (
              <T variant="sub">Already turned into the next document. Find it under {doc.type === 'quote' ? 'Quotes or Home' : 'Home'}.</T>
            ) : (
              <>
                <T variant="sub">
                  {doc.status !== 'accepted'
                    ? 'When the client says yes, tap Accepted to turn it into an invoice.'
                    : isQuote
                      ? 'Scroll down to turn it into an invoice or proforma.'
                      : 'Scroll down to turn it into an invoice.'}
                </T>
                <Segmented
                  options={[
                    { value: 'none', label: 'No reply' },
                    { value: 'accepted', label: 'Accepted' },
                    { value: 'declined', label: 'Declined' },
                  ]}
                  value={doc.status === 'accepted' || doc.status === 'declined' ? doc.status : 'none'}
                  onChange={setAnswer}
                />
              </>
            )}
        </Card>
        <Card style={{ marginTop: space.md, padding: space.lg, flexDirection: 'row', gap: space.lg }}>
          <View style={{ flex: 1 }}>
            <DayPicker
              label="Issue date"
              value={doc.issueDate}
              onChange={(d) => set({ issueDate: d, ...(doc.termsDays !== null ? { dueDate: addDays(d, doc.termsDays) } : {}) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DayPicker
              label={isQuote ? 'Valid until' : 'Due date'}
              value={doc.dueDate}
              display={doc.termsDays === 0 && !isQuote ? 'On receipt' : undefined}
              onChange={(d) => set({ dueDate: d, termsDays: null })}
            />
          </View>
        </Card>
        <View style={{ marginTop: space.sm }}>
          <ChipRow label={isQuote ? 'Valid for' : 'Payment terms'}>
            {(isQuote ? QUOTE_VALIDITY : PAYMENT_TERMS).map((t) => (
              <Chip key={t.days} label={t.label} on={doc.termsDays === t.days} onPress={() => set({ termsDays: t.days, dueDate: addDays(doc.issueDate, t.days) })} />
            ))}
          </ChipRow>
        </View>

        <T variant="section">Bill to</T>
        <Card>
          {client ? (
            <Row
              title={client.name}
              subtitle={client.phone || undefined}
              mono
              left={<Avatar text={initials(client.name)} />}
              right={<Text style={{ fontFamily: font.medium, fontSize: 14, color: color.tx }}>Change</Text>}
              onPress={() => go(`/invoice/pick-client?doc=${doc.id}`)}
            />
          ) : (
            <Row title="Choose a client" left={<Text style={{ fontSize: 22, color: color.accent, width: 24 }}>+</Text>} onPress={() => go(`/invoice/pick-client?doc=${doc.id}`)} />
          )}
        </Card>

        <T variant="section">Items</T>
        <Card>
          {lines.map((l, i) => (
            <View key={l.id}>
              {i > 0 ? <Divider /> : null}
              <LineEditor
                line={l}
                currency={doc.currency}
                onLocalChange={(nl) => setLines((prev) => prev.map((p) => (p.id === nl.id ? nl : p)))}
                onRemoved={(rid) => setLines((prev) => prev.filter((p) => p.id !== rid))}
                onSaveStatus={setLineStatus}
              />
            </View>
          ))}
          {lines.length ? <Divider /> : null}
          <Pressable accessibilityRole="button" onPress={() => go(`/invoice/pick-item?doc=${doc.id}`)} style={{ minHeight: 56, paddingHorizontal: space.lg, justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, color: color.accent, fontSize: 15 }}>+ Add item</Text>
          </Pressable>
        </Card>

        <Card style={{ marginTop: space.md, paddingVertical: space.sm }}>
          <View style={totalRow}>
            <T>Subtotal</T>
            <T variant="mono">{money(totals.subtotalKobo)}</T>
          </View>
          <View style={[totalRow, { alignItems: 'flex-start' }]}>
            <T style={{ paddingTop: 12 }}>Discount</T>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <View style={{ width: 104 }}>
                  <Segmented
                    options={[
                      { value: 'flat', label: doc.currency === 'NGN' ? '₦' : '$' },
                      { value: 'percent', label: '%' },
                    ]}
                    value={doc.discountType}
                    onChange={(v) => {
                      // Each type keeps its own value, so switching back restores what was typed.
                      setDiscountText(v === 'flat' ? koboToInput(doc.discountFlatKobo) : doc.discountPercent ? formatQuantity(doc.discountPercent) : '');
                      set({ discountType: v });
                    }}
                  />
                </View>
                <TextInput
                  value={discountText}
                  onChangeText={(v) => {
                    setDiscountText(v);
                    if (doc.discountType === 'flat') {
                      const k = v.trim() === '' ? 0 : parseNairaToKobo(v);
                      if (k !== null) set({ discountFlatKobo: k });
                    } else {
                      const p = v.trim() === '' ? 0 : parsePercent(v);
                      if (p !== null) set({ discountPercent: p });
                    }
                  }}
                  placeholder="0"
                  placeholderTextColor={color.tx3}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Discount"
                  style={[ui.input, { width: 96, height: 44, fontFamily: font.mono, textAlign: 'right' }, discountError ? { borderColor: color.dueTx } : null]}
                />
              </View>
              {totals.discountKobo ? <T variant="sub">-{money(totals.discountKobo)}</T> : null}
            </View>
          </View>
          <View style={totalRow}>
            <T>
              VAT <Text style={ui.sub}>· {VAT_RATE_PERCENT}%</Text>
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              {doc.vatEnabled ? <T variant="mono" style={{ color: color.tx3 }}>{money(totals.vatKobo)}</T> : null}
              <Switch
                value={doc.vatEnabled}
                onValueChange={(v) => set({ vatEnabled: v })}
                trackColor={{ true: color.ink, false: color.edge }}
                thumbColor={color.surface}
                accessibilityLabel="Add VAT"
              />
            </View>
          </View>
          <Divider />
          <View style={[totalRow, { alignItems: 'baseline', paddingTop: space.md }]}>
            <T style={{ fontFamily: font.semibold }}>
              Total <Text style={ui.sub}>· {doc.currency}</Text>
            </T>
            <T variant="display" style={{ fontSize: 34 }}>{money(totals.totalKobo)}</T>
          </View>
        </Card>

        <T variant="section">Pay by transfer</T>
        <Card>
          <Row
            title={business.paymentBankName || (business.paymentAccountNumber ? 'Add your bank name' : 'Add your bank details')}
            subtitle={
              business.paymentAccountNumber
                ? [business.paymentAccountNumber, business.paymentAccountName].filter((x) => x.trim()).join(' · ')
                : 'So clients know where to pay'
            }
            mono={!!business.paymentAccountNumber}
            right={<Text style={{ fontFamily: font.medium, fontSize: 14, color: color.tx }}>Edit</Text>}
            onPress={() => go('/setup')}
          />
        </Card>

        <View style={{ marginTop: space.lg }}>
          <Field label="Notes and terms" value={doc.notes} onChangeText={(v) => set({ notes: v })} multiline placeholder="e.g. Balance on pickup" />
        </View>

        {/* One main action per stage: send it, then once a quote is accepted, turn it into the next document. */}
        {readyToConvert ? (
          <View style={{ gap: space.sm, marginTop: space.xl }}>
            <Button label="Convert to invoice" onPress={() => convert('invoice')} busy={busy === 'convert'} style={{ flex: 0 }} />
            {isQuote ? <Button kind="secondary" label="Make proforma" onPress={() => convert('proforma')} disabled={busy === 'convert'} style={{ flex: 0 }} /> : null}
          </View>
        ) : (
          <View style={{ marginTop: space.xl }}>
            <WhatsAppButton onPress={whatsAppNow} busy={busy === 'wa'} />
          </View>
        )}
        <View style={{ alignItems: 'center', marginTop: space.md }}>
          <LinkButton label="Delete" danger onPress={remove} />
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line }}>
        <Button kind="secondary" label="Preview" onPress={preview} busy={busy === 'preview'} />
        <Button label="Share PDF" onPress={sharePdfNow} busy={busy === 'pdf'} />
      </View>
    </KeyboardAvoidingView>
  );
}

const totalRow = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingHorizontal: space.lg, paddingVertical: 8, gap: space.md };
