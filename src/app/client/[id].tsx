import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteClient, ensureBusiness, getClient, listDocuments, updateClient } from '../../db/repo';
import { buildStatement, statementCurrencies } from '../../lib/statement';
import { formatMoney } from '../../lib/format';
import type { Client } from '../../lib/types';
import { useAutosave } from '../../lib/useAutosave';
import { Button, Card, Field, LinkButton, SaveState, T } from '../../components/ui';
import { color, space } from '../../theme';

export default function ClientScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Client | null>(null);
  const autosave = useAutosave<Client>(async (patch) => {
    if (c) await updateClient(db, c.id, patch);
  });

  const [summary, setSummary] = useState<{ owed: string; detail: string } | null>(null);

  useEffect(() => {
    getClient(db, Number(id)).then(setC);
  }, [db, id]);

  // What they owe, refreshed when coming back from the statement or an invoice.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        const docs = (await listDocuments(db, b.id)).filter((d) => d.clientId === Number(id));
        const currency = statementCurrencies(docs)[0];
        if (!currency) return setSummary(null);
        const s = buildStatement(docs, currency, null);
        const count = s.entries.filter((e) => e.kind === 'invoice').length;
        setSummary({
          owed: s.closingKobo > 0 ? formatMoney(s.closingKobo, currency) : 'All paid up',
          detail: `${count} ${count === 1 ? 'invoice' : 'invoices'} · ${formatMoney(s.paidKobo, currency)} paid`,
        });
      })();
    }, [db, id]),
  );

  if (!c) return null;

  function set<K extends keyof Client>(key: K, value: Client[K]) {
    setC((prev) => (prev ? { ...prev, [key]: value } : prev));
    autosave.change({ [key]: value } as Partial<Client>);
  }

  function remove() {
    Alert.alert('Delete client?', 'Their invoices stay, without a client name.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteClient(db, c!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: c.name || 'New client',
          headerRight: () => (
            <Pressable onPress={autosave.flush} hitSlop={8} accessibilityRole="button">
              <SaveState state={autosave.status} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {summary ? (
          <Card style={{ padding: space.lg, gap: space.sm }}>
            <T variant="label">OWES YOU</T>
            <T variant="display" style={summary.owed === 'All paid up' ? { color: color.paidTx } : undefined}>{summary.owed}</T>
            <T variant="sub">{summary.detail}</T>
            <View style={{ flexDirection: 'row', marginTop: space.sm }}>
              <Button kind="secondary" label="View statement" onPress={() => router.push(`/client/statement?id=${c.id}`)} />
            </View>
          </Card>
        ) : null}
        <Field label="Name" value={c.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" autoFocus={!c.name} />
        <Field label="Phone" value={c.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" mono help="Used to send on WhatsApp" />
        <Field label="Email (optional)" value={c.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Address (optional)" value={c.address} onChangeText={(v) => set('address', v)} multiline />
        <Field label="Private notes (optional)" value={c.notes} onChangeText={(v) => set('notes', v)} multiline help="Only you see these" />
        <View style={{ flexDirection: 'row' }}>
          <Button
            label="Done"
            onPress={async () => {
              await autosave.flush();
              router.back();
            }}
            disabled={!c.name.trim()}
          />
        </View>
        <View style={{ alignItems: 'center' }}>
          <LinkButton label="Delete client" danger onPress={remove} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
