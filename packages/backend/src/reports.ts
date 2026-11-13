import type { ButtonNumber, ComparePreset, RangeSummaryDto, ReportCompareDto, ReportTodayDto, ReportWeekDto } from '@careping/shared';
import type { Db } from './db.ts';
import { HttpError, type Engine } from './engine.ts';
import type { Diary } from './diary.ts';
import { addDays, dayStart, daysBetween, isDate, isNight, localDate, minuteOfDay } from './time.ts';

interface Row { id: string; button: number; pressed_at: number; note: string | null }

/** รายงานสำหรับแท็บ "รายงาน": วันนี้ · สัปดาห์ · เปรียบเทียบ (ไม่มีข้อมูลรายผู้ดูแล) */
export class Reports {
  constructor(private deps: { db: Db; engine: Engine; diary: Diary; tzOffsetMin: number; now?: () => number }) {}

  private now() { return (this.deps.now ?? Date.now)(); }
  private get tz() { return this.deps.tzOffsetMin; }
  private today() { return localDate(this.now(), this.tz); }

  private async cases(patientId: string, from: string, to: string): Promise<Row[]> {
    const { rows } = await this.deps.db.query<Row>(
      'SELECT id, button, pressed_at, note FROM care_case WHERE patient_id = $1 AND pressed_at >= $2 AND pressed_at < $3 ORDER BY pressed_at',
      [patientId, dayStart(from, this.tz), dayStart(addDays(to, 1), this.tz)],
    );
    return rows;
  }

  private count(rows: Row[]) {
    const byButton: Record<number, number> = {};
    for (const r of rows) byButton[r.button] = (byButton[r.button] ?? 0) + 1;
    return byButton;
  }

  async todayReport(userId: string): Promise<ReportTodayDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const date = this.today();
    const labels = new Map((await this.deps.engine.buttons(patientId)).map((b) => [b.button, b.label]));
    const rows = await this.cases(patientId, date, date);
    // ช่วงปกติ = ควอไทล์ที่ 25–75 ของจำนวนครั้งต่อวันใน 30 วันก่อนหน้า
    const past = await this.cases(patientId, addDays(date, -30), addDays(date, -1));
    const perDay = new Map<string, number>();
    for (let i = 1; i <= 30; i++) perDay.set(addDays(date, -i), 0);
    for (const r of past) { const d = localDate(r.pressed_at, this.tz); perDay.set(d, (perDay.get(d) ?? 0) + 1); }
    const sorted = [...perDay.values()].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
    return {
      date,
      total: rows.length,
      typicalLow: q(0.25),
      typicalHigh: q(0.75),
      presses: rows.map((r) => ({ id: r.id, at: r.pressed_at, minuteOfDay: minuteOfDay(r.pressed_at, this.tz), button: r.button as ButtonNumber, label: labels.get(r.button as ButtonNumber) ?? `ปุ่ม ${r.button}`, note: r.note })),
    };
  }

  async weekReport(userId: string): Promise<ReportWeekDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const to = this.today();
    const from = addDays(to, -6);
    const rows = await this.cases(patientId, from, to);
    const prev = await this.cases(patientId, addDays(from, -7), addDays(from, -1));
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(from, i), counts: {} as Record<number, number> }));
    for (const r of rows) { const d = days.find((x) => x.date === localDate(r.pressed_at, this.tz)); if (d) d.counts[r.button] = (d.counts[r.button] ?? 0) + 1; }
    return {
      from, to,
      total: rows.length,
      prevTotal: prev.length,
      nightCount: rows.filter((r) => isNight(minuteOfDay(r.pressed_at, this.tz))).length,
      days,
      byButton: this.count(rows),
      prevByButton: this.count(prev),
    };
  }

  private async summary(patientId: string, from: string, to: string): Promise<RangeSummaryDto> {
    const rows = await this.cases(patientId, from, to);
    const days = daysBetween(from, to);
    return {
      from, to, days,
      total: rows.length,
      perDay: Math.round((rows.length / days) * 10) / 10,
      night: rows.filter((r) => isNight(minuteOfDay(r.pressed_at, this.tz))).length,
      byButton: this.count(rows),
      events: await this.deps.diary.eventsBetween(patientId, from, to),
    };
  }

  async compare(userId: string, preset: ComparePreset, custom?: { aFrom?: string; aTo?: string; bFrom?: string; bTo?: string }): Promise<ReportCompareDto> {
    const patientId = await this.deps.engine.patientOfUser(userId);
    const today = this.today();
    const monthRanges = () => {
      const dom = Number(today.slice(8));
      const aFrom = today.slice(0, 8) + '01';
      const prevMonthLast = addDays(aFrom, -1);
      const bFrom = prevMonthLast.slice(0, 8) + '01';
      const bTo = addDays(bFrom, Math.min(dom, Number(prevMonthLast.slice(8))) - 1);
      return { aFrom, aTo: today, bFrom, bTo, note: dom < 28 ? `เดือนนี้ยังไม่จบ จึงเทียบ ${dom} วันแรกของทั้งสองเดือน` : 'เทียบเดือนนี้กับเดือนก่อน' };
    };
    let r: { aFrom: string; aTo: string; bFrom: string; bTo: string; note: string };
    let used: ComparePreset = preset;
    if (preset === 'custom') {
      const { aFrom, aTo, bFrom, bTo } = custom ?? {};
      if (![aFrom, aTo, bFrom, bTo].every(isDate)) throw new HttpError(400, 'ต้องระบุช่วงวันที่ A และ B (YYYY-MM-DD)');
      if (aFrom! > aTo! || bFrom! > bTo!) throw new HttpError(400, 'วันเริ่มต้องไม่เกินวันสิ้นสุด');
      const da = daysBetween(aFrom!, aTo!), db = daysBetween(bFrom!, bTo!);
      r = { aFrom: aFrom!, aTo: aTo!, bFrom: bFrom!, bTo: bTo!, note: da === db ? `เทียบช่วงละ ${da} วัน` : 'สองช่วงยาวไม่เท่ากัน ให้ดูที่ค่าเฉลี่ยต่อวัน' };
    } else if (preset === 'doctor') {
      const ev = await this.deps.diary.lastEventOfType(patientId, 'doctor', today);
      if (ev) {
        const len = daysBetween(ev.date, today);
        r = { aFrom: ev.date, aTo: today, bFrom: addDays(ev.date, -len), bTo: addDays(ev.date, -1), note: `ตั้งแต่ “${ev.title}” (${len} วัน) เทียบกับ ${len} วันก่อนหน้า` };
      } else {
        r = monthRanges(); used = 'month';
        r.note = 'ยังไม่มีนัดหมอในบันทึก จึงเทียบเดือนนี้กับเดือนก่อนแทน';
      }
    } else {
      r = monthRanges();
    }
    return { preset: used, note: r.note, a: await this.summary(patientId, r.aFrom, r.aTo), b: await this.summary(patientId, r.bFrom, r.bTo) };
  }
}
