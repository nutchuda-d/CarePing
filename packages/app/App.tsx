import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ServerEvent } from '@careping/shared';
import { Api, defaultServerUrl, useLiveState } from './src/api';
import { AlertOverlay } from './src/components/AlertOverlay';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DiaryScreen } from './src/diary/DiaryScreen';
import { ReportScreen } from './src/report/ReportScreen';
import { colors } from './src/theme';

const SESSION_KEY = 'careping.session';
type Session = { url: string; userId: string; name: string };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((s) => setSession(s ? JSON.parse(s) : null))
      .catch(() => setSession(null));
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="dark" />
        {session === undefined ? null : session ? (
          <Main
            session={session}
            onLogout={async () => {
              await AsyncStorage.removeItem(SESSION_KEY);
              setSession(null);
            }}
          />
        ) : (
          <LoginScreen
            initialUrl={defaultServerUrl()}
            onLogin={async (url, user) => {
              const s = { url, userId: user.id, name: user.name };
              await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
              setSession(s);
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type Tab = 'home' | 'diary' | 'report';
type AlertEvent = Extract<ServerEvent, { type: 'alert' | 'device' }>;

function Main({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const api = useMemo(() => new Api(session.url, session.userId), [session]);
  const [tab, setTab] = useState<Tab>('home');
  const [alert, setAlert] = useState<AlertEvent | null>(null);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);

  const { state, connected, error, refresh } = useLiveState(api, (e) => {
    if (e.type === 'alert' || e.type === 'device') {
      // ฉุกเฉินสั่นยาวกว่า (เสียงจริงจะมาจาก push notification ในเวอร์ชันถัดไป)
      const urgent = e.type === 'alert' && e.case.urgency === 'urgent';
      Vibration.vibrate(urgent ? [0, 800, 300, 800, 300, 800] : [0, 400, 200, 400]);
      setAlert(e);
    }
    versionRef.current += 1;
    setVersion(versionRef.current);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>CarePing</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.user}>{session.name} · ออก</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' ? <HomeScreen api={api} state={state} connected={connected} error={error} refresh={refresh} version={version} /> : null}
        {tab === 'diary' ? <DiaryScreen api={api} version={version} /> : null}
        {tab === 'report' ? <ReportScreen api={api} buttons={state?.buttons ?? []} version={version} patientName={state?.patient.name ?? 'ผู้ป่วย'} /> : null}
      </View>

      <View style={styles.tabbar}>
        {(
          [
            ['home', 'หน้าหลัก'],
            ['diary', 'บันทึก'],
            ['report', 'รายงาน'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable key={key} style={styles.tabItem} onPress={() => setTab(key)}>
            <Text style={[styles.tabText, tab === key && styles.tabOn]}>
              {label}
              {key === 'home' && state?.openCases.length ? ` (${state.openCases.length})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <AlertOverlay
        event={alert}
        onAck={async (id) => {
          await api.ack(id);
          await refresh();
        }}
        onClose={() => setAlert(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  brand: { fontSize: 18, fontWeight: '800', color: colors.primary },
  user: { color: colors.muted },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabOn: { color: colors.primary },
});
