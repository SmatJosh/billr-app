import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteItem, getItem, updateItem } from '../../db/repo';
import type { Item } from '../../lib/types';
import { koboToInput } from '../../lib/format';
import { parseNairaToKobo } from '../../lib/money';
import { useAutosave } from '../../lib/useAutosave';
import { Button, Field, LinkButton, SaveState } from '../../components/ui';
import { space } from '../../theme';

export default function ItemScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [priceText, setPriceText] = useState('');
  const autosave = useAutosave<Item>(async (patch) => {
    if (item) await updateItem(db, item.id, patch);
  });

  useEffect(() => {
    getItem(db, Number(id)).then((i) => {
      setItem(i);
      if (i) setPriceText(koboToInput(i.defaultPriceKobo));
    });
  }, [db, id]);

  if (!item) return null;

  function set<K extends keyof Item>(key: K, value: Item[K]) {
    setItem((prev) => (prev ? { ...prev, [key]: value } : prev));
    autosave.change({ [key]: value } as Partial<Item>);
  }

  const parsed = priceText.trim() ? parseNairaToKobo(priceText) : 0;

  function remove() {
    Alert.alert('Delete item?', 'Invoices that already use it keep their lines.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteItem(db, item!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: item.name || 'New item',
          headerRight: () => (
            <Pressable onPress={autosave.flush} hitSlop={8} accessibilityRole="button">
              <SaveState state={autosave.status} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={item.name} onChangeText={(v) => set('name', v)} autoFocus={!item.name} placeholder="e.g. Agbada set" />
        <Field label="Details (optional)" value={item.details} onChangeText={(v) => set('details', v)} />
        <Field
          label="Price (₦)"
          value={priceText}
          onChangeText={(v) => {
            setPriceText(v);
            const k = v.trim() ? parseNairaToKobo(v) : 0;
            if (k !== null) set('defaultPriceKobo', k);
          }}
          keyboardType="decimal-pad"
          mono
          help="You can type 20k for ₦20,000"
          error={parsed === null ? 'Enter an amount like 45,000 or 20k' : null}
        />
        <View style={{ flexDirection: 'row' }}>
          <Button
            label="Done"
            onPress={async () => {
              await autosave.flush();
              router.back();
            }}
            disabled={!item.name.trim()}
          />
        </View>
        <View style={{ alignItems: 'center' }}>
          <LinkButton label="Delete item" danger onPress={remove} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
