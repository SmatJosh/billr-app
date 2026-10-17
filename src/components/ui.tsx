import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { color, font, radius, space, TOUCH } from '../theme';
import type { DocStatus, DocType } from '../lib/types';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from './icons';
import { today } from '../lib/dates';

export function T({ style, variant = 'body', ...rest }: TextProps & { variant?: 'body' | 'label' | 'sub' | 'title' | 'mono' | 'display' | 'section' }) {
  return <Text {...rest} style={[styles[variant], style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.line2 }} />;
}

type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  kind?: 'primary' | 'secondary';
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, kind = 'primary', busy, style, disabled, ...rest }: ButtonProps) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      {...rest}
      style={({ pressed }) => [
        styles.btn,
        primary ? { backgroundColor: pressed ? color.ink2 : color.ink } : styles.btn2,
        !primary && pressed && { backgroundColor: color.hover },
        (disabled || busy) && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? color.onInk : color.tx} />
      ) : (
        <Text style={[styles.btnText, { color: primary ? color.onInk : color.tx }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function LinkButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={styles.linkBtn}>
      <Text style={[styles.linkText, danger && { color: color.dueTx }]}>{label}</Text>
    </Pressable>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  mono?: boolean;
};

export function Row({ title, subtitle, value, onPress, left, right, mono }: RowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.hover }]}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.sub, mono && { fontFamily: font.mono }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {right}
    </Pressable>
  );
}

