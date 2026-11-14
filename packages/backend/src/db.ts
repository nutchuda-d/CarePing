import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_BUTTONS, DEFAULT_SETTINGS } from '@careping/shared';

export type Db = PGlite;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_team_member (
  patient_id TEXT NOT NULL REFERENCES patient(id),
  user_id TEXT NOT NULL REFERENCES app_user(id),
  role TEXT NOT NULL CHECK (role IN ('admin','caregiver')),
  priority INT NOT NULL,
  away BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (patient_id, user_id)
);
CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen DOUBLE PRECISION,
  battery INT,
  rssi INT,
  fw TEXT,
  offline_notified_at DOUBLE PRECISION,
  low_battery_notified_at DOUBLE PRECISION
);
CREATE TABLE IF NOT EXISTS button_config (
  patient_id TEXT NOT NULL REFERENCES patient(id),
  button INT NOT NULL,
  label TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('normal','high','urgent')),
  PRIMARY KEY (patient_id, button)
);
CREATE TABLE IF NOT EXISTS settings (
  patient_id TEXT PRIMARY KEY REFERENCES patient(id),
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_token (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id)
);
CREATE TABLE IF NOT EXISTS care_case (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  device_id TEXT NOT NULL,
  button INT NOT NULL,
  urgency TEXT NOT NULL,
  status TEXT NOT NULL,
  pressed_at DOUBLE PRECISION NOT NULL,
  last_press_at DOUBLE PRECISION NOT NULL,
  press_count INT NOT NULL DEFAULT 1,
  delayed BOOLEAN NOT NULL DEFAULT FALSE,
  nobody_home BOOLEAN NOT NULL DEFAULT FALSE,
  acked_by TEXT REFERENCES app_user(id),
  acked_at DOUBLE PRECISION,
  resolved_at DOUBLE PRECISION,
  note TEXT,
  phase TEXT NOT NULL,
  step INT NOT NULL DEFAULT 0,
  round INT NOT NULL DEFAULT 0,
  next_action_at DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS care_case_due ON care_case (next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS care_case_patient_time ON care_case (patient_id, pressed_at);
CREATE TABLE IF NOT EXISTS press_log (
  event_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_attempt (
  id SERIAL PRIMARY KEY,
  case_id TEXT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  round INT NOT NULL DEFAULT 0,
  sent_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  created_by TEXT REFERENCES app_user(id),
  created_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_log (
  patient_id TEXT NOT NULL REFERENCES patient(id),
  date TEXT NOT NULL,
  mood INT CHECK (mood BETWEEN 1 AND 5),
  updated_by TEXT REFERENCES app_user(id),
  updated_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (patient_id, date)
);
CREATE TABLE IF NOT EXISTS daily_log_tag (
  patient_id TEXT NOT NULL,
  date TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tag(id),
  PRIMARY KEY (patient_id, date, tag_id)
);
CREATE TABLE IF NOT EXISTS private_note (
  patient_id TEXT NOT NULL,
  date TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES app_user(id),
  text TEXT NOT NULL,
  updated_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (patient_id, date, author_id)
);
CREATE TABLE IF NOT EXISTS diary_audit (
  id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  date TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_user(id),
  text TEXT NOT NULL,
  at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS care_event (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  date TEXT NOT NULL,
  time TEXT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doctor','medication','therapy','other')),
  detail TEXT,
  created_by TEXT REFERENCES app_user(id),
  created_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS care_event_date ON care_event (patient_id, date);
CREATE TABLE IF NOT EXISTS medication (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  name TEXT NOT NULL,
  dose TEXT NOT NULL,
  instructions TEXT,
  times TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS dose_log (
  medication_id TEXT NOT NULL REFERENCES medication(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  given_by TEXT NOT NULL REFERENCES app_user(id),
  given_at DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (medication_id, date, time)
);
CREATE TABLE IF NOT EXISTS device_status_log (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  battery INT,
  at DOUBLE PRECISION NOT NULL
);
`;

export async function openDb(dataDir?: string, log: (m: string) => void = console.warn): Promise<Db> {
  let db: PGlite;
  // PGlite สร้างเฉพาะโฟลเดอร์สุดท้าย จึงต้องสร้างโฟลเดอร์แม่ (.data) ให้ก่อน
  if (dataDir) mkdirSync(dirname(dataDir), { recursive: true });
  try {
    db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  } catch (e) {
    // ฐานข้อมูลเสีย (เช่น ปิดโปรแกรมกลางคัน หรือเปิด backend ซ้อนกันสองตัว)
    // ย้ายของเดิมไปเก็บไว้ แล้วเริ่มฐานข้อมูลใหม่ เพื่อให้ช่วงพัฒนาใช้งานต่อได้ทันที
    if (!dataDir || !existsSync(dataDir)) throw e;
    const backup = `${dataDir}-broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(dataDir, backup);
    log(`[db] เปิดฐานข้อมูลไม่ได้ (${String(e).slice(0, 80)}) ย้ายของเดิมไปที่ ${backup} แล้วเริ่มใหม่`);
    db = await PGlite.create(dataDir);
  }
  await db.exec(SCHEMA);
  await seedIfEmpty(db);
  await seedDiary(db);
  return db;
}

/** ข้อมูลตั้งต้นสำหรับพัฒนา: บ้าน 1 หลัง ผู้ป่วย 1 คน ผู้ดูแล 3 คน ปุ่ม 1 ตัว */
async function seedIfEmpty(db: Db) {
  const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM organization');
  if (rows[0].n > 0) return;
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO organization VALUES ('org-1', 'บ้านทดสอบ')`);
    await tx.query(`INSERT INTO patient VALUES ('pat-1', 'org-1', 'คุณยาย')`);
    const users: [string, string, 'admin' | 'caregiver'][] = [
      ['u-1', 'ลูกคนโต', 'admin'],
      ['u-2', 'ลูกคนรอง', 'caregiver'],
      ['u-3', 'หลาน', 'caregiver'],
    ];
    for (const [i, [id, name, role]] of users.entries()) {
      await tx.query('INSERT INTO app_user VALUES ($1, $2)', [id, name]);
      await tx.query(
        'INSERT INTO care_team_member (patient_id, user_id, role, priority) VALUES ($1, $2, $3, $4)',
        ['pat-1', id, role, i + 1],
      );
    }
    await tx.query(`INSERT INTO device (id, patient_id) VALUES ('btn-001', 'pat-1')`);
    for (const b of DEFAULT_BUTTONS) {
      await tx.query('INSERT INTO button_config VALUES ($1, $2, $3, $4)', ['pat-1', b.button, b.label, b.urgency]);
    }
    await tx.query('INSERT INTO settings VALUES ($1, $2)', ['pat-1', JSON.stringify(DEFAULT_SETTINGS)]);
  });
}

/** ข้อมูลตั้งต้นของแท็กและยา (เพิ่มให้ฐานข้อมูลเดิมที่ยังไม่มีด้วย) */
async function seedDiary(db: Db) {
  const tags = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM tag');
  if (tags.rows[0].n === 0) {
    const defaults: [string, string][] = [['ร่าเริง', '#16A34A'], ['กินได้น้อย', '#D97706'], ['นอนไม่หลับ', '#2563EB'], ['ง่วงทั้งวัน', '#6B7385'], ['ปวดหลัง', '#DC2626']];
    for (const [i, [label, color]] of defaults.entries()) {
      await db.query('INSERT INTO tag VALUES ($1, $2, $3, $4, NULL, $5)', [`tag-${i + 1}`, 'pat-1', label, color, Date.now()]);
    }
  }
  const meds = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM medication');
  if (meds.rows[0].n === 0) {
    const defaults: [string, string, string, string][] = [
      ['ยาความดัน', 'Amlodipine 5 mg · 1 เม็ด', 'หลังอาหาร', '08:00'],
      ['ยาเบาหวาน', 'Metformin 500 mg · 1 เม็ด', 'หลังอาหาร', '08:00,18:00'],
      ['วิตามินบีรวม', '1 เม็ด', 'หลังอาหาร', '12:00'],
    ];
    for (const [i, [name, dose, ins, times]] of defaults.entries()) {
      await db.query('INSERT INTO medication (id, patient_id, name, dose, instructions, times) VALUES ($1, $2, $3, $4, $5, $6)', [`med-${i + 1}`, 'pat-1', name, dose, ins, times]);
    }
  }
}
