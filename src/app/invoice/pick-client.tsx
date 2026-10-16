import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createClient, ensureBusiness, listClients, updateClient, updateDocument } from '../../db/repo';
import type { Client } from '../../lib/types';
import { initials } from '../../lib/format';
import { Avatar, Button, Card, Field, Row, T } from '../../components/ui';
import { space } from '../../theme';

export default function PickClient() {
  const db = useSQLiteContext();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const [clients, setClients] = useState<Client[]>([]);
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        setBusinessId(b.id);
        setClients(await listClients(db, b.id));
      })();
    }, [db]),
  );

  async function pick(clientId: number) {
    await updateDocument(db, Number(doc), { clientId });
    router.back();
  }

  async function addAndPick() {
    if (!businessId || !query.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createClient(db, businessId, query.trim());
      if (phone.trim()) await updateClient(db, id, { phone: phone.trim() });
      await pick(id);
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : clients;
  const exact = clients.some((c) => c.name.trim().toLowerCase() === q);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={shown}
        keyExtractor={(c) => String(c.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Field label="Client name" value={query} onChangeText={setQuery} placeholder="Search or type a new name" autoCapitalize="words" autoFocus={clients.length === 0} />
            {q && !exact ? (
              <Card style={{ padding: space.lg, gap: space.md }}>
                <T style={{ fontWeight: '600' }}>New client: {query.trim()}</T>
                <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mono help="Needed to send on WhatsApp" />
                <View style={{ flexDirection: 'row' }}>
                  <Button label="Add and use" onPress={addAndPick} busy={busy} />
                </View>
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item: c }) => (
          <Card>
            <Row title={c.name} subtitle={c.phone || undefined} mono left={<Avatar text={initials(c.name)} />} onPress={() => pick(c.id)} />
          </Card>
        )}
      />
    </KeyboardAvoidingView>
  );
}
