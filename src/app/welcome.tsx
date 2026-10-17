import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBusiness } from '../db/repo';
import { Button, LinkButton, T } from '../components/ui';
import { useSync } from '../sync/SyncProvider';
import { color, font, space } from '../theme';

// First run. Home sends people here until the business has a name, and this sends them back once it has
// one, whether they typed it in or restored it from a backup.
export default function Welcome() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const backup = useSync();

  useFocusEffect(
    useCallback(() => {
      getBusiness(db).then((b) => {
        if (b?.name.trim()) router.replace('/');
      });
    }, [db]),
  );

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
