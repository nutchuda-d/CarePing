import { networkInterfaces } from 'node:os';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { Engine } from './engine.ts';
import { startBroker } from './mqtt.ts';
import { Notifier } from './notifier.ts';
import { buildApi } from './api.ts';

const log = (m: string) => console.log(`${new Date().toLocaleTimeString('th-TH')} ${m}`);

const db = await openDb(config.dataDir);
const notifier = new Notifier(db, { expoPush: config.expoPush, log });
const broker = await startBroker({ tcpPort: config.mqttPort, wsPort: config.mqttWsPort, log });
const engine = new Engine({ db, notifier, publishLed: broker.publishLed, timeScale: config.timeScale, log });
broker.attach(engine);

const app = await buildApi({
  db,
  engine,
  notifier,
  simulatorDir: config.simulatorDir,
  tzOffsetMin: config.tzOffsetMin,
  simConfig: async () => {
    const s = await engine.settings('pat-1');
    return {
      deviceId: 'btn-001',
      mqttWsPort: config.mqttWsPort,
      heartbeatIntervalSec: s.heartbeatIntervalSec * config.timeScale,
      buttons: await engine.buttons('pat-1'),
    };
  },
});
await app.listen({ port: config.httpPort, host: '0.0.0.0' });

const timer = setInterval(() => engine.tick().catch((e) => log(`[tick] ${e}`)), 1000);

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i!.address);
log(`[api] http://localhost:${config.httpPort}  (มือถือใช้ http://${ips[0] ?? '<IP เครื่องนี้>'}:${config.httpPort})`);
log(`[sim] ปุ่มจำลอง: http://localhost:${config.httpPort}/simulator/`);
if (config.timeScale !== 1) log(`[mode] --fast: ทุกเวลาเร็วขึ้น ${1 / config.timeScale} เท่า`);

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await broker.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
