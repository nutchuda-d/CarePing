import {
  DEFAULT_SETTINGS,
  type ButtonConfig,
  type ButtonNumber,
  type CaregiverDto,
  type CaseDto,
  type CaseStatus,
  type DeviceDto,
  type EscalationSettings,
  type HeartbeatMessage,
  type LedState,
  type PressMessage,
  type StateDto,
  type Urgency,
} from '@careping/shared';
import type { Db } from './db.ts';
import type { Notifier } from './notifier.ts';

export interface EngineDeps {
  db: Db;
  notifier: Notifier;
  /** ส่งสถานะ LED กลับไปที่ปุ่ม */
  publishLed: (deviceId: string, state: LedState, caseId?: string) => void;
  now?: () => number;
  /** 1 = เวลาจริง, 0.1 = เร็วขึ้น 10 เท่า */
  timeScale?: number;
  log?: (msg: string) => void;
}

interface CaseRow {
  id: string;
  patient_id: string;
  device_id: string;
  button: number;
  urgency: Urgency;
  status: CaseStatus;
  pressed_at: number;
  last_press_at: number;
  press_count: number;
  delayed: boolean;
  nobody_home: boolean;
  acked_by: string | null;
  acked_at: number | null;
  resolved_at: number | null;
  note: string | null;
  phase: 'chain' | 'broadcast' | 'done';
  step: number;
  round: number;
  next_action_at: number | null;
}

interface MemberRow {
  user_id: string;
  name: string;
  role: 'admin' | 'caregiver';
  priority: number;
  away: boolean;
}

interface DeviceRow {
  id: string;
  patient_id: string;
  online: boolean;
  last_seen: number | null;
  battery: number | null;
  rssi: number | null;
  offline_notified_at: number | null;
  low_battery_notified_at: number | null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const ACTIVE: CaseStatus[] = ['open', 'acknowledged', 'no_response'];

export class Engine {
  private db: Db;
  private notifier: Notifier;
  private now: () => number;
  private scale: number;
  private log: (msg: string) => void;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private deps: EngineDeps) {
    this.db = deps.db;
    this.notifier = deps.notifier;
    this.now = deps.now ?? Date.now;
    this.scale = deps.timeScale ?? 1;
    this.log = deps.log ?? (() => {});
  }

  /** ทุกคำสั่งรันทีละอัน กันข้อมูลชนกัน (เช่น กดรับทราบพร้อมกับตอนส่งต่อคนถัดไป) */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private ms(sec: number) {
    return sec * 1000 * this.scale;
  }

  // ---------- อ่านข้อมูล ----------

