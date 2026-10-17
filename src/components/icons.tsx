import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme';

// Line icons from the design canvas: 24 px box, 1.75 stroke, round ends.
export type IconName = 'home' | 'quotes' | 'clients' | 'reports' | 'more' | 'download' | 'chevron' | 'business' | 'items' | 'cloud';

export function Icon({ name, size = 24, tint = color.tx }: { name: IconName; size?: number; tint?: string }) {
  const p = { stroke: tint, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
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
      {name === 'cloud' ? <Path {...p} d="M20 11a8 8 0 0 0-14.7-4.3L3 9M4 13a8 8 0 0 0 14.7 4.3L21 15M3 4v5h5M21 20v-5h-5" /> : null}
    </Svg>
  );
}
