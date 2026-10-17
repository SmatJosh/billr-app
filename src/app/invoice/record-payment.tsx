import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addPayment, getDocument, listPayments } from '../../db/repo';
import { PAYMENT_METHOD_LABEL, type BillrDocument, type PaymentMethod } from '../../lib/types';
import { parseNairaToKobo } from '../../lib/money';
import { today } from '../../lib/dates';
import { formatMoney, koboToInput } from '../../lib/format';
import { Button, Chip, ChipRow, Field, SheetScreen, T } from '../../components/ui';
import { DayPicker } from '../../components/DayPicker';
import { space } from '../../theme';

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

// Records money received on an invoice: a deposit, a part payment or the rest of the balance.
export default function RecordPayment() {
  const db = useSQLiteContext();
  const { doc: docParam } = useLocalSearchParams<{ doc: string }>();
  const docId = Number(docParam);
  const [doc, setDoc] = useState<BillrDocument | null>(null);
  const [balance, setBalance] = useState(0);
  const [amountText, setAmountText] = useState('');
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('transfer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await getDocument(db, docId);
      const paid = (await listPayments(db, docId)).reduce((s, p) => s + p.amountKobo, 0);
      const left = Math.max(0, (d?.totalKobo ?? 0) - paid);
      setDoc(d);
      setBalance(left);
      setAmountText(koboToInput(left));
    })();
  }, [db, docId]);

  if (!doc) return null;

  const money = (k: number) => formatMoney(k, doc.currency);
  const amount = amountText.trim() ? parseNairaToKobo(amountText) : 0;
  const error =
    amount === null ? 'Enter an amount like 45,000 or 20k' : amount > balance ? `That is more than the ${money(balance)} still owed` : null;
  const half = Math.round(balance / 2);

  async function save() {
    if (!amount || error || busy) return;
    setBusy(true);
    try {
      await addPayment(db, docId, { amountKobo: amount, paidOn, method, note: note.trim() });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetScreen title="Record payment">
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <T variant="sub">
            {doc.number} · {money(balance)} still owed
          </T>
          <View style={{ gap: space.sm }}>
            <Field
              label={`Amount received (${doc.currency === 'NGN' ? '₦' : '$'})`}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              mono
              help="You can type 20k for ₦20,000"
              error={error}
            />
            <ChipRow label="Quick amounts">
              <Chip label={`Full balance ${money(balance)}`} on={amount === balance} onPress={() => setAmountText(koboToInput(balance))} />
              {half > 0 && half < balance ? <Chip label={`Half ${money(half)}`} on={amount === half} onPress={() => setAmountText(koboToInput(half))} /> : null}
            </ChipRow>
          </View>
          <DayPicker label="Paid on" value={paidOn} onChange={setPaidOn} />
          <View style={{ gap: space.sm }}>
            <T variant="label">PAID BY</T>
            <ChipRow label="Paid by">
              {METHODS.map((m) => (
                <Chip key={m} label={PAYMENT_METHOD_LABEL[m]} on={method === m} onPress={() => setMethod(m)} />
              ))}
            </ChipRow>
          </View>
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Deposit" />
          <Button label="Save payment" onPress={save} busy={busy} disabled={!amount || !!error} style={{ flex: 0 }} />
        </ScrollView>
      </SheetScreen>
    </KeyboardAvoidingView>
  );
}
