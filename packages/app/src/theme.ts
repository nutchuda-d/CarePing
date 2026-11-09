import type { CaseStatus, Urgency } from '@careping/shared';

export const colors = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  ink: '#1D2433',
  muted: '#6B7385',
  line: '#E3E6EC',
  primary: '#2563EB',
  green: '#16A34A',
  red: '#DC2626',
  amber: '#D97706',
  purple: '#9333EA',
};

export const urgencyColor: Record<Urgency, string> = {
  normal: colors.primary,
  high: colors.amber,
  urgent: colors.red,
};

export const statusLabel: Record<CaseStatus, string> = {
  open: 'รอคนรับ',
  acknowledged: 'รับทราบแล้ว',
  no_response: 'ไม่มีผู้ตอบ',
  resolved: 'เสร็จแล้ว',
  late_info: 'ส่งล่าช้า',
};

export const statusColor: Record<CaseStatus, string> = {
  open: colors.amber,
  acknowledged: colors.green,
  no_response: colors.red,
  resolved: colors.muted,
  late_info: colors.purple,
};

export function timeAgo(ms: number | null | undefined) {
  if (!ms) return '-';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}

export function clock(ms: number) {
  return new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
