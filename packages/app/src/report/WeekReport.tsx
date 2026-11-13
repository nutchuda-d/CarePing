import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { ButtonConfig, ReportWeekDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { rangeLabel, THAI_DAYS_SHORT, weekday } from '../dates';
import { Badge, Card } from '../components/ui';
import { bColor, Delta, Disclaimer, Legend } from './common';
import { st } from './TodayReport';

export function WeekReport({ api, buttons, version, header }: { api: Api; buttons: ButtonConfig[]; version: number; header: React.ReactNode }) {
  const [r, setR] = useState<ReportWeekDto | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setR(await api.reportWeek()); } catch {} finally { setLoading(false); } }, [api]);
  useEffect(() => { load(); }, [load, version]);
  const d = r ? r.total - r.prevTotal : 0;
  const max = r ? Math.max(1, ...r.days.map((x) => Object.values(x.counts).reduce((a, b) => a + b, 0))) : 1;

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      {header}
      {r ? (
        <>
          <Card style={st.mt}>
            <Text style={st.muted}>7 วันล่าสุด · {rangeLabel(r.from, r.to)}</Text>
            <View style={st.row}>
              <Text style={st.big}>{r.total} ครั้ง</Text>
              <Badge label={d === 0 ? 'เท่าสัปดาห์ก่อน' : `${d > 0 ? '+' : '−'}${Math.abs(d)} จากสัปดาห์ก่อน`} color={d > 0 ? colors.amber : d < 0 ? colors.green : colors.muted} />
            </View>
            <Text style={st.muted}>เฉลี่ย {(r.total / 7).toFixed(1)} ครั้งต่อวัน · กลางคืน {r.nightCount} ครั้ง</Text>
          </Card>

          <Card style={st.mt}>
            <Text style={st.title}>จำนวนครั้งต่อวัน</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170, marginTop: 10 }}>
              {r.days.map((day) => {
                const total = Object.values(day.counts).reduce((a, b) => a + b, 0);
                const isToday = day.date === r.to;
                return (
                  <View key={day.date} style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={st.small}>{total}</Text>
                    <View style={{ width: 26, height: 130, justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', marginTop: 2 }}>
                      {buttons.map((b) => (day.counts[b.button] ? <View key={b.button} style={{ height: `${(day.counts[b.button] / max) * 100}%`, backgroundColor: bColor(b.button) }} /> : null))}
                    </View>
                    <Text style={[st.small, isToday && { color: colors.primary, fontWeight: '700' }]}>{THAI_DAYS_SHORT[weekday(day.date)]} {Number(day.date.slice(8))}</Text>
                  </View>
                );
              })}
            </View>
            <Legend buttons={buttons} />
          </Card>

          <Card style={st.mt}>
            <Text style={st.title}>แยกตามประเภท · เทียบสัปดาห์ก่อน</Text>
            {buttons.map((b) => (
              <View key={b.button} style={st.item}>
                <View style={[st.sw, { backgroundColor: bColor(b.button) }]} />
                <Text style={st.text}>{b.label}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{r.byButton[b.button] ?? 0} ครั้ง</Text>
                <Delta now={r.byButton[b.button] ?? 0} before={r.prevByButton[b.button] ?? 0} />
              </View>
            ))}
          </Card>
          <Disclaimer />
        </>
      ) : null}
    </ScrollView>
  );
}
