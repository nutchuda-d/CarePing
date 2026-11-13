import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { CaseDto } from '@careping/shared';
import type { Api } from '../api';
import { clock, colors, statusColor, statusLabel, urgencyColor } from '../theme';
import { Badge } from '../components/ui';

export function HistoryScreen({ api, version, header }: { api: Api; version: number; header?: React.ReactNode }) {
  const [items, setItems] = useState<CaseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.history(30));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    load().catch(() => {});
  }, [load, version]);

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={
        <View>
          {header}
          <Text style={[styles.h, header ? { fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 8 } : null]}>ประวัติการเรียก 30 วัน</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.meta}>ยังไม่มีประวัติ</Text>}
      renderItem={({ item: c }) => (
        <View style={styles.item}>
          <View style={[styles.dot, { backgroundColor: urgencyColor[c.urgency] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{c.buttonLabel}</Text>
            <Text style={styles.meta}>
              {clock(c.pressedAt)}
              {c.ackedAt && !c.delayed ? ` · รับใน ${Math.round((c.ackedAt - c.pressedAt) / 1000)} วิ` : ''}
              {c.ackedByName ? ` · ${c.ackedByName}` : ''}
            </Text>
            {c.note ? <Text style={styles.note}>“{c.note}”</Text> : null}
          </View>
          <Badge label={statusLabel[c.status]} color={statusColor[c.status]} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { color: colors.muted, marginTop: 2 },
  note: { color: colors.ink, marginTop: 4, fontStyle: 'italic' },
});
