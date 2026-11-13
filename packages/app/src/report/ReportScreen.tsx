import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ButtonConfig } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { HistoryScreen } from '../screens/HistoryScreen';
import { TodayReport } from './TodayReport';
import { WeekReport } from './WeekReport';
import { CompareReport } from './CompareReport';

type Seg = 'today' | 'week' | 'compare' | 'history';
const SEGS: [Seg, string][] = [['today', 'วันนี้'], ['week', 'สัปดาห์'], ['compare', 'เทียบ'], ['history', 'ประวัติ']];

/** แท็บรายงาน: วันนี้ · สัปดาห์ · เทียบ · ประวัติ (มีแค่ข้อมูลผู้ป่วย ไม่มีสถิติของผู้ดูแล) */
export function ReportScreen({ api, buttons, version, patientName }: { api: Api; buttons: ButtonConfig[]; version: number; patientName: string }) {
  const [seg, setSeg] = useState<Seg>('today');
  const header = (
    <View>
      <Text style={s.h}>รายงาน</Text>
      <Text style={s.sub}>ข้อมูลของ{patientName}</Text>
      <View style={s.segs}>
        {SEGS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setSeg(k)} style={[s.seg, seg === k && s.segOn]}>
            <Text style={[s.segText, seg === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  if (seg === 'today') return <TodayReport api={api} buttons={buttons} version={version} header={header} />;
  if (seg === 'week') return <WeekReport api={api} buttons={buttons} version={version} header={header} />;
  if (seg === 'compare') return <CompareReport api={api} buttons={buttons} version={version} header={header} patientName={patientName} />;
  return <HistoryScreen api={api} version={version} header={header} />;
}

const s = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted },
  segs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seg: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segText: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
