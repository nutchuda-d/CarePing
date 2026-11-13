import { randomUUID } from 'node:crypto';
import {
  EVENT_TYPE_LABEL,
  MOODS,
  type DiaryDayDto,
  type DiaryMonthDto,
  type DoseDto,
  type EventDto,
  type EventType,
  type MedsTodayDto,
  type MoodLevel,
  type TagDto,
} from '@careping/shared';
import type { Db } from './db.ts';
import { HttpError, type Engine } from './engine.ts';
import type { Notifier } from './notifier.ts';
import { addDays, isDate, isTime, localDate, localTime } from './time.ts';

interface EventRow { id: string; date: string; time: string | null; title: string; type: EventType; detail: string | null; created_by_name: string | null }

const toEvent = (r: EventRow): EventDto => ({ id: r.id, date: r.date, time: r.time, title: r.title, type: r.type, detail: r.detail, createdByName: r.created_by_name ?? '-' });
const moodLabel = (m: number) => MOODS.find((x) => x.level === m)?.label ?? String(m);

/** บันทึกประจำวัน แท็ก เหตุการณ์ และการให้ยา */
export class Diary {
  constructor(
    private deps: { db: Db; engine: Engine; notifier: Notifier; tzOffsetMin: number; now?: () => number },
  ) {}

  private get db() { return this.deps.db; }
  private now() { return (this.deps.now ?? Date.now)(); }
  private today() { return localDate(this.now(), this.deps.tzOffsetMin); }

  private async userName(userId: string) {
    const { rows } = await this.db.query<{ name: string }>('SELECT name FROM app_user WHERE id = $1', [userId]);
    return rows[0]?.name ?? userId;
  }

  private async broadcast(patientId: string, type: 'diary_changed' | 'meds_changed', date: string) {
    this.deps.notifier.update(await this.deps.engine.memberIds(patientId), { type, date });
  }

  private async audit(patientId: string, date: string, userId: string, text: string) {
    await this.db.query('INSERT INTO diary_audit (patient_id, date, user_id, text, at) VALUES ($1, $2, $3, $4, $5)', [patientId, date, userId, text, this.now()]);
  }

  async tags(patientId: string): Promise<TagDto[]> {
    const { rows } = await this.db.query<TagDto>('SELECT id, label, color FROM tag WHERE patient_id = $1 ORDER BY created_at, label', [patientId]);
    return rows;
  }

  private async events(patientId: string, from: string, to: string): Promise<EventDto[]> {
    const { rows } = await this.db.query<EventRow>(
      `SELECT e.id, e.date, e.time, e.title, e.type, e.detail, u.name AS created_by_name
       FROM care_event e LEFT JOIN app_user u ON u.id = e.created_by
       WHERE e.patient_id = $1 AND e.date BETWEEN $2 AND $3 ORDER BY e.date, e.time NULLS FIRST`,
      [patientId, from, to],
    );
    return rows.map(toEvent);
  }

  eventsBetween(patientId: string, from: string, to: string) {
    return this.events(patientId, from, to);
  }

