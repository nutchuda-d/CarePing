// ข้อตกลงร่วมระหว่างปุ่ม IoT, backend และแอป
// แก้ที่ไฟล์นี้ที่เดียว ทุกฝั่งจะใช้ค่าเดียวกัน

export type Urgency = 'normal' | 'high' | 'urgent';

export type ButtonNumber = 1 | 2 | 3 | 4 | 5;

export interface ButtonConfig {
  button: ButtonNumber;
  label: string;
  urgency: Urgency;
}

export const DEFAULT_BUTTONS: ButtonConfig[] = [
  { button: 1, label: 'ห้องน้ำ', urgency: 'normal' },
  { button: 2, label: 'หิวน้ำ / อาหาร', urgency: 'normal' },
  { button: 3, label: 'ปวด / ไม่สบายตัว', urgency: 'high' },
  { button: 4, label: 'ขอความช่วยเหลืออื่น ๆ', urgency: 'normal' },
  { button: 5, label: 'ฉุกเฉิน', urgency: 'urgent' },
];

export const URGENCY_LABEL: Record<Urgency, string> = {
  normal: 'ปกติ',
  high: 'สูง',
  urgent: 'ด่วน',
};

/** ค่าเวลาทั้งหมด (วินาที) แอดมินแก้ได้ภายหลัง */
export interface EscalationSettings {
  waitPerPersonSec: Record<Exclude<Urgency, 'urgent'>, number>;
  broadcastIntervalSec: number;
  broadcastRounds: number;
  debounceSec: number;
  lateEventSec: number;
  heartbeatIntervalSec: number;
  missedHeartbeats: number;
  offlineReminderSec: number;
  lowBatteryPercent: number;
}

export const DEFAULT_SETTINGS: EscalationSettings = {
  waitPerPersonSec: { normal: 120, high: 60 },
  broadcastIntervalSec: 120,
  broadcastRounds: 3,
  debounceSec: 300,
  lateEventSec: 900,
  heartbeatIntervalSec: 60,
  missedHeartbeats: 3,
  offlineReminderSec: 1800,
  lowBatteryPercent: 20,
};

// ---------- MQTT ----------

export const topics = {
  press: (deviceId: string) => `careping/dev/${deviceId}/press`,
  heartbeat: (deviceId: string) => `careping/dev/${deviceId}/heartbeat`,
  status: (deviceId: string) => `careping/dev/${deviceId}/status`,
  led: (deviceId: string) => `careping/dev/${deviceId}/led`,
};

export const TOPIC_PATTERN = /^careping\/dev\/([^/]+)\/(press|heartbeat|status|led)$/;

/** ปุ่ม → เซิร์ฟเวอร์ เมื่อกดปุ่ม */
export interface PressMessage {
  eventId: string; // UUID สร้างที่ตัวปุ่ม
  button: ButtonNumber;
  ts: number; // epoch ms เวลาที่กดจริง
  queuedOffline?: boolean; // กดตอนออฟไลน์แล้วส่งทีหลัง
}

/** ปุ่ม → เซิร์ฟเวอร์ ทุก heartbeatIntervalSec */
export interface HeartbeatMessage {
  battery: number; // 0-100
  rssi: number; // dBm
  fw: string;
  ts: number;
}

export type LedState = 'idle' | 'waiting' | 'acked' | 'no_response' | 'nobody_home';

/** เซิร์ฟเวอร์ → ปุ่ม (retained) */
export interface LedMessage {
  state: LedState;
  caseId?: string;
}

// ---------- ข้อมูลที่แอปใช้ ----------

export type CaseStatus = 'open' | 'acknowledged' | 'no_response' | 'resolved' | 'late_info';

export interface CaseDto {
  id: string;
  patientId: string;
  button: ButtonNumber;
  buttonLabel: string;
  urgency: Urgency;
  status: CaseStatus;
  pressedAt: number;
  pressCount: number;
  delayed: boolean;
  ackedBy: string | null;
  ackedByName: string | null;
  ackedAt: number | null;
  resolvedAt: number | null;
  note: string | null;
  round: number;
}

export interface CaregiverDto {
  id: string;
  name: string;
  role: 'admin' | 'caregiver';
  priority: number;
  away: boolean;
}

