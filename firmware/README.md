# Firmware ปุ่ม IoT (ESP32)

ยังไม่ได้เริ่ม ระหว่างนี้ใช้ปุ่มจำลองบนเว็บแทน (`http://localhost:3000/simulator/`)

ข้อตกลงที่ firmware ต้องทำตาม อยู่ใน `packages/shared/src/index.ts`:

| Topic | ทิศทาง | ข้อมูล |
| --- | --- | --- |
| `careping/dev/<id>/press` | ปุ่ม → เซิร์ฟเวอร์ (QoS 1) | `{ eventId, button, ts, queuedOffline? }` |
| `careping/dev/<id>/heartbeat` | ปุ่ม → เซิร์ฟเวอร์ ทุก 60 วิ | `{ battery, rssi, fw, ts }` |
| `careping/dev/<id>/status` | Last Will (retained) | `offline` / `online` |
| `careping/dev/<id>/led` | เซิร์ฟเวอร์ → ปุ่ม (retained) | `{ state: idle \| waiting \| acked \| no_response \| nobody_home }` |
