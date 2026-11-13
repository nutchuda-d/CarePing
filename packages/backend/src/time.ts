// วันที่ตามเวลาท้องถิ่นของผู้ป่วย (ไม่พึ่ง timezone ของเครื่องเซิร์ฟเวอร์)
const DAY = 86_400_000;

export const localDate = (ms: number, tzMin: number) => new Date(ms + tzMin * 60_000).toISOString().slice(0, 10);

export const localTime = (ms: number, tzMin: number) => new Date(ms + tzMin * 60_000).toISOString().slice(11, 16);

export const minuteOfDay = (ms: number, tzMin: number) => {
  const d = new Date(ms + tzMin * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** เที่ยงคืนของวันนั้นตามเวลาท้องถิ่น เป็น epoch ms */
export const dayStart = (date: string, tzMin: number) => Date.parse(date + 'T00:00:00Z') - tzMin * 60_000;

export const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY) + 1;

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export const isNight = (minute: number) => minute >= 22 * 60 || minute < 6 * 60;
