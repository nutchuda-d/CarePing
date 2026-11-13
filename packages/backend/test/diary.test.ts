import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { Engine } from '../src/engine.ts';
import { Notifier } from '../src/notifier.ts';
import { Diary } from '../src/diary.ts';
import { Reports } from '../src/reports.ts';
import { dayStart } from '../src/time.ts';

const TZ = 420;
async function setup(nowIso = '2026-11-10T03:00:00Z') {
  const db = await openDb();
  let t = Date.parse(nowIso);
  const now = () => t;
  const notifier = new Notifier(db, { expoPush: false });
  const engine = new Engine({ db, notifier, now, publishLed: () => {} });
  const diary = new Diary({ db, engine, notifier, tzOffsetMin: TZ, now });
  const reports = new Reports({ db, engine, diary, tzOffsetMin: TZ, now });
  let n = 0;
  const addCase = async (date: string, hhmm: string, button: number) => {
    const at = dayStart(date, TZ) + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000;
    await db.query(`INSERT INTO care_case (id, patient_id, device_id, button, urgency, status, pressed_at, last_press_at, phase) VALUES ($1, 'pat-1', 'btn-001', $2, 'normal', 'resolved', $3, $3, 'done')`, [`c${++n}`, button, at]);
  };
  return { db, diary, reports, addCase, setNow: (iso: string) => { t = Date.parse(iso); }, notifier };
}

test('บันทึกอารมณ์และแท็ก มี log ว่าใครทำอะไร', async () => {
  const s = await setup();
  await s.diary.saveDay('u-1', '2026-11-10', { mood: 4, tagIds: ['tag-1'] });
  await s.diary.saveDay('u-2', '2026-11-10', { tagIds: ['tag-1', 'tag-2'] });
  await s.diary.saveDay('u-2', '2026-11-10', { mood: 3 });
  const day = await s.diary.day('u-3', '2026-11-10');
  assert.equal(day.mood, 3);
  assert.deepEqual(day.tagIds.sort(), ['tag-1', 'tag-2']);
  assert.deepEqual(day.log.map((l) => `${l.userName}: ${l.text}`).sort(), [
    'ลูกคนรอง: ตั้งอารมณ์เป็น เฉย ๆ',
    'ลูกคนรอง: เพิ่มแท็ก “กินได้น้อย”',
    'ลูกคนโต: ตั้งอารมณ์เป็น ดี',
    'ลูกคนโต: เพิ่มแท็ก “ร่าเริง”',
  ].sort());
  assert.ok(s.notifier.sent.length === 0, 'การบันทึกไม่ส่ง push');
});

test('โน้ตส่วนตัวเห็นเฉพาะคนเขียน และไม่ลง log', async () => {
  const s = await setup();
  await s.diary.saveDay('u-1', '2026-11-10', { note: 'คุณยายเล่าเรื่องเก่าให้ฟัง' });
  assert.equal((await s.diary.day('u-1', '2026-11-10')).note, 'คุณยายเล่าเรื่องเก่าให้ฟัง');
  assert.equal((await s.diary.day('u-2', '2026-11-10')).note, null);
  assert.equal((await s.diary.day('u-2', '2026-11-10')).log.length, 0);
});

test('บันทึกล่วงหน้าไม่ได้ และอารมณ์ต้องอยู่ระหว่าง 1–5', async () => {
  const s = await setup();
  await assert.rejects(s.diary.saveDay('u-1', '2026-11-11', { mood: 3 }), /ล่วงหน้า/);
  await assert.rejects(s.diary.saveDay('u-1', '2026-11-10', { mood: 9 }), /อารมณ์/);
});

