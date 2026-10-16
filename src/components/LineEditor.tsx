import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteLine, updateLine } from '../db/repo';
import type { Currency } from '../lib/format';
import { formatMoney, formatQuantity, koboToInput } from '../lib/format';
import { lineTotalKobo, parseNairaToKobo, parseQuantity } from '../lib/money';
import type { DocumentLine } from '../lib/types';
import { useAutosave } from '../lib/useAutosave';
import { styles as ui } from './ui';
import { color, font, space } from '../theme';

type Props = {
  line: DocumentLine;
  currency: Currency;
  onLocalChange: (line: DocumentLine) => void;
  onRemoved: (id: number) => void;
  onSaveStatus: (s: ReturnType<typeof useAutosave>['status']) => void;
};

export function LineEditor({ line, currency, onLocalChange, onRemoved, onSaveStatus }: Props) {
  const db = useSQLiteContext();
  const [qtyText, setQtyText] = useState(formatQuantity(line.quantity));
  const [priceText, setPriceText] = useState(koboToInput(line.unitPriceKobo));
  const autosave = useAutosave<DocumentLine>(async (patch) => {
    await updateLine(db, line, patch);
    onSaveStatus('saved');
  });

  function change(patch: Partial<DocumentLine>) {
    onLocalChange({ ...line, ...patch });
    onSaveStatus('saving');
    autosave.change(patch);
  }

  const qtyOk = parseQuantity(qtyText) !== null;
  const priceOk = priceText.trim() === '' || parseNairaToKobo(priceText) !== null;

  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TextInput
          value={line.description}
          onChangeText={(v) => change({ description: v })}
          placeholder="What is it for?"
          placeholderTextColor={color.tx3}
          accessibilityLabel="Item description"
          style={[ui.input, { flex: 1, fontFamily: font.semibold }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.description || 'item'}`}
          hitSlop={4}
          onPress={async () => {
            await deleteLine(db, line);
            onRemoved(line.id);
          }}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 22, color: color.tx3 }}>×</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <TextInput
          value={qtyText}
          onChangeText={(v) => {
            setQtyText(v);
            const q = parseQuantity(v);
            if (q !== null) change({ quantity: q });
          }}
          keyboardType="decimal-pad"
          accessibilityLabel="Quantity"
          style={[ui.input, { width: 72, fontFamily: font.mono, textAlign: 'center' }, !qtyOk && { borderColor: color.dueTx }]}
        />
        <Text style={{ color: color.tx3 }}>×</Text>
        <TextInput
          value={priceText}
          onChangeText={(v) => {
            setPriceText(v);
            const k = v.trim() === '' ? 0 : parseNairaToKobo(v);
            if (k !== null) change({ unitPriceKobo: k });
          }}
          placeholder="Price"
          placeholderTextColor={color.tx3}
          keyboardType="decimal-pad"
          accessibilityLabel="Price"
          style={[ui.input, { flex: 1, minWidth: 0, fontFamily: font.mono }, !priceOk && { borderColor: color.dueTx }]}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={ui.sub}>{!qtyOk ? 'Quantity must be a number' : !priceOk ? 'Enter a price like 45,000 or 20k' : 'Line total'}</Text>
        <Text style={{ fontFamily: font.monoMedium, fontSize: 15, color: color.tx }}>{formatMoney(lineTotalKobo(line), currency)}</Text>
      </View>
    </View>
  );
}
