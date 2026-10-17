import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ensureBusiness, updateBusiness } from '../db/repo';
import type { Business } from '../lib/types';
import { BRAND_COLORS, brandHex, isLogo } from '../lib/brand';
import { pickLogo } from '../lib/logo';
import { Button, Card, LinkButton, T } from '../components/ui';
import { color, font, radius, space } from '../theme';

// Your brand: logo and colour, with a live look at the top of an invoice.
export default function Brand() {
  const db = useSQLiteContext();
  const [b, setB] = useState<Business | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ensureBusiness(db).then(setB);
    }, [db]),
  );

  if (!b) return null;

  // Saved straight away: there is nothing to type here, so no Done button to forget.
  async function save(patch: Partial<Business>) {
    setB((prev) => (prev ? { ...prev, ...patch } : prev));
    await updateBusiness(db, b!.id, patch);
  }

  async function chooseLogo() {
    setBusy(true);
    try {
      const logo = await pickLogo();
      if (logo) await save({ logoData: logo });
    } catch (e) {
      Alert.alert('Could not use that picture', 'Try a PNG or JPG image.\n\n' + String(e));
    } finally {
      setBusy(false);
    }
  }

  function removeLogo() {
    Alert.alert('Remove logo?', 'Your invoices will show your business name only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => save({ logoData: '' }) },
    ]);
  }

  const hex = brandHex(b.brandColor);
  const hasLogo = isLogo(b.logoData);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}>
      <T variant="sub">Your logo and colour go on every invoice, quote, receipt and statement you send.</T>

      <Preview business={b} hex={hex} hasLogo={hasLogo} />

      <View style={{ gap: space.sm }}>
        <T variant="section" style={{ marginTop: 0, marginBottom: 0 }}>Logo</T>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.input, backgroundColor: color.muted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {hasLogo ? (
                <Image source={{ uri: b.logoData }} style={{ width: 56, height: 56 }} resizeMode="contain" accessibilityLabel="Your logo" />
              ) : (
                <T variant="sub">None</T>
              )}
            </View>
            <T variant="sub" style={{ flex: 1 }}>
              {hasLogo ? 'Shown at the top left of your invoices.' : 'A PNG with a clear background looks best. Square or wide both work.'}
            </T>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Button kind="secondary" label={hasLogo ? 'Change logo' : 'Add logo'} onPress={chooseLogo} busy={busy} />
          </View>
          {hasLogo ? (
            <View style={{ alignItems: 'center' }}>
              <LinkButton label="Remove logo" danger onPress={removeLogo} />
            </View>
          ) : null}
        </Card>
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="section" style={{ marginTop: 0, marginBottom: 0 }}>Colour</T>
        <Card style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {BRAND_COLORS.map((c) => {
              const on = c.hex === hex;
              return (
                <Pressable
                  key={c.name}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c.name}
                  onPress={() => save({ brandColor: c.value })}
                  style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? c.hex : 'transparent' }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.hex, alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Text style={{ color: color.onInk, fontFamily: font.semibold, fontSize: 18 }}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <T variant="sub">{BRAND_COLORS.find((c) => c.hex === hex)?.name}</T>
        </Card>
      </View>
    </ScrollView>
  );
}

// A small drawing of the top of an invoice, so changes show before anything is sent.
function Preview({ business: b, hex, hasLogo }: { business: Business; hex: string; hasLogo: boolean }) {
  const line = (w: number | `${number}%`) => <View style={{ height: 6, width: w, borderRadius: 3, backgroundColor: color.line }} />;
  return (
    <Card style={{ padding: space.lg, gap: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flex: 1, gap: 6 }}>
          {hasLogo ? <LogoImage uri={b.logoData} height={40} maxWidth={140} /> : null}
          <T style={{ fontFamily: font.semibold }} numberOfLines={1}>{b.name || 'Your business'}</T>
          {line('70%')}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontFamily: font.display, fontSize: 28, color: hex }}>Invoice</Text>
          <T variant="sub" style={{ fontFamily: font.mono }}>INV-0001</T>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ height: 2, backgroundColor: hex }} />
        {line('90%')}
        {line('60%')}
      </View>
      <View style={{ alignSelf: 'flex-end', width: '55%', borderTopWidth: 2, borderTopColor: hex, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={{ fontFamily: font.semibold }}>Total</T>
        <T variant="mono">₦180,000</T>
      </View>
    </Card>
  );
}

// The logo at a set height and its own width, so it lines up on the left like it does on the PDF.
function LogoImage({ uri, height, maxWidth }: { uri: string; height: number; maxWidth: number }) {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    Image.getSize(uri, (w, h) => h && setRatio(w / h), () => setRatio(1));
  }, [uri]);
  return <Image source={{ uri }} style={{ height, width: Math.min(maxWidth, height * ratio) }} resizeMode="contain" accessibilityLabel="Your logo" />;
}