  async lastEventOfType(patientId: string, type: EventType, before: string): Promise<EventDto | null> {
    const { rows } = await this.db.query<EventRow>(
      `SELECT e.id, e.date, e.time, e.title, e.type, e.detail, u.name AS created_by_name
       FROM care_event e LEFT JOIN app_user u ON u.id = e.created_by
       WHERE e.patient_id = $1 AND e.type = $2 AND e.date <= $3 ORDER BY e.date DESC LIMIT 1`,
      [patientId, type, before],
    );
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async month(userId: string, month?: string): Promise<DiaryMonthDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const today = this.today();
    const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
    const from = `${m}-01`;
    const to = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const logs = await this.db.query<{ date: string; mood: MoodLevel | null }>('SELECT date, mood FROM daily_log WHERE patient_id = $1 AND date BETWEEN $2 AND $3', [patientId, from, to]);
    const tags = await this.db.query<{ date: string; tag_id: string }>('SELECT date, tag_id FROM daily_log_tag WHERE patient_id = $1 AND date BETWEEN $2 AND $3', [patientId, from, to]);
    const map = new Map<string, { date: string; mood: MoodLevel | null; tagIds: string[] }>();
    for (const r of logs.rows) map.set(r.date, { date: r.date, mood: r.mood, tagIds: [] });
    for (const r of tags.rows) { if (!map.has(r.date)) map.set(r.date, { date: r.date, mood: null, tagIds: [] }); map.get(r.date)!.tagIds.push(r.tag_id); }
    return {
      month: m,
      today,
      days: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)),
      events: await this.events(patientId, from, to),
      tags: await this.tags(patientId),
    };
  }

  async day(userId: string, date: string): Promise<DiaryDayDto> {
    if (!isDate(date)) throw new HttpError(400, 'วันที่ไม่ถูกต้อง');
    const patientId = await this.deps.engine.patientOfUser(userId);
    const log = await this.db.query<{ mood: MoodLevel | null }>('SELECT mood FROM daily_log WHERE patient_id = $1 AND date = $2', [patientId, date]);
    const tags = await this.db.query<{ tag_id: string }>('SELECT tag_id FROM daily_log_tag WHERE patient_id = $1 AND date = $2', [patientId, date]);
    const note = await this.db.query<{ text: string }>('SELECT text FROM private_note WHERE patient_id = $1 AND date = $2 AND author_id = $3', [patientId, date, userId]);
    const audit = await this.db.query<{ name: string; text: string; at: number }>(
      `SELECT u.name, a.text, a.at FROM diary_audit a JOIN app_user u ON u.id = a.user_id
       WHERE a.patient_id = $1 AND a.date = $2 ORDER BY a.at DESC, a.id DESC LIMIT 50`,
      [patientId, date],
    );
    const meds = await this.dosesFor(patientId, date);
    return {
      date,
      mood: log.rows[0]?.mood ?? null,
      tagIds: tags.rows.map((r) => r.tag_id),
      note: note.rows[0]?.text ?? null,
      log: audit.rows.map((r) => ({ userName: r.name, text: r.text, at: r.at })),
      doses: { given: meds.filter((d) => d.givenBy).length, total: meds.length },
      events: await this.events(patientId, date, date),
    };
  }

  /** บันทึกอารมณ์ แท็ก และโน้ตส่วนตัว ทุกการเปลี่ยนแปลงลง log ว่าใครทำ (ยกเว้นโน้ตส่วนตัว) */
  async saveDay(userId: string, date: string, input: { mood?: number | null; tagIds?: string[]; note?: string | null }) {
    if (!isDate(date)) throw new HttpError(400, 'วันที่ไม่ถูกต้อง');
    if (date > this.today()) throw new HttpError(400, 'บันทึกล่วงหน้าไม่ได้');
    const patientId = await this.deps.engine.patientOfUser(userId);
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const prev = await tx.query<{ mood: number | null }>('SELECT mood FROM daily_log WHERE patient_id = $1 AND date = $2', [patientId, date]);
      const prevMood = prev.rows[0]?.mood ?? null;
      const entries: string[] = [];
      if (input.mood !== undefined) {
        const mood = input.mood === null ? null : Number(input.mood);
        if (mood !== null && !(mood >= 1 && mood <= 5)) throw new HttpError(400, 'อารมณ์ไม่ถูกต้อง');
        await tx.query(
          `INSERT INTO daily_log (patient_id, date, mood, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (patient_id, date) DO UPDATE SET mood = $3, updated_by = $4, updated_at = $5`,
          [patientId, date, mood, userId, now],
        );
        if (mood !== prevMood) entries.push(mood === null ? 'ล้างอารมณ์ของวัน' : `ตั้งอารมณ์เป็น ${moodLabel(mood)}`);
      }
      if (input.tagIds) {
        const valid = await tx.query<{ id: string; label: string }>('SELECT id, label FROM tag WHERE patient_id = $1', [patientId]);
        const labels = new Map(valid.rows.map((r) => [r.id, r.label]));
        const next = [...new Set(input.tagIds)].filter((t) => labels.has(t));
        const cur = (await tx.query<{ tag_id: string }>('SELECT tag_id FROM daily_log_tag WHERE patient_id = $1 AND date = $2', [patientId, date])).rows.map((r) => r.tag_id);
        for (const t of next.filter((t) => !cur.includes(t))) { await tx.query('INSERT INTO daily_log_tag VALUES ($1, $2, $3)', [patientId, date, t]); entries.push(`เพิ่มแท็ก “${labels.get(t)}”`); }
        for (const t of cur.filter((t) => !next.includes(t))) { await tx.query('DELETE FROM daily_log_tag WHERE patient_id = $1 AND date = $2 AND tag_id = $3', [patientId, date, t]); entries.push(`เอาแท็ก “${labels.get(t)}” ออก`); }
      }
      if (input.note !== undefined) {
        const text = input.note?.trim();
        if (text) await tx.query(`INSERT INTO private_note VALUES ($1, $2, $3, $4, $5) ON CONFLICT (patient_id, date, author_id) DO UPDATE SET text = $4, updated_at = $5`, [patientId, date, userId, text.slice(0, 1000), now]);
        else await tx.query('DELETE FROM private_note WHERE patient_id = $1 AND date = $2 AND author_id = $3', [patientId, date, userId]);
      }
      for (const e of entries) await tx.query('INSERT INTO diary_audit (patient_id, date, user_id, text, at) VALUES ($1, $2, $3, $4, $5)', [patientId, date, userId, e, now]);
    });
    await this.broadcast(patientId, 'diary_changed', date);
    return this.day(userId, date);
  }

  async createTag(userId: string, label: string, color: string): Promise<TagDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const l = label?.trim();
    if (!l || l.length > 30) throw new HttpError(400, 'ชื่อแท็กต้องยาว 1–30 ตัวอักษร');
    if (!/^#[0-9A-Fa-f]{6}$/.test(color ?? '')) throw new HttpError(400, 'สีต้องเป็นรหัสแบบ #RRGGBB');
    const dup = await this.db.query('SELECT 1 FROM tag WHERE patient_id = $1 AND label = $2', [patientId, l]);
    if (dup.rows.length) throw new HttpError(409, 'มีแท็กนี้แล้ว');
    const tag = { id: randomUUID(), label: l, color: color.toUpperCase() };
    await this.db.query('INSERT INTO tag VALUES ($1, $2, $3, $4, $5, $6)', [tag.id, patientId, tag.label, tag.color, userId, this.now()]);
    await this.broadcast(patientId, 'diary_changed', this.today());
    return tag;
  }

  async createEvent(userId: string, input: { date?: string; time?: string | null; title?: string; type?: EventType; detail?: string | null }): Promise<EventDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const title = input.title?.trim();
    if (!title) throw new HttpError(400, 'ต้องมีชื่อเหตุการณ์');
    if (!isDate(input.date)) throw new HttpError(400, 'วันที่ไม่ถูกต้อง (YYYY-MM-DD)');
    const time = input.time?.trim() || null;
    if (time && !isTime(time)) throw new HttpError(400, 'เวลาไม่ถูกต้อง (HH:MM)');
    const type = (input.type ?? 'other') as EventType;
    if (!(type in EVENT_TYPE_LABEL)) throw new HttpError(400, 'ประเภทไม่ถูกต้อง');
    const id = randomUUID();
    await this.db.query('INSERT INTO care_event VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id, patientId, input.date, time, title.slice(0, 80), type, input.detail?.trim() || null, userId, this.now()]);
    await this.audit(patientId, input.date!, userId, `เพิ่มเหตุการณ์ “${title}” (${EVENT_TYPE_LABEL[type]})`);
    await this.broadcast(patientId, 'diary_changed', input.date!);
    return { id, date: input.date!, time, title, type, detail: input.detail?.trim() || null, createdByName: await this.userName(userId) };
  }

  async deleteEvent(userId: string, id: string) {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const { rows } = await this.db.query<{ date: string; title: string }>('DELETE FROM care_event WHERE id = $1 AND patient_id = $2 RETURNING date, title', [id, patientId]);
    if (!rows[0]) throw new HttpError(404, 'ไม่พบเหตุการณ์');
    await this.audit(patientId, rows[0].date, userId, `ลบเหตุการณ์ “${rows[0].title}”`);
    await this.broadcast(patientId, 'diary_changed', rows[0].date);
  }

  // ---------- ยา ----------

  private async dosesFor(patientId: string, date: string): Promise<DoseDto[]> {
    const meds = await this.db.query<{ id: string; name: string; dose: string; instructions: string | null; times: string }>(
      'SELECT id, name, dose, instructions, times FROM medication WHERE patient_id = $1 AND active ORDER BY name', [patientId]);
    const logs = await this.db.query<{ medication_id: string; time: string; given_by: string; given_at: number; name: string }>(
      `SELECT d.medication_id, d.time, d.given_by, d.given_at, u.name FROM dose_log d JOIN app_user u ON u.id = d.given_by
       JOIN medication m ON m.id = d.medication_id WHERE m.patient_id = $1 AND d.date = $2`, [patientId, date]);
    const doses: DoseDto[] = [];
    for (const m of meds.rows) for (const time of m.times.split(',').map((t) => t.trim()).filter(Boolean)) {
      const l = logs.rows.find((x) => x.medication_id === m.id && x.time === time);
      doses.push({ medicationId: m.id, name: m.name, dose: m.dose, instructions: m.instructions, time, givenBy: l?.given_by ?? null, givenByName: l?.name ?? null, givenAt: l?.given_at ?? null });
    }
    return doses.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  }

  async medsToday(userId: string): Promise<MedsTodayDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const date = this.today();
    return { date, now: localTime(this.now(), this.deps.tzOffsetMin), doses: await this.dosesFor(patientId, date) };
  }

  /** กด "ให้แล้ว" (given=true) หรือยกเลิก (given=false เฉพาะคนที่กดเอง) */
  async setDose(userId: string, medicationId: string, time: string, given: boolean) {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const med = await this.db.query<{ name: string; times: string }>('SELECT name, times FROM medication WHERE id = $1 AND patient_id = $2', [medicationId, patientId]);
    if (!med.rows[0] || !med.rows[0].times.split(',').includes(time)) throw new HttpError(404, 'ไม่พบมื้อยานี้');
    const date = this.today();
    const cur = await this.db.query<{ given_by: string }>('SELECT given_by FROM dose_log WHERE medication_id = $1 AND date = $2 AND time = $3', [medicationId, date, time]);
    if (given) {
      if (cur.rows[0]) throw new HttpError(409, 'มีคนให้ยามื้อนี้ไปแล้ว');
      await this.db.query('INSERT INTO dose_log VALUES ($1, $2, $3, $4, $5)', [medicationId, date, time, userId, this.now()]);
      await this.audit(patientId, date, userId, `ให้${med.rows[0].name} มื้อ ${time}`);
    } else {
      if (!cur.rows[0]) return this.medsToday(userId);
      if (cur.rows[0].given_by !== userId) throw new HttpError(403, 'ยกเลิกได้เฉพาะคนที่บันทึกการให้ยา');
      await this.db.query('DELETE FROM dose_log WHERE medication_id = $1 AND date = $2 AND time = $3', [medicationId, date, time]);
      await this.audit(patientId, date, userId, `ยกเลิกการให้${med.rows[0].name} มื้อ ${time}`);
    }
    await this.broadcast(patientId, 'meds_changed', date);
    return this.medsToday(userId);
  }
}
