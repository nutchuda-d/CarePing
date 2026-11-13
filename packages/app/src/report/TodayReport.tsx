import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ButtonConfig, ReportTodayDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { hhmm, longDate } from '../dates';
import { Badge, Card } from '../components/ui';
import { bColor, Disclaimer, Legend } from './common';

export function TodayReport({ api, buttons, version, header }: { api: Api; buttons: ButtonConfig[]; version: number; header: React.ReactNode }) {
  const [r, setR] = useState<ReportTodayDto | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setR(await api.reportToday()); } catch {} finally { setLoading(false); } }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const level = !r ? null : r.total > r.typicalHigh ? ['มากกว่าปกติ', colors.amber] : r.total < r.typicalLow ? ['น้อยกว่าปกติ', colors.primary] : ['ปกติ', colors.green];
  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {header}
      {r ? (
        <>
          <Card style={st.mt}>
            <Text style={st.muted}>วันนี้ · {longDate(r.date)}</Text>
            <View style={st.row}>
              <Text style={st.big}>{r.total} ครั้ง</Text>
              {level ? <Badge label={level[0]} color={level[1]} /> : null}
            </View>
            <Text style={st.muted}>
              ปกติประมาณ {r.typicalLow === r.typicalHigh ? r.typicalLow : `${r.typicalLow}–${r.typicalHigh}`} ครั้งต่อวัน (30 วันก่อนหน้า)
            </Text>
          </Card>

          <Card style={st.mt}>
            <View style={[st.row, { justifyContent: 'space-between' }]}>
              <Text style={st.title}>ช่วงเวลาที่เรียก</Text>
              <Text style={st.small}>แถบเทา = กลางคืน</Text>
            </View>
            <View style={st.timeline}>
              <View style={[st.night, { left: 0, width: `${(6 / 24) * 100}%` }]} />
              <View style={[st.night, { left: `${(22 / 24) * 100}%`, width: `${(2 / 24) * 100}%` }]} />
              <View style={st.axis} />
              {r.presses.map((p) => (
                <View key={p.id} style={[st.dot, { left: `${(p.minuteOfDay / 1440) * 100}%`, backgroundColor: bColor(p.button) }]} />
              ))}
            </View>
            <View style={st.ticks}>
              {['00:00', '06:00', '12:00', '18:00', '24:00'].map((t) => <Text key={t} style={st.small}>{t}</Text>)}
            </View>
            <Legend buttons={buttons} />
          </Card>

          <Card style={st.mt}>
            <Text style={st.title}>รายการวันนี้</Text>
            {r.presses.length === 0 ? <Text style={[st.small, { marginTop: 6 }]}>วันนี้ยังไม่มีการเรียก</Text> : null}
            {[...r.presses].reverse().map((p) => (
              <View key={p.id} style={st.item}>
                <Text style={st.time}>{hhmm(p.minuteOfDay)}</Text>
                <View style={[st.sw, { backgroundColor: bColor(p.button) }]} />
                <Text style={st.text}>{p.label}{p.note ? ` · ${p.note}` : ''}</Text>
              </View>
            ))}
          </Card>
          <Disclaimer />
        </>
      ) : null}
    </ScrollView>
  );
}

export const st = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  mt: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  big: { fontSize: 30, fontWeight: '800', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  small: { fontSize: 11, color: colors.muted },
  timeline: { height: 40, marginTop: 12, position: 'relative' },
  night: { position: 'absolute', top: 0, height: 32, backgroundColor: '#1D24330F' },
  axis: { position: 'absolute', left: 0, right: 0, top: 32, height: 1, backgroundColor: colors.line },
  dot: { position: 'absolute', top: 9, width: 14, height: 14, borderRadius: 7, marginLeft: -7, borderWidth: 2, borderColor: '#fff' },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  time: { fontSize: 13, fontWeight: '600', color: colors.muted, width: 44 },
  sw: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: 14, color: colors.ink, flex: 1 },
});
