import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureBusiness, getClient, listDocuments } from '../../db/repo';
import { buildStatement, statementCurrencies, statementMessage, type StatementDoc } from '../../lib/statement';
import type { Business, Client } from '../../lib/types';
import { formatMoney, type Currency } from '../../lib/format';
import { formatDayShort, today } from '../../lib/dates';
import { openWhatsApp, previewStatement, shareStatementPdf } from '../../lib/share';
import { Button, Card, Divider, Empty, Segmented, T, WhatsAppButton } from '../../components/ui';
import { color, font, space } from '../../theme';

type Range = 'all' | 'year' | 'quarter';

// The day a range starts: this year from 1 January, the last 3 months from the 1st two months back.
function rangeStart(range: Range, now: string): string | null {
  const [y, m] = now.split('-').map(Number);
  if (range === 'year') return `${y}-01-01`;
  if (range === 'quarter') {
    const d = new Date(y, m - 3, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return null;
}

// Every invoice and payment for one client, with the balance, to share as a PDF or a WhatsApp message.
export default function StatementScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [docs, setDocs] = useState<StatementDoc[]>([]);
  const [range, setRange] = useState<Range>('all');
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [busy, setBusy] = useState<'preview' | 'pdf' | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        const c = await getClient(db, Number(id));
        const all = (await listDocuments(db, b.id)).filter((d) => d.clientId === Number(id));
        setBusiness(b);
        setClient(c);
        setDocs(all);
        const used = statementCurrencies(all);
        setCurrency((cur) => (used.includes(cur) ? cur : (used[0] ?? 'NGN')));
      })();
    }, [db, id]),
  );

  if (!business || !client) return null;

  const now = today();
  const s = buildStatement(docs, currency, rangeStart(range, now));
  const currencies = statementCurrencies(docs);
  const money = (k: number) => formatMoney(k, currency);
  const input = { business, client, statement: s, now };

  async function run(kind: 'preview' | 'pdf') {
    setBusy(kind);
    try {
      if (kind === 'preview') await previewStatement(input);
      else if (!(await shareStatementPdf(input))) Alert.alert('Sharing is not available on this phone');
    } catch (e) {
      Alert.alert('Could not make the PDF', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function whatsApp() {
    if (!(await openWhatsApp(client!.phone, statementMessage(business!, client!, s)))) {
      Alert.alert('WhatsApp did not open', 'Check that WhatsApp is installed, or use Share PDF.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Statement' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}>
        <T variant="title">{client.name}</T>
        <Segmented
          options={[
            { value: 'all', label: 'All time' },
            { value: 'year', label: 'This year' },
            { value: 'quarter', label: '3 months' },
          ]}
          value={range}
          onChange={setRange}
        />
        {currencies.length > 1 ? (
          <Segmented options={currencies.map((c) => ({ value: c, label: c === 'NGN' ? 'Naira' : 'Dollars' }))} value={currency} onChange={setCurrency} />
        ) : null}

        <Card style={{ padding: space.lg, gap: space.md }}>
          <T variant="label">BALANCE DUE</T>
          <T variant="display" style={{ color: s.closingKobo > 0 ? color.tx : color.paidTx }}>{money(s.closingKobo)}</T>
          <Divider />
          {s.openingKobo ? <Line label="Brought forward" value={money(s.openingKobo)} /> : null}
          <Line label="Billed" value={money(s.invoicedKobo)} />
          <Line label="Paid" value={money(s.paidKobo)} />
        </Card>

        {client.phone ? <WhatsAppButton label="Send on WhatsApp" onPress={whatsApp} /> : null}

        <View style={{ gap: space.sm }}>
          <T variant="section" style={{ marginTop: 0, marginBottom: 0 }}>Activity</T>
          {s.entries.length ? (
            <Card>
              {s.entries.map((e, i) => (
                <View key={`${e.kind}-${e.docId}-${i}`}>
                  {i ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/invoice/${e.docId}`)}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 56 }, pressed && { backgroundColor: color.hover }]}
                  >
                    <View style={{ flex: 1 }}>
                      <T style={{ fontFamily: font.semibold }} numberOfLines={1}>
                        {e.kind === 'invoice' ? 'Invoice' : e.label}
                      </T>
                      <T variant="sub" numberOfLines={1}>
                        {formatDayShort(e.day)} · <T variant="sub" style={{ fontFamily: font.mono }}>{e.number}</T>
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T variant="mono" style={e.kind === 'payment' ? { color: color.paidTx } : undefined}>
                        {e.kind === 'payment' ? '-' : '+'}
                        {money(e.kobo)}
                      </T>
                      <T variant="sub">Balance {money(e.balanceKobo)}</T>
                    </View>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <Empty title="Nothing in this period" body="Sent invoices and payments for this client show here." />
          )}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line }}>
        <Button kind="secondary" label="Preview" onPress={() => run('preview')} busy={busy === 'preview'} />
        <Button label="Share PDF" onPress={() => run('pdf')} busy={busy === 'pdf'} />
      </View>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <T variant="sub">{label}</T>
      <T variant="mono">{value}</T>
    </View>
  );
}