  async settings(patientId: string): Promise<EscalationSettings> {
    const { rows } = await this.db.query<{ json: string }>('SELECT json FROM settings WHERE patient_id = $1', [patientId]);
    return rows[0] ? { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].json) } : DEFAULT_SETTINGS;
  }

  async buttons(patientId: string): Promise<ButtonConfig[]> {
    const { rows } = await this.db.query<{ button: ButtonNumber; label: string; urgency: Urgency }>(
      'SELECT button, label, urgency FROM button_config WHERE patient_id = $1 ORDER BY button',
      [patientId],
    );
    return rows;
  }

  private async members(patientId: string): Promise<MemberRow[]> {
    const { rows } = await this.db.query<MemberRow>(
      `SELECT m.user_id, u.name, m.role, m.priority, m.away
       FROM care_team_member m JOIN app_user u ON u.id = m.user_id
       WHERE m.patient_id = $1 ORDER BY m.priority`,
      [patientId],
    );
    return rows;
  }

  async memberIds(patientId: string): Promise<string[]> {
    return (await this.members(patientId)).map((m) => m.user_id);
  }

  async patientOfUser(userId: string): Promise<string> {
    const { rows } = await this.db.query<{ patient_id: string }>(
      'SELECT patient_id FROM care_team_member WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    if (!rows[0]) throw new HttpError(404, 'ไม่พบผู้ใช้ในทีมดูแล');
    return rows[0].patient_id;
  }

  private async getCase(id: string): Promise<CaseRow | undefined> {
    const { rows } = await this.db.query<CaseRow>('SELECT * FROM care_case WHERE id = $1', [id]);
    return rows[0];
  }

  async toDto(c: CaseRow): Promise<CaseDto> {
    const { rows } = await this.db.query<{ label: string; acked_name: string | null }>(
      `SELECT b.label, u.name AS acked_name FROM button_config b
       LEFT JOIN app_user u ON u.id = $3
       WHERE b.patient_id = $1 AND b.button = $2`,
      [c.patient_id, c.button, c.acked_by],
    );
    return {
      id: c.id,
      patientId: c.patient_id,
      button: c.button as ButtonNumber,
      buttonLabel: rows[0]?.label ?? `ปุ่ม ${c.button}`,
      urgency: c.urgency,
      status: c.status,
      pressedAt: c.pressed_at,
      pressCount: c.press_count,
      delayed: c.delayed,
      ackedBy: c.acked_by,
      ackedByName: rows[0]?.acked_name ?? null,
      ackedAt: c.acked_at,
      resolvedAt: c.resolved_at,
      note: c.note,
      round: c.round,
    };
  }

  private deviceDto(d: DeviceRow): DeviceDto {
    return { id: d.id, online: d.online, lastSeen: d.last_seen, battery: d.battery, rssi: d.rssi };
  }

  async state(userId: string): Promise<StateDto> {
    const patientId = await this.patientOfUser(userId);
    const p = await this.db.query<{ id: string; name: string }>('SELECT id, name FROM patient WHERE id = $1', [patientId]);
    const d = await this.db.query<DeviceRow>('SELECT * FROM device WHERE patient_id = $1 LIMIT 1', [patientId]);
    const cases = await this.db.query<CaseRow>(
      'SELECT * FROM care_case WHERE patient_id = $1 AND status = ANY($2) ORDER BY pressed_at DESC',
      [patientId, ACTIVE],
    );
    const members = await this.members(patientId);
    return {
      patient: p.rows[0],
      device: d.rows[0] ? this.deviceDto(d.rows[0]) : null,
      caregivers: members.map(
        (m): CaregiverDto => ({ id: m.user_id, name: m.name, role: m.role, priority: m.priority, away: m.away }),
      ),
      openCases: await Promise.all(cases.rows.map((c) => this.toDto(c))),
      buttons: await this.buttons(patientId),
    };
  }

  async history(userId: string, days: number): Promise<CaseDto[]> {
    const patientId = await this.patientOfUser(userId);
    const since = this.now() - days * 86_400_000;
    const { rows } = await this.db.query<CaseRow>(
      'SELECT * FROM care_case WHERE patient_id = $1 AND pressed_at >= $2 ORDER BY pressed_at DESC LIMIT 500',
      [patientId, since],
    );
    return Promise.all(rows.map((c) => this.toDto(c)));
  }

  // ---------- ผู้รับแจ้งเตือน ----------

  /** ผู้ดูแลที่อยู่บ้าน เรียงตามลำดับ ถ้าไม่มีใครอยู่บ้านเลย ใช้คนลำดับแรกแทน */
  private chain(members: MemberRow[]): { ids: string[]; nobodyHome: boolean } {
    const home = members.filter((m) => !m.away).map((m) => m.user_id);
    if (home.length > 0) return { ids: home, nobodyHome: false };
    return { ids: members.slice(0, 1).map((m) => m.user_id), nobodyHome: true };
  }

  /** รอบแจ้งทุกคน: ปกติ = คนที่อยู่บ้าน, สูง/ด่วน = ทุกคนรวมนอกบ้าน */
  private broadcastTargets(members: MemberRow[], urgency: Urgency): string[] {
    if (urgency !== 'normal') return members.map((m) => m.user_id);
    return this.chain(members).ids;
  }

  private async alert(c: CaseRow, userIds: string[], reason: 'escalation' | 'broadcast' | 'urgent' | 'repeat_press' | 'late_info') {
    const t = this.now();
    for (const u of userIds) {
      await this.db.query(
        'INSERT INTO notification_attempt (case_id, user_id, kind, round, sent_at) VALUES ($1, $2, $3, $4, $5)',
        [c.id, u, reason, c.round, t],
      );
    }
    await this.notifier.alert(userIds, { type: 'alert', case: await this.toDto(c), reason });
  }

  private async broadcastUpdate(c: CaseRow) {
    const members = await this.members(c.patient_id);
    this.notifier.update(
      members.map((m) => m.user_id),
      { type: 'case_updated', case: await this.toDto(c) },
    );
  }

  private async saveCase(c: CaseRow) {
    await this.db.query(
      `UPDATE care_case SET status=$2, last_press_at=$3, press_count=$4, acked_by=$5, acked_at=$6,
        resolved_at=$7, note=$8, phase=$9, step=$10, round=$11, next_action_at=$12, nobody_home=$13
       WHERE id=$1`,
      [
        c.id, c.status, c.last_press_at, c.press_count, c.acked_by, c.acked_at,
        c.resolved_at, c.note, c.phase, c.step, c.round, c.next_action_at, c.nobody_home,
      ],
    );
  }

  /** LED ของปุ่มสะท้อนเคสที่สำคัญที่สุดที่ยังค้างอยู่ */
  private async refreshLed(patientId: string) {
    const { rows } = await this.db.query<CaseRow>(
      'SELECT * FROM care_case WHERE patient_id = $1 AND status = ANY($2) ORDER BY pressed_at DESC',
      [patientId, ACTIVE],
    );
    const dev = await this.db.query<{ id: string }>('SELECT id FROM device WHERE patient_id = $1', [patientId]);
    let state: LedState = 'idle';
    let caseId: string | undefined;
    const pick = (s: LedState, pred: (c: CaseRow) => boolean) => {
      if (state !== 'idle') return;
      const c = rows.find(pred);
      if (c) {
        state = s;
        caseId = c.id;
      }
    };
    pick('no_response', (c) => c.status === 'no_response');
    pick('nobody_home', (c) => c.status === 'open' && c.nobody_home);
    pick('waiting', (c) => c.status === 'open');
    pick('acked', (c) => c.status === 'acknowledged');
    for (const d of dev.rows) this.deps.publishLed(d.id, state, caseId);
  }

  // ---------- เหตุการณ์จากปุ่ม ----------

  handlePress(deviceId: string, msg: PressMessage) {
    return this.serial(() => this._handlePress(deviceId, msg));
  }

  private async _handlePress(deviceId: string, msg: PressMessage): Promise<CaseRow | null> {
    if (!msg?.eventId || ![1, 2, 3, 4, 5].includes(msg.button)) {
      this.log(`[press] ข้อความไม่ถูกต้องจาก ${deviceId}`);
      return null;
    }
    const dup = await this.db.query('SELECT 1 FROM press_log WHERE event_id = $1', [msg.eventId]);
    if (dup.rows.length > 0) return null; // MQTT ส่งซ้ำ

    const devRes = await this.db.query<DeviceRow>('SELECT * FROM device WHERE id = $1', [deviceId]);
    const dev = devRes.rows[0];
    if (!dev) {
      this.log(`[press] ไม่รู้จักปุ่ม ${deviceId}`);
      return null;
    }
    const now = this.now();
    await this.markSeen(dev, now);

    const patientId = dev.patient_id;
    const settings = await this.settings(patientId);
    const btn = (await this.buttons(patientId)).find((b) => b.button === msg.button);
    const urgency: Urgency = btn?.urgency ?? 'normal';
    const members = await this.members(patientId);
    const pressedAt = Math.min(msg.ts || now, now);

    // 1) event เก่ามาก (ปุ่มออฟไลน์นาน) → แจ้งให้ทราบอย่างเดียว ไม่เริ่ม escalation
    if (now - pressedAt > this.ms(settings.lateEventSec)) {
      const c = await this.insertCase({
        id: msg.eventId, patient_id: patientId, device_id: deviceId, button: msg.button, urgency,
        status: 'late_info', pressed_at: pressedAt, delayed: true, phase: 'done', next_action_at: null,
      });
      await this.db.query('INSERT INTO press_log VALUES ($1, $2, $3)', [msg.eventId, c.id, now]);
      await this.alert(c, members.map((m) => m.user_id), 'late_info');
      return c;
    }

    // 2) กดปุ่มเดิมซ้ำขณะเคสยังค้าง → ไม่เปิดเคสใหม่ (ฉุกเฉินจะแจ้งทุกคนซ้ำ)
    const open = await this.db.query<CaseRow>(
      `SELECT * FROM care_case WHERE patient_id = $1 AND button = $2 AND status = ANY($3)
         AND last_press_at >= $4 ORDER BY pressed_at DESC LIMIT 1`,
      [patientId, msg.button, ACTIVE, now - this.ms(settings.debounceSec)],
    );
    if (open.rows[0]) {
      const c = open.rows[0];
      c.press_count += 1;
      c.last_press_at = now;
      await this.saveCase(c);
      await this.db.query('INSERT INTO press_log VALUES ($1, $2, $3)', [msg.eventId, c.id, now]);
      if (urgency === 'urgent' && c.status !== 'acknowledged') {
        await this.alert(c, members.map((m) => m.user_id), 'repeat_press');
      } else {
        await this.broadcastUpdate(c);
      }
      return c;
    }

    // 3) เคสใหม่
    let c: CaseRow;
    if (urgency === 'urgent') {
      c = await this.insertCase({
        id: msg.eventId, patient_id: patientId, device_id: deviceId, button: msg.button, urgency,
        status: 'open', pressed_at: pressedAt, delayed: !!msg.queuedOffline, phase: 'broadcast', round: 1,
        next_action_at: now + this.ms(settings.broadcastIntervalSec),
      });
      await this.db.query('INSERT INTO press_log VALUES ($1, $2, $3)', [msg.eventId, c.id, now]);
      await this.alert(c, members.map((m) => m.user_id), 'urgent');
    } else {
      const { ids, nobodyHome } = this.chain(members);
      c = await this.insertCase({
        id: msg.eventId, patient_id: patientId, device_id: deviceId, button: msg.button, urgency,
        status: 'open', pressed_at: pressedAt, delayed: !!msg.queuedOffline, phase: 'chain', step: 0,
        nobody_home: nobodyHome, next_action_at: now + this.ms(settings.waitPerPersonSec[urgency]),
      });
      await this.db.query('INSERT INTO press_log VALUES ($1, $2, $3)', [msg.eventId, c.id, now]);
      await this.alert(c, ids.slice(0, 1), 'escalation');
    }
    await this.broadcastUpdate(c);
    await this.refreshLed(patientId);
    return c;
  }

  private async insertCase(p: Partial<CaseRow> & Pick<CaseRow, 'id' | 'patient_id' | 'device_id' | 'button' | 'urgency' | 'status' | 'pressed_at' | 'phase'>) {
    const now = this.now();
    const c: CaseRow = {
      last_press_at: now, press_count: 1, delayed: false, nobody_home: false, acked_by: null, acked_at: null,
      resolved_at: null, note: null, step: 0, round: 0, next_action_at: null, ...p,
    };
    await this.db.query(
      `INSERT INTO care_case (id, patient_id, device_id, button, urgency, status, pressed_at, last_press_at,
        press_count, delayed, nobody_home, phase, step, round, next_action_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [c.id, c.patient_id, c.device_id, c.button, c.urgency, c.status, c.pressed_at, c.last_press_at,
        c.press_count, c.delayed, c.nobody_home, c.phase, c.step, c.round, c.next_action_at],
    );
    return c;
  }

  handleHeartbeat(deviceId: string, msg: HeartbeatMessage) {
    return this.serial(async () => {
      const { rows } = await this.db.query<DeviceRow>('SELECT * FROM device WHERE id = $1', [deviceId]);
      const dev = rows[0];
      if (!dev) return;
      const now = this.now();
      await this.db.query('UPDATE device SET battery = $2, rssi = $3, fw = $4 WHERE id = $1', [
        deviceId, Math.round(msg.battery), Math.round(msg.rssi), msg.fw ?? null,
      ]);
      dev.battery = Math.round(msg.battery);
      dev.rssi = Math.round(msg.rssi);
      await this.markSeen(dev, now);

      const settings = await this.settings(dev.patient_id);
      const day = 86_400_000;
      if (dev.battery < settings.lowBatteryPercent && (!dev.low_battery_notified_at || now - dev.low_battery_notified_at > day)) {
        await this.db.query('UPDATE device SET low_battery_notified_at = $2 WHERE id = $1', [deviceId, now]);
        await this.db.query('INSERT INTO device_status_log (device_id, kind, battery, at) VALUES ($1, $2, $3, $4)', [deviceId, 'low_battery', dev.battery, now]);
        const admins = (await this.members(dev.patient_id)).filter((m) => m.role === 'admin').map((m) => m.user_id);
        await this.notifier.alert(admins, { type: 'device', device: this.deviceDto(dev), reason: 'low_battery' });
      }
    });
  }

  /** อัปเดตเวลาเห็นล่าสุด ถ้าเคยออฟไลน์อยู่ แจ้งทุกคนว่ากลับมาแล้ว */
  private async markSeen(dev: DeviceRow, now: number) {
    await this.db.query('UPDATE device SET last_seen = $2, online = TRUE, offline_notified_at = NULL WHERE id = $1', [dev.id, now]);
    const wasOffline = !dev.online;
    dev.online = true;
    dev.last_seen = now;
    const members = (await this.members(dev.patient_id)).map((m) => m.user_id);
    if (wasOffline) {
      await this.db.query('INSERT INTO device_status_log (device_id, kind, battery, at) VALUES ($1, $2, $3, $4)', [dev.id, 'online', dev.battery, now]);
      // ครั้งแรกที่ปุ่มต่อเข้าระบบ (ไม่เคยเห็นมาก่อน) ไม่ต้องแจ้ง
      if (dev.offline_notified_at) {
        await this.notifier.alert(members, { type: 'device', device: this.deviceDto(dev), reason: 'online' });
      } else {
        this.notifier.update(members, { type: 'state_changed' });
      }
      await this.refreshLed(dev.patient_id);
    }
  }

  // ---------- การกระทำจากแอป ----------

  ack(caseId: string, userId: string) {
    return this.serial(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new HttpError(404, 'ไม่พบเคส');
      await this.assertMember(c.patient_id, userId);
      if (c.status === 'acknowledged') throw new HttpError(409, 'มีคนรับทราบไปแล้ว');
      if (c.status !== 'open' && c.status !== 'no_response') throw new HttpError(409, 'เคสนี้ปิดไปแล้ว');
      c.status = 'acknowledged';
      c.acked_by = userId;
      c.acked_at = this.now();
      c.phase = 'done';
      c.next_action_at = null;
      await this.saveCase(c);
      await this.broadcastUpdate(c);
      await this.refreshLed(c.patient_id);
      return this.toDto(c);
    });
  }

  resolve(caseId: string, userId: string, note?: string) {
    return this.serial(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new HttpError(404, 'ไม่พบเคส');
      await this.assertMember(c.patient_id, userId);
      if (c.status === 'resolved') throw new HttpError(409, 'เคสนี้ปิดไปแล้ว');
      const now = this.now();
      if (!c.acked_by) {
        c.acked_by = userId;
        c.acked_at = now;
      }
      c.status = 'resolved';
      c.resolved_at = now;
      c.note = note?.trim() || null;
      c.phase = 'done';
      c.next_action_at = null;
      await this.saveCase(c);
      await this.broadcastUpdate(c);
      await this.refreshLed(c.patient_id);
      return this.toDto(c);
    });
  }

  setAway(userId: string, away: boolean) {
    return this.serial(async () => {
      const patientId = await this.patientOfUser(userId);
      await this.db.query('UPDATE care_team_member SET away = $3 WHERE patient_id = $1 AND user_id = $2', [patientId, userId, away]);
      const members = (await this.members(patientId)).map((m) => m.user_id);
      this.notifier.update(members, { type: 'state_changed' });
    });
  }

  setOrder(adminId: string, order: string[]) {
    return this.serial(async () => {
      const patientId = await this.patientOfUser(adminId);
      await this.assertAdmin(patientId, adminId);
      const members = await this.members(patientId);
      if (order.length !== members.length || !members.every((m) => order.includes(m.user_id))) {
        throw new HttpError(400, 'ลำดับต้องมีผู้ดูแลครบทุกคน');
      }
      for (const [i, id] of order.entries()) {
        await this.db.query('UPDATE care_team_member SET priority = $3 WHERE patient_id = $1 AND user_id = $2', [patientId, id, i + 1]);
      }
      this.notifier.update(order, { type: 'state_changed' });
    });
  }

  setButton(adminId: string, button: number, label: string, urgency: Urgency) {
    return this.serial(async () => {
      const patientId = await this.patientOfUser(adminId);
      await this.assertAdmin(patientId, adminId);
      if (!['normal', 'high', 'urgent'].includes(urgency) || !label?.trim()) throw new HttpError(400, 'ข้อมูลปุ่มไม่ถูกต้อง');
      await this.db.query('UPDATE button_config SET label = $3, urgency = $4 WHERE patient_id = $1 AND button = $2', [patientId, button, label.trim(), urgency]);
      const members = (await this.members(patientId)).map((m) => m.user_id);
      this.notifier.update(members, { type: 'state_changed' });
    });
  }

  private async assertMember(patientId: string, userId: string) {
    const { rows } = await this.db.query('SELECT 1 FROM care_team_member WHERE patient_id = $1 AND user_id = $2', [patientId, userId]);
    if (rows.length === 0) throw new HttpError(403, 'ไม่มีสิทธิ์');
  }

  private async assertAdmin(patientId: string, userId: string) {
    const { rows } = await this.db.query(`SELECT 1 FROM care_team_member WHERE patient_id = $1 AND user_id = $2 AND role = 'admin'`, [patientId, userId]);
    if (rows.length === 0) throw new HttpError(403, 'เฉพาะแอดมิน');
  }

  // ---------- ตัวจับเวลา (เรียกทุก 1 วินาที) ----------

  tick() {
    return this.serial(async () => {
      await this.tickCases();
      await this.tickDevices();
    });
  }

  private async tickCases() {
    const now = this.now();
    const { rows } = await this.db.query<CaseRow>(
      `SELECT * FROM care_case WHERE status = 'open' AND next_action_at IS NOT NULL AND next_action_at <= $1`,
      [now],
    );
    for (const c of rows) {
      const settings = await this.settings(c.patient_id);
      const members = await this.members(c.patient_id);
      if (c.phase === 'chain') {
        const { ids, nobodyHome } = this.chain(members);
        c.step += 1;
        c.nobody_home = nobodyHome;
        if (c.step < ids.length) {
          c.next_action_at = now + this.ms(settings.waitPerPersonSec[c.urgency as 'normal' | 'high']);
          await this.saveCase(c);
          await this.alert(c, [ids[c.step]], 'escalation');
          continue;
        }
        c.phase = 'broadcast';
        c.round = 1;
        c.next_action_at = now + this.ms(settings.broadcastIntervalSec);
        await this.saveCase(c);
        await this.alert(c, this.broadcastTargets(members, c.urgency), 'broadcast');
        continue;
      }
      if (c.phase === 'broadcast') {
        if (c.round < settings.broadcastRounds) {
          c.round += 1;
          c.next_action_at = now + this.ms(settings.broadcastIntervalSec);
          await this.saveCase(c);
          await this.alert(c, this.broadcastTargets(members, c.urgency), c.urgency === 'urgent' ? 'urgent' : 'broadcast');
          continue;
        }
        c.status = 'no_response';
        c.phase = 'done';
        c.next_action_at = null;
        await this.saveCase(c);
        this.log(`[case] ${c.id} ไม่มีผู้ตอบหลังส่งครบ ${c.round} รอบ`);
        await this.broadcastUpdate(c);
        await this.refreshLed(c.patient_id);
      }
    }
  }

  private async tickDevices() {
    const now = this.now();
    const { rows } = await this.db.query<DeviceRow>('SELECT * FROM device');
    for (const d of rows) {
      const settings = await this.settings(d.patient_id);
      const members = (await this.members(d.patient_id)).map((m) => m.user_id);
      const timeout = this.ms(settings.heartbeatIntervalSec * settings.missedHeartbeats);
      if (d.online && d.last_seen && now - d.last_seen > timeout) {
        await this.db.query('UPDATE device SET online = FALSE, offline_notified_at = $2 WHERE id = $1', [d.id, now]);
        await this.db.query('INSERT INTO device_status_log (device_id, kind, battery, at) VALUES ($1, $2, $3, $4)', [d.id, 'offline', d.battery, now]);
        d.online = false;
        this.log(`[device] ${d.id} ขาดการเชื่อมต่อ`);
        await this.notifier.alert(members, { type: 'device', device: this.deviceDto(d), reason: 'offline' });
      } else if (!d.online && d.offline_notified_at && now - d.offline_notified_at > this.ms(settings.offlineReminderSec)) {
        await this.db.query('UPDATE device SET offline_notified_at = $2 WHERE id = $1', [d.id, now]);
        await this.notifier.alert(members, { type: 'device', device: this.deviceDto(d), reason: 'offline_reminder' });
      }
    }
  }
}
