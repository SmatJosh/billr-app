import { Pressable, Text, View } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Icon, type IconName } from '../../components/icons';
import { color, font } from '../../theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'quotes', title: 'Quotes', icon: 'quotes' },
  { name: 'clients', title: 'Clients', icon: 'clients' },
  { name: 'reports', title: 'Reports', icon: 'reports' },
  { name: 'more', title: 'More', icon: 'more' },
];

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.paper } }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
    </Tabs>
  );
}

// The design's bar: five equal tabs, the active icon on a saffron pill.
function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.line, paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, i) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const on = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.title}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, height: 72, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <View style={{ width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.accentTint : 'transparent' }}>
              <Icon name={tab.icon} tint={on ? color.ink : color.tx2} />
            </View>
            <Text style={{ fontSize: 12, fontFamily: on ? font.semibold : font.medium, color: on ? color.tx : color.tx2 }}>{tab.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
