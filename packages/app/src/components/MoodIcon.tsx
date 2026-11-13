import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { MOODS, type MoodLevel } from '@careping/shared';

const INK = '#3A2E2A';
const stroke = { stroke: INK, strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };

/** ไอคอนอารมณ์ของ CarePing (ตรงกับ component "Mood icon" ใน Figma) */
export function MoodIcon({ level, size = 32 }: { level: MoodLevel; size?: number }) {
  const color = MOODS.find((m) => m.level === level)?.color ?? '#ccc';
  const blush = level !== 1;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M21 4C31 4.5 37 11 36.5 21C36 31 30 36.5 20 36C9.5 35.5 3.5 29.5 4 19.5C4.5 9.5 11 3.5 21 4Z" fill={color} />
      <Ellipse cx={13} cy={11} rx={4.2} ry={2.4} fill="#FFFFFF" fillOpacity={0.5} transform="rotate(-28 13 11)" />
      {blush ? (
        <>
          <Ellipse cx={11} cy={24.5} rx={3} ry={1.8} fill="#FF8FA3" fillOpacity={0.55} />
          <Ellipse cx={29} cy={24.5} rx={3} ry={1.8} fill="#FF8FA3" fillOpacity={0.55} />
        </>
      ) : null}
      {level === 5 ? (
        <>
          <Path d="M12.5 19 Q15 15.5 17.5 19" {...stroke} />
          <Path d="M22.5 19 Q25 15.5 27.5 19" {...stroke} />
          <Path d="M14.5 23 C16 29.5 24 29.5 25.5 23 C22 24.2 18 24.2 14.5 23 Z" fill={INK} />
          <Ellipse cx={20} cy={27} rx={2.6} ry={1.4} fill="#FF7A8A" />
        </>
      ) : level === 1 ? (
        <>
          <Path d="M12.5 15.8 L16.5 14.3" {...stroke} />
          <Path d="M27.5 15.8 L23.5 14.3" {...stroke} />
          <Circle cx={15} cy={19.5} r={1.9} fill={INK} />
          <Circle cx={25} cy={19.5} r={1.9} fill={INK} />
          <Path d="M15.5 28 Q20 23.5 24.5 28" {...stroke} />
          <Path d="M27 21.5 Q29.4 25 27 26.6 Q24.6 25 27 21.5 Z" fill="#5AB4FF" />
        </>
      ) : (
        <>
          <Circle cx={15} cy={18.5} r={1.9} fill={INK} />
          <Circle cx={25} cy={18.5} r={1.9} fill={INK} />
          {level === 4 ? <Path d="M15.5 24 Q20 28.5 24.5 24" {...stroke} /> : null}
          {level === 3 ? <Path d="M16 25.5 H24" {...stroke} /> : null}
          {level === 2 ? <Path d="M15.5 27 Q20 23 24.5 27" {...stroke} /> : null}
        </>
      )}
    </Svg>
  );
}
