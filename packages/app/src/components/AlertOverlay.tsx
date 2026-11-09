import { Modal, StyleSheet, Text, View } from 'react-native';
import type { ServerEvent } from '@careping/shared';
import { colors, urgencyColor } from '../theme';
import { Button } from './ui';

type AlertEvent = Extract<ServerEvent, { type: 'alert' }> | Extract<ServerEvent, { type: 'device' }>;

/** หน้าจอเต็มตอนมีการเรียก (ใช้ตอนแอปเปิดอยู่ ส่วนตอนแอปปิดจะเป็น push notification) */
export function AlertOverlay({
  event,
  onAck,
  onClose,
}: {
  event: AlertEvent | null;
  onAck: (caseId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  if (!event) return null;
  if (event.type === 'device') {
    const text = {
      offline: 'ปุ่มขาดการเชื่อมต่อ ผู้ป่วยเรียกใครไม่ได้ในตอนนี้',
      offline_reminder: 'ปุ่มยังขาดการเชื่อมต่ออยู่',
      online: 'ปุ่มกลับมาออนไลน์แล้ว',
      low_battery: `แบตปุ่มเหลือ ${event.device.battery ?? '-'}% ควรชาร์จ`,
    }[event.reason];
    const color = event.reason === 'online' ? colors.green : colors.red;
    return (
      <Modal transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { borderTopColor: color }]}>
            <Text style={styles.kicker}>สถานะปุ่ม</Text>
            <Text style={styles.title}>{text}</Text>
            <View style={styles.actions}>
              <Button title="ตกลง" color={color} onPress={onClose} />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  const c = event.case;
  const color = urgencyColor[c.urgency];
  const reason = {
    escalation: 'ถึงคิวคุณแล้ว',
    broadcast: `ยังไม่มีใครรับ · แจ้งทุกคน รอบ ${c.round}`,
    urgent: 'ฉุกเฉิน · แจ้งทุกคนพร้อมกัน',
    repeat_press: `ผู้ป่วยกดซ้ำ (${c.pressCount} ครั้ง)`,
    late_info: 'ส่งล่าช้าเพราะปุ่มออฟไลน์ แจ้งให้ทราบเท่านั้น',
  }[event.reason];
  const canAck = c.status === 'open' || c.status === 'no_response';

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { borderTopColor: color }]}>
          <Text style={[styles.kicker, { color }]}>{reason}</Text>
          <Text style={styles.title}>{c.buttonLabel}</Text>
          <View style={styles.actions}>
            {canAck && event.reason !== 'late_info' ? (
              <Button
                title="รับทราบ กำลังไป"
                color={color}
                onPress={async () => {
                  await onAck(c.id).catch(() => {});
                  onClose();
                }}
              />
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button title="ปิด" variant="outline" color={colors.muted} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,20,32,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, padding: 24, paddingBottom: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 6 },
  kicker: { fontSize: 14, fontWeight: '700', color: colors.muted },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 6 },
  actions: { flexDirection: 'row', marginTop: 16 },
});
