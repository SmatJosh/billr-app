import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { DocListRow } from '../db/repo';
import { formatMoney, formatMoneyShort, initials } from '../lib/format';
import { formatDayShort } from '../lib/dates';
import { Avatar, Card, pillFor, StatusPill, T } from './ui';
import { font, space } from '../theme';

function detail(d: DocListRow): string {
  if (d.type === 'invoice' && d.status === 'sent' && d.paidKobo > 0) return `${formatMoneyShort(d.totalKobo - d.paidKobo, d.currency)} left`;
  if (d.type === 'invoice') return d.termsDays === 0 && d.status !== 'paid' ? 'due on receipt' : `due ${formatDayShort(d.dueDate)}`;
  // The number already says QUO or PRO; spell out proforma, which fewer people know by its prefix.
  if (d.type === 'quote') return d.status === 'converted' ? 'quote' : `until ${formatDayShort(d.dueDate)}`;
  return d.status === 'converted' ? 'proforma' : `proforma · due ${formatDayShort(d.dueDate)}`;
}

// One invoice, quote or proforma in a list. Tapping opens it in the editor.
export function DocRow({ d }: { d: DocListRow }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/invoice/${d.id}`)}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }}>
        <Avatar text={initials(d.clientName ?? '')} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{d.clientName || 'No client yet'}</T>
          <T variant="sub" numberOfLines={1}>
            <Text style={{ fontFamily: font.mono }}>{d.number}</Text> · {detail(d)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <T variant="mono">{formatMoney(d.totalKobo, d.currency)}</T>
          <StatusPill status={pillFor(d)} />
        </View>
      </Card>
    </Pressable>
  );
}
