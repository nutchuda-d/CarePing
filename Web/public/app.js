/* ==========================================================
   CarePing · Caregiver console (front end)

   Live data: when the page is served by server.js, it listens to
   the Socket.IO event "mqtt_message". Node-RED turns each button's
   MQTT message into one of these before it reaches the page:

     { "device": "CP-7F3A", "type": "water" }        ← a request
       type = help | pain | water | toilet
     { "device": "CP-7F3A", "status": "online" }     ← a heartbeat (or "offline")

   When a caregiver presses On my way / Done / Reassign / Undo, the
   page POSTs /api/ack and the server forwards it to Node-RED, which
   publishes careping/<CODE>/ack so the button can light up.

   Without the server (file opened directly) the page runs in demo
   mode with sample data. Press  T  to simulate a new ping.
   ========================================================== */
(() => {
  'use strict';

  // ───────────── Settings ─────────────
  const NURSE = 'Nurse Noon';
  const WARD = 'Ward A';
  const ESCALATE_AFTER = 120;   // seconds a request may wait before it escalates
  const OFFLINE_AFTER = 300;    // seconds without a signal before a button counts as offline
  const UNDO_WINDOW = 10;       // seconds a finished card stays (with Undo) before moving to the log
  const PAGE_SIZE = 8;
  const CODE_RE = /^CP-[0-9A-Z]{4}$/;

  // ───────────── Helpers ─────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();
  const ago = (sec) => now() - sec * 1000;
  const secsSince = (t) => (now() - t) / 1000;
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const human = (s) => { s = Math.round(s); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
  const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const rel = (t) => {
    if (!t) return 'Never';
    const s = secsSince(t);
    if (s < 5) return 'Just now';
    if (s < 60) return `${Math.floor(s)} s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)} h ago`;
  };

  // Lucide-style icons (MIT)
  const ICON = {
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    toilet: '<path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18"/><path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    wifioff: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
    volumeoff: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    device: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  };
  const svg = (name, size = 20) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

  const TYPES = {
    help:   { label: 'Needs help',        short: 'Help',   icon: 'alert',   tone: 'danger' },
    pain:   { label: 'Pain / discomfort', short: 'Pain',   icon: 'heart',   tone: 'warning' },
    water:  { label: 'Water',             short: 'Water',  icon: 'droplet', tone: 'info' },
    toilet: { label: 'Toilet',            short: 'Toilet', icon: 'toilet',  tone: 'violet' },
  };
  const STATUS = {
    waiting:   ['Waiting', 'danger'],
    escalated: ['Escalated', 'warning'],
    otw:       ['On the way', 'info'],
    done:      ['Done', 'success'],
  };
  const chip = (label, tone, { dot = true, upper = false } = {}) =>
    `<span class="chip tone-${tone}${upper ? ' chip-upper' : ''}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;
  const tag = (type) => { const t = TYPES[type]; return `<span class="tag tone-${t.tone}">${svg(t.icon, 16)}${t.short}</span>`; };

  // ───────────── Sample data ─────────────
  let seq = 100;
  const state = {
    view: 'ping',
    filter: 'all',
    logType: 'all',
    logQuery: '',
    logPage: 0,
    sound: true,
    live: false,
    pings: [
      { id: 1, type: 'help',   patient: 'Somsri K.',  bed: 'Bed 3',  ward: WARD, device: 'CP-21B9', createdAt: ago(38),  state: 'waiting', presses: 3, lastPressAt: ago(8) },
      { id: 2, type: 'pain',   patient: 'Prasert W.', bed: 'Bed 7',  ward: WARD, device: 'CP-9D10', createdAt: ago(171), state: 'waiting', presses: 1 },
      { id: 3, type: 'water',  patient: 'Malee T.',   bed: 'Bed 12', ward: WARD, device: 'CP-7F3A', createdAt: ago(65),  state: 'waiting', presses: 1 },
      { id: 4, type: 'toilet', patient: 'Boonmee S.', bed: 'Bed 5',  ward: WARD, device: 'CP-0C44', createdAt: ago(97),  state: 'otw', acceptedAt: ago(45), by: 'Nurse Ploy' },
    ],
    log: [
      [26, 'Wichai P.', 'Bed 2', 'water', 'Nurse Fah', 70],
      [40, 'Ratana J.', 'Bed 9', 'toilet', 'Nurse Kan', 125],
      [58, 'Somsri K.', 'Bed 3', 'water', 'Nurse Ploy', 48],
      [77, 'Prasert W.', 'Bed 7', 'pain', 'Nurse Fah', 92],
      [95, 'Malee T.', 'Bed 12', 'water', 'Nurse Noon', 61],
      [118, 'Boonmee S.', 'Bed 5', 'toilet', 'Nurse Kan', 104],
      [140, 'Somsri K.', 'Bed 3', 'help', 'Nurse Ploy', 35],
      [165, 'Wichai P.', 'Bed 2', 'pain', 'Nurse Noon', 88],
      [190, 'Ratana J.', 'Bed 9', 'water', 'Nurse Fah', 57],
      [212, 'Prasert W.', 'Bed 7', 'pain', 'Ward A team', 252, true],
      [240, 'Malee T.', 'Bed 12', 'toilet', 'Nurse Ploy', 96],
      [268, 'Boonmee S.', 'Bed 5', 'water', 'Nurse Kan', 44],
      [300, 'Somsri K.', 'Bed 3', 'toilet', 'Ward A team', 132, true],
      [331, 'Wichai P.', 'Bed 2', 'water', 'Nurse Fah', 66],
      [360, 'Ratana J.', 'Bed 9', 'pain', 'Nurse Ploy', 79],
      [392, 'Malee T.', 'Bed 12', 'water', 'Nurse Kan', 52],
      [425, 'Prasert W.', 'Bed 7', 'toilet', 'Nurse Fah', 118],
      [460, 'Boonmee S.', 'Bed 5', 'water', 'Nurse Noon', 73],
      [497, 'Somsri K.', 'Bed 3', 'water', 'Nurse Ploy', 58],
      [540, 'Wichai P.', 'Bed 2', 'toilet', 'Nurse Kan', 101],
    ].map(([minAgo, patient, bed, type, by, responseSec, escalated], i) => ({
      id: 'L' + i, createdAt: ago(minAgo * 60), patient, bed, ward: WARD, type, by, responseSec, escalated: !!escalated,
    })),
    devices: [
      { code: 'CP-7F3A', patient: 'Malee T.',   bed: 'Bed 12', ward: WARD, lastSeen: ago(2),  sim: true },
      { code: 'CP-21B9', patient: 'Somsri K.',  bed: 'Bed 3',  ward: WARD, lastSeen: ago(12), sim: true },
      { code: 'CP-0C44', patient: 'Boonmee S.', bed: 'Bed 5',  ward: WARD, lastSeen: ago(30), sim: true },
      { code: 'CP-9D10', patient: 'Prasert W.', bed: 'Bed 7',  ward: WARD, lastSeen: ago(60), sim: true },
      { code: 'CP-55E2', patient: 'Ratana J.',  bed: 'Bed 9',  ward: WARD, lastSeen: ago(36 * 60) },
      { code: 'CP-A817', patient: 'Wichai P.',  bed: 'Bed 2',  ward: WARD, lastSeen: ago(8),  sim: true },
      { code: 'CP-3F6C', patient: null, bed: null, ward: null, lastSeen: ago(120), sim: true },
    ],
  };

  // ───────────── Derived state ─────────────
  const isEscalated = (p) => p.state === 'waiting' && p.type !== 'help' && secsSince(p.createdAt) >= ESCALATE_AFTER;
  const isOnline = (d) => !d.offline && !!d.lastSeen && secsSince(d.lastSeen) < OFFLINE_AFTER;
  const deviceStatus = (d) => (!d.patient ? 'unassigned' : !d.lastSeen ? 'pending' : isOnline(d) ? 'online' : 'offline');
  const activePings = () => state.pings.filter((p) => p.state !== 'done');
  const offlineDevices = () => state.devices.filter((d) => deviceStatus(d) === 'offline');

  function rank(p) {
    if (p.state === 'done') return 9;
    if (p.state === 'otw') return 5;
    if (p.type === 'help') return 0;
    if (isEscalated(p)) return 1;
    return 2;
  }
  const sortedPings = () => [...state.pings].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);

  function allRows() {
    const fromPings = state.pings.map((p) => {
      const status = p.state === 'waiting' ? (isEscalated(p) ? 'escalated' : 'waiting') : p.state;
      const live = p.state === 'waiting';
      return {
        ...p,
        status,
        live,
        by: status === 'escalated' ? `${p.ward || WARD} team` : p.by || '—',
        responseSec: p.acceptedAt ? (p.acceptedAt - p.createdAt) / 1000 : secsSince(p.createdAt),
        escalated: status === 'escalated' || !!p.wasEscalated,
      };
    });
    const fromLog = state.log.map((l) => ({ ...l, status: 'done', live: false }));
    return [...fromPings, ...fromLog].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ───────────── Ping view ─────────────
  function timerInfo(p) {
    if (p.state === 'otw') return { value: mmss(secsSince(p.acceptedAt)), caption: 'since accepted', tone: 't-info' };
    if (p.state === 'done') return { value: mmss((p.acceptedAt - p.createdAt) / 1000), caption: 'response time', tone: 't-success' };
    const tone = p.type === 'help' ? 't-danger' : isEscalated(p) ? 't-warning' : '';
    return { value: mmss(secsSince(p.createdAt)), caption: 'waiting', tone };
  }

  function noteText(p) {
    if (p.state === 'otw') return { icon: 'arrow', text: `${p.by} accepted at ${clock(p.acceptedAt)}` };
    if (isEscalated(p)) return { icon: 'clock', text: `No answer after ${Math.floor(ESCALATE_AFTER / 60)} min — escalated to ${p.ward || WARD} team` };
    if ((p.presses || 1) > 1) {
      const span = Math.max(1, Math.round(((p.lastPressAt || now()) - p.createdAt) / 1000));
      return { icon: 'clock', text: `Pressed ${p.presses} times in ${span} seconds` };
    }
    return { icon: 'clock', text: 'Bedside button · 1 press' };
  }

  function cardHTML(p) {
    const t = TYPES[p.type];
    const urgent = p.type === 'help' && p.state === 'waiting';
    let badge = '';
    if (p.state === 'otw') badge = chip('On the way', 'info', { dot: false, upper: true });
    else if (p.state === 'done') badge = chip('Done', 'success', { dot: false, upper: true });
    else if (urgent) badge = chip('Urgent', 'danger', { dot: false, upper: true });
    else if (isEscalated(p)) badge = chip('Escalated', 'warning', { dot: false, upper: true });

    const tm = timerInfo(p);
    const note = noteText(p);
    let body;
    if (p.state === 'waiting') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions">
          <button class="btn grow" data-action="accept" data-id="${p.id}">${svg('arrow', 18)}On my way</button>
          <button class="btn btn-secondary btn-fixed" data-action="done" data-id="${p.id}">${svg('check', 18)}Done</button>
        </div>`;
    } else if (p.state === 'otw') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions">
          <button class="btn btn-success grow" data-action="done" data-id="${p.id}">${svg('check', 18)}Mark as done</button>
          <button class="btn btn-secondary btn-fixed" data-action="reassign" data-id="${p.id}">Reassign</button>
        </div>`;
    } else {
      body = `
        <div class="actions">
          <span class="done-note">Completed by ${esc(p.by)} · moves to the log shortly</span>
          <button class="btn btn-secondary btn-fixed" data-action="undo" data-id="${p.id}">${svg('undo', 18)}Undo</button>
        </div>`;
    }

    return `
      <article class="card glass${urgent ? ' card-urgent' : ''}${p.state === 'done' ? ' card-done' : ''}" data-id="${p.id}">
        <div class="card-top">
          <div class="icon-tile tone-${t.tone}">${svg(t.icon, 24)}</div>
          <div class="card-info">
            <div class="card-title"><h3>${t.label}</h3>${badge}</div>
            <div class="card-sub">${esc(p.patient)} · ${esc(p.bed)}${p.ward ? ', ' + esc(p.ward) : ''}</div>
          </div>
          <div class="timer">
            <div class="timer-value ${tm.tone}" data-timer>${tm.value}</div>
            <div class="timer-caption">${tm.caption}</div>
          </div>
        </div>
        ${body}
      </article>`;
  }

  function statHTML(label, value, caption) {
    return `<div class="stat glass"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-caption">${esc(caption)}</div></div>`;
  }

  function avgResponse() {
    const rows = allRows().filter((r) => !r.live);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.responseSec, 0) / rows.length;
  }

  function renderPingStats() {
    const waiting = state.pings.filter((p) => p.state === 'waiting');
    const otw = state.pings.filter((p) => p.state === 'otw');
    const longest = waiting.reduce((m, p) => Math.max(m, secsSince(p.createdAt)), 0);
    const avg = avgResponse();
    const rows = allRows();
    const escalations = rows.filter((r) => r.escalated).length;
    $('#pingStats').innerHTML =
      statHTML('Waiting', waiting.length, waiting.length ? `Longest wait: ${mmss(longest)}` : 'Nobody waiting') +
      statHTML('On the way', otw.length, otw.length ? `${otw[0].by} → ${otw[0].bed}` : 'No one on the way') +
      statHTML('Avg response today', avg == null ? '—' : human(avg), 'Target: under 3 min') +
      statHTML('Requests today', rows.length, `${escalations} escalated`);
  }

  let gridSignature = '';
  function renderPingGrid(force = false) {
    const list = sortedPings().filter((p) => state.filter === 'all' || p.type === state.filter);
    const sig = state.filter + '|' + list.map((p) => `${p.id}:${p.state}:${isEscalated(p) ? 1 : 0}:${p.presses || 1}`).join(',');
    if (!force && sig === gridSignature) {
      // Only the clocks changed — update them in place so buttons keep focus/hover.
      for (const p of list) {
        const el = $(`.card[data-id="${p.id}"] [data-timer]`);
        if (el) el.textContent = timerInfo(p).value;
      }
      return;
    }
    gridSignature = sig;
    $('#pingGrid').innerHTML = list.map(cardHTML).join('');
    const empty = $('#pingEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = state.filter === 'all'
      ? 'All calm — no active requests right now.'
      : `No ${TYPES[state.filter].short.toLowerCase()} requests right now.`;
  }

  let catSignature = '';
  function renderCategories() {
    const active = activePings();
    const count = (k) => (k === 'all' ? active.length : active.filter((p) => p.type === k).length);
    const items = [['all', 'All', 'bell', 'brand'], ...Object.entries(TYPES).map(([k, t]) => [k, t.short, t.icon, t.tone])];
    const sig = state.filter + '|' + items.map(([k]) => count(k)).join(',');
    if (sig === catSignature) return;   // nothing changed — keep focus/hover intact
    catSignature = sig;
    $('#categoryBar').innerHTML = items.map(([k, label, ic, tone]) =>
      `<button class="cat tone-${tone}" data-filter="${k}" aria-pressed="${state.filter === k}" aria-label="${label}: ${count(k)} active">
         ${svg(ic, 20)}<span>${label}</span><span class="count">${count(k)}</span>
       </button>`).join('');
  }

  function renderBanners() {
    const off = offlineDevices();
    const pb = $('#pingBanner'), db = $('#devBanner');
    pb.hidden = db.hidden = off.length === 0;
    if (!off.length) return;
    if (off.length === 1) {
      const d = off[0];
      $('.banner-text', pb).textContent = `${d.bed} button has been offline since ${clock(d.lastSeen)} — check its power or Wi‑Fi.`;
      $('.banner-text', db).textContent = `${d.bed} button (${d.code}) has been offline since ${clock(d.lastSeen)} — check its power or Wi‑Fi. The patient cannot call for help with it.`;
    } else {
      const beds = off.map((d) => d.bed).join(', ');
      $('.banner-text', pb).textContent = `${off.length} buttons are offline (${beds}) — check their power or Wi‑Fi.`;
      $('.banner-text', db).textContent = `${off.length} buttons are offline (${beds}). Those patients cannot call for help until they're back.`;
    }
  }

  function renderLivePill() {
    const assigned = state.devices.filter((d) => d.patient);
    const online = assigned.filter(isOnline).length;
    const pill = $('#livePill');
    pill.className = 'pill ' + (state.live ? 'pill-success' : 'pill-neutral');
    $('#livePillText').textContent = `${state.live ? 'Live' : 'Demo mode'} · ${online} of ${assigned.length} buttons online`;
  }

  function renderPing(force) {
    renderPingStats();
    renderPingGrid(force);
    renderCategories();
    renderBanners();
    renderLivePill();
  }

  // ───────────── Log view ─────────────
  function logRows() {
    const q = state.logQuery.trim().toLowerCase();
    return allRows().filter((r) =>
      (state.logType === 'all' || r.type === state.logType) &&
      (!q || r.patient.toLowerCase().includes(q) || r.bed.toLowerCase().includes(q)));
  }
  const responseText = (r) => (r.live ? `${mmss(r.responseSec)} so far` : mmss(r.responseSec));

  function renderLog() {
    renderLogStats();
    $('#logTypeFilters').innerHTML = [['all', 'All'], ['water', 'Water'], ['toilet', 'Toilet'], ['pain', 'Pain'], ['help', 'Help']]
      .map(([k, l]) => `<button class="btn btn-sm${state.logType === k ? '' : ' btn-secondary'}" data-logtype="${k}" aria-pressed="${state.logType === k}">${l}</button>`)
      .join('');
    renderLogTable();
  }

  function renderLogStats() {
    const rows = allRows();
    const done = rows.filter((r) => !r.live);
    const longest = done.reduce((m, r) => (!m || r.responseSec > m.responseSec ? r : m), null);
    const avg = avgResponse();
    const openEsc = rows.filter((r) => r.status === 'escalated').length;
    $('#logStats').innerHTML =
      statHTML('Total requests', rows.length, `Today, until ${clock(now())}`) +
      statHTML('Avg response', avg == null ? '—' : human(avg), 'Target: under 3 min') +
      statHTML('Longest wait', longest ? human(longest.responseSec) : '—', longest ? `${longest.bed} · ${clock(longest.createdAt)}` : '') +
      statHTML('Escalations', rows.filter((r) => r.escalated).length, openEsc ? `${openEsc} still open` : 'All resolved');
  }

  function renderLogTable() {
    const rows = logRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.logPage = Math.min(state.logPage, pages - 1);
    const page = rows.slice(state.logPage * PAGE_SIZE, (state.logPage + 1) * PAGE_SIZE);
    $('#logBody').innerHTML = page.length
      ? page.map((r) => {
          const [label, tone] = STATUS[r.status];
          const respTone = r.live ? (r.status === 'escalated' ? 't-warning' : 't-danger') : '';
          return `<tr>
            <td class="muted">${clock(r.createdAt)}</td>
            <td class="strong">${esc(r.patient)}</td>
            <td>${esc(r.bed)}</td>
            <td>${tag(r.type)}</td>
            <td>${chip(label, tone)}</td>
            <td class="${r.by === '—' ? 'muted' : ''}">${esc(r.by)}</td>
            <td class="strong ${respTone}">${responseText(r)}</td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="7">No requests match these filters.</td></tr>`;
    const from = rows.length ? state.logPage * PAGE_SIZE + 1 : 0;
    $('#logCount').textContent = `Showing ${from}–${state.logPage * PAGE_SIZE + page.length} of ${rows.length} requests`;
    $('#prevPage').disabled = state.logPage === 0;
    $('#nextPage').disabled = state.logPage >= pages - 1;
  }

  function exportCSV() {
    const safe = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
    const head = ['Time', 'Patient', 'Bed', 'Request', 'Status', 'Answered by', 'Response time'];
    const lines = [head, ...logRows().map((r) => [clock(r.createdAt), r.patient, r.bed, TYPES[r.type].short, STATUS[r.status][0], r.by, responseText(r)])]
      .map((cols) => cols.map((v) => `"${safe(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `careping-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ───────────── Devices view ─────────────
  const DEV_STATUS = {
    online: ['Online', 'success'],
    offline: ['Offline', 'danger'],
    unassigned: ['Unassigned', 'neutral'],
    pending: ['Not seen yet', 'neutral'],
  };

  let patientSignature = '';
  function renderDevices(force = false) {
    const assigned = state.devices.filter((d) => d.patient);
    const online = assigned.filter(isOnline).length;
    const offline = offlineDevices().length;
    $('#devOnline span:last-child').textContent = `${online} online`;
    $('#devOffline span:last-child').textContent = `${offline} offline`;
    $('#devOffline').hidden = offline === 0;
    $('#devCount').textContent = `${state.devices.length} devices`;

    // Don't redraw the table under someone who is tabbing through its buttons.
    if (force || !$('#devBody').contains(document.activeElement)) $('#devBody').innerHTML = state.devices.map((d) => {
      const st = deviceStatus(d);
      const [label, tone] = DEV_STATUS[st];
      const last = st === 'offline'
        ? `<span class="t-danger strong">${clock(d.lastSeen)} · ${rel(d.lastSeen)}</span>`
        : st === 'pending' ? '<span class="muted">Waiting for first press</span>' : `<span class="muted">${rel(d.lastSeen)}</span>`;
      return `<tr class="${st === 'offline' ? 'row-offline' : ''}">
        <td class="code">${esc(d.code)}</td>
        <td class="${d.patient ? 'strong' : 'muted'}">${esc(d.patient || '—')}</td>
        <td class="${d.bed ? '' : 'muted'}">${esc(d.bed || '—')}</td>
        <td>${chip(label, tone)}</td>
        <td>${last}</td>
        <td><button class="link-btn" data-edit="${esc(d.code)}">${d.patient ? 'Edit' : 'Assign'}</button></td>
      </tr>`;
    }).join('');

    const names = [...new Set([...state.devices.map((d) => d.patient), ...state.pings.map((p) => p.patient)].filter(Boolean))].sort();
    if (names.join('|') !== patientSignature) {
      patientSignature = names.join('|');
      $('#patientList').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
    }
  }

  function setHint(kind, text) {
    const h = $('#codeHint');
    if (!kind) { h.hidden = true; return; }
    h.hidden = false;
    h.className = `field-hint ${kind}`;
    h.innerHTML = (kind === 'ok' ? svg('check', 14) : '') + `<span>${esc(text)}</span>`;
  }

  function updateCodeHint() {
    const code = $('#fCode').value.trim().toUpperCase();
    if (!code) return setHint(null);
    if (!CODE_RE.test(code)) return setHint(code.length >= 7 ? 'err' : 'info', 'Codes look like CP-7F3A');
    const d = state.devices.find((x) => x.code === code);
    if (!d) return setHint('info', "New button — it'll show online after its first press");
    if (!d.patient) return setHint(isOnline(d) ? 'ok' : 'info', isOnline(d) ? 'Found · button is online' : 'Found · not seen recently');
    setHint('warn', `Linked to ${d.patient} · ${d.bed} — saving will update it`);
  }

  function fillForm(code) {
    const d = state.devices.find((x) => x.code === code);
    if (!d) return;
    $('#fCode').value = d.code;
    $('#fPatient').value = d.patient || '';
    $('#fBed').value = d.bed ? `${d.bed}${d.ward ? ', ' + d.ward : ''}` : '';
    updateCodeHint();
    $('#fPatient').focus();
  }

  function submitLink(e) {
    e.preventDefault();
    const code = $('#fCode').value.trim().toUpperCase();
    const patient = $('#fPatient').value.trim();
    const bedRaw = $('#fBed').value.trim();
    if (!CODE_RE.test(code)) { setHint('err', 'Enter the code from the sticker, e.g. CP-7F3A'); $('#fCode').focus(); return; }
    if (!patient) { toast('Add the patient this button belongs to'); $('#fPatient').focus(); return; }
    if (!bedRaw) { toast('Add the bed or room'); $('#fBed').focus(); return; }
    const [bed, ward = WARD] = bedRaw.split(',').map((s) => s.trim());
    let d = state.devices.find((x) => x.code === code);
    if (!d) { d = { code, lastSeen: null }; state.devices.push(d); }
    Object.assign(d, { patient, bed, ward });
    $('#linkForm').reset();
    setHint(null);
    toast(`${code} linked to ${patient} · ${bed}`);
    renderAll();
  }

  // ───────────── Actions ─────────────
  const act = {
    accept(p) {
      p.wasEscalated = p.wasEscalated || isEscalated(p);
      p.state = 'otw'; p.acceptedAt = now(); p.by = NURSE;
      toast(`You're on the way to ${p.patient} · ${p.bed}`);
    },
    done(p) {
      p.undo = { state: p.state, acceptedAt: p.acceptedAt, by: p.by };
      p.wasEscalated = p.wasEscalated || isEscalated(p);
      if (!p.acceptedAt) { p.acceptedAt = now(); p.by = NURSE; }
      p.state = 'done'; p.doneAt = now();
      clearTimeout(p.archiveTimer);
      p.archiveTimer = setTimeout(() => archive(p), UNDO_WINDOW * 1000);
    },
    reassign(p) {
      p.state = 'waiting'; p.acceptedAt = null; p.by = null;
      toast(`${p.patient}'s request is back in the queue`);
    },
    undo(p) {
      if (!p.undo) return;
      clearTimeout(p.archiveTimer);
      Object.assign(p, p.undo, { undo: null, doneAt: null });
    },
  };

  function archive(p) {
    if (p.state !== 'done') return;
    state.pings = state.pings.filter((x) => x !== p);
    state.log.unshift({
      id: 'L' + p.id, createdAt: p.createdAt, patient: p.patient, bed: p.bed, ward: p.ward, type: p.type,
      by: p.by, responseSec: (p.acceptedAt - p.createdAt) / 1000, escalated: !!p.wasEscalated,
    });
    renderAll();
  }

  // A new request from a bedside button (MQTT) or the T-key simulator.
  function addPing({ type, device, patient, bed }) {
    type = String(type || '').toLowerCase();
    if (!TYPES[type]) return;
    const code = device ? String(device).toUpperCase() : null;
    let d = code ? state.devices.find((x) => x.code === code) : null;
    if (code && !d) { d = { code, patient: null, bed: null, ward: null, lastSeen: null }; state.devices.push(d); }
    if (d) { d.lastSeen = now(); d.offline = false; }

    // A button that isn't linked yet still raises a card — a call for help must never be dropped.
    const linked = !!(patient || d?.patient);
    const who = patient || d?.patient || 'Unlinked button';
    const where = bed || d?.bed || code || 'Unknown bed';
    const existing = state.pings.find((p) => p.state === 'waiting' && p.type === type && (code ? p.device === code : p.patient === who));
    if (existing) {
      existing.presses = (existing.presses || 1) + 1;
      existing.lastPressAt = now();
    } else {
      state.pings.push({ id: ++seq, type, patient: who, bed: where, ward: d?.ward || WARD, device: code, createdAt: now(), state: 'waiting', presses: 1 });
    }
    beep(type === 'help');
    toast(linked
      ? `New ${TYPES[type].short.toLowerCase()} request · ${who}, ${where}`
      : `New ${TYPES[type].short.toLowerCase()} request from unlinked button ${code} — link it on the Devices page`);
    renderAll();
  }

  // A button reporting in ("online") or its last-will message ("offline").
  function heartbeat(device, status) {
    const code = String(device).toUpperCase();
    let d = state.devices.find((x) => x.code === code);
    if (!d) { d = { code, patient: null, bed: null, ward: null, lastSeen: null }; state.devices.push(d); }
    d.offline = String(status || '').toLowerCase() === 'offline';
    if (!d.offline || !d.lastSeen) d.lastSeen = now();
    renderAll();
  }

  // Tell Node-RED what the caregiver did, so it can signal the bedside button.
  function sendAck(p) {
    if (!state.live || !p.device) return;
    fetch('/api/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: p.device, type: p.type, state: p.state, by: p.by || null }),
    })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); })
      .catch(() => toast("Couldn't reach Node-RED — updated here, but the bedside button wasn't told"));
  }

  // ───────────── Sound & toast ─────────────
  let audio;
  function beep(urgent) {
    if (!state.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const tones = urgent ? [880, 660, 880] : [660, 880];
      tones.forEach((f, i) => {
        const t0 = audio.currentTime + i * 0.18;
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g).connect(audio.destination);
        o.start(t0); o.stop(t0 + 0.18);
      });
    } catch { /* audio not available */ }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function renderSound() {
    const b = $('#soundBtn');
    b.setAttribute('aria-pressed', String(state.sound));
    b.innerHTML = `${svg(state.sound ? 'volume' : 'volumeoff', 16)}<span>Sound ${state.sound ? 'on' : 'off'}</span>`;
  }

  // ───────────── Light / dark theme ─────────────
  const THEME_KEY = 'careping-theme';
  const savedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
  const systemDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    const b = $('#themeBtn');
    b.setAttribute('aria-pressed', String(dark));
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.innerHTML = `${svg(dark ? 'sun' : 'moon', 20)}<span class="nav-label">${dark ? 'Light mode' : 'Dark mode'}</span>`;
  }

  function initTheme() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    $('#themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked — still switch for this visit */ }
      applyTheme(next);
    });
    // Follow the computer's setting until the user picks one themselves.
    if (systemDark && systemDark.addEventListener) {
      systemDark.addEventListener('change', (e) => { if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light'); });
    }
  }

  // ───────────── Navigation & shared chrome ─────────────
  function setView(view) {
    if (!['ping', 'log', 'devices'].includes(view)) view = 'ping';
    state.view = view;
    for (const v of ['ping', 'log', 'devices']) $(`#view-${v}`).hidden = v !== view;
    $$('.nav-item').forEach((a) => {
      const on = a.dataset.view === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    renderAll(true);
    window.scrollTo(0, 0);
  }

  function renderChrome() {
    const waiting = state.pings.filter((p) => p.state === 'waiting').length;
    const badge = $('#navBadge');
    badge.hidden = waiting === 0;
    badge.textContent = waiting;
    document.title = (waiting ? `(${waiting}) ` : '') + 'CarePing · Caregiver console';
    const d = new Date();
    $('#clock').textContent = `${WARD} · ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}, ${clock(d)}`;
  }

  function renderAll(force = false) {
    renderChrome();
    if (state.view === 'ping') renderPing(force);
    if (state.view === 'log') { if (force) renderLog(); else { renderLogStats(); renderLogTable(); } }
    if (state.view === 'devices') renderDevices(force);
    renderBanners();
  }

  // ───────────── Events ─────────────
  function bind() {
    window.addEventListener('hashchange', () => setView(location.hash.slice(1)));

    $('#pingGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const p = state.pings.find((x) => String(x.id) === b.dataset.id);
      if (!p || !act[b.dataset.action]) return;
      const before = p.state;
      act[b.dataset.action](p);
      if (p.state !== before) sendAck(p);
      renderAll(true);
    });

    $('#categoryBar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      state.filter = b.dataset.filter;
      renderPing(true);
    });

    $('#soundBtn').addEventListener('click', () => { state.sound = !state.sound; renderSound(); if (state.sound) beep(false); });

    $('#logTypeFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-logtype]');
      if (!b) return;
      state.logType = b.dataset.logtype; state.logPage = 0; renderLog();
    });
    $('#logSearch').addEventListener('input', (e) => { state.logQuery = e.target.value; state.logPage = 0; renderLogTable(); });
    $('#prevPage').addEventListener('click', () => { state.logPage = Math.max(0, state.logPage - 1); renderLogTable(); });
    $('#nextPage').addEventListener('click', () => { state.logPage += 1; renderLogTable(); });
    $('#exportBtn').addEventListener('click', exportCSV);

    $('#fCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); updateCodeHint(); });
    $('#linkForm').addEventListener('submit', submitLink);
    $('#devBody').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) fillForm(b.dataset.edit); });

    // Press T anywhere (outside a text box) to simulate a button press.
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 't' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest('input, textarea, select')) return;
      const linked = state.devices.filter((d) => d.patient && isOnline(d));
      if (!linked.length) return;
      const d = linked[Math.floor(Math.random() * linked.length)];
      const types = ['water', 'water', 'toilet', 'toilet', 'pain', 'help'];
      addPing({ device: d.code, type: types[Math.floor(Math.random() * types.length)] });
    });
  }

  // ───────────── Live connection (server.js → Socket.IO) ─────────────
  function connect() {
    if (typeof window.io !== 'function') return;     // opened as a plain file → demo mode
    const socket = window.io();
    socket.on('connect', () => { state.live = true; renderAll(); });
    socket.on('disconnect', () => { state.live = false; renderAll(); });
    socket.on('mqtt_message', (msg) => {
      let data = msg && msg.payload;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const type = data.type || data.request;
      const device = data.device || data.code;
      if (type) addPing({ type, device, patient: data.patient, bed: data.bed });
      else if (device) heartbeat(device, data.status);
    });
  }

  // ───────────── Start ─────────────
  $$('[data-icon]').forEach((el) => { el.outerHTML = svg(el.dataset.icon, Number(el.dataset.size) || 20); });
  bind();
  initTheme();
  renderSound();
  setView(location.hash.slice(1) || 'ping');
  connect();

  // Clocks tick every second. Demo buttons send a heartbeat every 20 s.
  setInterval(() => renderAll(), 1000);
  setInterval(() => {
    for (const d of state.devices) if (d.sim) d.lastSeen = now() - Math.random() * 15000;
  }, 20000);
  // Once real buttons are talking through Node-RED, stop faking their heartbeats.
  setInterval(() => { if (state.live) for (const d of state.devices) d.sim = false; }, 1000);
})();
