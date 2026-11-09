import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LedState, PressMessage } from '@careping/shared';
import { openDb } from '../src/db.ts';
import { Engine } from '../src/engine.ts';
import { Notifier } from '../src/notifier.ts';

async function setup() {
  const db = await openDb();
  let t = 1_800_000_000_000;
  const leds: LedState[] = [];
  const notifier = new Notifier(db, { expoPush: false });
  const engine = new Engine({ db, notifier, now: () => t, publishLed: (_d, s) => leds.push(s) });
  let n = 0;
  const press = (button: number, extra: Partial<PressMessage> = {}) =>
    engine.handlePress('btn-001', { eventId: `e${++n}`, button: button as 1, ts: t, ...extra });
  const advance = async (sec: number) => {
    t += sec * 1000;
    await engine.tick();
  };
  const alerts = () => notifier.sent.filter((s) => s.event.type === 'alert');
  const lastAlertTargets = () => {
    const all = alerts();
    const last = all.at(-1)!;
    const sameTime = all.filter((a) => a.event === last.event);
    return sameTime.map((a) => a.userId).sort();
  };
  return { db, engine, notifier, press, advance, alerts, lastAlertTargets, leds, now: () => t };
}

test('ปกติ: ไล่ตามลำดับทีละคน แล้วแจ้งทุกคน 3 รอบ จากนั้นเป็นไม่มีผู้ตอบ', async () => {
  const s = await setup();
  const c = await s.press(1);
  assert.deepEqual(s.lastAlertTargets(), ['u-1']);
  assert.equal(s.leds.at(-1), 'waiting');
  await s.advance(119);
  assert.equal(s.alerts().length, 1);
  await s.advance(1);
  assert.deepEqual(s.lastAlertTargets(), ['u-2']);
  await s.advance(120);
  assert.deepEqual(s.lastAlertTargets(), ['u-3']);
  for (let round = 1; round <= 3; round++) {
    await s.advance(120);
    assert.deepEqual(s.lastAlertTargets(), ['u-1', 'u-2', 'u-3'], `รอบ ${round}`);
  }
  await s.advance(120);
  const state = await s.engine.state('u-1');
  assert.equal(state.openCases[0].id, c!.id);
  assert.equal(state.openCases[0].status, 'no_response');
  assert.equal(s.leds.at(-1), 'no_response');
  assert.equal(s.alerts().length, 3 + 9);
});

test('รับทราบแล้วหยุดแจ้ง, ปิดเคสแล้ว LED ดับ', async () => {
  const s = await setup();
  const c = await s.press(2);
  await s.advance(120); // ไปถึงคนที่ 2
  const acked = await s.engine.ack(c!.id, 'u-2');
  assert.equal(acked.status, 'acknowledged');
  assert.equal(acked.ackedByName, 'ลูกคนรอง');
  assert.equal(s.leds.at(-1), 'acked');
  const before = s.alerts().length;
  await s.advance(600);
  assert.equal(s.alerts().length, before);
  await assert.rejects(s.engine.ack(c!.id, 'u-1'), /รับทราบไปแล้ว/);
  const resolved = await s.engine.resolve(c!.id, 'u-2', 'พาไปห้องน้ำแล้ว');
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.note, 'พาไปห้องน้ำแล้ว');
  assert.equal(s.leds.at(-1), 'idle');
});

test('กดปุ่มเดิมซ้ำใน 5 นาทีไม่แจ้งซ้ำ แต่นับจำนวนครั้ง', async () => {
  const s = await setup();
  const c = await s.press(1);
  await s.advance(30);
  await s.press(1);
  await s.press(1);
  assert.equal(s.alerts().length, 1);
  const state = await s.engine.state('u-1');
  assert.equal(state.openCases.length, 1);
  assert.equal(state.openCases[0].pressCount, 3);
  // ปุ่มอื่นเปิดเคสใหม่
  await s.press(2);
  assert.equal((await s.engine.state('u-1')).openCases.length, 2);
  assert.ok(c);
});

