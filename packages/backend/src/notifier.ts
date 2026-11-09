import type { ServerEvent } from '@careping/shared';
import type { Db } from './db.ts';

export interface Socket {
  send(data: string): void;
}

/** ส่งเหตุการณ์ไปหาผู้ดูแล: WebSocket (แอปที่เปิดอยู่) + Expo push (แอปที่ปิดอยู่) */
export class Notifier {
  private sockets = new Map<string, Set<Socket>>();
  /** เก็บทุกข้อความที่ส่ง ไว้ใช้ในเทสต์ */
  public sent: { userId: string; event: ServerEvent }[] = [];

  constructor(
    private db: Db,
    private opts: { expoPush: boolean; log?: (msg: string) => void },
  ) {}

  attach(userId: string, socket: Socket) {
    if (!this.sockets.has(userId)) this.sockets.set(userId, new Set());
    this.sockets.get(userId)!.add(socket);
    return () => this.sockets.get(userId)?.delete(socket);
  }

  /** แจ้งเตือนจริง (มีเสียง/push) */
  async alert(userIds: string[], event: ServerEvent) {
    for (const userId of userIds) {
      this.sent.push({ userId, event });
      this.toSockets(userId, event);
    }
    this.opts.log?.(`[notify] ${event.type} → ${userIds.join(', ')}`);
    if (this.opts.expoPush) await this.push(userIds, event).catch((e) => this.opts.log?.(`[push] error ${e}`));
  }

  /** อัปเดตหน้าจอเงียบ ๆ ไม่มี push */
  update(userIds: string[], event: ServerEvent) {
    for (const userId of userIds) this.toSockets(userId, event);
  }

  private toSockets(userId: string, event: ServerEvent) {
    const data = JSON.stringify(event);
    for (const s of this.sockets.get(userId) ?? []) {
      try {
        s.send(data);
      } catch {
        /* socket ปิดไปแล้ว */
      }
    }
  }

  private async push(userIds: string[], event: ServerEvent) {
    if (userIds.length === 0) return;
    const { rows } = await this.db.query<{ token: string }>(
      'SELECT token FROM push_token WHERE user_id = ANY($1)',
      [userIds],
    );
    if (rows.length === 0) return;
    const { title, body, urgent } = describe(event);
    const messages = rows.map((r) => ({
      to: r.token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: urgent ? 'urgent' : 'default',
      interruptionLevel: urgent ? 'critical' : 'time-sensitive',
      data: event,
    }));
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  }
}

export function describe(event: ServerEvent): { title: string; body: string; urgent: boolean } {
  switch (event.type) {
    case 'alert': {
      const c = event.case;
      const urgent = c.urgency === 'urgent';
      const prefix = urgent ? '🚨 ฉุกเฉิน' : c.urgency === 'high' ? '⚠️ ' + c.buttonLabel : c.buttonLabel;
      const body =
        event.reason === 'late_info'
          ? 'ส่งล่าช้าเพราะปุ่มออฟไลน์ (แจ้งให้ทราบ)'
          : event.reason === 'repeat_press'
            ? `กดซ้ำ ${c.pressCount} ครั้ง`
            : event.reason === 'broadcast'
              ? `ยังไม่มีใครรับ (รอบ ${c.round})`
              : 'ผู้ป่วยต้องการความช่วยเหลือ';
      return { title: urgent ? prefix : `เรียก: ${prefix}`, body, urgent };
    }
    case 'device': {
      const map = {
        offline: 'ปุ่มขาดการเชื่อมต่อ ผู้ป่วยเรียกใครไม่ได้',
        offline_reminder: 'ปุ่มยังขาดการเชื่อมต่ออยู่',
        online: 'ปุ่มกลับมาออนไลน์แล้ว',
        low_battery: `แบตปุ่มเหลือ ${event.device.battery}%`,
      } as const;
      return { title: 'สถานะปุ่ม CarePing', body: map[event.reason], urgent: false };
    }
    default:
      return { title: 'CarePing', body: '', urgent: false };
  }
}
