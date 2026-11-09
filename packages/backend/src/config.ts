import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  httpPort: Number(process.env.HTTP_PORT ?? 3000),
  mqttPort: Number(process.env.MQTT_PORT ?? 1883),
  mqttWsPort: Number(process.env.MQTT_WS_PORT ?? 8888),
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../.data/pg'),
  /** เวลาท้องถิ่นสำหรับสถิติ (นาที) ค่าเริ่มต้น UTC+7 */
  tzOffsetMin: Number(process.env.TZ_OFFSET_MIN ?? 420),
  /** --fast: ย่อทุกเวลาให้เร็วขึ้น 10 เท่า ไว้ทดสอบ/เดโม */
  timeScale: process.argv.includes('--fast') || process.env.FAST === '1' ? 0.1 : 1,
  expoPush: process.env.EXPO_PUSH !== '0',
  simulatorDir: path.resolve(here, '../../simulator'),
};
