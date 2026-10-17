import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme';

// Line icons from the design canvas: 24 px box, 1.75 stroke, round ends.
export type IconName = 'bank' | 'whatsapp' | 'home' | 'quotes' | 'clients' | 'reports' | 'more' | 'download' | 'chevron' | 'business' | 'items' | 'cloud' | 'info' | 'close' | 'brand';

// filled: solid version of the five tab icons, for the open tab. cut is the colour behind it, used for the
// small gaps that keep a solid shape readable.
export function Icon({ name, size = 24, tint = color.tx, filled, cut = color.accentTint }: { name: IconName; size?: number; tint?: string; filled?: boolean; cut?: string }) {
  const p = { stroke: tint, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  if (filled) {
    const f = { ...p, fill: tint };
    const solid = (
      <>
        {name === 'home' ? <Path {...f} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> : null}
        {name === 'quotes' ? (
          <>
            <Rect {...f} x={4} y={5} width={16} height={17} rx={2} />
            <Rect {...f} stroke={cut} strokeWidth={2} x={8} y={2.5} width={8} height={5} rx={1.5} />
            <Path stroke={cut} strokeWidth={1.75} strokeLinecap="round" d="M8 12h8M8 16h5" />
          </>
        ) : null}
        {name === 'clients' ? (
          <>
            <Circle {...f} cx={9} cy={8} r={4} />
            <Path {...f} d="M2 21a7 7 0 0 1 14 0z" />
            <Path {...p} d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" />
          </>
        ) : null}
        {name === 'reports' ? (
          <>
            <Path {...p} d="M3 20h18" />
            <Rect fill={tint} x={4.5} y={10} width={3.5} height={7} rx={1} />
            <Rect fill={tint} x={10.25} y={5} width={3.5} height={12} rx={1} />
            <Rect fill={tint} x={16} y={7.5} width={3.5} height={9.5} rx={1} />
          </>
        ) : null}
        {name === 'more' ? (
          <>
            <Rect {...f} x={4} y={4} width={6} height={6} rx={1.5} />
            <Rect {...f} x={14} y={4} width={6} height={6} rx={1.5} />
            <Rect {...f} x={4} y={14} width={6} height={6} rx={1.5} />
            <Rect {...f} x={14} y={14} width={6} height={6} rx={1.5} />
          </>
        ) : null}
      </>
    );
    if (['home', 'quotes', 'clients', 'reports', 'more'].includes(name)) {
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {solid}
        </Svg>
      );
    }
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'whatsapp' ? (
        <Path
          fill={tint}
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
        />
      ) : null}
      {name === 'bank' ? <Path {...p} d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" /> : null}
      {name === 'home' ? <Path {...p} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> : null}
      {name === 'quotes' ? (
        <>
          <Rect {...p} x={8} y={3} width={8} height={4} rx={1} />
          <Path {...p} d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        </>
      ) : null}
      {name === 'clients' ? (
        <>
          <Circle {...p} cx={9} cy={8} r={4} />
          <Path {...p} d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" />
        </>
      ) : null}
      {name === 'reports' ? <Path {...p} d="M3 20h18M6 16v-5M11 16V6M16 16v-8" /> : null}
      {name === 'more' ? (
        <>
          <Rect {...p} x={4} y={4} width={6} height={6} rx={1.5} />
          <Rect {...p} x={14} y={4} width={6} height={6} rx={1.5} />
          <Rect {...p} x={4} y={14} width={6} height={6} rx={1.5} />
          <Rect {...p} x={14} y={14} width={6} height={6} rx={1.5} />
        </>
      ) : null}
      {name === 'download' ? <Path {...p} d="M12 4v11M7 10l5 5 5-5M5 20h14" /> : null}
      {name === 'chevron' ? <Path {...p} d="M9 6l6 6-6 6" /> : null}
      {name === 'business' ? <Path {...p} d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h3a1 1 0 0 1 1 1v11M3 21h18M8 7h4M8 11h4M8 15h4" /> : null}
      {name === 'items' ? (
        <>
          <Path {...p} d="M21 8l-9-5-9 5 9 5z" />
          <Path {...p} d="M3 8v8l9 5 9-5V8M12 13v8" />
        </>
      ) : null}
      {name === 'info' ? (
        <>
          <Circle {...p} cx={12} cy={12} r={9} />
          <Path {...p} d="M12 11v5M12 8h.01" />
        </>
      ) : null}
      {name === 'brand' ? (
        <>
          <Path {...p} d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.2-4-7.7-9-7.7z" />
          <Circle {...p} cx={7.5} cy={11} r={1} />
          <Circle {...p} cx={10} cy={7} r={1} />
          <Circle {...p} cx={15} cy={7.5} r={1} />
        </>
      ) : null}
      {name === 'close' ? <Path {...p} d="M6 6l12 12M18 6L6 18" /> : null}
      {name === 'cloud' ? <Path {...p} d="M20 11a8 8 0 0 0-14.7-4.3L3 9M4 13a8 8 0 0 0 14.7 4.3L21 15M3 4v5h5M21 20v-5h-5" /> : null}
    </Svg>
  );
}
