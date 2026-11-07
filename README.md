# CarePing 🔔

ระบบเรียกพยาบาล/ผู้ดูแล สำหรับผู้ป่วยที่เคลื่อนไหวลำบาก ผู้ป่วยกดปุ่มข้างเตียงเพื่อบอกว่าต้องการอะไร (ช่วยด่วน, ปวด, น้ำ, ห้องน้ำ) แล้วผู้ดูแลจะเห็นคำขอบนหน้าเว็บทันที เมื่อผู้ดูแลกด **On my way** หรือ **Done** ระบบจะส่งสัญญาณกลับไปที่ปุ่ม ให้ผู้ป่วยรู้ว่ามีคนกำลังมา

---

## ภาพรวมระบบ

```
 ปุ่มข้างเตียง (ESP32 / Payload.py)
        │  MQTT: careping/<รหัสปุ่ม>/request
        ▼
   Mosquitto (MQTT broker, พอร์ต 1883)
        │
        ▼
   Node-RED (พอร์ต 1880) ── แปลงข้อความ ──► POST /api/mqtt-data
                                                   │
                                                   ▼
                                   เว็บเซิร์ฟเวอร์ server.js (พอร์ต 3000)
                                                   │ Socket.IO (เรียลไทม์)
                                                   ▼
                                   หน้าเว็บผู้ดูแล http://localhost:3000

 ทางกลับ: ผู้ดูแลกดปุ่มบนเว็บ ─► POST /api/ack ─► Node-RED /careping/ack
          ─► MQTT careping/<รหัสปุ่ม>/ack ─► ปุ่มข้างเตียง (เช่น ไฟติด)
```

## โครงสร้างไฟล์

```
CarePing/
├── README.md            ← ไฟล์นี้
├── flows.json           ← flow ของ Node-RED (import เข้า Node-RED)
├── mosquitto.conf       ← ตั้งค่า Mosquitto ให้ Node-RED ใน Docker ต่อได้
├── requirements.txt     ← แพ็กเกจ Python
└── Web/
    ├── server.js        ← เว็บเซิร์ฟเวอร์ (Express + Socket.IO + SQLite)
    ├── Payload.py       ← จำลองปุ่มข้างเตียง ใช้ทดสอบแทนปุ่มจริง
    ├── package.json
    └── public/
        ├── index.html   ← หน้าเว็บผู้ดูแล (Ping / Log / Devices)
        ├── style.css    ← หน้าตา (ธีมฟ้า, ปุ่ม liquid glass, dark mode)
        ├── app.js       ← การทำงานของหน้าเว็บ
        └── debug.html   ← ตารางข้อความดิบ ใช้เช็กว่าข้อมูลเข้ามาไหม
```

---

## 1. ติดตั้งครั้งแรก

### สิ่งที่ต้องมี

