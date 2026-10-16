import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDocument, ensureBusiness, listDocuments, type DocListRow } from '../db/repo';
import type { Business } from '../lib/types';
import { formatMoney } from '../lib/format';
import { formatDay, isOverdue } from '../lib/dates';
import { Avatar, Button, Card, Chip, Empty, LinkButton, StatusPill, T } from '../components/ui';
import { useSync } from '../sync/SyncProvider';
import { initials } from '../lib/format';
import { color, font, radius, space } from '../theme';

type Filter = 'all' | 'unpaid' | 'draft';

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

  if (!business.name.trim()) {
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, paddingTop: insets.top + 48, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg }}>
        <T variant="display" style={{ fontSize: 56, lineHeight: 60 }}>
          Bill like <Text style={{ fontFamily: font.displayItalic }}>a pro</Text>
        </T>
        <T style={{ marginTop: space.md, color: color.tx2, fontSize: 17, lineHeight: 24 }}>
          Make invoices your clients take seriously, with your bank details on every one. Works without data. No ads, ever.
        </T>
        <View style={{ flex: 1 }} />
        <Button label="Set up your business" onPress={() => router.push('/setup')} style={{ flex: 0 }} />
        {backup.status !== 'unavailable' ? (
          <View style={{ alignItems: 'center', marginTop: space.sm }}>
            <LinkButton label="Used Billr before? Restore your invoices" onPress={() => router.push('/sign-in?restore=1')} />
          </View>
        ) : null}
      </View>
    );
  }

  const unpaid = docs.filter((d) => d.type === 'invoice' && d.status === 'sent');
  const unpaidTotal = unpaid.reduce((s, d) => s + d.totalKobo, 0);
  const overdueCount = unpaid.filter((d) => isOverdue(d.dueDate)).length;
  const shown = docs.filter((d) => (filter === 'all' ? true : filter === 'unpaid' ? d.status === 'sent' : d.status === 'draft'));

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
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: 160 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
              <T variant="title" numberOfLines={1} style={{ flex: 1 }}>{business.name}</T>
              <Pressable accessibilityRole="button" onPress={() => router.push('/setup')} hitSlop={8} style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semibold, color: color.accent, fontSize: 14 }}>Business</Text>
              </Pressable>
            </View>

            <Card style={{ padding: space.lg, marginTop: space.sm }}>
              <T variant="label">WAITING TO BE PAID</T>
              <T variant="display" style={{ marginTop: 2 }}>{formatMoney(unpaidTotal, business.defaultCurrency)}</T>
              <T variant="sub">
                {unpaid.length} unpaid {unpaid.length === 1 ? 'invoice' : 'invoices'}
                {overdueCount ? ` · ${overdueCount} overdue` : ''}
              </T>
            </Card>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <Button kind="secondary" label="Clients" onPress={() => router.push('/clients')} />
              <Button kind="secondary" label="Items" onPress={() => router.push('/items')} />
            </View>

            {backup.status === 'signed-out' && docs.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/sign-in')} style={{ minHeight: 48, justifyContent: 'center', marginTop: space.sm }}>
                <T variant="sub">
                  Only saved on this phone. <Text style={{ fontFamily: font.semibold, color: color.accent }}>Back up</Text>
                </T>
              </Pressable>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl, marginBottom: space.md }}>
              <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Unpaid" on={filter === 'unpaid'} onPress={() => setFilter('unpaid')} />
              <Chip label="Drafts" on={filter === 'draft'} onPress={() => setFilter('draft')} />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <Empty
            title={docs.length ? 'Nothing here' : 'No invoices yet'}
            body={docs.length ? 'Try another filter.' : 'Your first invoice takes about a minute. It saves as you type.'}
          />
        }
        renderItem={({ item: d }) => {
          const overdue = d.status === 'sent' && isOverdue(d.dueDate);
          return (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/invoice/${d.id}`)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
                <Avatar text={initials(d.clientName ?? '')} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{d.clientName || 'No client yet'}</T>
                  <T variant="sub">
                    <Text style={{ fontFamily: font.mono }}>{d.number}</Text> · due {formatDay(d.dueDate)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T variant="mono">{formatMoney(d.totalKobo, d.currency)}</T>
                  <StatusPill status={overdue ? 'overdue' : d.status} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New invoice"
        onPress={newInvoice}
        style={({ pressed }) => ({
          position: 'absolute',
          right: space.lg,
          bottom: insets.bottom + space.xl,
          height: 56,
          paddingHorizontal: 20,
          borderRadius: radius.card,
          backgroundColor: pressed ? color.ink2 : color.ink,
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        })}
      >
        <Text style={{ color: color.onInk, fontFamily: font.semibold, fontSize: 15 }}>+ New invoice</Text>
      </Pressable>
    </View>
  );
}
