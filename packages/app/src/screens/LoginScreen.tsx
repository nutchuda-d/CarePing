import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Api } from '../api';
import { colors } from '../theme';

type Props = {
  initialUrl: string;
  onLogin: (url: string, user: { id: string; name: string }) => void;
};

const digits = (s: string) => s.replace(/\D/g, '');
/** 0812345678 → "081 234 5678" (sep "-" → "081-234-5678") */
const formatPhone = (d: string, sep = ' ') => [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(sep);

/** เข้าสู่ระบบด้วยเบอร์โทร + OTP (ตรงกับ Figma: 00a เข้าสู่ระบบ, 00b ยืนยัน OTP) */
export function LoginScreen({ initialUrl, onLogin }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [showUrl, setShowUrl] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<{ phone: string; resendAt: number; devCode?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const base = url.trim().replace(/\/$/, '');
  const valid = /^0\d{9}$/.test(phone);

  const request = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await Api.requestOtp(base, phone);
      setOtp({ phone: r.phone, resendAt: Date.now() + r.resendInSec * 1000, devCode: r.devCode });
    } catch (e) {
      const msg = (e as Error).message;
      setError(/network|fetch/i.test(msg) ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่าเปิด backend แล้วและอยู่ Wi-Fi เดียวกัน' : msg);
    } finally {
      setLoading(false);
    }
  };

  if (otp) {
    return (
      <OtpStep
        base={base}
        phone={otp.phone}
        resendAt={otp.resendAt}
        devCode={otp.devCode}
        onBack={() => {
          setOtp(null);
          setError(null);
        }}
        onResent={(r) => setOtp({ phone: r.phone, resendAt: Date.now() + r.resendInSec * 1000, devCode: r.devCode })}
        onDone={(user) => onLogin(base, user)}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View>
        {/* กดค้างที่โลโก้เพื่อแก้ที่อยู่ backend (เฉพาะช่วงพัฒนา) */}
        <Pressable style={styles.appIcon} onLongPress={() => setShowUrl((v) => !v)} delayLongPress={600}>
          <View style={styles.iconRing} />
          <View style={styles.iconDot} />
        </Pressable>
        <Text style={styles.brand}>CarePing</Text>
        <Text style={styles.sub}>เข้าสู่ระบบเพื่อรับแจ้งเตือนจากปุ่มของผู้ป่วย</Text>

        <View style={styles.card}>
          <Text style={styles.label}>เบอร์โทรศัพท์</Text>
          <View style={styles.phoneRow}>
            <View style={styles.country}>
              <Text style={styles.inputText}>🇹🇭 +66</Text>
            </View>
            <TextInput
              style={[styles.input, focused && styles.inputFocus]}
              value={formatPhone(phone)}
              onChangeText={(t) => {
                setPhone(digits(t).slice(0, 10));
                setError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="081 234 5678"
              placeholderTextColor="#A6ACB9"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={12}
              returnKeyType="done"
              onSubmitEditing={request}
            />
          </View>
          <Text style={styles.help}>เราจะส่งรหัส 6 หลักทาง SMS ไปที่เบอร์นี้</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title="ขอรหัส OTP" onPress={request} loading={loading} disabled={!valid} />
        </View>

        {showUrl ? (
          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.label}>ที่อยู่ backend (โหมดพัฒนา)</Text>
            <TextInput style={styles.input} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          </View>
        ) : null}

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.help}>หรือ</Text>
          <View style={styles.rule} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          onPress={() => Alert.alert('รหัสเชิญจากครอบครัว', 'ฟีเจอร์นี้ยังไม่เปิดใช้งาน ตอนนี้ให้แอดมินเพิ่มเบอร์ของคุณในทีมดูแลก่อน')}
        >
          <Text style={styles.secondaryText}>เข้าร่วมด้วยรหัสเชิญจากครอบครัว</Text>
        </Pressable>
        <Text style={[styles.help, { textAlign: 'center', marginTop: 10 }]}>ใช้เมื่อสมาชิกในครอบครัวส่งรหัสเชิญมาให้</Text>
      </View>

      <Text style={styles.legal}>
        การเข้าสู่ระบบถือว่าคุณยอมรับ <Text style={styles.link}>ข้อกำหนดการใช้งาน</Text> และ{' '}
        <Text style={styles.link}>นโยบายความเป็นส่วนตัว</Text>
      </Text>
    </ScrollView>
  );
}

function OtpStep({
  base,
  phone,
  resendAt,
  devCode,
  onBack,
  onResent,
  onDone,
}: {
  base: string;
  phone: string;
  resendAt: number;
  devCode?: string;
  onBack: () => void;
  onResent: (r: { phone: string; resendInSec: number; devCode?: string }) => void;
  onDone: (user: { id: string; name: string }) => void;
}) {
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [resendAt]);

  const verify = async (value = code) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      onDone(await Api.verifyOtp(base, phone, value));
    } catch (e) {
      setError((e as Error).message);
      setCode('');
      input.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      onResent(await Api.requestOtp(base, phone));
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const active = Math.min(code.length, 5);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: 16 }]} keyboardShouldPersistTaps="handled">
      <View>
        <Pressable onPress={onBack} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
          <Text style={styles.back}>‹ เปลี่ยนเบอร์</Text>
        </Pressable>
        <Text style={styles.title}>ใส่รหัสยืนยัน</Text>
        <Text style={styles.sub2}>
          ส่งรหัส 6 หลักทาง SMS ไปที่ <Text style={styles.strong}>{formatPhone(phone, '-')}</Text> แล้ว
        </Text>

        <View style={styles.card}>
          <Pressable style={styles.otpRow} onPress={() => input.current?.focus()}>
            {Array.from({ length: 6 }, (_, i) => (
              <View key={i} style={[styles.digit, i === active && styles.digitActive]}>
                <Text style={styles.digitText}>{code[i] ?? ''}</Text>
              </View>
            ))}
            <TextInput
              ref={input}
              style={styles.hiddenInput}
              value={code}
              onChangeText={(t) => {
                const v = digits(t).slice(0, 6);
                setCode(v);
                setError(null);
                if (v.length === 6) verify(v);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={6}
              autoFocus
              caretHidden
            />
          </Pressable>

          {left > 0 ? (
            <Text style={styles.resend}>
              ไม่ได้รับรหัส? ส่งอีกครั้งได้ใน{' '}
              <Text style={styles.strong}>
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </Text>
            </Text>
          ) : (
            <Pressable onPress={resend} hitSlop={8}>
              <Text style={styles.resend}>
                ไม่ได้รับรหัส? <Text style={styles.link}>ส่งรหัสอีกครั้ง</Text>
              </Text>
            </Pressable>
          )}
          {error ? <Text style={[styles.error, { textAlign: 'center' }]}>{error}</Text> : null}
          <PrimaryButton title="ยืนยันและเข้าสู่ระบบ" onPress={() => verify()} loading={loading} disabled={code.length !== 6} style={{ marginTop: 16 }} />
        </View>

        <View style={styles.hint}>
          <Text style={styles.hintText}>รหัสใช้ได้ 5 นาที · อย่าบอกรหัสนี้กับใคร แม้จะอ้างว่าเป็นเจ้าหน้าที่ CarePing</Text>
        </View>
        {devCode ? <Text style={styles.dev}>โหมดพัฒนา (ยังไม่ได้ต่อ SMS จริง) · รหัสคือ {devCode}</Text> : null}
      </View>
    </ScrollView>
  );
}

