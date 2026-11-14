import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { MOODS, type MoodLevel } from '@careping/shared';

const INK = '#3A2E2A';
const TEAR = '#7FCBFF';
const line = (w = 1.7) => ({ stroke: INK, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' });

const Blush = ({ o = 0.6 }: { o?: number }) => (
  <>
    <Ellipse cx={10.5} cy={24.6} rx={3.4} ry={2} fill="#FF8FA3" fillOpacity={o} />
    <Ellipse cx={29.5} cy={24.6} rx={3.4} ry={2} fill="#FF8FA3" fillOpacity={o} />
  </>
);

const Eyes = ({ y = 20 }: { y?: number }) => (
  <>
    <Ellipse cx={14.6} cy={y} rx={2} ry={2.5} fill={INK} />
    <Ellipse cx={25.4} cy={y} rx={2} ry={2.5} fill={INK} />
    <Circle cx={15.3} cy={y - 1} r={0.8} fill="#FFFFFF" />
    <Circle cx={26.1} cy={y - 1} r={0.8} fill="#FFFFFF" />
  </>
);

/** ไอคอนอารมณ์ของ CarePing (ตรงกับ component "Mood icon" ใน Figma) */
export function MoodIcon({ level, size = 32 }: { level: MoodLevel; size?: number }) {
  const color = MOODS.find((m) => m.level === level)?.color ?? '#ccc';
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M20 6C29.6 6 36 12.4 36 21C36 29.8 29.4 35.5 20 35.5C10.6 35.5 4 29.8 4 21C4 12.4 10.4 6 20 6Z" fill={color} />
      <Ellipse cx={12.5} cy={12.5} rx={4} ry={2.3} fill="#FFFFFF" fillOpacity={0.55} transform="rotate(-30 12.5 12.5)" />
      <Circle cx={17.6} cy={9.6} r={1} fill="#FFFFFF" fillOpacity={0.55} />
      {level === 5 ? (
        <>
          <Blush o={0.7} />
          <Path d="M12.4 20.6 Q14.6 17.6 16.8 20.6" {...line(1.9)} />
          <Path d="M23.2 20.6 Q25.4 17.6 27.6 20.6" {...line(1.9)} />
          <Path d="M16.8 23.6 Q20 28.6 23.2 23.6 Z" fill={INK} />
          <Path d="M18.4 25.9 Q20 27.4 21.6 25.9" stroke="#FF7A8A" strokeWidth={1.6} strokeLinecap="round" fill="none" />
          <Path d="M33.5 9.5 l0.6 1.4 l1.4 0.6 l-1.4 0.6 l-0.6 1.4 l-0.6 -1.4 l-1.4 -0.6 l1.4 -0.6 Z" fill="#FFFFFF" />
        </>
      ) : level === 4 ? (
        <>
          <Blush />
          <Eyes />
          <Path d="M17.4 24 Q18.7 25.9 20 24 Q21.3 25.9 22.6 24" {...line()} />
        </>
      ) : level === 3 ? (
        <>
          <Blush o={0.5} />
          <Eyes />
          <Path d="M18.2 25 H21.8" {...line()} />
        </>
      ) : level === 2 ? (
        <>
          <Blush o={0.5} />
          <Eyes y={20.4} />
          <Path d="M17.8 26 Q20 24.2 22.2 26" {...line()} />
          <Path d="M31.2 13.2 Q32.8 15.6 31.2 16.8 Q29.6 15.6 31.2 13.2 Z" fill={TEAR} />
        </>
      ) : (
        <>
          <Path d="M12.6 16.4 L16.2 15.2" {...line(1.5)} />
          <Path d="M27.4 16.4 L23.8 15.2" {...line(1.5)} />
          <Ellipse cx={14.6} cy={20.6} rx={2.1} ry={2.6} fill={INK} />
          <Ellipse cx={25.4} cy={20.6} rx={2.1} ry={2.6} fill={INK} />
          <Circle cx={15.4} cy={19.5} r={0.9} fill="#FFFFFF" />
          <Circle cx={26.2} cy={19.5} r={0.9} fill="#FFFFFF" />
          <Path d="M17.6 26.6 Q20 24.4 22.4 26.6" {...line()} />
          <Path d="M13.4 23.4 Q12.6 26.4 13.6 28.6" stroke={TEAR} strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <Path d="M26.6 23.4 Q27.4 26.4 26.4 28.6" stroke={TEAR} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        </>
      )}
    </Svg>
  );
}
