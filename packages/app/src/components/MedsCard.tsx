import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DoseDto, MedsTodayDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const untilText = (from: string, to: string) => {
  const d = toMin(to) - toMin(from);
  if (d <= 0) return 'ถึงเวลาแล้ว';
  if (d < 60) return `อีก ${d} นาที`;
  return `อีก ${Math.round(d / 60)} ชม.`;
};

/** การ์ด "ยาวันนี้" บนหน้าหลัก: มื้อถัดไปเด่นสุด มื้อที่เลยเวลาแล้วยังไม่ให้ขึ้นสีส้ม */
export function MedsCard({ api, version, userId }: { api: Api; version: number; userId: string }) {
  const [data, setData] = useState<MedsTodayDto | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.medsToday().then(setData).catch(() => {}), [api]);
  useEffect(() => { load(); }, [load, version]);
  if (!data) return null;
  if (data.doses.length === 0) return null;

  const pending = data.doses.filter((d) => !d.givenBy);
  const overdue = pending.filter((d) => toMin(d.time) <= toMin(data.now));
  const next: DoseDto | undefined = overdue[0] ?? pending[0];
  const rest = pending.filter((d) => d !== next);
  const given = data.doses.length - pending.length;

  const toggle = async (d: DoseDto, give: boolean) => {
    setBusy(true);
    try {
      setData(await api.setDose(d.medicationId, d.time, give));
    } catch (e) {
      Alert.alert('บันทึกไม่สำเร็จ', (e as Error).message);
      load();
    } finally {
      setBusy(false);
    }
  };
  const lastGiven = [...data.doses].filter((d) => d.givenBy).sort((a, b) => (b.givenAt ?? 0) - (a.givenAt ?? 0))[0];

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>💊 ยาวันนี้</Text>
        <Text style={styles.meta}>ให้แล้ว {given}/{data.doses.length} มื้อ</Text>
      </View>
      {next ? (
        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={{ alignItems: 'center', minWidth: 56 }}>
            <Text style={[styles.time, overdue.includes(next) && { color: colors.red }]}>{next.time}</Text>
            <Text style={styles.small}>{overdue.includes(next) ? 'เลยเวลาแล้ว' : untilText(data.now, next.time)}</Text>
          </View>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={styles.name}>{next.name}</Text>
            <Text style={styles.small}>{next.dose}{next.instructions ? ` · ${next.instructions}` : ''}</Text>
          </View>
          <Pressable style={styles.giveBtn} disabled={busy} onPress={() => toggle(next, true)}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.giveText}>ให้แล้ว</Text>}
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.meta, { marginTop: 6, color: colors.green }]}>✓ ให้ยาครบทุกมื้อแล้ววันนี้</Text>
      )}
      {rest.length ? <Text style={[styles.small, { marginTop: 8 }]}>ถัดไป {rest.map((d) => `${d.time} ${d.name}`).join(' · ')}</Text> : null}
      {lastGiven ? (
        <Pressable
          onLongPress={() => lastGiven.givenBy === userId && toggle(lastGiven, false)}
          style={{ marginTop: 6 }}
        >
          <Text style={[styles.small, { color: colors.green }]}>
            ✓ ล่าสุด: {lastGiven.name} {lastGiven.time} · {lastGiven.givenByName}
            {lastGiven.givenBy === userId ? ' (กดค้างเพื่อยกเลิก)' : ''}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FDF4E7', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EFCB95', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12, fontWeight: '600', color: colors.muted },
  time: { fontSize: 18, fontWeight: '800', color: colors.amber },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  small: { fontSize: 12, color: colors.muted },
  giveBtn: { backgroundColor: colors.amber, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  giveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
