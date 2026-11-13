import { networkInterfaces } from 'node:os';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { Engine } from './engine.ts';
import { startBroker } from './mqtt.ts';
import { Notifier } from './notifier.ts';
import { buildApi } from './api.ts';
import { Diary } from './diary.ts';
import { Reports } from './reports.ts';

const log = (m: string) => console.log(`${new Date().toLocaleTimeString('th-TH')} ${m}`);

// เปิดพอร์ต MQTT ก่อนแตะฐานข้อมูล: ถ้ามี backend อีกตัวเปิดค้างอยู่ จะหยุดตรงนี้
// แทนที่จะเปิดฐานข้อมูลซ้อนกันจนไฟล์เสีย
const broker = await startBroker({ tcpPort: config.mqttPort, wsPort: config.mqttWsPort, log }).catch((e) => {
  if (e?.code === 'EADDRINUSE') {
    console.error(`พอร์ต ${e.port} ถูกใช้อยู่ — น่าจะมี backend อีกหน้าต่างเปิดค้างอยู่ ให้ปิดตัวนั้นก่อน (Ctrl+C)`);
    process.exit(1);
  }
  throw e;
});
const db = await openDb(config.dataDir, log);
const notifier = new Notifier(db, { expoPush: config.expoPush, log });
const engine = new Engine({ db, notifier, publishLed: broker.publishLed, timeScale: config.timeScale, log });
broker.attach(engine);
const diary = new Diary({ db, engine, notifier, tzOffsetMin: config.tzOffsetMin });
const reports = new Reports({ db, engine, diary, tzOffsetMin: config.tzOffsetMin });

const app = await buildApi({
  db,
  engine,
  notifier,
  diary,
  reports,
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
