import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ButtonConfig, StatsDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { Card, SectionTitle } from '../components/ui';

const BUTTON_COLORS = ['#3B82F6', '#0EA5A4', '#F59E0B', '#6366F1', '#DC2626'];
const RANGES = [7, 14, 30];

export function StatsScreen({ api, buttons, version }: { api: Api; buttons: ButtonConfig[]; version: number }) {
  const [days, setDays] = useState(14);
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.stats(days));
    } finally {
      setLoading(false);
    }
  }, [api, days]);
  useEffect(() => {
    load().catch(() => {});
  }, [load, version]);

  const max = Math.max(1, ...(stats?.perDay.map((d) => Object.values(d.counts).reduce((a, b) => a + b, 0)) ?? [1]));
  const change =
    stats && stats.prevPeriodTotal > 0
      ? Math.round(((stats.total - stats.prevPeriodTotal) / stats.prevPeriodTotal) * 100)
      : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={styles.h}>สถิติ</Text>
      <View style={styles.tabs}>
        {RANGES.map((r) => (
          <Pressable key={r} onPress={() => setDays(r)} style={[styles.tab, days === r && styles.tabOn]}>
            <Text style={[styles.tabText, days === r && styles.tabTextOn]}>{r} วัน</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.kpis}>
        <Kpi label="ครั้งทั้งหมด" value={String(stats?.total ?? '-')} sub={change === null ? 'ไม่มีข้อมูลช่วงก่อน' : `${change >= 0 ? '+' : ''}${change}% จากช่วงก่อน`} />
        <Kpi label="ช่วงกลางคืน" value={String(stats?.nightCount ?? '-')} sub="22:00–06:00" />
        <Kpi label="เวลาเฉลี่ยจนมีคนรับ" value={stats?.avgAckSec != null ? `${stats.avgAckSec} วิ` : '-'} sub={`ไม่มีผู้ตอบ ${stats?.noResponseCount ?? 0} ครั้ง`} />
      </View>

      <SectionTitle>จำนวนครั้งต่อวัน แยกตามปุ่ม</SectionTitle>
      <Card>
        <View style={styles.chart}>
          {stats?.perDay.map((d) => (
            <View key={d.date} style={styles.col}>
              <View style={styles.bar}>
                {buttons.map((b) => {
                  const n = d.counts[b.button] ?? 0;
                  return n ? (
                    <View key={b.button} style={{ height: `${(n / max) * 100}%`, backgroundColor: BUTTON_COLORS[b.button - 1] }} />
                  ) : null;
                })}
              </View>
              {stats.perDay.length <= 14 ? <Text style={styles.axis}>{Number(d.date.slice(8))}</Text> : null}
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {buttons.map((b) => (
            <View key={b.button} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: BUTTON_COLORS[b.button - 1] }]} />
              <Text style={styles.legendText}>
                {b.label} ({stats?.totalByButton[b.button] ?? 0})
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <Text style={styles.disclaimer}>รายงานความถี่การขอความช่วยเหลือ ไม่ใช่ผลวินิจฉัยทางการแพทย์</Text>
    </ScrollView>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card style={{ flex: 1, padding: 12 }}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '800', color: colors.ink },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { color: colors.ink, fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  kpis: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpiLabel: { color: colors.muted, fontSize: 12 },
  kpiValue: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 4 },
  kpiSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 3 },
  col: { flex: 1, alignItems: 'center', height: '100%' },
  bar: { flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  axis: { fontSize: 10, color: colors.muted, marginTop: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: colors.ink, fontSize: 12 },
  disclaimer: { color: colors.muted, fontSize: 12, marginTop: 16, textAlign: 'center' },
});