test('สร้างแท็กเอง เลือกสีเองได้ และกันชื่อซ้ำ', async () => {
  const s = await setup();
  const tag = await s.diary.createTag('u-2', 'คิดถึงหลาน', '#e8609a');
  assert.equal(tag.color, '#E8609A');
  await assert.rejects(s.diary.createTag('u-1', 'คิดถึงหลาน', '#000000'), /มีแท็กนี้แล้ว/);
  await assert.rejects(s.diary.createTag('u-1', 'x', 'pink'), /#RRGGBB/);
  const month = await s.diary.month('u-1', '2026-11');
  assert.ok(month.tags.some((t) => t.label === 'คิดถึงหลาน'));
});

test('เหตุการณ์แสดงในปฏิทินเดือนนั้น และลง log', async () => {
  const s = await setup();
  await s.diary.createEvent('u-1', { date: '2026-11-12', time: '10:00', title: 'นัดหมอที่โรงพยาบาล', type: 'doctor' });
  await assert.rejects(s.diary.createEvent('u-1', { date: '12/11/2026', title: 'x' }), /วันที่/);
  const m = await s.diary.month('u-1', '2026-11');
  assert.equal(m.events.length, 1);
  assert.equal(m.events[0].createdByName, 'ลูกคนโต');
  assert.equal((await s.diary.month('u-1', '2026-12')).events.length, 0);
  const day = await s.diary.day('u-1', '2026-11-12');
  assert.match(day.log[0].text, /นัดหมอที่โรงพยาบาล/);
});

test('ให้ยา: บันทึกว่าใครให้ กันให้ซ้ำ และยกเลิกได้เฉพาะคนที่กด', async () => {
  const s = await setup();
  let meds = await s.diary.medsToday('u-1');
  assert.equal(meds.doses.length, 4);
  assert.equal(meds.now, '10:00');
  meds = await s.diary.setDose('u-1', 'med-1', '08:00', true);
  const d = meds.doses.find((x) => x.medicationId === 'med-1')!;
  assert.equal(d.givenByName, 'ลูกคนโต');
  await assert.rejects(s.diary.setDose('u-2', 'med-1', '08:00', true), /ไปแล้ว/);
  await assert.rejects(s.diary.setDose('u-2', 'med-1', '08:00', false), /เฉพาะคนที่บันทึก/);
  await s.diary.setDose('u-1', 'med-1', '08:00', false);
  const day = await s.diary.day('u-1', '2026-11-10');
  assert.deepEqual(day.doses, { given: 0, total: 4 });
  assert.equal(day.log.length, 2);
});

test('รายงานวันนี้: นับครั้งและเวลาตามเวลาท้องถิ่น', async () => {
  const s = await setup('2026-11-10T13:00:00Z'); // 20:00 ท้องถิ่น
  await s.addCase('2026-11-10', '02:10', 1);
  await s.addCase('2026-11-10', '14:32', 3);
  await s.addCase('2026-11-09', '23:50', 1);
  const r = await s.reports.todayReport('u-1');
  assert.equal(r.total, 2);
  assert.deepEqual(r.presses.map((p) => p.minuteOfDay), [130, 872]);
  assert.equal(r.presses[1].label, 'ปวด / ไม่สบายตัว');
});

test('รายงานสัปดาห์: 7 วันล่าสุดเทียบ 7 วันก่อนหน้า', async () => {
  const s = await setup();
  await s.addCase('2026-11-10', '09:00', 1);
  await s.addCase('2026-11-04', '23:00', 2);
  await s.addCase('2026-11-03', '09:00', 1);
  const w = await s.reports.weekReport('u-1');
  assert.equal(w.from, '2026-11-04');
  assert.equal(w.total, 2);
  assert.equal(w.prevTotal, 1);
  assert.equal(w.nightCount, 1);
  assert.equal(w.days[6].counts[1], 1);
});

test('เปรียบเทียบ: เดือนนี้เทียบจำนวนวันเท่ากัน และตั้งแต่นัดหมอครั้งก่อน', async () => {
  const s = await setup();
  await s.addCase('2026-11-05', '10:00', 1);
  await s.addCase('2026-10-05', '10:00', 1);
  await s.addCase('2026-10-20', '10:00', 1); // อยู่นอกช่วง 10 วันแรกของ ต.ค.
  const m = await s.reports.compare('u-1', 'month');
  assert.equal(m.a.from, '2026-11-01'); assert.equal(m.a.to, '2026-11-10');
  assert.equal(m.b.from, '2026-10-01'); assert.equal(m.b.to, '2026-10-10');
  assert.equal(m.a.total, 1); assert.equal(m.b.total, 1);
  assert.match(m.note, /10 วันแรก/);
  const none = await s.reports.compare('u-1', 'doctor');
  assert.equal(none.preset, 'month');
  await s.diary.createEvent('u-1', { date: '2026-11-06', title: 'นัดหมอ', type: 'doctor' });
  const d = await s.reports.compare('u-1', 'doctor');
  assert.equal(d.a.from, '2026-11-06'); assert.equal(d.a.days, 5);
  assert.equal(d.b.to, '2026-11-05'); assert.equal(d.b.days, 5);
  assert.equal(d.b.total, 1);
});
