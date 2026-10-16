import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Field, LinkButton, T } from '../components/ui';
import { useSync } from '../sync/SyncProvider';
import { color, space } from '../theme';

function friendly(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/expired|invalid/i.test(msg)) return 'That code is wrong or has expired. Use the newest email, or send a new code.';
  if (/rate limit|too many|seconds/i.test(msg)) return 'Too many codes sent. Wait a few minutes, then try again.';
  if (/network|fetch/i.test(msg)) return 'No internet connection. Connect and try again.';
  return msg;
}

export default function SignIn() {
  const { restore } = useLocalSearchParams<{ restore?: string }>();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  async function send() {
    if (!emailOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sync.sendCode(cleanEmail);
      setStep('code');
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (token.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sync.verifyCode(cleanEmail, token);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  }

  if (sync.status === 'unavailable') {
    return (
      <View style={{ flex: 1, padding: space.lg, gap: space.md }}>
        <T variant="title">Backup is not switched on yet</T>
        <T style={{ color: color.tx2 }}>This version of Billr was built without a backup server. Your invoices are still saved on this phone.</T>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <T variant="display" style={{ fontSize: 36, lineHeight: 40 }}>{restore ? 'Restore your invoices' : 'Back up your invoices'}</T>
        {step === 'email' ? (
          <>
            <T style={{ color: color.tx2 }}>
              Sign in with your email and we’ll send you a code. Your business, clients and invoices are then kept online, so they come back if you change or lose your phone.
            </T>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              returnKeyType="send"
              onSubmitEditing={send}
              error={error}
            />
            <Button label="Send code" onPress={send} busy={busy} disabled={!emailOk} style={{ flex: 0 }} />
          </>
        ) : (
          <>
            <T style={{ color: color.tx2 }}>
              Enter the code we sent to <T style={{ fontWeight: '600' }}>{cleanEmail}</T>. Check spam if it is not in your inbox.
            </T>
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
              mono
              placeholder="123456"
              returnKeyType="done"
              onSubmitEditing={verify}
              error={error}
            />
            <Button label="Sign in" onPress={verify} busy={busy} disabled={code.length < 6} style={{ flex: 0 }} />
            {busy ? <T variant="sub">Signing in and bringing your invoices up to date…</T> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <LinkButton label="Use another email" onPress={() => { setStep('email'); setCode(''); setError(null); }} />
              <LinkButton label="Send a new code" onPress={send} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
