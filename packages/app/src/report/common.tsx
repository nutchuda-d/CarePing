import { StyleSheet, Text, View } from 'react-native';
import type { ButtonConfig } from '@careping/shared';
import { colors } from '../theme';

export const BUTTON_COLORS = ['#3B82F6', '#0EA5A4', '#F59E0B', '#6366F1', '#DC2626'];
export const bColor = (b: number) => BUTTON_COLORS[b - 1] ?? colors.muted;

/** ความต่างเป็นจำนวนครั้ง (ไม่ใช้ % เพราะตัวเลขน้อยจะดูน่ากลัวเกินจริง) */
export function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  const color = d > 0 ? colors.amber : d < 0 ? colors.green : colors.muted;
  return <Text style={[s.delta, { color }]}>{d === 0 ? 'เท่าเดิม' : d > 0 ? `▲ ${d} ครั้ง` : `▼ ${-d} ครั้ง`}</Text>;
}

export function Legend({ buttons }: { buttons: ButtonConfig[] }) {
  return (
    <View style={s.legend}>
      {buttons.map((b) => (
        <View key={b.button} style={s.item}>
          <View style={[s.sw, { backgroundColor: bColor(b.button) }]} />
          <Text style={s.text}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const Disclaimer = () => <Text style={s.disc}>รายงานความถี่การขอความช่วยเหลือ ไม่ใช่ผลวินิจฉัยทางการแพทย์</Text>;

const s = StyleSheet.create({
  delta: { fontSize: 12, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sw: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: 12, color: colors.ink },
  disc: { color: colors.muted, fontSize: 12, marginTop: 16, textAlign: 'center' },
});
