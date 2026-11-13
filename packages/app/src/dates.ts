// วันที่แบบ YYYY-MM-DD (ไม่พึ่ง timezone ของเครื่อง)
export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
export const weekday = (d: string) => new Date(Date.parse(d + 'T00:00:00Z')).getUTCDay();
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const addMonths = (month: string, n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const monthTitle = (month: string) => `${THAI_MONTHS[Number(month.slice(5, 7)) - 1]} ${Number(month.slice(0, 4)) + 543}`;
export const shortDate = (d: string) => { const p = parts(d); return `${p.day} ${THAI_MONTHS_SHORT[p.m - 1]}`; };
export const longDate = (d: string) => { const p = parts(d); return `${THAI_DAYS_SHORT[weekday(d)]}. ${p.day} ${THAI_MONTHS_SHORT[p.m - 1]} ${p.y + 543}`; };
export const rangeLabel = (from: string, to: string) => {
  const a = parts(from), b = parts(to);
  if (a.y === b.y && a.m === b.m) return `${a.day}–${b.day} ${THAI_MONTHS_SHORT[a.m - 1]} ${a.y + 543}`;
  return `${shortDate(from)} – ${shortDate(to)} ${b.y + 543}`;
};
export const hhmm = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
