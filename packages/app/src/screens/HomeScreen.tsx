import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { StateDto } from '@careping/shared';
import type { Api } from '../api';
import { colors, timeAgo } from '../theme';
import { Badge, Card, SectionTitle } from '../components/ui';
import { CaseCard } from '../components/CaseCard';

export function HomeScreen({
  api,
  state,
  connected,
  error,
  refresh,
}: {
  api: Api;
  state: StateDto | null;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}) {
  const me = state?.caregivers.find((c) => c.id === api.userId);
  const device = state?.device;

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
    >
      <Text style={styles.hello}>ดูแล{state?.patient.name ?? ''}</Text>
      {!connected ? <Text style={styles.warn}>กำลังเชื่อมต่อเซิร์ฟเวอร์…</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}

      <Card style={{ marginTop: 12 }}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>ปุ่มของผู้ป่วย</Text>
          {device ? (
            <Badge label={device.online ? 'ออนไลน์' : 'ขาดการเชื่อมต่อ'} color={device.online ? colors.green : colors.red} />
          ) : null}
        </View>
        {device ? (
          <Text style={styles.meta}>
            แบต {device.battery ?? '-'}% · สัญญาณ {device.rssi ?? '-'} dBm · เห็นล่าสุด {timeAgo(device.lastSeen)}
          </Text>
        ) : (
          <Text style={styles.meta}>ยังไม่ได้ผูกปุ่ม</Text>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{me?.away ? 'ฉันอยู่นอกบ้าน' : 'ฉันอยู่บ้าน'}</Text>
            <Text style={styles.meta}>
              {me?.away ? 'จะได้รับแจ้งเฉพาะเรื่องฉุกเฉิน (ยังดูเคสได้)' : 'อยู่ในลำดับรับแจ้งเตือนปกติ'}
            </Text>
          </View>
          <Switch
            value={!me?.away}
            onValueChange={async (home) => {
              await api.setAway(!home).catch(() => {});
              refresh();
            }}
          />
        </View>
      </Card>

      <SectionTitle>เคสที่ยังค้าง ({state?.openCases.length ?? 0})</SectionTitle>
      {state?.openCases.length === 0 ? <Text style={styles.meta}>ไม่มีการเรียกค้างอยู่</Text> : null}
      {state?.openCases.map((c) => (
        <CaseCard
          key={c.id}
          c={c}
          onAck={async () => {
            await api.ack(c.id);
            await refresh();
          }}
          onResolve={async (note) => {
            await api.resolve(c.id, note);
            await refresh();
          }}
        />
      ))}

      <SectionTitle>ทีมดูแล (เรียงตามลำดับรับแจ้ง)</SectionTitle>
      <Card>
        {state?.caregivers.map((g) => (
          <View key={g.id} style={[styles.row, { paddingVertical: 8 }]}>
            <Text style={styles.member}>
              {g.priority}. {g.name}
              {g.id === api.userId ? ' (ฉัน)' : ''}
              {g.role === 'admin' ? ' · แอดมิน' : ''}
            </Text>
            <Badge label={g.away ? 'นอกบ้าน' : 'อยู่บ้าน'} color={g.away ? colors.muted : colors.green} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  hello: { fontSize: 26, fontWeight: '800', color: colors.ink },
  warn: { color: colors.amber, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { color: colors.muted, marginTop: 4 },
  member: { color: colors.ink, fontSize: 15 },
});
