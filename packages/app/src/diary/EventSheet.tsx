import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EVENT_TYPE_LABEL, type EventType } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { Button } from '../components/ui';

const TYPES = Object.keys(EVENT_TYPE_LABEL) as EventType[];

/** เพิ่มเหตุการณ์ลงปฏิทิน เช่น นัดหมอ เปลี่ยนยา */
export function EventSheet({ api, date, onClose, onSaved }: { api: Api; date: string | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [d, setD] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<EventType>('doctor');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (date) { setD(date); setTitle(''); setTime(''); setDetail(''); setType('doctor'); } }, [date]);

  const save = async () => {
    setBusy(true);
    try {
      await api.createEvent({ date: d.trim(), time: time.trim() || null, title: title.trim(), type, detail: detail.trim() || null });
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
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.h}>เพิ่มเหตุการณ์</Text>
            <Text style={styles.sub}>จะแสดงเป็นจุดในปฏิทิน และใช้เทียบ "ตั้งแต่นัดหมอครั้งก่อน" ในรายงาน</Text>
            <Text style={styles.label}>ชื่อเหตุการณ์</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="เช่น นัดหมอที่โรงพยาบาล" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>วันที่ · เวลา (ไม่บังคับ)</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1.4 }]} value={d} onChangeText={setD} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
              <TextInput style={[styles.input, { flex: 1 }]} value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.muted} />
            </View>
            <Text style={styles.label}>ประเภท</Text>
            <View style={styles.types}>
              {TYPES.map((t) => (
                <Pressable key={t} onPress={() => setType(t)} style={[styles.type, type === t && styles.typeOn]}>
                  <Text style={[styles.typeText, type === t && { color: '#fff' }]}>{EVENT_TYPE_LABEL[t]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>รายละเอียด</Text>
            <TextInput style={styles.input} value={detail} onChangeText={setDetail} placeholder="เช่น นำยาเดิมไปด้วย" placeholderTextColor={colors.muted} />
          </ScrollView>
          <View style={styles.actions}>
            <Button title="ยกเลิก" variant="outline" color={colors.muted} onPress={onClose} />
            <View style={{ width: 8 }} />
            <Button title="บันทึกเหตุการณ์" color={colors.purple} onPress={save} loading={busy} disabled={!title.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,20,32,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, maxHeight: '90%' },
  h: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 6 },
  typeOn: { backgroundColor: colors.purple, borderColor: colors.purple },
  typeText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  actions: { flexDirection: 'row', marginTop: 16 },
});
