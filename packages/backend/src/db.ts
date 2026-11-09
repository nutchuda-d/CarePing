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
CREATE TABLE IF NOT EXISTS device_status_log (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  battery INT,
  at DOUBLE PRECISION NOT NULL
);
`;

export async function openDb(dataDir?: string): Promise<Db> {
  const db = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
  await db.exec(SCHEMA);
  await seedIfEmpty(db);
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
