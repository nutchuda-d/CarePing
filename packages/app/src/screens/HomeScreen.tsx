import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { CaseDto, StateDto } from '@careping/shared';
import type { Api } from '../api';
import { colors, timeAgo } from '../theme';
import { Badge, Card, SectionTitle } from '../components/ui';
import { CaseCard } from '../components/CaseCard';
import { MedsCard } from '../components/MedsCard';

export function HomeScreen({
  api,
  state,
  connected,
  error,
  refresh,
  version,
}: {
  api: Api;
  state: StateDto | null;
  connected: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  version: number;
}) {
  const me = state?.caregivers.find((c) => c.id === api.userId);
  const device = state?.device;
  // เคสฉุกเฉินที่ยังไม่มีคนรับ ขึ้นไปอยู่เหนือการ์ดยาชั่วคราว
  const urgentOpen = (state?.openCases ?? []).filter((c) => c.urgency === 'urgent' && c.status !== 'acknowledged');
  const otherCases = (state?.openCases ?? []).filter((c) => !urgentOpen.includes(c));
  const renderCase = (c: CaseDto) => (
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
  );

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
    >
      <Text style={styles.hello}>ดูแล{state?.patient.name ?? ''}</Text>
      {!connected ? <Text style={styles.warn}>กำลังเชื่อมต่อเซิร์ฟเวอร์…</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}

      <Card style={styles.compact}>
        <View style={styles.row}>
          <Text style={styles.cardTitleSm}>ปุ่มของผู้ป่วย</Text>
          {device ? (
            <Badge label={device.online ? 'ออนไลน์' : 'ขาดการเชื่อมต่อ'} color={device.online ? colors.green : colors.red} />
          ) : null}
        </View>
        <Text style={styles.metaSm}>
          {device ? `แบต ${device.battery ?? '-'}% · สัญญาณ ${device.rssi ?? '-'} dBm · ${timeAgo(device.lastSeen)}` : 'ยังไม่ได้ผูกปุ่ม'}
        </Text>
      </Card>

      <Card style={[styles.compact, { paddingVertical: 8 }]}>
        <View style={styles.row}>
          <Text style={styles.cardTitleSm} numberOfLines={1}>
            {me?.away ? 'ฉันอยู่นอกบ้าน' : 'ฉันอยู่บ้าน'}
            <Text style={styles.metaSm}>{me?.away ? ' · รับเฉพาะเรื่องฉุกเฉิน' : ' · รับแจ้งเตือนตามลำดับ'}</Text>
          </Text>
          <Switch
            value={!me?.away}
            onValueChange={async (home) => {
              await api.setAway(!home).catch(() => {});
              refresh();
            }}
          />
        </View>
      </Card>

      {urgentOpen.length ? (
        <>
          <SectionTitle>ฉุกเฉิน</SectionTitle>
          {urgentOpen.map(renderCase)}
        </>
      ) : null}

      <MedsCard api={api} version={version} userId={api.userId} />

      <SectionTitle>เคสที่ยังค้าง ({otherCases.length})</SectionTitle>
      {otherCases.length === 0 ? <Text style={styles.meta}>{urgentOpen.length ? 'ไม่มีเคสอื่นค้างอยู่' : 'ไม่มีการเรียกค้างอยู่'}</Text> : null}
      {otherCases.map(renderCase)}

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
  cardTitleSm: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  metaSm: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 2 },
  compact: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 14 },
  meta: { color: colors.muted, marginTop: 4 },
  member: { color: colors.ink, fontSize: 15 },
});
