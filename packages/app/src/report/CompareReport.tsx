import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { EVENT_TYPE_LABEL, type ButtonConfig, type ComparePreset, type ReportCompareDto } from '@careping/shared';
import type { Api } from '../api';
import { colors } from '../theme';
import { rangeLabel, shortDate } from '../dates';
import { Button, Card } from '../components/ui';
import { bColor, Delta, Disclaimer } from './common';
import { st } from './TodayReport';

const B_COLOR = '#A3ABB9';
const PRESETS: [ComparePreset, string][] = [['month', 'เดือนนี้ vs เดือนก่อน'], ['doctor', 'ตั้งแต่นัดหมอครั้งก่อน'], ['custom', 'กำหนดเอง']];

export function CompareReport({ api, buttons, version, header, patientName }: { api: Api; buttons: ButtonConfig[]; version: number; header: React.ReactNode; patientName: string }) {
  const [preset, setPreset] = useState<ComparePreset>('month');
  const [custom, setCustom] = useState({ aFrom: '', aTo: '', bFrom: '', bTo: '' });
  const [r, setR] = useState<ReportCompareDto | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: ComparePreset = preset) => {
    if (p === 'custom' && !Object.values(custom).every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) return;
    setLoading(true);
    try { setR(await api.reportCompare(p, p === 'custom' ? custom : undefined)); } catch (e) { Alert.alert('โหลดไม่สำเร็จ', (e as Error).message); } finally { setLoading(false); }
  }, [api, preset, custom]);
  useEffect(() => { if (preset !== 'custom') load(); }, [preset, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p: ComparePreset) => {
    setPreset(p);
    if (p === 'custom' && r && !custom.aFrom) setCustom({ aFrom: r.a.from, aTo: r.a.to, bFrom: r.b.from, bTo: r.b.to });
  };

  const max = r ? Math.max(1, ...buttons.flatMap((b) => [r.a.byButton[b.button] ?? 0, r.b.byButton[b.button] ?? 0])) : 1;
  const diff = r ? r.a.total - r.b.total : 0;
  const top = r ? buttons.map((b) => ({ b, d: (r.a.byButton[b.button] ?? 0) - (r.b.byButton[b.button] ?? 0) })).filter((x) => x.d > 0).sort((x, y) => y.d - x.d).slice(0, 2) : [];

  const share = () => {
    if (!r) return;
    const lines = [
      `สรุปการขอความช่วยเหลือของ${patientName} (CarePing)`,
      `ช่วง A ${rangeLabel(r.a.from, r.a.to)}: ${r.a.total} ครั้ง (เฉลี่ย ${r.a.perDay}/วัน, กลางคืน ${r.a.night})`,
      `ช่วง B ${rangeLabel(r.b.from, r.b.to)}: ${r.b.total} ครั้ง (เฉลี่ย ${r.b.perDay}/วัน, กลางคืน ${r.b.night})`,
      ...buttons.map((b) => `- ${b.label}: ${r.a.byButton[b.button] ?? 0} เทียบ ${r.b.byButton[b.button] ?? 0}`),
      ...(r.a.events.length ? ['เหตุการณ์ในช่วง A: ' + r.a.events.map((e) => `${shortDate(e.date)} ${e.title}`).join(', ')] : []),
      'หมายเหตุ: เป็นความถี่การกดเรียก ไม่ใช่ผลวินิจฉัย',
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} />} keyboardShouldPersistTaps="handled">
      {header}
      <Card style={st.mt}>
        <View style={s.presets}>
          {PRESETS.map(([p, label]) => (
            <Pressable key={p} onPress={() => pick(p)} style={[s.preset, preset === p && s.presetOn]}>
              <Text style={[s.presetText, preset === p && { color: colors.primary }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {preset === 'custom' ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            {(['a', 'b'] as const).map((k) => (
              <View key={k} style={s.rangeRow}>
                <View style={[s.sq, { backgroundColor: k === 'a' ? colors.primary : B_COLOR }]} />
                <Text style={s.rangeKey}>ช่วง {k.toUpperCase()}</Text>
                <TextInput style={s.dateInput} value={custom[`${k}From`]} onChangeText={(v) => setCustom((c) => ({ ...c, [`${k}From`]: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
                <Text style={st.small}>ถึง</Text>
                <TextInput style={s.dateInput} value={custom[`${k}To`]} onChangeText={(v) => setCustom((c) => ({ ...c, [`${k}To`]: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} />
              </View>
            ))}
            <View style={{ flexDirection: 'row' }}><Button title="เทียบ" onPress={() => load('custom')} loading={loading} /></View>
          </View>
        ) : r ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <View style={s.rangeRow}><View style={[s.sq, { backgroundColor: colors.primary }]} /><Text style={s.rangeKey}>ช่วง A</Text><Text style={s.rangeVal}>{rangeLabel(r.a.from, r.a.to)}</Text></View>
            <View style={s.rangeRow}><View style={[s.sq, { backgroundColor: B_COLOR }]} /><Text style={s.rangeKey}>ช่วง B</Text><Text style={s.rangeVal}>{rangeLabel(r.b.from, r.b.to)}</Text></View>
          </View>
        ) : null}
        {r ? <Text style={[st.small, { marginTop: 8 }]}>{r.note}</Text> : null}
      </Card>

      {r ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {(['a', 'b'] as const).map((k) => (
              <Card key={k} style={{ flex: 1, padding: 12 }}>
                <View style={st.row}><View style={[s.sq, { backgroundColor: k === 'a' ? colors.primary : B_COLOR }]} /><Text style={st.small}>ช่วง {k.toUpperCase()}</Text></View>
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{r[k].total} ครั้ง</Text>
                <Text style={st.small}>เฉลี่ย {r[k].perDay} ครั้ง/วัน</Text>
              </Card>
            ))}
          </View>
          <View style={[s.verdict, { backgroundColor: diff > 0 ? '#D977061A' : diff < 0 ? '#16A34A1A' : '#6B73851A' }]}>
            <Text style={s.verdictText}>
              {diff === 0 ? 'สองช่วงเรียกเท่ากัน' : `ช่วง A เรียก${diff > 0 ? 'บ่อยขึ้น' : 'น้อยลง'} ${Math.abs(diff)} ครั้ง`}
              {top.length ? ` ส่วนใหญ่เป็น${top.map((x) => x.b.label).join('และ')}` : ''}
            </Text>
          </View>

          <Card style={st.mt}>
            <Text style={st.title}>แยกตามประเภท</Text>
            <Text style={st.small}>บอกความต่างเป็นจำนวนครั้ง ไม่ใช้ %</Text>
            {buttons.map((b) => {
              const a = r.a.byButton[b.button] ?? 0, bb = r.b.byButton[b.button] ?? 0;
              return (
                <View key={b.button} style={{ paddingVertical: 6 }}>
                  <View style={[st.row, { justifyContent: 'space-between' }]}>
                    <View style={st.row}><View style={[st.sw, { backgroundColor: bColor(b.button) }]} /><Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{b.label}</Text></View>
                    <Delta now={a} before={bb} />
                  </View>
                  {[[a, colors.primary], [bb, B_COLOR]].map(([v, c], i) => (
                    <View key={i} style={[st.row, { marginTop: 4 }]}>
                      <View style={{ height: 10, borderRadius: 5, width: `${Math.max(2, ((v as number) / max) * 70)}%`, backgroundColor: c as string }} />
                      <Text style={st.small}>{v}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </Card>

          <Card style={st.mt}>
            <Text style={st.title}>ภาพรวมอื่น ๆ</Text>
            <View style={st.item}><Text style={st.text}>กลางคืน (22–06)</Text><Text style={s.a}>{r.a.night}</Text><Text style={st.small}>vs</Text><Text style={s.b}>{r.b.night}</Text><Delta now={r.a.night} before={r.b.night} /></View>
            <View style={st.item}><Text style={st.text}>เหตุการณ์ในช่วง</Text><Text style={s.a}>{r.a.events.length}</Text><Text style={st.small}>vs</Text><Text style={s.b}>{r.b.events.length}</Text></View>
            {r.a.events.map((e) => <Text key={e.id} style={[st.small, { marginLeft: 4 }]}>• {shortDate(e.date)} {e.title} ({EVENT_TYPE_LABEL[e.type]})</Text>)}
          </Card>

          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button title="แชร์สรุปช่วงนี้ให้หมอ" variant="outline" onPress={share} />
          </View>
          <Disclaimer />
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 6 },
  presetOn: { backgroundColor: '#2563EB1F', borderColor: colors.primary },
  presetText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sq: { width: 10, height: 10, borderRadius: 3 },
  rangeKey: { fontSize: 13, fontWeight: '700', color: colors.muted },
  rangeVal: { fontSize: 15, fontWeight: '600', color: colors.ink },
  dateInput: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: colors.ink },
  verdict: { borderRadius: 12, padding: 12, marginTop: 12 },
  verdictText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  a: { fontSize: 14, fontWeight: '700', color: colors.primary },
  b: { fontSize: 14, fontWeight: '700', color: '#6B7385' },
});
