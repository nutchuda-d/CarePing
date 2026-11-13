import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TAG_COLORS, type TagDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { Button } from '../components/ui';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** สร้างแท็กใหม่: ตั้งชื่อ เลือกสีสำเร็จรูปหรือพิมพ์รหัสสีเอง */
export function TagForm({ api, onDone, onCancel }: { api: Api; onDone: (t: TagDto) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(TAG_COLORS[4]);
  const [custom, setCustom] = useState('#E8609A');
  const [useCustom, setUseCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = useCustom ? custom : color;
  const valid = label.trim().length > 0 && HEX.test(chosen);

  const save = async () => {
    setBusy(true);
    try {
      onDone(await api.createTag(label.trim(), chosen));
    } catch (e) {
      Alert.alert('สร้างแท็กไม่สำเร็จ', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.h}>สร้างแท็กใหม่</Text>
      <Text style={styles.sub}>แท็กจะอยู่ในรายการให้เลือกใช้ทุกวัน</Text>
      <Text style={styles.label}>ชื่อแท็ก</Text>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="เช่น คิดถึงหลาน" placeholderTextColor={colors.muted} maxLength={30} />
      <Text style={styles.label}>สี</Text>
      <View style={styles.swatches}>
        {TAG_COLORS.map((c) => (
          <Pressable key={c} onPress={() => { setColor(c); setUseCustom(false); }} style={[styles.swatch, { backgroundColor: c }, !useCustom && color === c && styles.on]} />
        ))}
        <Pressable onPress={() => setUseCustom(true)} style={[styles.swatch, styles.rainbow, useCustom && styles.on]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>+</Text>
        </Pressable>
      </View>
      {useCustom ? (
        <View style={styles.customRow}>
          <View style={[styles.preview, { backgroundColor: HEX.test(custom) ? custom : '#eee' }]} />
          <TextInput style={[styles.input, { flex: 1, marginTop: 0 }]} value={custom} onChangeText={(t) => setCustom(t.startsWith('#') ? t : '#' + t)} autoCapitalize="characters" maxLength={7} />
          <Text style={styles.sub}>รหัสสี #RRGGBB</Text>
        </View>
      ) : null}
      <View style={styles.previewRow}>
        <Text style={styles.sub}>ตัวอย่าง:</Text>
        <View style={[styles.chip, { backgroundColor: HEX.test(chosen) ? chosen : colors.muted }]}>
          <Text style={styles.chipText}>✓ {label.trim() || 'ชื่อแท็ก'}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button title="ยกเลิก" variant="outline" color={colors.muted} onPress={onCancel} />
        <View style={{ width: 8 }} />
        <Button title="สร้างและแปะวันนี้" onPress={save} loading={busy} disabled={!valid} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 14 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink, marginTop: 6 },
  swatches: { flexDirection: 'row', gap: 12, marginTop: 8 },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rainbow: { backgroundColor: '#E8609A', borderWidth: 3, borderColor: '#FFD66B' },
  on: { borderWidth: 3, borderColor: colors.ink },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  preview: { width: 36, height: 36, borderRadius: 10 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  actions: { flexDirection: 'row', marginTop: 18 },
});
