import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ensureBusiness, updateBusiness } from '../db/repo';
import type { Business } from '../lib/types';
import { useAutosave } from '../lib/useAutosave';
import { Button, Card, Field, SaveState, Segmented, T } from '../components/ui';
import { BackupCard } from '../components/BackupCard';
import { color, space } from '../theme';

export default function Setup() {
  const db = useSQLiteContext();
  const [b, setB] = useState<Business | null>(null);
  const autosave = useAutosave<Business>(async (patch) => {
    if (b) await updateBusiness(db, b.id, patch);
  });

  useEffect(() => {
    ensureBusiness(db).then(setB);
  }, [db]);

  if (!b) return null;

  function set<K extends keyof Business>(key: K, value: Business[K]) {
    setB((prev) => (prev ? { ...prev, [key]: value } : prev));
    autosave.change({ [key]: value } as Partial<Business>);
  }

  const accountError = b.paymentAccountNumber && !/^\d{10}$/.test(b.paymentAccountNumber.replace(/\s/g, '')) ? 'Nigerian account numbers have 10 digits' : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={autosave.flush} hitSlop={8} accessibilityRole="button">
              <SaveState state={autosave.status} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <T variant="sub" style={{ fontSize: 14 }}>This shows on every invoice you send. It saves as you type.</T>

        <Field label="Business name" value={b.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Adaeze Couture" autoCapitalize="words" />
        <Field label="Your name" value={b.ownerName} onChangeText={(v) => set('ownerName', v)} autoCapitalize="words" />
        <Field label="Phone" value={b.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" mono placeholder="0803 000 0000" />
        <Field label="Email (optional)" value={b.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Address (optional)" value={b.address} onChangeText={(v) => set('address', v)} multiline />
        <Field label="TIN (optional)" value={b.taxId} onChangeText={(v) => set('taxId', v)} mono />

        <T variant="section">Payment details</T>
        <T variant="sub" style={{ marginTop: -8 }}>Most clients pay by transfer. These go on every invoice, free.</T>
        <Field label="Bank" value={b.paymentBankName} onChangeText={(v) => set('paymentBankName', v)} placeholder="e.g. GTBank" autoCapitalize="words" />
        <Field
          label="Account number"
          value={b.paymentAccountNumber}
          onChangeText={(v) => set('paymentAccountNumber', v.replace(/[^\d]/g, '').slice(0, 10))}
          keyboardType="number-pad"
          mono
          maxLength={10}
          error={accountError}
        />
        <Field label="Account name" value={b.paymentAccountName} onChangeText={(v) => set('paymentAccountName', v)} autoCapitalize="words" />

        <T variant="section">Defaults for new invoices</T>
        <Card style={{ padding: space.lg, gap: space.lg }}>
          <View style={{ gap: 6 }}>
            <T variant="label">CURRENCY</T>
            <Segmented
              options={[
                { value: 'NGN', label: 'Naira ₦' },
                { value: 'USD', label: 'US dollar $' },
              ]}
              value={b.defaultCurrency}
              onChange={(v) => set('defaultCurrency', v)}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Add VAT (7.5%)</T>
              <T variant="sub">Only if you are VAT-registered</T>
            </View>
            <Switch
              value={b.vatDefault}
              onValueChange={(v) => set('vatDefault', v)}
              trackColor={{ true: color.ink, false: color.edge }}
              thumbColor={color.surface}
              accessibilityLabel="Add VAT by default"
            />
          </View>
        </Card>
        <Field
          label="Default notes and terms (optional)"
          value={b.defaultNotes}
          onChangeText={(v) => set('defaultNotes', v)}
          multiline
          placeholder="e.g. 50% deposit before work starts. Balance on pickup."
        />

        {b.name.trim() ? (
          <>
            <T variant="section">Backup</T>
            <BackupCard />
          </>
        ) : null}

        <Button
          label="Done"
          onPress={async () => {
            await autosave.flush();
            router.back();
          }}
          disabled={!b.name.trim()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
