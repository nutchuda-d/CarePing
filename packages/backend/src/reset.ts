import { rmSync } from 'node:fs';
import { config } from './config.ts';

rmSync(config.dataDir, { recursive: true, force: true });
console.log('ลบฐานข้อมูลแล้ว จะสร้างข้อมูลตั้งต้นใหม่ตอนรัน backend ครั้งถัดไป');
