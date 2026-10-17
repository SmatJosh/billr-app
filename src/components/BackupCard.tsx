import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useSync } from '../sync/SyncProvider';
import { Button, Card, LinkButton, T } from './ui';
import { color, space } from '../theme';

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function BackupCard() {
  const s = useSync();

  if (s.status === 'unavailable') return null;

  if (s.status === 'signed-out') {
    return (
      <Card style={{ padding: space.lg, gap: space.md }}>
        <T style={{ color: color.tx2 }}>Your invoices are only on this phone. Sign in to keep a copy online and restore it on a new phone.</T>
        <Button label="Back up my invoices" onPress={() => router.push('/sign-in')} style={{ flex: 0 }} />
      </Card>
    );
  }

  const line =
    s.status === 'syncing'
      ? 'Backing up…'
      : s.status === 'offline'
        ? `Waiting for internet. ${s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} saved on this phone for now.` : ''}`
        : s.status === 'error'
          ? s.error ?? 'Backup failed. It will try again.'
          : s.pending
            ? `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to back up.`
            : `Backed up ${ago(s.lastSyncedAt)}.`;

  return (
    <Card style={{ padding: space.lg, gap: space.sm }}>
      <T style={{ fontWeight: '600' }}>{s.email}</T>
      <T style={{ color: s.status === 'error' ? color.dueTx : color.tx2 }} accessibilityLiveRegion="polite">{line}</T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <LinkButton label="Back up now" onPress={() => s.syncNow()} />
        <LinkButton
          label="Sign out"
          onPress={() =>
            Alert.alert('Sign out?', 'Your invoices stay on this phone. Backup stops until you sign in again.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', onPress: () => s.signOut() },
            ])
          }
        />
      </View>
    </Card>
  );
}
