import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EVENT_TYPE_LABEL, MOODS, type DiaryDayDto, type MoodLevel, type TagDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { longDate } from '../dates';
import { Button } from '../components/ui';
import { MoodIcon } from '../components/MoodIcon';
import { TagForm } from './TagForm';

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

/** แผ่นบันทึกของวันที่เลือก: อารมณ์ แท็ก โน้ตส่วนตัว และประวัติว่าใครบันทึกอะไร */
export function DaySheet({ api, date, isToday, tags, onClose, onSaved, onTagCreated }: {
  api: Api; date: string | null; isToday: boolean; tags: TagDto[];
  onClose: () => void; onSaved: () => void; onTagCreated: (t: TagDto) => void;
}) {
  const [day, setDay] = useState<DiaryDayDto | null>(null);
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!date) return;
    setDay(null); setCreating(false);
    api.diaryDay(date).then((d) => { setDay(d); setMood(d.mood); setTagIds(d.tagIds); setNote(d.note ?? ''); }).catch((e) => Alert.alert('โหลดไม่สำเร็จ', (e as Error).message));
  }, [api, date]);

  const toggleTag = (id: string) => setTagIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    if (!date || !day) return;
    setBusy(true);
    try {
      const input: { mood?: number | null; tagIds?: string[]; note?: string | null } = {};
      if (mood !== day.mood) input.mood = mood;
      if ([...tagIds].sort().join() !== [...day.tagIds].sort().join()) input.tagIds = tagIds;
      if (note.trim() !== (day.note ?? '')) input.note = note.trim() || null;
      if (Object.keys(input).length) await api.saveDay(date, input);
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('บันทึกไม่สำเร็จ', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!date} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {creating ? (
            <TagForm api={api} onCancel={() => setCreating(false)} onDone={(t) => { onTagCreated(t); setTagIds((c) => [...c, t.id]); setCreating(false); }} />
          ) : !day || !date ? (
            <ActivityIndicator style={{ margin: 40 }} />
          ) : (
            <ScrollView style={{ maxHeight: 620 }} keyboardShouldPersistTaps="handled">
              <View style={styles.row}>
                <Text style={styles.h}>{longDate(date)}</Text>
                {isToday ? <Text style={styles.today}>วันนี้</Text> : null}
              </View>

              <Text style={styles.label}>อารมณ์</Text>
              <View style={styles.moods}>
                {MOODS.map((m) => {
                  const on = mood === m.level;
                  return (
                    <Pressable key={m.level} onPress={() => setMood(on ? null : m.level)} style={[styles.mood, on && styles.moodOn]}>
                      <MoodIcon level={m.level} size={30} />
                      <Text style={[styles.moodText, on && { color: colors.primary, fontWeight: '700' }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>แท็ก</Text>
              <View style={styles.tags}>
                {tags.map((t) => {
                  const on = tagIds.includes(t.id);
                  return (
                    <Pressable key={t.id} onPress={() => toggleTag(t.id)} style={[styles.tag, on ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: colors.line }]}>
                      <Text style={[styles.tagText, { color: on ? '#fff' : colors.ink }]}>{on ? '✓ ' : ''}{t.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => setCreating(true)} style={[styles.tag, styles.addTag]}>
                  <Text style={[styles.tagText, { color: colors.primary }]}>+ สร้างแท็ก</Text>
                </Pressable>
              </View>

              <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="โน้ตสั้น ๆ (ไม่บังคับ) · เห็นเฉพาะฉัน" placeholderTextColor={colors.muted} multiline />

              {day.doses.total ? <Text style={styles.info}>💊 ให้ยาแล้ว {day.doses.given}/{day.doses.total} มื้อ</Text> : null}
              {day.events.map((e) => (
                <Text key={e.id} style={styles.info}>📅 {e.time ? e.time + ' · ' : ''}{e.title} ({EVENT_TYPE_LABEL[e.type]})</Text>
              ))}

              <View style={styles.log}>
                <Text style={[styles.label, { marginTop: 0 }]}>ประวัติการบันทึก</Text>
                {day.log.length === 0 ? <Text style={styles.small}>ยังไม่มีใครบันทึกวันนี้</Text> : null}
                {day.log.map((l, i) => (
                  <View key={i} style={styles.logRow}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{l.userName.replace('ลูกคน', '').slice(0, 3)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logText}>{l.userName} {l.text}</Text>
                      <Text style={styles.small}>{clockTime(l.at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          {!creating ? (
            <View style={styles.actions}>
              <Button title="ปิด" variant="outline" color={colors.muted} onPress={onClose} />
              <View style={{ width: 8 }} />
              <Button title="บันทึก" onPress={save} loading={busy} disabled={!day} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,20,32,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink },
  today: { fontSize: 12, fontWeight: '700', color: colors.primary },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 14, marginBottom: 6 },
  moods: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { width: 60, height: 66, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 2 },
  moodOn: { backgroundColor: '#2563EB1F', borderColor: colors.primary, borderWidth: 1.5 },
  moodText: { fontSize: 11, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, fontWeight: '600' },
  addTag: { borderColor: colors.primary, borderStyle: 'dashed' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink, marginTop: 12, minHeight: 44 },
  info: { fontSize: 13, color: colors.ink, marginTop: 8 },
  log: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, marginTop: 12 },
  logRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2563EB1F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 9, fontWeight: '700', color: colors.primary },
  logText: { fontSize: 13, color: colors.ink },
  small: { fontSize: 11, color: colors.muted },
  actions: { flexDirection: 'row', marginTop: 14 },
});
