import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createItem, ensureBusiness, listItems } from '../db/repo';
import type { Item } from '../lib/types';
import { formatMoney } from '../lib/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Empty, Fab, Row } from '../components/ui';
import { space } from '../theme';

export default function Items() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [businessId, setBusinessId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        setBusinessId(b.id);
        setItems(await listItems(db, b.id));
      })();
    }, [db]),
  );

  async function add() {
    if (!businessId) return;
    const id = await createItem(db, businessId);
    router.push(`/item/${id}`);
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 120 }}
        ListEmptyComponent={<Empty title="No saved items" body="Save what you sell or charge for, and add it to any invoice in one tap." />}
        renderItem={({ item }) => (
          <Card>
            <Row title={item.name} subtitle={item.details || undefined} value={formatMoney(item.defaultPriceKobo)} onPress={() => router.push(`/item/${item.id}`)} />
          </Card>
        )}
      />
      <Fab label="New item" onPress={add} bottom={insets.bottom + space.lg} />
    </View>
  );
}
