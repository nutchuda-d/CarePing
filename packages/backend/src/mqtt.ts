import { createServer as createTcp } from 'node:net';
import { Aedes } from 'aedes';
import { createServer as createFactoryServer } from 'aedes-server-factory';
import { TOPIC_PATTERN, topics, type LedState } from '@careping/shared';
import type { Engine } from './engine.ts';

export async function startBroker(opts: { tcpPort: number; wsPort: number; log: (m: string) => void }) {
  const broker = await Aedes.createBroker();
  const tcp = createTcp(broker.handle);
  const ws = createFactoryServer(broker, { ws: true });
  await new Promise<void>((r) => tcp.listen(opts.tcpPort, r));
  await new Promise<void>((r) => ws.listen(opts.wsPort, r));
  opts.log(`[mqtt] broker: tcp ${opts.tcpPort}, websocket ${opts.wsPort}`);

  const publishLed = (deviceId: string, state: LedState, caseId?: string) => {
    broker.publish(
      { cmd: 'publish', topic: topics.led(deviceId), payload: Buffer.from(JSON.stringify({ state, caseId })), qos: 1, retain: true, dup: false },
      () => {},
    );
  };

  const attach = (engine: Engine) => {
    broker.on('publish', (packet, client) => {
      if (!client) return; // ข้อความที่เซิร์ฟเวอร์ส่งเอง
      const m = TOPIC_PATTERN.exec(packet.topic);
      if (!m) return;
      const [, deviceId, kind] = m;
      let body: any;
      try {
        body = JSON.parse(packet.payload.toString());
      } catch {
        return;
      }
      const run =
        kind === 'press' ? engine.handlePress(deviceId, body) : kind === 'heartbeat' ? engine.handleHeartbeat(deviceId, body) : null;
      run?.catch((e) => opts.log(`[mqtt] ${kind} error: ${e}`));
    });
  };

  const close = async () => {
    await new Promise((r) => tcp.close(r));
    await new Promise((r) => ws.close(r));
    await new Promise<void>((r) => broker.close(() => r()));
  };

  return { publishLed, attach, close };
}