test('ฉุกเฉิน: แจ้งทุกคนทันทีรวมคนที่อยู่นอกบ้าน และกดซ้ำแจ้งซ้ำ', async () => {
  const s = await setup();
  await s.engine.setAway('u-2', true);
  await s.press(5);
  assert.deepEqual(s.lastAlertTargets(), ['u-1', 'u-2', 'u-3']);
  await s.press(5);
  assert.deepEqual(s.lastAlertTargets(), ['u-1', 'u-2', 'u-3']);
  assert.equal((await s.engine.state('u-1')).openCases.length, 1);
});

test('คนที่อยู่นอกบ้านถูกข้ามในลำดับ, ระดับสูงรวมคนนอกบ้านตอนแจ้งทุกคน', async () => {
  const s = await setup();
  await s.engine.setAway('u-1', true);
  await s.press(3); // ปวด = สูง รอคนละ 60 วิ
  assert.deepEqual(s.lastAlertTargets(), ['u-2']);
  await s.advance(60);
  assert.deepEqual(s.lastAlertTargets(), ['u-3']);
  await s.advance(60);
  assert.deepEqual(s.lastAlertTargets(), ['u-1', 'u-2', 'u-3']);
});

test('ไม่มีใครอยู่บ้าน: แจ้งคนลำดับแรก และ LED บอกว่าไม่มีใครอยู่บ้าน', async () => {
  const s = await setup();
  for (const u of ['u-1', 'u-2', 'u-3']) await s.engine.setAway(u, true);
  await s.press(1);
  assert.deepEqual(s.lastAlertTargets(), ['u-1']);
  assert.equal(s.leds.at(-1), 'nobody_home');
});

test('event ที่ส่งล่าช้าเกิน 15 นาทีเป็นแค่การแจ้งให้ทราบ ไม่เริ่ม escalation', async () => {
  const s = await setup();
  const c = await s.press(1, { ts: s.now() - 20 * 60_000, queuedOffline: true });
  assert.equal(c!.status, 'late_info');
  assert.equal(s.alerts().at(-1)!.event.type === 'alert' && (s.alerts().at(-1)!.event as any).reason, 'late_info');
  const n = s.alerts().length;
  await s.advance(600);
  assert.equal(s.alerts().length, n);
});

test('eventId ซ้ำ (MQTT ส่งซ้ำ) ถูกข้าม', async () => {
  const s = await setup();
  await s.engine.handlePress('btn-001', { eventId: 'same', button: 1, ts: s.now() });
  await s.engine.handlePress('btn-001', { eventId: 'same', button: 1, ts: s.now() });
  assert.equal(s.alerts().length, 1);
  const state = await s.engine.state('u-1');
  assert.equal(state.openCases[0].pressCount, 1);
});

test('ปุ่มขาด heartbeat 3 ครั้งแจ้งทุกคน และแจ้งอีกครั้งเมื่อกลับมา', async () => {
  const s = await setup();
  const hb = () => s.engine.handleHeartbeat('btn-001', { battery: 80, rssi: -60, fw: '0.1', ts: s.now() });
  await hb();
  const devAlerts = () => s.notifier.sent.filter((x) => x.event.type === 'device').map((x) => (x.event as any).reason);
  assert.deepEqual(devAlerts(), []); // ครั้งแรกไม่ต้องแจ้ง
  await s.advance(179);
  assert.deepEqual(devAlerts(), []);
  await s.advance(2);
  assert.deepEqual(devAlerts(), ['offline', 'offline', 'offline']);
  assert.equal((await s.engine.state('u-1')).device!.online, false);
  await hb();
  assert.deepEqual(devAlerts().slice(3), ['online', 'online', 'online']);
});

test('แบตต่ำแจ้งเฉพาะแอดมินวันละครั้ง', async () => {
  const s = await setup();
  await s.engine.handleHeartbeat('btn-001', { battery: 15, rssi: -60, fw: '0.1', ts: s.now() });
  await s.engine.handleHeartbeat('btn-001', { battery: 14, rssi: -60, fw: '0.1', ts: s.now() });
  const low = s.notifier.sent.filter((x) => x.event.type === 'device' && (x.event as any).reason === 'low_battery');
  assert.deepEqual(low.map((x) => x.userId), ['u-1']);
});