function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.primaryBtn, style, (disabled || pressed) && { opacity: disabled ? 0.45 : 0.8 }]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 34 },
  appIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconRing: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)' },
  iconDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  brand: { fontSize: 34, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 24 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  label: { fontSize: 14, color: colors.muted, marginBottom: 6 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  country: { height: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  input: { flex: 1, height: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, fontSize: 14, color: colors.ink },
  inputFocus: { borderWidth: 1.5, borderColor: colors.primary },
  inputText: { fontSize: 14, color: colors.ink },
  help: { fontSize: 13, color: colors.muted, marginTop: 8 },
  error: { fontSize: 13, color: colors.red, marginTop: 8 },
  primaryBtn: { height: 49, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: 1, backgroundColor: colors.line, marginTop: 8 },
  secondaryBtn: { height: 49, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.ink },
  legal: { fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: 'center', paddingHorizontal: 20, marginTop: 32 },
  link: { color: colors.primary },
  back: { fontSize: 15, fontWeight: '600', color: colors.primary },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 24 },
  sub2: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 24 },
  strong: { color: colors.ink, fontWeight: '600' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  digit: { width: 46, height: 56, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  digitActive: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary },
  digitText: { fontSize: 24, fontWeight: '700', color: colors.ink },
  hiddenInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.01, color: 'transparent' },
  resend: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
  hint: { backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 },
  hintText: { fontSize: 13, lineHeight: 18, color: colors.primary },
  dev: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 12 },
});
