import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Api } from '../api';
import { colors } from '../theme';
import { Button, Card } from '../components/ui';

/** ช่วงพัฒนา: เลือกว่าเป็นผู้ดูแลคนไหน (ยังไม่มีระบบล็อกอินจริง) */
export function LoginScreen({
  initialUrl,
  onLogin,
}: {
  initialUrl: string;
  onLogin: (url: string, user: { id: string; name: string }) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await Api.users(url.replace(/\/$/, '')));
    } catch (e) {
      setError(`เชื่อมต่อไม่ได้: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.brand}>CarePing</Text>
      <Text style={styles.sub}>โหมดพัฒนา · เลือกผู้ดูแล</Text>
      <Card>
        <Text style={styles.label}>ที่อยู่ backend</Text>
        <TextInput style={styles.input} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} />
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Button title="เชื่อมต่อ" onPress={load} loading={loading} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>
      {loading && !users ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}
      {users?.map((u) => (
        <Pressable key={u.id} onPress={() => onLogin(url.replace(/\/$/, ''), u)}>
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.role}>{u.role === 'admin' ? 'แอดมิน' : 'ผู้ดูแล'}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 80 },
  brand: { fontSize: 34, fontWeight: '800', color: colors.ink },
  sub: { color: colors.muted, marginBottom: 20 },
  label: { color: colors.muted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink },
  error: { color: colors.red, marginTop: 10 },
  name: { fontSize: 18, fontWeight: '700', color: colors.ink },
  role: { color: colors.muted, marginTop: 2 },
});
