import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteClient, getClient, updateClient } from '../../db/repo';
import type { Client } from '../../lib/types';
import { useAutosave } from '../../lib/useAutosave';
import { Button, Field, LinkButton, SaveState } from '../../components/ui';
import { space } from '../../theme';

export default function ClientScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Client | null>(null);
  const autosave = useAutosave<Client>(async (patch) => {
    if (c) await updateClient(db, c.id, patch);
  });

  useEffect(() => {
    getClient(db, Number(id)).then(setC);
  }, [db, id]);

  if (!c) return null;

  function set<K extends keyof Client>(key: K, value: Client[K]) {
    setC((prev) => (prev ? { ...prev, [key]: value } : prev));
    autosave.change({ [key]: value } as Partial<Client>);
  }

  function remove() {
    Alert.alert('Delete client?', 'Their invoices stay, without a client name.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteClient(db, c!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: c.name || 'New client',
          headerRight: () => (
            <Pressable onPress={autosave.flush} hitSlop={8} accessibilityRole="button">
              <SaveState state={autosave.status} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={c.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" autoFocus={!c.name} />
        <Field label="Phone" value={c.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" mono help="Used to send on WhatsApp" />
        <Field label="Email (optional)" value={c.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Address (optional)" value={c.address} onChangeText={(v) => set('address', v)} multiline />
        <Field label="Private notes (optional)" value={c.notes} onChangeText={(v) => set('notes', v)} multiline help="Only you see these" />
        <View style={{ flexDirection: 'row' }}>
          <Button
            label="Done"
            onPress={async () => {
              await autosave.flush();
              router.back();
            }}
            disabled={!c.name.trim()}
          />
        </View>
        <View style={{ alignItems: 'center' }}>
          <LinkButton label="Delete client" danger onPress={remove} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