export function Avatar({ text }: { text: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={{ fontFamily: font.semibold, color: color.tx2, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

type FieldProps = TextInputProps & { label: string; help?: string; mono?: boolean; error?: string | null };

export function Field({ label, help, mono, error, style, multiline, ...rest }: FieldProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={color.tx3}
        aria-label={label}
        multiline={multiline}
        {...rest}
        style={[
          styles.input,
          mono && { fontFamily: font.mono },
          multiline && { height: undefined, minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
          error ? { borderColor: color.dueTx } : null,
          style,
        ]}
      />
      {error ? <Text style={[styles.help, { color: color.dueTx }]}>{error}</Text> : help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      style={[styles.chip, on && { backgroundColor: color.ink, borderColor: color.ink }]}
    >
      <Text style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 14, color: on ? color.onInk : color.tx }}>{label}</Text>
    </Pressable>
  );
}

// Filter chips in one line that scrolls sideways past the screen edge, instead of wrapping onto a second line.
// A fade at the cut edge shows there is more to swipe to; it goes away once the end is in view.
export function ChipRow({ children, label }: { children: ReactNode; label?: string }) {
  const [boxW, setBoxW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [x, setX] = useState(0);
  const moreRight = contentW - boxW - x > 4;
  const moreLeft = x > 4;
  return (
    <View style={{ marginHorizontal: -space.lg }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={label}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
        onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentW(w)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {moreLeft ? <EdgeFade side="left" /> : null}
      {moreRight ? <EdgeFade side="right" /> : null}
    </View>
  );
}

function EdgeFade({ side }: { side: 'left' | 'right' }) {
  const id = `fade-${side}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, width: 48, [side]: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === 'right' ? '0' : '1'} y1="0" x2={side === 'right' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={color.paper} stopOpacity={0} />
            <Stop offset="1" stopColor={color.paper} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// Sending on WhatsApp is how most clients get their bill, so it gets WhatsApp's own colour and logo.
export function WhatsAppButton({ onPress, busy, label = 'Send on WhatsApp' }: { onPress: () => void; busy?: boolean; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btn, { flex: 0, flexDirection: 'row', gap: 10, backgroundColor: color.whatsapp, opacity: pressed || busy ? 0.85 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={color.onInk} />
      ) : (
        <>
          <Icon name="whatsapp" size={22} tint={color.onInk} />
          <Text style={[styles.btnText, { color: color.onInk }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// A small figure card: coloured dot, label, amount in the display font. Used on Home and Reports.
export function StatTile({ label, value, dot, danger }: { label: string; value: string; dot?: string; danger?: boolean }) {
  return (
    <View style={[styles.card, { flex: 1, padding: space.md, borderColor: danger ? color.dueBg : color.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
        <Text style={[styles.label, { flexShrink: 1 }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.display, { fontSize: 26, lineHeight: 32, color: danger ? color.dueTx : color.tx }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, on && { backgroundColor: color.ink }]}
          >
            <Text style={{ fontFamily: on ? font.semibold : font.medium, color: on ? color.onInk : color.tx, fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type PillKind = DocStatus | 'overdue' | 'awaiting';

const STATUS: Record<PillKind, { label: string; bg: string; tx: string }> = {
  draft: { label: 'Draft', bg: color.muted, tx: color.tx2 },
  sent: { label: 'Sent', bg: color.accentSoft, tx: color.accentOnSoft },
  paid: { label: 'Paid', bg: color.paidBg, tx: color.paidTx },
  overdue: { label: 'Overdue', bg: color.dueBg, tx: color.dueTx },
  awaiting: { label: 'Awaiting reply', bg: color.partBg, tx: color.partTx },
  accepted: { label: 'Accepted', bg: color.paidBg, tx: color.paidTx },
  declined: { label: 'Declined', bg: color.muted, tx: color.tx2 },
  converted: { label: 'Converted', bg: color.paidBg, tx: color.paidTx },
};

// What a document's pill says: an unpaid invoice past its due date is overdue; a sent quote awaits a reply.
export function pillFor(d: { type: DocType; status: DocStatus; dueDate: string }, now: string = today()): PillKind {
  if (d.type === 'invoice') return d.status === 'sent' && d.dueDate < now ? 'overdue' : d.status;
  return d.status === 'sent' ? 'awaiting' : d.status;
}

export function StatusPill({ status, align = 'flex-end' }: { status: PillKind; align?: 'flex-start' | 'flex-end' }) {
  const s = STATUS[status];
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: align }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 12, color: s.tx }}>{s.label}</Text>
    </View>
  );
}

// The floating "+ New ..." button at the bottom right of a list.
// bottom: lift it above the phone's own buttons on screens that have no tab bar.
export function Fab({ label, onPress, busy, bottom = space.lg }: { label: string; onPress: () => void; busy?: boolean; bottom?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.lg,
        bottom,
        height: 56,
        paddingHorizontal: 20,
        borderRadius: radius.card,
        backgroundColor: pressed ? color.ink2 : color.ink,
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
      })}
    >
      <Text style={{ color: color.onInk, fontFamily: font.semibold, fontSize: 15 }}>+ {label}</Text>
    </Pressable>
  );
}

// The big serif title at the top of each tab, as in the design.
export function ScreenTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
      <Text style={[styles.display, { fontSize: 44, lineHeight: 50, flex: 1 }]} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

export function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Not saved. Tap to retry';
  return (
    <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.semibold, fontSize: 12, color: state === 'error' ? color.dueTx : state === 'saved' ? color.paidTx : color.tx3 }}>
      {state === 'saved' ? '✓ ' : ''}
      {label}
    </Text>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <Text style={[styles.display, { fontSize: 28, textAlign: 'center' }]}>{title}</Text>
      <Text style={[styles.sub, { textAlign: 'center', fontSize: 15 }]}>{body}</Text>
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  body: { fontFamily: font.regular, fontSize: 15, color: color.tx, lineHeight: 21 },
  label: { fontFamily: font.medium, fontSize: 12, color: color.tx3, letterSpacing: 0.3 },
  sub: { fontFamily: font.regular, fontSize: 13, color: color.tx3 },
  title: { fontFamily: font.semibold, fontSize: 20, color: color.tx },
  mono: { fontFamily: font.mono, fontSize: 15, color: color.tx },
  display: { fontFamily: font.display, fontSize: 40, color: color.tx, letterSpacing: -0.3 },
  section: { fontFamily: font.semibold, fontSize: 13, color: color.tx2, marginTop: 18, marginBottom: 8, marginHorizontal: 4 },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' },
  btn: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, flex: 1 },
  btn2: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.edge },
  btnText: { fontFamily: font.semibold, fontSize: 16 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontFamily: font.semibold, fontSize: 14, color: color.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: TOUCH + 8 },
  rowTitle: { fontFamily: font.semibold, fontSize: 15, color: color.tx },
  rowValue: { fontFamily: font.mono, fontSize: 14, color: color.tx },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.muted, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontFamily: font.medium, fontSize: 13, color: color.tx2 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: color.edge,
    borderRadius: radius.input,
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.tx,
  },
  help: { fontFamily: font.regular, fontSize: 13, color: color.tx3 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: color.edge, backgroundColor: color.surface, justifyContent: 'center' },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: color.edge, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: color.surface },
  segBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
