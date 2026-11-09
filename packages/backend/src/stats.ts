import type { StatsDto } from '@careping/shared';
import type { Db } from './db.ts';

interface Row {
  button: number;
  status: string;
  pressed_at: number;
  acked_at: number | null;
  delayed: boolean;
}

/** สถิติสำหรับกราฟในแอปและรายงานหมอ */
export async function computeStats(
  db: Db,
  patientId: string,
  days: number,
  now: number,
  tzOffsetMin: number,
): Promise<StatsDto> {
  const dayMs = 86_400_000;
  const tz = tzOffsetMin * 60_000;
  // เริ่มนับจากเที่ยงคืนตามเวลาท้องถิ่น ของ (days - 1) วันก่อน
  const todayStartLocal = Math.floor((now + tz) / dayMs) * dayMs - tz;
  const from = todayStartLocal - (days - 1) * dayMs;
  const prevFrom = from - days * dayMs;

  const { rows } = await db.query<Row>(
    `SELECT button, status, pressed_at, acked_at, delayed FROM care_case
     WHERE patient_id = $1 AND pressed_at >= $2 ORDER BY pressed_at`,
    [patientId, prevFrom],
  );

  const perDay = Array.from({ length: days }, (_, i) => ({
    date: new Date(from + i * dayMs + tz).toISOString().slice(0, 10),
    counts: {} as Record<number, number>,
  }));
  const totalByButton: Record<number, number> = {};
  let total = 0;
  let prevPeriodTotal = 0;
  let nightCount = 0;
  let noResponseCount = 0;
  const ackTimes: number[] = [];

  for (const r of rows) {
    if (r.pressed_at < from) {
      prevPeriodTotal++;
      continue;
    }
    total++;
    const idx = Math.floor((r.pressed_at - from) / dayMs);
    const day = perDay[idx];
    if (day) day.counts[r.button] = (day.counts[r.button] ?? 0) + 1;
    totalByButton[r.button] = (totalByButton[r.button] ?? 0) + 1;
    const hour = new Date(r.pressed_at + tz).getUTCHours();
    if (hour >= 22 || hour < 6) nightCount++;
    if (r.status === 'no_response') noResponseCount++;
    if (r.acked_at && !r.delayed) ackTimes.push((r.acked_at - r.pressed_at) / 1000);
  }

  return {
    days,
    perDay,
    totalByButton,
    nightCount,
    prevPeriodTotal,
    total,
    avgAckSec: ackTimes.length ? Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length) : null,
    noResponseCount,
  };
}
