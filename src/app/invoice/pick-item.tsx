import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addLine, ensureBusiness, listItems } from '../../db/repo';
import type { Item } from '../../lib/types';
import { formatMoney } from '../../lib/format';
import { Button, Card, Field, Row, SheetScreen, T } from '../../components/ui';
import { space } from '../../theme';

export default function PickItem() {
  const db = useSQLiteContext();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        setItems(await listItems(db, b.id));
      })();
    }, [db]),
  );

  async function add(line: { description: string; unitPriceKobo?: number }) {
    await addLine(db, Number(doc), { ...line, quantity: 1 });
    router.back();
  }

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

  return (
    <SheetScreen title="Add item">
      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 48 }}
          style={{ flexGrow: 0 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Field label="Item" value={query} onChangeText={setQuery} placeholder="Search saved items or type a new one" autoFocus={items.length === 0} />
            <View style={{ flexDirection: 'row' }}>
              <Button kind={shown.length ? 'secondary' : 'primary'} label={q ? `Add "${query.trim()}"` : 'Add a blank line'} onPress={() => add({ description: query.trim() })} />
            </View>
            {items.length ? <T variant="section">Saved items</T> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <Row
              title={item.name}
              subtitle={item.details || undefined}
              value={formatMoney(item.defaultPriceKobo)}
              onPress={() => add({ description: item.name, unitPriceKobo: item.defaultPriceKobo })}
            />
          </Card>
        )}
      />
    </SheetScreen>
  );
}
