import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { Auth, normalizePhone } from '../src/auth.ts';

async function setup() {
  const db = await openDb();
  let t = Date.parse('2026-11-10T03:00:00Z');
  const auth = new Auth({ db, now: () => t, devEcho: true });
  return { auth, wait: (sec: number) => { t += sec * 1000; } };
}

test('รับเบอร์ได้หลายรูปแบบ และปฏิเสธเบอร์ที่ไม่ครบ', () => {
  assert.equal(normalizePhone('081 234 5678'), '0812345678');
  assert.equal(normalizePhone('+66 81-234-5678'), '0812345678');
  assert.throws(() => normalizePhone('08123'));
  assert.throws(() => normalizePhone(undefined));
});

test('ขอ OTP แล้วยืนยันเข้าสู่ระบบได้ และใช้รหัสซ้ำไม่ได้', async () => {
  const s = await setup();
  const r = await s.auth.requestOtp('081 234 5678');
  assert.match(r.devCode!, /^\d{6}$/);
  const user = await s.auth.verify('0812345678', r.devCode);
  assert.deepEqual(user, { id: 'u-1', name: 'ลูกคนโต', role: 'admin' });
  await assert.rejects(s.auth.verify('0812345678', r.devCode), /หมดอายุ/);
});

test('เบอร์ที่ไม่อยู่ในทีมดูแลขอรหัสไม่ได้', async () => {
  const s = await setup();
  await assert.rejects(s.auth.requestOtp('0999999999'), /ยังไม่มีเบอร์นี้/);
});

test('รหัสผิด รหัสหมดอายุ และขอซ้ำเร็วเกินไป', async () => {
  const s = await setup();
  const r = await s.auth.requestOtp('0822345678');
  const wrong = r.devCode === '000000' ? '111111' : '000000';
  await assert.rejects(s.auth.verify('0822345678', wrong), /ไม่ถูกต้อง/);
  await assert.rejects(s.auth.requestOtp('0822345678'), /ขอรหัสใหม่ได้ในอีก/);
  s.wait(61);
  const r2 = await s.auth.requestOtp('0822345678');
  s.wait(301);
  await assert.rejects(s.auth.verify('0822345678', r2.devCode), /หมดอายุ/);
});

test('ใส่ผิดครบ 5 ครั้งต้องขอรหัสใหม่', async () => {
  const s = await setup();
  const r = await s.auth.requestOtp('0832345678');
  const wrong = r.devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) await assert.rejects(s.auth.verify('0832345678', wrong), /ไม่ถูกต้อง/);
  await assert.rejects(s.auth.verify('0832345678', wrong), /หลายครั้ง/);
  await assert.rejects(s.auth.verify('0832345678', r.devCode), /หมดอายุ/);
});
