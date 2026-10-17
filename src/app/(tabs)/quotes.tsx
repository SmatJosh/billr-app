import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDocument, ensureBusiness, listDocuments, type DocListRow } from '../../db/repo';
import type { Business } from '../../lib/types';
import { formatMoney } from '../../lib/format';
import { quoteSummary } from '../../lib/reports';
import { Card, Chip, Empty, Fab, ScreenTitle, T } from '../../components/ui';
import { DocRow } from '../../components/DocRow';
import { color, space } from '../../theme';

type Filter = 'all' | 'quote' | 'proforma' | 'converted';

export default function Quotes() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [business, setBusiness] = useState<Business | null>(null);
  const [docs, setDocs] = useState<DocListRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const b = await ensureBusiness(db);
        const d = await listDocuments(db, b.id);
        if (active) {
          setBusiness(b);
          setDocs(d.filter((x) => x.type !== 'invoice'));
        }
      })();
      return () => {
        active = false;
      };
    }, [db]),
  );

  if (!business) return <View style={{ flex: 1, backgroundColor: color.paper }} />;

  const cur = business.defaultCurrency;
  const summary = quoteSummary(docs, cur);
  const shown = docs.filter((d) =>
    filter === 'all' ? true : filter === 'converted' ? d.status === 'converted' : d.type === filter && d.status !== 'converted',
  );

  async function newQuote() {
    if (!business || creating) return;
    setCreating(true);
    try {
      const id = await createDocument(db, business, 'quote');
      router.push(`/invoice/${id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <FlatList
        data={shown}
        keyExtractor={(d) => String(d.id)}
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: 96 }}
        ListHeaderComponent={
          <View>
            <ScreenTitle title="Quotes" />
            <Card style={{ padding: space.lg, marginTop: space.md, flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <T variant="label">AWAITING REPLY</T>
                <T variant="display" style={{ fontSize: 30, lineHeight: 36 }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(summary.awaitingKobo, cur)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="label">WON THIS MONTH</T>
                <T variant="display" style={{ fontSize: 30, lineHeight: 36 }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(summary.wonKobo, cur)}</T>
              </View>
            </Card>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg, marginBottom: space.md, flexWrap: 'wrap' }}>
              <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Quotes" on={filter === 'quote'} onPress={() => setFilter('quote')} />
              <Chip label="Proforma" on={filter === 'proforma'} onPress={() => setFilter('proforma')} />
              <Chip label="Converted" on={filter === 'converted'} onPress={() => setFilter('converted')} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <Empty
            title={docs.length ? 'Nothing here' : 'No quotes yet'}
            body={
              docs.length
                ? 'Try another filter.'
                : 'Send a price before the job starts. When the client says yes, turn it into an invoice in one tap.'
            }
          />
        }
        renderItem={({ item }) => <DocRow d={item} />}
      />
      <Fab label="New quote" onPress={newQuote} busy={creating} />
    </View>
  );
}
