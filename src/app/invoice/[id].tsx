import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteDocument, ensureBusiness, getClient, getDocument, getLines, markSent, updateDocument } from '../../db/repo';
import type { BillrDocument, Business, Client, DocumentLine } from '../../lib/types';
import { computeTotals, parseNairaToKobo, parsePercent, VAT_RATE_PERCENT } from '../../lib/money';
import { addDays, PAYMENT_TERMS } from '../../lib/dates';
import { formatMoney, formatQuantity, initials, koboToInput } from '../../lib/format';
import { useAutosave, type SaveStatus } from '../../lib/useAutosave';
import { openWhatsApp, previewDocument, sharePdf, whatsAppMessage } from '../../lib/share';
import { Avatar, Button, Card, Chip, Divider, Field, LinkButton, Row, SaveState, Segmented, T, styles as ui } from '../../components/ui';
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
  const [discountText, setDiscountText] = useState('');
  const [lineStatus, setLineStatus] = useState<SaveStatus>('idle');
  const [busy, setBusy] = useState<'pdf' | 'wa' | 'preview' | null>(null);
  const loadedOnce = useRef(false);

  const autosave = useAutosave<BillrDocument>(async (patch) => {
    await updateDocument(db, docId, patch);
  });

  const load = useCallback(async () => {
    const [b, d, l] = await Promise.all([ensureBusiness(db), getDocument(db, docId), getLines(db, docId)]);
    setBusiness(b);
    setDoc(d);
    setLines(l);
    setClient(d?.clientId ? await getClient(db, d.clientId) : null);
    if (d && !loadedOnce.current) {
      setDiscountText(d.discountType === 'flat' ? koboToInput(d.discountFlatKobo) : d.discountPercent ? formatQuantity(d.discountPercent) : '');
      loadedOnce.current = true;
    }
  }, [db, docId]);

  // Reload when coming back from the client or item picker.
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
      Alert.alert('Add an item first', 'An invoice needs at least one item with a price.');
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
        setDoc({ ...doc, status: doc.status === 'draft' ? 'sent' : doc.status });
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
        setDoc({ ...doc, status: doc.status === 'draft' ? 'sent' : doc.status });
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

  function markPaid() {
    set({ status: doc!.status === 'paid' ? 'sent' : 'paid' });
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
              label="Due date"
              value={doc.dueDate}
              display={doc.termsDays === 0 ? 'On receipt' : undefined}
              onChange={(d) => set({ dueDate: d, termsDays: null })}
            />
          </View>
        </Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: space.sm }} accessibilityLabel="Payment terms">
          {PAYMENT_TERMS.map((t) => (
            <Chip key={t.days} label={t.label} on={doc.termsDays === t.days} onPress={() => set({ termsDays: t.days, dueDate: addDays(doc.issueDate, t.days) })} />
          ))}
        </ScrollView>

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
            title={business.paymentBankName || 'Add your bank details'}
            subtitle={business.paymentAccountNumber ? `${business.paymentAccountNumber} · ${business.paymentAccountName}` : 'So clients know where to pay'}
            mono={!!business.paymentAccountNumber}
            right={<Text style={{ fontFamily: font.medium, fontSize: 14, color: color.tx }}>Edit</Text>}
            onPress={() => go('/setup')}
          />
        </Card>

        <View style={{ marginTop: space.lg }}>
          <Field label="Notes and terms" value={doc.notes} onChangeText={(v) => set({ notes: v })} multiline placeholder="e.g. Balance on pickup" />
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
          <Button kind="secondary" label="Send on WhatsApp" onPress={whatsAppNow} busy={busy === 'wa'} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
          {doc.status !== 'draft' ? <LinkButton label={doc.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'} onPress={markPaid} /> : <View />}
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
