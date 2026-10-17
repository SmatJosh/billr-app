import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { migrate } from '../db/schema';
import { SyncProvider } from '../sync/SyncProvider';
import { color, font } from '../theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={color.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="billr.db" onInit={migrate}>
        <SyncProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.paper },
              headerShadowVisible: false,
              headerTintColor: color.tx,
              headerTitleStyle: { fontFamily: font.semibold, fontSize: 20 },
              contentStyle: { backgroundColor: color.paper },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="setup" options={{ title: 'Your business' }} />
            <Stack.Screen name="client/[id]" options={{ title: 'Client' }} />
            <Stack.Screen name="items" options={{ title: 'Items' }} />
            <Stack.Screen name="item/[id]" options={{ title: 'Item' }} />
            <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
            <Stack.Screen name="invoice/pick-client" options={{ title: 'Bill to', presentation: 'modal' }} />
            <Stack.Screen name="invoice/pick-item" options={{ title: 'Add item', presentation: 'modal' }} />
            <Stack.Screen name="sign-in" options={{ title: '' }} />
          </Stack>
        </SyncProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
