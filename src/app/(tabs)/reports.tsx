import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureBusiness, listDocuments, type DocListRow } from '../../db/repo';
import type { Business } from '../../lib/types';
import type { Currency } from '../../lib/format';
import { formatMoney } from '../../lib/format';
import { today } from '../../lib/dates';
import { currenciesUsed, moneyIn, outstanding, periodLabel, toCsv, type Period } from '../../lib/reports';
import { shareCsv } from '../../lib/share';
import { Card, Divider, ScreenTitle, Segmented, T } from '../../components/ui';
import { Icon } from '../../components/icons';
import { color, font, space } from '../../theme';

const CHART_HEIGHT = 96;

export default function Reports() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [business, setBusiness] = useState<Business | null>(null);
  const [docs, setDocs] = useState<DocListRow[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [currency, setCurrency] = useState<Currency | null>(null);

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

  const currencies = currenciesUsed(docs, business.defaultCurrency);
  const cur = currency && currencies.includes(currency) ? currency : currencies[0];
  const r = moneyIn(docs, cur, period);
  const owed = outstanding(docs, cur);
  const max = Math.max(1, ...r.bars.map((b) => b.kobo));
  const money = (k: number) => formatMoney(k, cur);

  async function exportCsv() {
    if (!docs.length) {
      Alert.alert('Nothing to export yet', 'Your invoices and quotes will be listed here once you make some.');
      return;
    }
    try {
      const ok = await shareCsv(`billr-${today()}.csv`, toCsv(docs));
      if (!ok) Alert.alert('Sharing is not available on this phone');
    } catch (e) {
      Alert.alert('Could not make the spreadsheet', String(e));
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md }}>
      <ScreenTitle
        title="Reports"
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Export a spreadsheet" onPress={exportCsv} hitSlop={8} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="download" />
          </Pressable>
        }
      />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ width: 230 }}>
          <Segmented
            options={[
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </View>
        {currencies.length > 1 ? (
          <View style={{ width: 96 }}>
            <Segmented options={currencies.map((c) => ({ value: c, label: c === 'NGN' ? '₦' : '$' }))} value={cur} onChange={setCurrency} />
          </View>
        ) : null}
      </View>

      <Card style={{ padding: space.lg }}>
        <T variant="label">MONEY IN · {periodLabel(period).toUpperCase()}</T>
        <T variant="display" style={{ fontSize: 44, lineHeight: 52 }} numberOfLines={1} adjustsFontSizeToFit>{money(r.totalKobo)}</T>
        <T variant="sub">
          {r.previousLabel}: {money(r.previousKobo)}
        </T>
        <View
          accessible
          accessibilityLabel={`Money in by ${period === 'month' ? 'week' : 'month'}: ${r.bars.map((b) => `${b.label} ${money(b.kobo)}`).join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: CHART_HEIGHT + 22, marginTop: space.lg }}
        >
          {r.bars.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
              <View
                style={{
                  width: '100%',
                  height: Math.max(2, Math.round((b.kobo / max) * CHART_HEIGHT)),
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  borderBottomLeftRadius: 2,
                  borderBottomRightRadius: 2,
                  backgroundColor: b.kobo === 0 ? color.line2 : b.current ? color.accent : color.ink,
                }}
              />
              <T style={{ fontSize: 10, lineHeight: 12, color: color.tx3 }} numberOfLines={1}>{b.label}</T>
            </View>
          ))}
        </View>
        {r.totalKobo === 0 ? (
          <T variant="sub" style={{ marginTop: space.sm }}>Invoices you mark as paid show up here.</T>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat label="PENDING" value={money(owed.pendingKobo)} />
        <Stat label="OVERDUE" value={money(owed.overdueKobo)} danger={owed.overdueKobo > 0} />
        <Stat label="DAYS TO PAY" value={r.avgDaysToPay === null ? '–' : r.avgDaysToPay === 0 ? 'Same day' : `${r.avgDaysToPay} avg`} />
      </View>

      <Card>
        <T variant="label" style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs }}>TOP CLIENTS</T>
        {r.topClients.length === 0 ? (
          <T variant="sub" style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>No paid invoices in this period yet.</T>
        ) : (
          r.topClients.map((c, i) => (
            <View key={c.name}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10 }}>
                <T style={{ flex: 1, fontFamily: font.medium }} numberOfLines={1}>{c.name}</T>
                <View style={{ width: 80, height: 6, borderRadius: 6, backgroundColor: color.line2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${Math.round((c.kobo / r.topClients[0].kobo) * 100)}%`, backgroundColor: color.ink }} />
                </View>
                <T variant="mono" style={{ minWidth: 92, textAlign: 'right' }} numberOfLines={1}>{money(c.kobo)}</T>
              </View>
            </View>
          ))
        )}
      </Card>

      <T variant="sub" style={{ textAlign: 'center' }}>
        An invoice counts as money in on the day you mark it paid.
      </T>
    </ScrollView>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <T variant="label" numberOfLines={1}>{label}</T>
      <T variant="mono" style={{ marginTop: 2, color: danger ? color.dueTx : color.tx }} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
    </Card>
  );
}
