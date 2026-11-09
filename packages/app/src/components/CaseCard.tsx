import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { URGENCY_LABEL, type CaseDto } from '@careping/shared';
import { colors, statusColor, statusLabel, timeAgo, urgencyColor } from '../theme';
import { Badge, Button, Card } from './ui';

export function CaseCard({
  c,
  onAck,
  onResolve,
}: {
  c: CaseDto;
  onAck?: () => Promise<unknown>;
  onResolve?: (note: string) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('ทำรายการไม่สำเร็จ', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const canAck = c.status === 'open' || c.status === 'no_response';
  const canResolve = c.status !== 'resolved' && c.status !== 'late_info';

  return (
    <Card style={{ borderLeftWidth: 5, borderLeftColor: urgencyColor[c.urgency], marginBottom: 12 }}>
      <View style={styles.row}>
        <Text style={styles.title}>{c.buttonLabel}</Text>
        <Badge label={statusLabel[c.status]} color={statusColor[c.status]} />
      </View>
      <Text style={styles.meta}>
        ระดับ{URGENCY_LABEL[c.urgency]} · {timeAgo(c.pressedAt)}
        {c.pressCount > 1 ? ` · กด ${c.pressCount} ครั้ง` : ''}
        {c.delayed ? ' · ส่งล่าช้า' : ''}
      </Text>
      {c.ackedByName ? <Text style={styles.meta}>รับโดย {c.ackedByName}</Text> : null}
      {c.note ? <Text style={styles.note}>“{c.note}”</Text> : null}

      {canAck && onAck ? (
        <View style={styles.actions}>
          <Button title="รับทราบ กำลังไป" color={urgencyColor[c.urgency]} loading={busy} onPress={() => run(onAck)} />
        </View>
      ) : null}
      {!canAck && canResolve && onResolve ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="โน้ตสั้น ๆ (ไม่บังคับ) เช่น พาไปห้องน้ำแล้ว"
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={setNote}
          />
          <View style={styles.actions}>
            <Button title="ช่วยเสร็จแล้ว" color={colors.green} loading={busy} onPress={() => run(() => onResolve(note))} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  meta: { color: colors.muted, marginTop: 4 },
  note: { color: colors.ink, marginTop: 6, fontStyle: 'italic' },
  actions: { flexDirection: 'row', marginTop: 12 },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
});
