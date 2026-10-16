import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createClient, ensureBusiness, listClients } from '../db/repo';
import type { Client } from '../lib/types';
import { formatMoney, initials } from '../lib/format';
import { Avatar, Button, Card, Empty, Field, Row } from '../components/ui';
import { space } from '../theme';

export default function Clients() {
  const db = useSQLiteContext();
  const [clients, setClients] = useState<(Client & { owedKobo: number })[]>([]);
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        setBusinessId(b.id);
        setClients(await listClients(db, b.id));
      })();
    }, [db]),
  );

  async function add() {
    if (!businessId) return;
    const id = await createClient(db, businessId);
    router.push(`/client/${id}`);
  }

  const q = query.trim().toLowerCase();
  const shown = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : clients;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={shown}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          clients.length > 5 ? (
            <View style={{ marginBottom: space.sm }}>
              <Field label="Search" value={query} onChangeText={setQuery} placeholder="Name or phone" />
            </View>
          ) : undefined
        }
        ListEmptyComponent={<Empty title="No clients yet" body="Add the people you bill so you never type their details twice." />}
        renderItem={({ item: c }) => (
          <Card>
            <Row
              title={c.name}
              subtitle={c.phone || c.email || undefined}
              mono={!!c.phone}
              value={c.owedKobo ? formatMoney(c.owedKobo) : undefined}
              left={<Avatar text={initials(c.name)} />}
              onPress={() => router.push(`/client/${c.id}`)}
            />
          </Card>
        )}
      />
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.xl, flexDirection: 'row' }}>
        <Button label="Add client" onPress={add} />
      </View>
    </View>
  );
}