| โปรแกรม | ใช้ทำอะไร | เช็กว่ามีแล้วด้วยคำสั่ง |
|---|---|---|
| [Node.js](https://nodejs.org) 18 ขึ้นไป | รันเว็บเซิร์ฟเวอร์ | `node --version` |
| [Python 3](https://www.python.org) | รันตัวจำลองปุ่ม | `python --version` |
| [Mosquitto](https://mosquitto.org/download/) | MQTT broker | `mosquitto -h` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | รัน Node-RED | `docker --version` |

### ติดตั้งแพ็กเกจ

เปิด PowerShell ที่โฟลเดอร์ `CarePing` แล้วรัน

```powershell
cd Web
npm install
cd ..
pip install paho-mqtt==1.6.1
```

> `Payload.py` เขียนสำหรับ paho-mqtt **1.6.1** ถ้าใช้เวอร์ชัน 2.x จะรันไม่ขึ้น

### สร้าง Node-RED ใน Docker (ทำครั้งเดียว)

ถ้ายังไม่มีคอนเทนเนอร์ Node-RED ให้รัน

```powershell
docker run -d --name nodered -p 1880:1880 -v node_red_data:/data nodered/node-red
```

`-p 1880:1880` จำเป็นมาก เพราะเว็บเซิร์ฟเวอร์ต้องส่งข้อมูลเข้า Node-RED ทางพอร์ตนี้

### Import flow เข้า Node-RED (ทำครั้งเดียว และทำใหม่ทุกครั้งที่ `flows.json` เปลี่ยน)

1. เปิด http://localhost:1880
2. ถ้ามีแท็บ flow เก่า (เช่น "Flow 4" หรือ "CarePing" เวอร์ชันก่อน) ให้ดับเบิลคลิกที่แท็บ แล้วกด **Delete**
3. กด **☰ (เมนูมุมขวาบน) → Import** หรือกด `Ctrl + I`
4. กด **select a file to import** แล้วเลือกไฟล์ `flows.json`
5. ถ้าขึ้นว่ามีโหนดซ้ำ ให้เลือก **Replace**
6. กด **Import** แล้วกดปุ่มแดง **Deploy** มุมขวาบน

จะได้แท็บชื่อ **CarePing** ที่แบ่งเป็น 3 ส่วน:
- **Button → web console** รับข้อความจากปุ่ม แล้วส่งเข้าเว็บ
- **Web console → button** รับการตอบกลับจากเว็บ แล้วส่งไปที่ปุ่ม
- **Tests** ปุ่มทดสอบสำเร็จรูป (ดูหัวข้อ 3)

---

## 2. วิธีเปิดใช้งาน (ทุกครั้ง)

เปิดตามลำดับนี้ โดยแต่ละขั้นให้เปิด PowerShell **คนละหน้าต่าง** และอย่าปิดหน้าต่างทิ้ง

### ขั้นที่ 1: เปิด Mosquitto

```powershell
cd C:\Users\ZIA\IdeaProjects\CarePing
mosquitto -v -c mosquitto.conf
```

ถ้าขึ้น `Opening ipv4 listen socket on port 1883` แปลว่าพร้อมแล้ว

> ถ้าขึ้น error ว่าพอร์ต 1883 ถูกใช้อยู่ แปลว่ามี Mosquitto เวอร์ชัน service ของ Windows เปิดค้างอยู่ ให้เปิด PowerShell แบบ **Run as administrator** แล้วรัน `net stop mosquitto` จากนั้นลองใหม่

### ขั้นที่ 2: เปิด Node-RED

เปิด Docker Desktop ขึ้นมา แล้วรัน

```powershell
docker start nodered
```

เข้า http://localhost:1880 แล้วดูในแท็บ **CarePing** โหนด **Button messages** กับ **Ack to button** ต้องมีจุดสีเขียวพร้อมคำว่า **connected**
(ถ้ายังเป็นสีเหลือง **connecting** ดูหัวข้อ [แก้ปัญหา](#5-แก้ปัญหา))

### ขั้นที่ 3: เปิดเว็บเซิร์ฟเวอร์

```powershell
cd C:\Users\ZIA\IdeaProjects\CarePing\Web
node server.js
```

ถ้าขึ้น `CarePing running on http://localhost:3000` แปลว่าพร้อมแล้ว

### ขั้นที่ 4: เปิดหน้าเว็บ

เข้า **http://localhost:3000**

ป้ายมุมขวาบนต้องขึ้น **Live · … buttons online** ถ้าขึ้น **Demo mode** แปลว่าหน้าเว็บยังต่อกับเซิร์ฟเวอร์ไม่ได้

> หน้าเว็บมีข้อมูลตัวอย่าง (ผู้ป่วย 6 คน, คำขอ 4 รายการ) ติดมาเพื่อใช้สาธิต ถ้ารีเฟรชหน้า ข้อมูลจะกลับเป็นค่าเริ่มต้น

### ขั้นที่ 5 (ไม่บังคับ): จำลองปุ่ม

```powershell
cd C:\Users\ZIA\IdeaProjects\CarePing\Web
python Payload.py
```

ตัวจำลองจะกดปุ่มแบบสุ่มทุก 15–30 วินาที และพิมพ์ข้อความที่ปุ่มได้รับกลับมา (ack) ให้ดู ถ้าต้องการกดครั้งเดียวให้ใช้

```powershell
python Payload.py CP-7F3A water
```

---

## 3. ทดสอบใน Node-RED

ในแท็บ **CarePing** ส่วน **Tests** มีโหนดทดสอบ 3 ตัว ทดสอบโดย **กดปุ่มสี่เหลี่ยมเล็กๆ ทางซ้ายของโหนด** แล้วดูผลที่หน้าเว็บ http://localhost:3000

| โหนด | ทดสอบอะไร | ผลที่ควรเห็นบนเว็บ |
|---|---|---|
| **Test 1: Help from Bed 3 (direct to web)** | Node-RED → เว็บ (ส่งตรง ไม่ผ่าน MQTT) | การ์ดสีแดง **Needs help** ของ Somsri K. เตียง 3 พร้อมเสียงเตือน |
| **Test 2: Water from Bed 12 (via MQTT)** | ปุ่ม → Mosquitto → Node-RED → เว็บ (เส้นทางเดียวกับปุ่มจริง) | การ์ด **Water** ของ Malee T. เตียง 12 |
| **Test 3: Bed 9 button back online (via MQTT)** | ข้อความสถานะ (heartbeat) | แถบเหลือง "Bed 9 button has been offline" หายไป |

**วิธีอ่านผล**
- Test 1 ได้ แต่ Test 2 ไม่ได้ แปลว่าเว็บปกติ แต่ **MQTT มีปัญหา** ให้เช็ก Mosquitto
- Test 1 ก็ไม่ได้ แปลว่า Node-RED ส่งเข้าเว็บไม่ได้ ให้เช็กว่ารัน `node server.js` อยู่ไหม
- กดแท็บ **debug 🐞** ทางขวาของ Node-RED จะเห็นข้อความทุกอันที่ผ่าน flow ในชื่อ **Incoming**

### ทดสอบทางกลับ (เว็บ → ปุ่ม)

1. ที่หน้าเว็บ กด **On my way** บนการ์ดใดก็ได้
2. ใน Node-RED แท็บ debug 🐞 จะมีข้อความ **Acks sent** หัวข้อ `careping/<รหัสปุ่ม>/ack`
3. ใต้โหนด **Build ack for button** จะขึ้นสถานะ เช่น `CP-7F3A: otw`
4. ถ้าเปิด `python Payload.py` ไว้ หน้าต่างนั้นจะพิมพ์ `← careping/CP-7F3A/ack: {"state": "otw", ...}`

ทดสอบโดยไม่ต้องใช้หน้าเว็บก็ได้ (รันใน PowerShell)

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:1880/careping/ack -ContentType 'application/json' -Body '{"device":"CP-7F3A","state":"otw","by":"Test"}'
```

ถ้าได้ผลเป็น `status: sent` แปลว่าใช้ได้

> เปิด http://localhost:1880/careping/ack ในเบราว์เซอร์แล้วขึ้น `Cannot GET` เป็นเรื่อง**ปกติ** เพราะหน้านี้รับเฉพาะ POST

### ทดสอบหน้าเว็บอย่างเดียว (ไม่ต้องเปิดอะไรเลย)

ดับเบิลคลิกเปิดไฟล์ `Web/public/index.html` ได้ทันที หน้าเว็บจะทำงานใน **Demo mode** ให้กดปุ่ม **T** บนคีย์บอร์ดเพื่อจำลองคำขอใหม่

---

## 4. รายละเอียดสำหรับนักพัฒนา

### รูปแบบข้อความ MQTT (สำหรับเขียนโค้ด ESP32)

รหัสปุ่มต้องอยู่ในรูปแบบ `CP-XXXX` (ตัวอักษร/ตัวเลข 4 ตัว)

| Topic | ใครส่ง | Payload | ใช้เมื่อ |
|---|---|---|---|
| `careping/CP-7F3A/request` | ปุ่ม | `{"type":"water"}` (`help` / `pain` / `water` / `toilet`) | ผู้ป่วยกดปุ่ม |
| `careping/CP-7F3A/status` | ปุ่ม | `{"status":"online"}` | ส่งทุก ~1 นาที เพื่อบอกว่ายังทำงานอยู่ |
| `careping/CP-7F3A/status` | broker (Last Will) | `{"status":"offline"}` | ตั้งเป็น Last Will ตอนเชื่อมต่อ ถ้าปุ่มดับ broker จะส่งให้อัตโนมัติ |
| `careping/CP-7F3A/ack` | Node-RED | `{"state":"otw","type":"water","by":"Nurse Noon","at":"..."}` | ผู้ดูแลกดปุ่มบนเว็บ (`otw` = กำลังไป, `done` = เสร็จแล้ว, `waiting` = ส่งคืนคิว) |

ปุ่มที่ไม่ส่งสัญญาณเกิน 5 นาที หน้าเว็บจะแสดงเป็น **Offline** และขึ้นแถบเตือน

### API ของเว็บเซิร์ฟเวอร์

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| `POST` | `/api/mqtt-data` | Node-RED ส่งข้อความปุ่มเข้ามา `{ topic, payload: {device, type} หรือ {device, status}, timestamp }` |
| `POST` | `/api/ack` | หน้าเว็บส่งการตอบกลับ `{ device, type, state, by }` แล้วเซิร์ฟเวอร์ส่งต่อให้ Node-RED |
| `GET` | `/api/history` | ข้อความดิบ 50 รายการล่าสุด (ใช้ใน `debug.html`) |

### ค่าที่ปรับได้

| ค่า | อยู่ที่ไหน | ค่าเริ่มต้น |
|---|---|---|
| พอร์ตเว็บ | ตัวแปร `PORT` ตอนรัน `server.js` | `3000` |
| ที่อยู่ Node-RED | ตัวแปร `NODE_RED_URL` ตอนรัน `server.js` | `http://localhost:1880` |
| URL ที่ Node-RED ส่งเข้าเว็บ | `flows.json` → โหนด **Send to web console** | `http://host.docker.internal:3000/api/mqtt-data` |
| MQTT broker ของ Node-RED | `flows.json` → config node **Mosquitto** | `host.docker.internal:1883` |
| MQTT broker ของตัวจำลอง | `Web/Payload.py` → `BROKER`, `PORT` | `localhost:1883` |
| ชื่อพยาบาล, วอร์ด, เวลา escalate (120 วิ), เวลาถือว่า offline (300 วิ), เวลา Undo (10 วิ) | บนสุดของ `Web/public/app.js` | — |

ตัวอย่างการตั้งค่าตอนรัน (PowerShell)

```powershell
$env:NODE_RED_URL="http://192.168.1.50:1880"; node server.js
```

> **ถ้าไม่ได้ใช้ Docker** (ติดตั้ง Node-RED ด้วย npm) ให้เปลี่ยน `host.docker.internal` เป็น `localhost` ใน 2 ที่ คือโหนด **Send to web console** และ config node **Mosquitto** แล้วกด Deploy

---

## 5. แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| หน้าเว็บขึ้น **Demo mode** | ยังไม่ได้รัน `node server.js` หรือเปิดหน้าเว็บด้วยการดับเบิลคลิกไฟล์ ให้เข้าผ่าน http://localhost:3000 แทน |
| โหนด MQTT ใน Node-RED ขึ้นสีเหลือง **connecting** | Mosquitto ไม่ได้เปิด หรือเปิดแบบไม่มี `mosquitto.conf` (Mosquitto 2.x รับเฉพาะ localhost) ให้เปิดตามขั้นที่ 1 |
| Debug ใน Node-RED ขึ้น `ECONNREFUSED ...:3000` | เว็บเซิร์ฟเวอร์ไม่ได้รัน ให้รัน `node server.js` |
| กด On my way แล้วมีข้อความ "Couldn't reach Node-RED" | Node-RED ไม่ได้เปิด หรือ Docker ไม่ได้เปิดพอร์ต 1880 (ต้องมี `-p 1880:1880`) |
| `Cannot GET /careping/ack` | ปกติ ไม่ใช่ error (หน้านี้รับเฉพาะ POST) |
| `python Payload.py` error เรื่อง `CallbackAPIVersion` | ใช้ paho-mqtt 2.x อยู่ ให้รัน `pip install paho-mqtt==1.6.1` |
| การ์ดขึ้นว่า **Unlinked button** | ปุ่มนั้นยังไม่ได้ผูกกับผู้ป่วย ให้ไปหน้า **Devices** ใส่รหัสปุ่ม ชื่อผู้ป่วย และเตียง แล้วกด **Link device** |
| ข้อมูลหายหลังรีเฟรช | ตอนนี้หน้าเว็บยังไม่บันทึกข้อมูลผู้ป่วย/การผูกปุ่มลงฐานข้อมูล (ฐานข้อมูลเก็บแค่ข้อความดิบจาก Node-RED) |

ถ้าอยากดูว่าข้อมูลเข้ามาถึงเซิร์ฟเวอร์ไหม ให้เปิด http://localhost:3000/debug.html จะเห็นข้อความดิบทุกอันที่ Node-RED ส่งมา
