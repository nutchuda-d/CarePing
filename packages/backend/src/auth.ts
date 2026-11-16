import { randomInt } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './engine.ts';

const OTP_TTL_SEC = 300; // รหัสใช้ได้ 5 นาที
const RESEND_SEC = 60; // ขอรหัสใหม่ได้ทุก 60 วินาที
const MAX_TRIES = 5;

type Pending = { code: string; expiresAt: number; resendAt: number; tries: number };

/** รับเบอร์ไทยได้ทั้ง 0812345678, 081-234-5678, +66812345678 แล้วคืนรูปแบบ 0XXXXXXXXX */
export function normalizePhone(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, 'ต้องระบุเบอร์โทรศัพท์');
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = `0${d.slice(2)}`;
  if (!/^0\d{9}$/.test(d)) throw new HttpError(400, 'เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องมี 10 หลัก)');
  return d;
}

/**
 * ล็อกอินด้วยเบอร์โทร + OTP
 * ตอนนี้ยังไม่ได้ต่อผู้ให้บริการ SMS: รหัสจะแสดงใน terminal ของ backend
 * และส่งกลับไปให้แอปใน devCode (ต้องปิด devEcho เมื่อต่อ SMS จริง)
 */
export class Auth {
  private pending = new Map<string, Pending>();
  private now: () => number;
  private log: (m: string) => void;

  constructor(private deps: { db: Db; now?: () => number; log?: (m: string) => void; devEcho?: boolean }) {
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? (() => {});
  }

  private async userByPhone(phone: string) {
    const { rows } = await this.deps.db.query<{ id: string; name: string; role: string }>(
      `SELECT u.id, u.name, m.role FROM app_user u JOIN care_team_member m ON m.user_id = u.id WHERE u.phone = $1 LIMIT 1`,
      [phone],
    );
    return rows[0];
  }

  async requestOtp(rawPhone: unknown) {
    const phone = normalizePhone(rawPhone);
    if (!(await this.userByPhone(phone))) {
      throw new HttpError(404, 'ยังไม่มีเบอร์นี้ในทีมดูแล ให้แอดมินของครอบครัวเพิ่มเบอร์ก่อน');
    }
    const now = this.now();
    const cur = this.pending.get(phone);
    if (cur && now < cur.resendAt) {
      throw new HttpError(429, `ขอรหัสใหม่ได้ในอีก ${Math.ceil((cur.resendAt - now) / 1000)} วินาที`);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pending.set(phone, { code, expiresAt: now + OTP_TTL_SEC * 1000, resendAt: now + RESEND_SEC * 1000, tries: 0 });
    this.log(`[auth] OTP ของ ${phone} คือ ${code} (ยังไม่ได้ส่ง SMS จริง)`);
    return { phone, resendInSec: RESEND_SEC, expiresInSec: OTP_TTL_SEC, ...(this.deps.devEcho ? { devCode: code } : {}) };
  }

  async verify(rawPhone: unknown, code: unknown) {
    const phone = normalizePhone(rawPhone);
    const p = this.pending.get(phone);
    if (!p || this.now() > p.expiresAt) {
      this.pending.delete(phone);
      throw new HttpError(400, 'รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่');
    }
    if (typeof code !== 'string' || code !== p.code) {
      p.tries += 1;
      if (p.tries >= MAX_TRIES) {
        this.pending.delete(phone);
        throw new HttpError(429, 'ใส่รหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่');
      }
      throw new HttpError(400, 'รหัสไม่ถูกต้อง');
    }
    this.pending.delete(phone);
    const user = await this.userByPhone(phone);
    if (!user) throw new HttpError(404, 'ไม่พบผู้ใช้');
    return user;
  }
}
