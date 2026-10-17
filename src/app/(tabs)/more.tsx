import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ensureBusiness, listItems } from '../../db/repo';
import type { Business } from '../../lib/types';
import { Card, Divider, ScreenTitle, T } from '../../components/ui';
import { BackupCard } from '../../components/BackupCard';
import { Icon, type IconName } from '../../components/icons';
import { color, font, radius, space } from '../../theme';

export default function More() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [business, setBusiness] = useState<Business | null>(null);
  const [itemCount, setItemCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const b = await ensureBusiness(db);
        setBusiness(b);
        setItemCount((await listItems(db, b.id)).length);
      })();
    }, [db]),
  );

  if (!business) return <View style={{ flex: 1, backgroundColor: color.paper }} />;

  const bank = business.paymentAccountNumber
    ? `${business.paymentBankName || 'Bank'} ••${business.paymentAccountNumber.slice(-4)}`
    : 'Not added';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.paper }} contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: space.xl }}>
      <ScreenTitle title="More" />

      <Pressable accessibilityRole="button" onPress={() => router.push('/setup')} style={{ marginTop: space.lg }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.lg }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.displayItalic, color: color.onInk, fontSize: 26, lineHeight: 32 }}>{business.name.trim()[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{business.name}</T>
            {business.phone ? <T variant="sub" style={{ fontFamily: font.mono }}>{business.phone}</T> : null}
          </View>
          <Icon name="chevron" size={20} tint={color.tx3} />
        </Card>
      </Pressable>

      <T variant="section">Your business</T>
      <Card>
        <MenuRow icon="business" title="Business profile and payment details" value={bank} onPress={() => router.push('/setup')} />
        <Divider />
        <MenuRow icon="items" title="Items" value={itemCount ? `${itemCount} saved` : undefined} onPress={() => router.push('/items')} />
      </Card>

      <T variant="section">Backup</T>
      <BackupCard />

      <T variant="sub" style={{ textAlign: 'center', marginTop: space.xl }}>Billr has no ads on any plan.</T>
    </ScrollView>
  );
}

function MenuRow({ icon, title, value, onPress }: { icon: IconName; title: string; value?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: 12, backgroundColor: pressed ? color.hover : 'transparent', borderRadius: radius.card })}
    >
      <Icon name={icon} />
      <T style={{ flex: 1 }} numberOfLines={2}>{title}</T>
      {value ? <T variant="sub" style={{ fontFamily: font.mono }}>{value}</T> : null}
      <Icon name="chevron" size={20} tint={color.tx3} />
    </Pressable>
  );
}
