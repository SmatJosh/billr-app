import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDocument, ensureBusiness, listDocuments, type DocListRow } from '../../db/repo';
import type { Business } from '../../lib/types';
import { formatMoneyShort } from '../../lib/format';
import { outstanding, paidThisMonth } from '../../lib/reports';
import { Chip, ChipRow, Empty, Fab, StatTile, T } from '../../components/ui';
import { DocRow } from '../../components/DocRow';
import { useSync } from '../../sync/SyncProvider';
import { color, font, space } from '../../theme';

type Filter = 'all' | 'unpaid' | 'paid' | 'draft';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function Home() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [business, setBusiness] = useState<Business | null>(null);
  const [docs, setDocs] = useState<DocListRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const backup = useSync();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const b = await ensureBusiness(db);
        const d = await listDocuments(db, b.id);
        if (active) {
          setBusiness(b);
          setDocs(d);
        }
      })();
      return () => {
        active = false;
      };
    }, [db]),
  );

  if (!business) return <View style={{ flex: 1, backgroundColor: color.paper }} />;
  if (!business.name.trim()) return <Redirect href="/welcome" />;

  const cur = business.defaultCurrency;
  const invoices = docs.filter((d) => d.type === 'invoice');
  const owed = outstanding(invoices, cur);
  const paid = paidThisMonth(invoices, cur);
  const shown = invoices.filter((d) => filter === 'all' || (filter === 'unpaid' ? d.status === 'sent' : d.status === filter));

  async function newInvoice() {
    if (!business || creating) return;
    setCreating(true);
    try {
      const id = await createDocument(db, business, 'invoice');
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
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: 96 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.displayItalic, color: color.onInk, fontSize: 20, lineHeight: 24 }}>{business.name.trim()[0]?.toUpperCase()}</Text>
              </View>
              <T style={{ fontFamily: font.semibold, fontSize: 17, flex: 1 }} numberOfLines={1}>{business.name}</T>
            </View>

            {backup.status === 'signed-out' && docs.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T variant="sub">
                  Only saved on this phone. <Text style={{ fontFamily: font.semibold, color: color.accent }}>Back up</Text>
                </T>
              </Pressable>
            ) : null}

            <T variant="display" style={{ marginTop: space.sm, lineHeight: 46 }}>Who owes you</T>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <StatTile dot={color.paidTx} label={`PAID · ${MONTHS[new Date().getMonth()]}`} value={formatMoneyShort(paid, cur)} />
              <StatTile dot={color.partTx} label="PENDING" value={formatMoneyShort(owed.pendingKobo, cur)} />
              <StatTile dot={color.dueTx} label="OVERDUE" value={formatMoneyShort(owed.overdueKobo, cur)} danger={owed.overdueKobo > 0} />
            </View>

            <View style={{ marginTop: space.lg, marginBottom: space.md }}>
              <ChipRow label="Show">
                <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
                <Chip label="Unpaid" on={filter === 'unpaid'} onPress={() => setFilter('unpaid')} />
                <Chip label="Paid" on={filter === 'paid'} onPress={() => setFilter('paid')} />
                <Chip label="Drafts" on={filter === 'draft'} onPress={() => setFilter('draft')} />
              </ChipRow>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <Empty
            title={invoices.length ? 'Nothing here' : 'No invoices yet'}
            body={invoices.length ? 'Try another filter.' : 'Your first invoice takes about a minute. It saves as you type.'}
          />
        }
        renderItem={({ item }) => <DocRow d={item} />}
      />
      <Fab label="New invoice" onPress={newInvoice} busy={creating} />
    </View>
  );
}
