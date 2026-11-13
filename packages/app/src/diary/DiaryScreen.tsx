import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EVENT_TYPE_LABEL, MOODS, type DiaryMonthDto, type TagDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { addMonths, daysInMonth, monthTitle, THAI_DAYS_SHORT, THAI_MONTHS_SHORT, weekday } from '../dates';
import { Button, Card } from '../components/ui';
import { MoodIcon } from '../components/MoodIcon';
import { DaySheet } from './DaySheet';
import { EventSheet } from './EventSheet';

export function DiaryScreen({ api, version }: { api: Api; version: number }) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DiaryMonthDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.diaryMonth(month)); } catch (e) { Alert.alert('โหลดไม่สำเร็จ', (e as Error).message); } finally { setLoading(false); }
  }, [api, month]);
  useEffect(() => { load(); }, [load, version]);

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const eventDates = useMemo(() => new Set((data?.events ?? []).map((e) => e.date)), [data]);

  if (!data) return <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}><Text style={styles.h}>บันทึกประจำวัน</Text></ScrollView>;

  const m = data.month;
  const first = `${m}-01`;
  const lead = weekday(first);
  const n = daysInMonth(m);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const onDay = (d: string) => {
    if (d > data.today) setEventOpen(d); // วันในอนาคต: เพิ่มเหตุการณ์ล่วงหน้า
    else setDayOpen(d);
  };
  const confirmDelete = (id: string, title: string) =>
    Alert.alert('ลบเหตุการณ์?', title, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ลบ', style: 'destructive', onPress: () => api.deleteEvent(id).then(load).catch((e) => Alert.alert('ลบไม่สำเร็จ', (e as Error).message)) }]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={styles.h}>บันทึกประจำวัน</Text>
      <Text style={styles.sub}>กดวันที่เพื่อดูหรือแก้บันทึก</Text>

      <Card style={{ marginTop: 12, paddingHorizontal: 10 }}>
        <View style={styles.monthRow}>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonths(m, -1))}><Text style={styles.arrow}>‹</Text></Pressable>
          <Text style={styles.month}>{monthTitle(m)}</Text>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonths(m, 1))}><Text style={styles.arrow}>›</Text></Pressable>
        </View>
        <View style={styles.week}>
          {THAI_DAYS_SHORT.map((d) => <Text key={d} style={styles.wd}>{d}</Text>)}
        </View>
        {weeks.map((w, i) => (
          <View key={i} style={styles.week}>
            {w.map((d, j) => {
              if (!d) return <View key={j} style={styles.cell} />;
              const entry = byDate.get(d);
              const isToday = d === data.today;
              return (
                <Pressable key={d} onPress={() => onDay(d)} style={[styles.cell, isToday && styles.todayCell]}>
                  <Text style={[styles.dayNum, entry?.mood ? styles.dayNumSmall : null, isToday && { color: colors.primary, fontWeight: '800' }, d > data.today && { color: colors.muted }]}>{Number(d.slice(8))}</Text>
                  {entry?.mood ? <MoodIcon level={entry.mood} size={28} /> : entry?.tagIds.length ? <Text style={styles.tagged}>•••</Text> : null}
                  <View style={[styles.dot, eventDates.has(d) && { backgroundColor: colors.purple }]} />
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={styles.legend}>
          <View style={[styles.dot, { backgroundColor: colors.purple }]} />
          <Text style={styles.small}>มีเหตุการณ์</Text>
          <View style={{ flexDirection: 'row', marginLeft: 10 }}>{MOODS.map((x) => <MoodIcon key={x.level} level={x.level} size={16} />)}</View>
          <Text style={styles.small}> อารมณ์ของวัน</Text>
        </View>
      </Card>

      <View style={styles.hint}>
        <Text style={styles.hintText}>👆 กดวันที่ผ่านมาเพื่อบันทึกอารมณ์และแท็ก · กดวันในอนาคตเพื่อเพิ่มนัด</Text>
      </View>

      <Card style={{ marginTop: 12 }}>
        <View style={styles.monthRow}>
          <Text style={styles.cardTitle}>เหตุการณ์เดือนนี้</Text>
          <Text style={styles.small}>{data.events.length} รายการ</Text>
        </View>
        {data.events.length === 0 ? <Text style={[styles.small, { marginVertical: 8 }]}>ยังไม่มีเหตุการณ์</Text> : null}
        {data.events.map((e) => (
          <Pressable key={e.id} onLongPress={() => confirmDelete(e.id, e.title)} style={styles.event}>
            <View style={styles.dateBox}>
              <Text style={styles.dateNum}>{Number(e.date.slice(8))}</Text>
              <Text style={styles.dateMon}>{THAI_MONTHS_SHORT[Number(e.date.slice(5, 7)) - 1]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{e.title}</Text>
              <Text style={styles.small}>{EVENT_TYPE_LABEL[e.type]}{e.time ? ` · ${e.time}` : ''}{e.detail ? ` · ${e.detail}` : ''} · โดย {e.createdByName}</Text>
            </View>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Button title="+ เพิ่มเหตุการณ์" variant="outline" color={colors.purple} onPress={() => setEventOpen(data.today)} />
        </View>
        <Text style={[styles.small, { marginTop: 6 }]}>กดค้างที่เหตุการณ์เพื่อลบ</Text>
      </Card>

      <DaySheet
        api={api}
        date={dayOpen}
        isToday={dayOpen === data.today}
        tags={data.tags}
        onClose={() => setDayOpen(null)}
        onSaved={load}
        onTagCreated={(t: TagDto) => setData((cur) => (cur ? { ...cur, tags: [...cur.tags, t] } : cur))}
      />
      <EventSheet api={api} date={eventOpen} onClose={() => setEventOpen(null)} onSaved={load} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  month: { fontSize: 16, fontWeight: '700', color: colors.ink },
  arrow: { fontSize: 24, color: colors.muted, paddingHorizontal: 8 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 6 },
  cell: { width: `${100 / 7}%`, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  todayCell: { backgroundColor: '#2563EB1A', borderWidth: 1.5, borderColor: colors.primary },
  dayNum: { fontSize: 14, color: colors.ink },
  dayNumSmall: { fontSize: 10, lineHeight: 12 },
  tagged: { fontSize: 10, color: colors.muted },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingHorizontal: 4 },
  small: { fontSize: 12, color: colors.muted },
  hint: { backgroundColor: '#2563EB14', borderRadius: 12, padding: 12, marginTop: 12 },
  hintText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dateBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#9333EA1F', alignItems: 'center', justifyContent: 'center' },
  dateNum: { fontSize: 16, fontWeight: '800', color: colors.purple },
  dateMon: { fontSize: 10, color: colors.purple },
  eventTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
