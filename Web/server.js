/* ==========================================================
   CarePing web server

   Bedside button ──MQTT──▶ Mosquitto ──▶ Node-RED ──HTTP POST /api/mqtt-data──▶ this server ──Socket.IO──▶ browser
   Browser ──POST /api/ack──▶ this server ──HTTP POST {NODE_RED_URL}/careping/ack──▶ Node-RED ──MQTT careping/<code>/ack──▶ button

   Run:  node server.js
   Optional settings (environment variables):
     PORT          web port                       (default 3000)
     NODE_RED_URL  where Node-RED listens         (default http://localhost:1880)
   ========================================================== */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT) || 3000;
const NODE_RED_URL = (process.env.NODE_RED_URL || 'http://localhost:1880').replace(/\/+$/, '');
const DEVICE_RE = /^CP-[0-9A-Z]{4}$/;
const ACK_STATES = new Set(['waiting', 'otw', 'done']);
const REQUEST_TYPES = new Set(['help', 'pain', 'water', 'toilet']);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ───────────── Database: keeps every message Node-RED sends ─────────────
const db = new sqlite3.Database(path.join(__dirname, 'mqtt_data.db'), (err) => {
  if (err) console.error('Error opening SQLite database:', err.message);
  else console.log('Connected to SQLite database.');
});
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sensor_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ───────────── Node-RED → web ─────────────
// Node-RED POSTs { topic, payload, timestamp } for every button message.
app.post('/api/mqtt-data', (req, res) => {
  const { topic, payload, timestamp } = req.body || {};
  if (typeof topic !== 'string' || payload === undefined) {
    return res.status(400).json({ error: 'Expected JSON with "topic" and "payload"' });
  }
  const timeStr = typeof timestamp === 'string' ? timestamp : new Date().toISOString();
  const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);

  db.run('INSERT INTO sensor_logs (topic, payload, created_at) VALUES (?, ?, ?)', [topic, payloadStr, timeStr], (err) => {
    if (err) {
      console.error('Database write error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    io.emit('mqtt_message', { topic, payload: payloadStr, timestamp: timeStr });
    console.log(`[${timeStr}] ${topic} ${payloadStr}`);
    res.status(200).json({ status: 'success' });
  });
});

// Last 50 raw messages (used by debug.html)
app.get('/api/history', (req, res) => {
  db.all('SELECT * FROM sensor_logs ORDER BY id DESC LIMIT 50', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ───────────── Web → Node-RED → button ─────────────
// The caregiver pressed "On my way", "Done", "Reassign" or "Undo".
app.post('/api/ack', async (req, res) => {
  const { device, type, state, by } = req.body || {};
  const code = String(device || '').toUpperCase();
  if (!DEVICE_RE.test(code)) return res.status(400).json({ error: 'Unknown device code' });
  if (!ACK_STATES.has(state)) return res.status(400).json({ error: 'state must be waiting, otw or done' });

  const body = {
    device: code,
    type: REQUEST_TYPES.has(type) ? type : null,
    state,
    by: typeof by === 'string' ? by.slice(0, 60) : null,
  };
  try {
    const r = await fetch(`${NODE_RED_URL}/careping/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`Node-RED answered ${r.status}`);
    console.log(`ack → ${code}: ${state}${body.by ? ' by ' + body.by : ''}`);
    res.status(202).json({ status: 'sent' });
  } catch (err) {
    console.error(`Could not send ack to Node-RED at ${NODE_RED_URL}:`, err.message);
    res.status(502).json({ error: 'Node-RED is not reachable' });
  }
});

server.listen(PORT, () => {
  console.log(`CarePing running on http://localhost:${PORT}`);
  console.log(`Sending acknowledgements to Node-RED at ${NODE_RED_URL}/careping/ack`);
});