export interface DeviceDto {
  id: string;
  online: boolean;
  lastSeen: number | null;
  battery: number | null;
  rssi: number | null;
}

export interface StateDto {
  patient: { id: string; name: string };
  device: DeviceDto | null;
  caregivers: CaregiverDto[];
  openCases: CaseDto[];
  buttons: ButtonConfig[];
}

export interface StatsDto {
  days: number;
  perDay: { date: string; counts: Record<number, number> }[];
  totalByButton: Record<number, number>;
  nightCount: number;
  prevPeriodTotal: number;
  total: number;
  avgAckSec: number | null;
  noResponseCount: number;
}

/** ข้อความที่ backend ส่งให้แอปผ่าน WebSocket */
export type ServerEvent =
  | { type: 'alert'; case: CaseDto; reason: 'escalation' | 'broadcast' | 'urgent' | 'repeat_press' | 'late_info' }
  | { type: 'case_updated'; case: CaseDto }
  | { type: 'device'; device: DeviceDto; reason: 'offline' | 'online' | 'offline_reminder' | 'low_battery' }
  | { type: 'state_changed' }
  | { type: 'diary_changed'; date: string }
  | { type: 'meds_changed'; date: string };

// ---------- บันทึกประจำวัน ----------

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export const MOODS: { level: MoodLevel; label: string; color: string }[] = [
  { level: 5, label: 'ดีมาก', color: '#FFD66B' },
  { level: 4, label: 'ดี', color: '#8EE3B0' },
  { level: 3, label: 'เฉย ๆ', color: '#C8C1FF' },
  { level: 2, label: 'ไม่ค่อยดี', color: '#FFC09A' },
  { level: 1, label: 'แย่', color: '#9DB8E0' },
];

export const TAG_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#9333EA', '#6B7385'];

export interface TagDto {
  id: string;
  label: string;
  color: string;
}

export type EventType = 'doctor' | 'medication' | 'therapy' | 'other';

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  doctor: 'นัดหมอ',
  medication: 'เปลี่ยนยา',
  therapy: 'กายภาพ',
  other: 'อื่น ๆ',
};

export interface EventDto {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  title: string;
  type: EventType;
  detail: string | null;
  createdByName: string;
}

export interface DiaryMonthDto {
  month: string; // YYYY-MM
  today: string;
  days: { date: string; mood: MoodLevel | null; tagIds: string[] }[];
  events: EventDto[];
  tags: TagDto[];
}

export interface DiaryLogDto {
  userName: string;
  text: string;
  at: number;
}

export interface DiaryDayDto {
  date: string;
  mood: MoodLevel | null;
  tagIds: string[];
  /** โน้ตส่วนตัวของผู้ใช้ที่เรียกเท่านั้น */
  note: string | null;
  log: DiaryLogDto[];
  doses: { given: number; total: number };
  events: EventDto[];
}

// ---------- ยา ----------

export interface DoseDto {
  medicationId: string;
  name: string;
  dose: string;
  instructions: string | null;
  time: string; // HH:MM
  givenBy: string | null;
  givenByName: string | null;
  givenAt: number | null;
}

export interface MedsTodayDto {
  date: string;
  now: string; // HH:MM เวลาท้องถิ่นของผู้ป่วย
  doses: DoseDto[];
}

// ---------- รายงาน ----------

export interface ReportTodayDto {
  date: string;
  total: number;
  typicalLow: number;
  typicalHigh: number;
  presses: { id: string; at: number; minuteOfDay: number; button: ButtonNumber; label: string; note: string | null }[];
}

export interface ReportWeekDto {
  from: string;
  to: string;
  total: number;
  prevTotal: number;
  nightCount: number;
  days: { date: string; counts: Record<number, number> }[];
  byButton: Record<number, number>;
  prevByButton: Record<number, number>;
}

export interface RangeSummaryDto {
  from: string;
  to: string;
  days: number;
  total: number;
  perDay: number;
  night: number;
  byButton: Record<number, number>;
  events: EventDto[];
}

export type ComparePreset = 'month' | 'doctor' | 'custom';

export interface ReportCompareDto {
  preset: ComparePreset;
  note: string;
  a: RangeSummaryDto;
  b: RangeSummaryDto;
}
