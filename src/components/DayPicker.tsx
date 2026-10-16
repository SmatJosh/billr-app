import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDay, parseDay, toDay } from '../lib/dates';
import { color, font } from '../theme';

type Props = { label: string; value: string; onChange: (day: string) => void; display?: string };

// Android-first: opens the system date dialog. iOS falls back to the compact inline picker.
export function DayPicker({ label, value, onChange, display }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 12, color: color.tx3 }}>{label.toUpperCase()}</Text>
        <DateTimePicker value={parseDay(value)} mode="date" display="compact" onChange={(_, d) => d && onChange(toDay(d))} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${display ?? formatDay(value)}. Change`}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: parseDay(value),
          mode: 'date',
          onChange: (e, d) => {
            if (e.type === 'set' && d) onChange(toDay(d));
          },
        })
      }
      style={{ minHeight: 48, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: font.medium, fontSize: 12, color: color.tx3 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 15, color: color.tx, marginTop: 2 }}>{display ?? formatDay(value)}</Text>
    </Pressable>
  );
}
