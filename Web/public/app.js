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
  const ANSWERING_MS = 1700;    // "Answering…" bar fills up
  const ANSWERED_MS = 1500;     // "Answered by …" stays before the card settles into On the way
  const COMPLETING_MS = 1300;   // "Completing…" bar fills up
  const COMPLETED_MS = 1300;    // "Completed" stays before the card settles into Done
  const PAGE_SIZE = 8;
  const CODE_RE = /^CP-[0-9A-Z]{4}$/;

  // ───────────── Language (English / ไทย) ─────────────
  // The words themselves live in i18n.js. t('key', { name: value }) fills in {name}.
  const I18N = window.CAREPING_I18N || { en: {} };
  const LANG_KEY = 'careping-lang';
  let lang = document.documentElement.lang === 'th' ? 'th' : 'en';
  const t = (key, vars = {}) => {
    const str = I18N[lang]?.[key] ?? I18N.en?.[key] ?? key;
    return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  };
  const LOC = () => (lang === 'th' ? 'th-TH' : 'en-GB');      // dates like "Sunday 8 Nov"
  const LOC_US = () => (lang === 'th' ? 'th-TH' : 'en-US');   // dates like "Nov 8"
  const yearText = (y) => (lang === 'th' ? y + 543 : y);      // Thai dates use the Buddhist year (พ.ศ.)

  // ───────────── Helpers ─────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();
  const ago = (sec) => now() - sec * 1000;
  const secsSince = (t) => (now() - t) / 1000;
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const human = (s) => { s = Math.round(s); return s < 60 ? t('secs', { s }) : t('minSecs', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') }); };
  const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
  const dayLabel = (day) => {
    const today = startOfDay(now());
    if (day === today) return t('today');
    if (day === startOfDay(today - 12 * 3600 * 1000)) return t('yesterday');
    const sameYear = new Date(day).getFullYear() === new Date(today).getFullYear();
    return new Date(day).toLocaleDateString(LOC_US(), sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const rel = (t0) => {
    if (!t0) return t('never');
    const s = secsSince(t0);
    if (s < 5) return t('justNow');
    if (s < 60) return t('secAgo', { n: Math.floor(s) });
    const m = Math.floor(s / 60);
    if (m < 60) return t('minAgo', { n: m });
    return t('hourAgo', { n: Math.floor(m / 60) });
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
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9 4v16"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    device: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  };
  const svg = (name, size = 20) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

  // label / short are looked up in the current language every time they're read
  const TYPES = {};
  for (const [k, [name, icon, tone]] of Object.entries({
    help:   ['Help',   'alert',   'danger'],
    pain:   ['Pain',   'heart',   'warning'],
    water:  ['Water',  'droplet', 'info'],
    toilet: ['Toilet', 'toilet',  'violet'],
  })) TYPES[k] = { icon, tone, get label() { return t('type' + name); }, get short() { return t('short' + name); } };
  const STATUS = {             // [text key, colour]
    waiting:   ['stWaiting', 'danger'],
    escalated: ['stEscalated', 'warning'],
    otw:       ['stOtw', 'info'],
    done:      ['stDone', 'success'],
  };
  // "Ward A team" is stored as byTeam so it can be shown in either language
  const byText = (r) => (r.byTeam ? t('team', { ward: r.byTeam }) : r.by || '—');
  const chip = (label, tone, { dot = true, upper = false } = {}) =>
    `<span class="chip tone-${tone}${upper ? ' chip-upper' : ''}">${dot ? '<span class="dot"></span>' : ''}${esc(label)}</span>`;
  const tag = (type) => { const ty = TYPES[type]; return `<span class="tag tone-${ty.tone}">${svg(ty.icon, 16)}${esc(ty.short)}</span>`; };

  // ───────────── Sample data ─────────────
  // A few weeks of made-up history so the Log's calendar has something to show.
  function sampleHistory(days) {
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const people = [['Somsri K.', 'Bed 3'], ['Prasert W.', 'Bed 7'], ['Malee T.', 'Bed 12'], ['Boonmee S.', 'Bed 5'], ['Wichai P.', 'Bed 2'], ['Ratana J.', 'Bed 9']];
    const types = ['water', 'water', 'water', 'toilet', 'toilet', 'toilet', 'pain', 'pain', 'help'];
    const nurses = ['Nurse Ploy', 'Nurse Fah', 'Nurse Kan', 'Nurse Noon'];
    const out = [];
    for (let d = 1; d <= days; d++) {
      const day = startOfDay(now()) - d * 86400000;
      const count = 8 + Math.floor(rnd() * 14);
      for (let i = 0; i < count; i++) {
        const [patient, bed] = pick(people);
        const type = pick(types);
        const responseSec = Math.round(30 + rnd() * (type === 'help' ? 60 : 170));
        const escalated = type !== 'help' && responseSec > 150 && rnd() < 0.5;
        out.push({
          id: `H${d}-${i}`, createdAt: day + Math.round((6 + rnd() * 16) * 3600000),
          patient, bed, ward: WARD, type, by: escalated ? null : pick(nurses), byTeam: escalated ? WARD : null, responseSec, escalated,
        });
      }
    }
    return out;
  }
  let seq = 100;
  const state = {
    view: 'ping',
    filter: 'all',
    logType: 'all',
    logQuery: '',
    logPage: 0,
    logDay: null,          // start of the day shown in the Log (null = today)
    calMonth: null,        // first day of the month shown in the calendar
    calMode: 'days',       // calendar level: days | months | years
    calYearPage: null,     // first year shown in the years grid
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
      id: 'L' + i, createdAt: ago(minAgo * 60), patient, bed, ward: WARD, type,
      by: by === 'Ward A team' ? null : by, byTeam: by === 'Ward A team' ? WARD : null, responseSec, escalated: !!escalated,
    })).concat(sampleHistory(21)),
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
    if (p.uiPhase && p.holdRank != null) return p.holdRank;   // don't jump while "Answering…" plays
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
        by: p.by || '—',
        byTeam: status === 'escalated' ? p.ward || WARD : null,
        responseSec: p.acceptedAt ? (p.acceptedAt - p.createdAt) / 1000 : secsSince(p.createdAt),
        escalated: status === 'escalated' || !!p.wasEscalated,
      };
    });
    const fromLog = state.log.map((l) => ({ ...l, status: 'done', live: false }));
    return [...fromPings, ...fromLog].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ───────────── Ping view ─────────────
  function timerInfo(p) {
    if (p.state === 'otw') return { value: mmss(secsSince(p.acceptedAt)), caption: t('sinceAccepted'), tone: 't-info' };
    if (p.state === 'done') return { value: mmss((p.acceptedAt - p.createdAt) / 1000), caption: t('responseTime'), tone: 't-success' };
    const tone = p.type === 'help' ? 't-danger' : '';   // only Help is red; escalation is shown by its chip
    return { value: mmss(secsSince(p.createdAt)), caption: t('waiting'), tone };
  }

  function noteText(p) {
    if (p.state === 'done') return { icon: 'check', text: t('finishedAt', { by: p.by || NURSE, time: clock(p.doneAt || now()) }) };
    if (p.state === 'otw') return { icon: 'arrow', text: t('acceptedAt', { by: p.by, time: clock(p.acceptedAt) }) };
    if (isEscalated(p)) return { icon: 'clock', text: t('noAnswer', { min: Math.floor(ESCALATE_AFTER / 60), team: t('team', { ward: p.ward || WARD }) }) };
    if ((p.presses || 1) > 1) {
      const span = Math.max(1, Math.round(((p.lastPressAt || now()) - p.createdAt) / 1000));
      return { icon: 'clock', text: t('pressedTimes', { n: p.presses, s: span }) };
    }
    return { icon: 'clock', text: t('onePress') };
  }

  function cardHTML(p, isNew) {
    const ty = TYPES[p.type];
    const urgent = p.type === 'help' && p.state === 'waiting';
    let badge = '';
    if (p.state === 'otw') badge = chip(t('stOtw'), 'info', { dot: false, upper: true });
    else if (p.state === 'done') badge = chip(t('stDone'), 'success', { dot: false, upper: true });
    else if (urgent) badge = chip(t('urgent'), 'danger', { dot: false, upper: true });
    else if (isEscalated(p)) badge = chip(t('stEscalated'), 'warning', { dot: false, upper: true });

    const tm = timerInfo(p);
    const note = noteText(p);
    let body;
    if (p.state === 'waiting') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions">
          <button class="btn btn-go grow" data-action="accept" data-id="${p.id}">${svg('arrow', 18)}${t('onMyWay')}</button>
          <button class="btn btn-secondary btn-fixed" data-action="done" data-id="${p.id}">${svg('check', 18)}${t('done')}</button>
        </div>`;
    } else if (p.state === 'otw' && p.uiPhase === 'answering') {
      // the two buttons melt into one bar that fills up
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions is-answering">
          <div class="answer-bar" role="status">
            <span class="answer-label">${t('answering')}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
            <span class="answer-fill" aria-hidden="true"><span class="answer-label on-fill">${t('answering')}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span></span>
          </div>
          <span class="btn btn-secondary btn-fixed ghost-btn" aria-hidden="true">${svg('check', 18)}${t('done')}</span>
        </div>`;
    } else if (p.state === 'otw' && p.uiPhase === 'answered') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions is-answered">
          <div class="answer-bar is-done" role="status">
            <span class="answer-label">${svg('check', 18)}${esc(t('answeredBy', { by: p.by }))}</span>
          </div>
        </div>`;
    } else if (p.state === 'otw') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions${p.enterActions ? ' is-entering' : ''}">
          <button class="btn btn-navy grow" data-action="done" data-id="${p.id}">${svg('check', 18)}${t('markDone')}</button>
          <button class="btn btn-secondary btn-fixed" data-action="reassign" data-id="${p.id}">${t('reassign')}</button>
        </div>`;
    } else if (p.state === 'done' && p.uiPhase === 'completing') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions is-answering">
          <div class="answer-bar is-complete-track" role="status">
            <span class="answer-label">${t('completing')}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
            <span class="answer-fill complete-fill" aria-hidden="true"><span class="answer-label on-fill">${t('completing')}<span class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span></span>
          </div>
          <span class="btn btn-secondary btn-fixed ghost-btn" aria-hidden="true">${esc(t(p.ghostLabel || 'reassign'))}</span>
        </div>`;
    } else if (p.state === 'done' && p.uiPhase === 'completed') {
      body = `
        <div class="note">${svg(note.icon, 16)}<span>${esc(note.text)}</span></div>
        <div class="actions is-answered">
          <div class="answer-bar is-completed" role="status">
            <span class="answer-label"><svg class="ic draw-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${t('completed')}</span>
          </div>
        </div>`;
    } else {
      body = `
        <div class="actions${p.enterActions ? ' is-entering' : ''}">
          <span class="done-note">${esc(t('completedBy', { by: p.by }))}</span>
          <button class="btn btn-secondary btn-fixed" data-action="undo" data-id="${p.id}">${svg('undo', 18)}${t('undo')}</button>
        </div>`;
    }

    return `
      <article class="card glass${isNew ? ' is-new' : ''}${urgent ? ' card-urgent' : ''}${p.state === 'done' && !p.uiPhase ? ' card-done' : ''}" data-id="${p.id}">
        <div class="card-top">
          <div class="icon-tile tone-${ty.tone}">${svg(ty.icon, 24)}</div>
          <div class="card-info">
            <div class="card-title"><h3>${esc(ty.label)}</h3>${badge}</div>
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

  const todayRows = () => allRows().filter((r) => sameDay(r.createdAt, now()));
  function avgResponse(source) {
    const rows = source.filter((r) => !r.live);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.responseSec, 0) / rows.length;
  }

  function renderPingStats() {
    const waiting = state.pings.filter((p) => p.state === 'waiting');
    const otw = state.pings.filter((p) => p.state === 'otw');
    const longest = waiting.reduce((m, p) => Math.max(m, secsSince(p.createdAt)), 0);
    const rows = todayRows();
    const avg = avgResponse(rows);
    const escalations = rows.filter((r) => r.escalated).length;
    $('#pingStats').innerHTML =
      statHTML(t('statWaiting'), waiting.length, waiting.length ? t('longestWaitIs', { t: mmss(longest) }) : t('nobodyWaiting')) +
      statHTML(t('statOtw'), otw.length, otw.length ? `${otw[0].by} → ${otw[0].bed}` : t('noOneOtw')) +
      statHTML(t('avgToday'), avg == null ? '—' : human(avg), t('target')) +
      statHTML(t('requestsToday'), rows.length, t('nEscalated', { n: escalations }));
  }

  let gridSignature = '';
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function renderPingGrid(force = false) {
    const list = sortedPings().filter((p) => state.filter === 'all' || p.type === state.filter);
    const sig = lang + '|' + state.filter + '|' + list.map((p) => `${p.id}:${p.state}:${p.uiPhase || ''}:${isEscalated(p) ? 1 : 0}:${p.presses || 1}`).join(',');
    if (!force && sig === gridSignature) {
      // Only the clocks changed — update them in place so buttons keep focus/hover.
      for (const p of list) {
        const el = $(`.card[data-id="${p.id}"] [data-timer]`);
        if (el) el.textContent = timerInfo(p).value;
      }
      return;
    }
    gridSignature = sig;
    const grid = $('#pingGrid');
    // FLIP: remember where each card was, redraw, then glide cards from old to new spots
    const before = new Map($$('.card', grid).map((c) => [c.dataset.id, c.getBoundingClientRect()]));
    grid.innerHTML = list.map((p) => cardHTML(p, !before.has(String(p.id)))).join('');
    list.forEach((p) => { p.enterActions = false; });
    if (!reduceMotion()) {
      for (const c of $$('.card', grid)) {
        const old = before.get(c.dataset.id);
        if (!old || !old.width) continue;   // was hidden (other view) → nothing to glide from
        const now_ = c.getBoundingClientRect();
        const dx = old.left - now_.left, dy = old.top - now_.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
            { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        }
      }
    }
    const empty = $('#pingEmpty');
    empty.hidden = list.length > 0;
    empty.textContent = state.filter === 'all'
      ? t('allCalm')
      : t('noTypeNow', { type: TYPES[state.filter].short.toLowerCase() });
  }

  // ───────────── Expandable category bar ─────────────
  // Icons only until you hover / tab into it, then it springs open to show labels.
  // A navy pill slides to the selected tab, a soft pill slides to the hovered one.
  const CAT_ITEMS = [['all', 'bell', 'brand'], ...Object.entries(TYPES).map(([k, ty]) => [k, ty.icon, ty.tone])];
  const catLabel = (k) => (k === 'all' ? t('all') : TYPES[k].short);
  const COLLAPSE_DELAY = 90;   // ms, like the original component
  const cat = { built: false, hovered: null, timer: 0, raf: 0 };

  function buildCategories() {
    const bar = $('#categoryBar');
    bar.innerHTML =
      '<span class="cat-indicator" aria-hidden="true"></span><span class="cat-hover" aria-hidden="true"></span>' +
      CAT_ITEMS.map(([k, ic, tone]) =>
        `<button type="button" class="cat tone-${tone}" data-filter="${k}" aria-pressed="false">
           <span class="cat-icon">${svg(ic, 22)}<span class="count" hidden></span></span>
           <span class="cat-label"><span>${esc(catLabel(k))}</span></span>
         </button>`).join('');

    const canHover = window.matchMedia ? matchMedia('(hover: hover)').matches : true;
    const open = () => { clearTimeout(cat.timer); setCatExpanded(true); };
    const close = () => {
      clearTimeout(cat.timer);
      cat.timer = setTimeout(() => { cat.hovered = null; setCatExpanded(false); }, COLLAPSE_DELAY);
    };
    bar.addEventListener('mouseenter', () => { if (canHover) open(); });
    bar.addEventListener('mouseleave', () => { cat.hovered = null; placeCatPills(true); if (canHover) close(); });
    bar.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.cat');
      if (b && b.dataset.filter !== cat.hovered) { clearTimeout(cat.timer); cat.hovered = b.dataset.filter; placeCatPills(true); }
    });
    // keyboard users: open when tabbing in, close when focus leaves the bar
    bar.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) open(); });
    bar.addEventListener('focusout', (e) => { if (!bar.contains(e.relatedTarget)) close(); });
    window.addEventListener('resize', () => placeCatPills(false));
    cat.built = true;
  }

  function setCatExpanded(on) {
    const bar = $('#categoryBar');
    if (bar.classList.contains('is-expanded') === on) return;
    bar.classList.toggle('is-expanded', on);
    $$('.cat-label', bar).forEach((l) => l.setAttribute('aria-hidden', String(!on)));
    trackCatPills(480);   // keep the pills glued to their tabs while the labels grow / shrink
  }

  // Move the navy (selected) and soft (hovered) pills under their buttons.
  function placeCatPills(animate) {
    const bar = $('#categoryBar');
    const put = (pill, btn) => {
      if (!btn || !btn.offsetWidth) { pill.style.opacity = '0'; return; }
      if (!animate) pill.classList.add('no-anim');
      pill.style.width = `${btn.offsetWidth}px`;
      pill.style.height = `${btn.offsetHeight}px`;
      pill.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
      pill.style.opacity = '1';
      if (!animate) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
    };
    put($('.cat-indicator', bar), $(`.cat[data-filter="${state.filter}"]`, bar));
    const hov = cat.hovered && cat.hovered !== state.filter ? $(`.cat[data-filter="${cat.hovered}"]`, bar) : null;
    if (hov) put($('.cat-hover', bar), hov); else $('.cat-hover', bar).style.opacity = '0';
  }

  function trackCatPills(ms) {
    const end = performance.now() + ms;
    cancelAnimationFrame(cat.raf);
    const step = () => {
      placeCatPills(false);
      if (performance.now() < end) cat.raf = requestAnimationFrame(step);
    };
    step();
  }

  let catSignature = '';
  function renderCategories() {
    if (!cat.built) buildCategories();
    const active = activePings();
    const count = (k) => (k === 'all' ? active.length : active.filter((p) => p.type === k).length);
    const sig = state.filter + '|' + lang + '|' + CAT_ITEMS.map(([k]) => count(k)).join(',');
    if (sig === catSignature) return;   // nothing changed — leave hover / focus alone
    const filterChanged = catSignature !== '' && catSignature.split('|')[0] !== state.filter;
    catSignature = sig;
    for (const [k] of CAT_ITEMS) {
      const label = catLabel(k);
      const b = $(`#categoryBar .cat[data-filter="${k}"]`);
      $('.cat-label > span', b).textContent = label;
      const n = count(k);
      const badge = $('.count', b);
      badge.hidden = n === 0;
      badge.textContent = n;
      b.setAttribute('aria-pressed', String(state.filter === k));
      b.setAttribute('aria-label', t('catAria', { label, n }));
      b.title = label;
    }
    placeCatPills(filterChanged);   // slide when the selection changes, jump into place otherwise
  }

  function renderBanners() {
    const off = offlineDevices();
    const pb = $('#pingBanner'), db = $('#devBanner');
    pb.hidden = db.hidden = off.length === 0;
    if (!off.length) return;
    if (off.length === 1) {
      const d = off[0];
      $('.banner-text', pb).textContent = t('off1Ping', { bed: d.bed, time: clock(d.lastSeen) });
      $('.banner-text', db).textContent = t('off1Dev', { bed: d.bed, code: d.code, time: clock(d.lastSeen) });
    } else {
      const beds = off.map((d) => d.bed).join(', ');
      $('.banner-text', pb).textContent = t('offNPing', { n: off.length, beds });
      $('.banner-text', db).textContent = t('offNDev', { n: off.length, beds });
    }
  }

  function renderLivePill() {
    const assigned = state.devices.filter((d) => d.patient);
    const online = assigned.filter(isOnline).length;
    const pill = $('#livePill');
    pill.className = 'pill ' + (state.live ? 'pill-live' : 'pill-neutral');
    $('#livePillText').textContent = t('buttonsOnline', { mode: state.live ? t('live') : t('demoMode'), n: online, total: assigned.length });
  }

  function renderPing(force) {
    renderPingStats();
    renderPingGrid(force);
    renderCategories();
    renderBanners();
    renderLivePill();
  }

  // ───────────── Log view ─────────────
  const logDay = () => state.logDay ?? startOfDay(now());
  const dayRows = () => allRows().filter((r) => sameDay(r.createdAt, logDay()));
  function logRows() {
    const q = state.logQuery.trim().toLowerCase();
    return dayRows().filter((r) =>
      (state.logType === 'all' || r.type === state.logType) &&
      (!q || r.patient.toLowerCase().includes(q) || r.bed.toLowerCase().includes(q)));
  }
  const responseText = (r) => (r.live ? t('soFar', { t: mmss(r.responseSec) }) : mmss(r.responseSec));

  function renderLog() {
    renderDateChip();
    renderLogStats();
    $('#logTypeFilters').innerHTML = ['all', 'water', 'toilet', 'pain', 'help'].map((k) => [k, k === 'all' ? t('all') : TYPES[k].short])
      .map(([k, l]) => `<button class="btn btn-sm${state.logType === k ? ' btn-navy' : ' btn-chip'}" data-logtype="${k}" aria-pressed="${state.logType === k}">${l}</button>`)
      .join('');
    renderLogTable();
  }

  function renderLogStats() {
    const rows = dayRows();
    const done = rows.filter((r) => !r.live);
    const longest = done.reduce((m, r) => (!m || r.responseSec > m.responseSec ? r : m), null);
    const avg = avgResponse(rows);
    const openEsc = rows.filter((r) => r.status === 'escalated').length;
    const isToday = logDay() === startOfDay(now());
    const when = isToday ? t('todayUntil', { time: clock(now()) }) : new Date(logDay()).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'short' });
    $('#logStats').innerHTML =
      statHTML(t('totalRequests'), rows.length, when) +
      statHTML(t('avgResponse'), avg == null ? '—' : human(avg), t('target')) +
      statHTML(t('longestWait'), longest ? human(longest.responseSec) : '—', longest ? `${longest.bed} · ${clock(longest.createdAt)}` : '') +
      statHTML(t('escalations'), rows.filter((r) => r.escalated).length, openEsc ? t('stillOpen', { n: openEsc }) : t('allResolved'));
  }

  function renderLogTable() {
    const rows = logRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.logPage = Math.min(state.logPage, pages - 1);
    const page = rows.slice(state.logPage * PAGE_SIZE, (state.logPage + 1) * PAGE_SIZE);
    $('#logBody').innerHTML = page.length
      ? page.map((r) => {
          const [labelKey, tone] = STATUS[r.status];
          const respTone = r.live ? (r.status === 'escalated' ? 't-warning' : 't-danger') : '';
          return `<tr>
            <td class="muted">${clock(r.createdAt)}</td>
            <td class="strong">${esc(r.patient)}</td>
            <td>${esc(r.bed)}</td>
            <td>${tag(r.type)}</td>
            <td>${chip(t(labelKey), tone)}</td>
            <td class="${byText(r) === '—' ? 'muted' : ''}">${esc(byText(r))}</td>
            <td class="strong ${respTone}">${responseText(r)}</td>
          </tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="7">${esc(dayRows().length ? t('noMatch')
          : logDay() === startOfDay(now()) ? t('noRequestsToday') : t('noRequestsOn', { day: dayLabel(logDay()) }))}</td></tr>`;
    const from = rows.length ? state.logPage * PAGE_SIZE + 1 : 0;
    $('#logCount').textContent = t('showing', { a: from, b: state.logPage * PAGE_SIZE + page.length, n: rows.length });
    $('#prevPage').disabled = state.logPage === 0;
    $('#nextPage').disabled = state.logPage >= pages - 1;
  }

  function exportCSV() {
    const safe = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s; };
    const head = ['thTime', 'thPatient', 'thBed', 'thRequest', 'thStatus', 'thAnsweredBy', 'thResponse'].map((k) => t(k));
    const lines = [head, ...logRows().map((r) => [clock(r.createdAt), r.patient, r.bed, TYPES[r.type].short, t(STATUS[r.status][0]), byText(r), responseText(r)])]
      .map((cols) => cols.map((v) => `"${safe(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date(logDay());
    a.download = `careping-log-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ───────────── Devices view ─────────────
  const DEV_STATUS = {
    online: ['devOnline', 'success'],
    offline: ['devOffline', 'danger'],
    unassigned: ['devUnassigned', 'neutral'],
    pending: ['devPending', 'neutral'],
  };

  let patientSignature = '';
  function renderDevices(force = false) {
    const assigned = state.devices.filter((d) => d.patient);
    const online = assigned.filter(isOnline).length;
    const offline = offlineDevices().length;
    $('#devOnline span:last-child').textContent = t('nOnline', { n: online });
    $('#devOffline span:last-child').textContent = t('nOffline', { n: offline });
    $('#devOffline').hidden = offline === 0;
    $('#devCount').textContent = t('nDevices', { n: state.devices.length });

    // Don't redraw the table under someone who is tabbing through its buttons.
    if (force || !$('#devBody').contains(document.activeElement)) $('#devBody').innerHTML = state.devices.map((d) => {
      const st = deviceStatus(d);
      const [labelKey, tone] = DEV_STATUS[st];
      const last = st === 'offline'
        ? `<span class="t-danger strong">${clock(d.lastSeen)} · ${rel(d.lastSeen)}</span>`
        : st === 'pending' ? `<span class="muted">${t('firstPress')}</span>` : `<span class="muted">${rel(d.lastSeen)}</span>`;
      return `<tr class="${st === 'offline' ? 'row-offline' : ''}">
        <td class="code">${esc(d.code)}</td>
        <td class="${d.patient ? 'strong' : 'muted'}">${esc(d.patient || '—')}</td>
        <td class="${d.bed ? '' : 'muted'}">${esc(d.bed || '—')}</td>
        <td>${chip(t(labelKey), tone)}</td>
        <td>${last}</td>
        <td><button class="link-btn" data-edit="${esc(d.code)}">${d.patient ? t('edit') : t('assign')}</button></td>
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
    if (!CODE_RE.test(code)) return setHint(code.length >= 7 ? 'err' : 'info', t('codeFormat'));
    const d = state.devices.find((x) => x.code === code);
    if (!d) return setHint('info', t('newButton'));
    if (!d.patient) return setHint(isOnline(d) ? 'ok' : 'info', isOnline(d) ? t('foundOnline') : t('foundQuiet'));
    setHint('warn', t('linkedTo', { p: d.patient, bed: d.bed }));
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
    if (!CODE_RE.test(code)) { setHint('err', t('enterCode')); $('#fCode').focus(); return; }
    if (!patient) { toast(t('addPatient')); $('#fPatient').focus(); return; }
    if (!bedRaw) { toast(t('addBed')); $('#fBed').focus(); return; }
    const [bed, ward = WARD] = bedRaw.split(',').map((s) => s.trim());
    let d = state.devices.find((x) => x.code === code);
    if (!d) { d = { code, lastSeen: null }; state.devices.push(d); }
    Object.assign(d, { patient, bed, ward });
    $('#linkForm').reset();
    setHint(null);
    toast(t('linkedToast', { code, p: patient, bed }));
    renderAll();
  }

  // ───────────── Actions ─────────────
  const act = {
    accept(p) {
      p.holdRank = rank(p);                      // keep its place in the grid during the animation
      p.wasEscalated = p.wasEscalated || isEscalated(p);
      p.state = 'otw'; p.acceptedAt = now(); p.by = NURSE;
      p.uiPhase = 'answering';
      clearTimeout(p.phaseTimer);
      p.phaseTimer = setTimeout(() => {
        if (p.state !== 'otw') return;
        p.uiPhase = 'answered';
        renderAll();
        p.phaseTimer = setTimeout(() => {
          if (p.state !== 'otw') return;
          p.uiPhase = null; p.holdRank = null; p.enterActions = true;
          renderAll();
        }, ANSWERED_MS);
      }, ANSWERING_MS);
      toast(t('onTheWayTo', { p: p.patient, bed: p.bed }));
    },
    done(p) {
      clearTimeout(p.phaseTimer);
      p.holdRank = p.uiPhase ? p.holdRank : rank(p);   // stay in place while "Completing…" plays
      p.ghostLabel = p.state === 'otw' ? 'reassign' : 'done';   // text key
      p.uiPhase = 'completing';
      p.phaseTimer = setTimeout(() => {
        if (p.state !== 'done') return;
        p.uiPhase = 'completed';
        renderAll();
        p.phaseTimer = setTimeout(() => {
          if (p.state !== 'done') return;
          p.uiPhase = null; p.holdRank = null; p.enterActions = true;
          renderAll();
        }, COMPLETED_MS);
      }, COMPLETING_MS);
      p.undo = { state: p.state, acceptedAt: p.acceptedAt, by: p.by };
      p.wasEscalated = p.wasEscalated || isEscalated(p);
      if (!p.acceptedAt) { p.acceptedAt = now(); p.by = NURSE; }
      p.state = 'done'; p.doneAt = now();
      clearTimeout(p.archiveTimer);
      p.archiveTimer = setTimeout(() => archive(p), UNDO_WINDOW * 1000);
    },
    reassign(p) {
      clearTimeout(p.phaseTimer); p.uiPhase = null; p.holdRank = null;
      p.state = 'waiting'; p.acceptedAt = null; p.by = null;
      toast(t('backInQueue', { p: p.patient }));
    },
    undo(p) {
      if (!p.undo) return;
      clearTimeout(p.archiveTimer); clearTimeout(p.phaseTimer);
      p.uiPhase = null; p.holdRank = null;
      Object.assign(p, p.undo, { undo: null, doneAt: null });
    },
  };

  function archive(p) {
    if (p.state !== 'done') return;
    if (p.uiPhase) { p.archiveTimer = setTimeout(() => archive(p), 1000); return; }
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
    const who = patient || d?.patient || t('unlinkedButton');
    const where = bed || d?.bed || code || t('unknownBed');
    const existing = state.pings.find((p) => p.state === 'waiting' && p.type === type && (code ? p.device === code : p.patient === who));
    if (existing) {
      existing.presses = (existing.presses || 1) + 1;
      existing.lastPressAt = now();
    } else {
      state.pings.push({ id: ++seq, type, patient: who, bed: where, ward: d?.ward || WARD, device: code, createdAt: now(), state: 'waiting', presses: 1 });
    }
    beep(type === 'help');
    toast(linked
      ? t('newRequest', { type: TYPES[type].short.toLowerCase(), who, where })
      : t('newUnlinked', { type: TYPES[type].short.toLowerCase(), code }));
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
      .catch(() => toast(t('nodeRedDown')));
  }

  // ───────────── Sound & toast ─────────────
  let audio;
  function beep(urgent) {
    if (!state.sound) return;
    ringSoundButton();
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

  // Sound toggle: waves draw out when on, fade + an ✕ draws when off, label cross-fades.
  function renderSound() {
    const b = $('#soundBtn');
    if (!b.dataset.built) {
      b.innerHTML = `
        <svg class="ic sound-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path class="spk" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
          <path class="wave w1" pathLength="1" d="M16 9a5 5 0 0 1 0 6"/>
          <path class="wave w2" pathLength="1" d="M19.364 18.364a9 9 0 0 0 0-12.728"/>
          <path class="mute m1" pathLength="1" d="m22 9-6 6"/>
          <path class="mute m2" pathLength="1" d="m16 9 6 6"/>
        </svg>
        <span class="sound-label"><span class="s-on"></span><span class="s-off"></span></span>`;
      b.dataset.built = '1';
    }
    $('.s-on', b).textContent = t('soundOn');
    $('.s-off', b).textContent = t('soundOff');
    b.classList.toggle('is-on', state.sound);
    b.classList.toggle('is-off', !state.sound);
    b.setAttribute('aria-pressed', String(state.sound));
    b.setAttribute('aria-label', state.sound ? t('soundOnAria') : t('soundOffAria'));
  }
  function ringSoundButton() {
    const b = $('#soundBtn');
    b.classList.remove('is-ringing'); void b.offsetWidth; b.classList.add('is-ringing');
  }

  // ───────────── Light / dark theme ─────────────
  const THEME_KEY = 'careping-theme';
  const savedTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } };
  const systemDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $$('#themeSwitch [data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
  }

  function initTheme() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    $('#themeSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-set]');
      if (!b) return;
      try { localStorage.setItem(THEME_KEY, b.dataset.themeSet); } catch { /* storage blocked — still switch for this visit */ }
      applyTheme(b.dataset.themeSet);
    });
    // Follow the computer's setting until the user picks one themselves.
    if (systemDark && systemDark.addEventListener) {
      systemDark.addEventListener('change', (e) => { if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light'); });
    }
  }

  // ───────────── Language switch (EN / ไทย) ─────────────
  function applyLang(next, { render = true } = {}) {
    lang = next === 'th' ? 'th' : 'en';
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(',')) {
        const [attr, key] = pair.split(':').map((x) => x.trim());
        el.setAttribute(attr, t(key));
      }
    });
    $$('#langSwitch [data-lang-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langSet === lang)));
    $('#onDuty').textContent = t('onDuty', { ward: WARD });
    if (!render) return;
    setCollapsed(document.documentElement.classList.contains('sidebar-collapsed'));   // re-labels the button
    renderSound();
    if (!$('#calendar').hidden) renderCalendar();
    updateCodeHint();
    renderAll(true);
    trackNavPills(300);                    // the menu words changed width
    if (cat.built) trackCatPills(480);
  }

  function initLang() {
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
    applyLang(saved || lang, { render: false });
    $('#langSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang-set]');
      if (!b || b.dataset.langSet === lang) return;
      try { localStorage.setItem(LANG_KEY, b.dataset.langSet); } catch { /* still switch for this visit */ }
      applyLang(b.dataset.langSet);
    });
  }

  // ───────────── Collapsible sidebar ─────────────
  const SIDEBAR_KEY = 'careping-sidebar';
  // ───────────── Sliding menu pills (same feel as the category bar) ─────────────
  let navHoverItem = null;
  function putNavPill(pill, item, animate) {
    if (!item || !item.offsetWidth) { pill.style.opacity = '0'; return; }
    if (!animate) pill.classList.add('no-anim');
    pill.style.width = `${item.offsetWidth}px`;
    pill.style.height = `${item.offsetHeight}px`;
    pill.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
    pill.style.opacity = '1';
    if (!animate) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
  }
  function placeNavPills(animate) {
    const nav = $('.nav');
    if (!nav) return;
    const active = nav.querySelector('.nav-item.active');
    putNavPill(nav.querySelector('.nav-indicator'), active, animate);
    const hover = nav.querySelector('.nav-hover');
    if (navHoverItem && navHoverItem !== active) putNavPill(hover, navHoverItem, animate && hover.style.opacity === '1');
    else hover.style.opacity = '0';
    if (active && active.offsetWidth) nav.classList.add('pills-ready');
  }
  // Follow the items while the sidebar is resizing (collapse / expand).
  function trackNavPills(ms) {
    const end = performance.now() + ms;
    const step = () => { placeNavPills(false); if (performance.now() < end) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function bindNavPills() {
    const nav = $('.nav');
    nav.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.nav-item');
      if (!item || item === navHoverItem) return;
      navHoverItem = item;
      placeNavPills(true);
    });
    nav.addEventListener('mouseleave', () => { navHoverItem = null; placeNavPills(true); });
    window.addEventListener('resize', () => placeNavPills(false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeNavPills(false));
  }

  function setCollapsed(collapsed) {
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    trackNavPills(450);
    const b = $('#collapseBtn');
    b.setAttribute('aria-expanded', String(!collapsed));
    b.setAttribute('aria-label', collapsed ? t('expandSidebar') : t('collapseSidebar'));
    b.title = collapsed ? t('expandSidebar') : t('collapseSidebar');
  }
  function initSidebar() {
    let saved = null;
    try { saved = localStorage.getItem(SIDEBAR_KEY); } catch { /* ignore */ }
    setCollapsed(saved === 'collapsed');
    $('#collapseBtn').addEventListener('click', () => {
      const next = !document.documentElement.classList.contains('sidebar-collapsed');
      try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open'); } catch { /* ignore */ }
      setCollapsed(next);
    });
  }

  // ───────────── Navigation & shared chrome ─────────────
  function setView(view) {
    if (!['ping', 'log', 'devices'].includes(view)) view = 'ping';
    state.view = view;
    catSignature = '';   // re-measure the category pills once the Ping view is visible again
    for (const v of ['ping', 'log', 'devices']) $(`#view-${v}`).hidden = v !== view;
    $$('.nav-item').forEach((a) => {
      const on = a.dataset.view === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    placeNavPills($('.nav').classList.contains('pills-ready'));
    renderAll(true);
    window.scrollTo(0, 0);
  }

  function renderChrome() {
    const waiting = state.pings.filter((p) => p.state === 'waiting').length;
    const badge = $('#navBadge');
    badge.hidden = waiting === 0;
    badge.textContent = waiting;
    document.title = (waiting ? `(${waiting}) ` : '') + t('pageTitle');
    const d = new Date();
    $('#clock').textContent = `${WARD} · ${d.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'short' })}, ${clock(d)}`;
  }

  function renderAll(force = false) {
    renderChrome();
    if (state.view === 'ping') renderPing(force);
    if (state.view === 'log') { if (force) renderLog(); else { renderLogStats(); renderLogTable(); } }
    if (state.view === 'devices') renderDevices(force);
    renderBanners();
  }

  // ───────────── Events ─────────────
  // ───────────── Log calendar (date picker) ─────────────
  // Three levels: days → (click title) months → (click title) years.
  const WEEKDAYS = { en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] };
  const monthShort = (i) => new Date(2000, i, 1).toLocaleDateString(LOC_US(), { month: 'short' });   // Jan / ม.ค.
  const MIN_YEAR = 2020;
  const monthStart = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
  const addMonths = (m, n) => { const d = new Date(m); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
  const yearPageOf = (y) => y - ((y - MIN_YEAR) % 12);

  function renderDateChip() {
    $('#dateLabel').textContent = dayLabel(logDay());
  }

  function setCalTitle(text, label, clickable) {
    const t = $('#calTitle');
    $('#calTitleText').textContent = text;
    t.setAttribute('aria-label', label);
    t.disabled = !clickable;
  }

  function renderCalendar() {
    const today = startOfDay(now());
    const thisMonth = monthStart(today);
    const thisYear = new Date(today).getFullYear();
    const mode = state.calMode || 'days';
    const month = state.calMonth ?? monthStart(logDay());
    const first = new Date(month);
    const sel = new Date(logDay());
    const grid = $('#calGrid');
    grid.className = `cal-grid cal-${mode}`;
    let html = '';

    if (mode === 'days') {
      const name = first.toLocaleDateString(LOC_US(), { month: 'long', year: 'numeric' });
      setCalTitle(name, t('chooseMonthYear', { name }), true);
      $('#calPrev').disabled = month <= new Date(MIN_YEAR, 0, 1).getTime();
      $('#calNext').disabled = month >= thisMonth;
      $('#calPrev').setAttribute('aria-label', t('prevMonth'));
      $('#calNext').setAttribute('aria-label', t('nextMonth'));
      const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const withData = new Set(allRows().map((r) => startOfDay(r.createdAt)));
      html = WEEKDAYS[lang].map((w) => `<span class="cal-wd" aria-hidden="true">${w}</span>`).join('');
      html += '<span></span>'.repeat(first.getDay());
      for (let d = 1; d <= daysIn; d++) {
        const day = new Date(first.getFullYear(), first.getMonth(), d).getTime();
        const cls = ['cal-day', 'cal-cell'];
        if (day === today) cls.push('is-today');
        if (day === logDay()) cls.push('is-selected');
        if (withData.has(day)) cls.push('has-data');
        const label = new Date(day).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        html += `<button type="button" class="${cls.join(' ')}" data-day="${day}" ${day > today ? 'disabled' : ''}
                   aria-label="${label}"${day === logDay() ? ' aria-current="date"' : ''}>${d}</button>`;
      }
    } else if (mode === 'months') {
      const y = first.getFullYear();
      setCalTitle(String(yearText(y)), t('chooseYear', { y: yearText(y) }), true);
      $('#calPrev').disabled = y <= MIN_YEAR;
      $('#calNext').disabled = y >= thisYear;
      $('#calPrev').setAttribute('aria-label', t('prevYear'));
      $('#calNext').setAttribute('aria-label', t('nextYear'));
      html = Array.from({ length: 12 }, (_, i) => monthShort(i)).map((m, i) => {
        const mt = new Date(y, i, 1).getTime();
        const cls = ['cal-month', 'cal-cell'];
        if (mt === thisMonth) cls.push('is-today');
        if (y === sel.getFullYear() && i === sel.getMonth()) cls.push('is-selected');
        const full = new Date(mt).toLocaleDateString(LOC_US(), { month: 'long', year: 'numeric' });
        return `<button type="button" class="${cls.join(' ')}" data-month="${mt}" ${mt > thisMonth ? 'disabled' : ''} aria-label="${full}">${m}</button>`;
      }).join('');
    } else {
      const start = state.calYearPage ?? yearPageOf(first.getFullYear());
      const endY = start + 11;
      setCalTitle(`${yearText(start)} – ${yearText(endY)}`, t('yearsRange', { a: yearText(start), b: yearText(endY) }), false);
      $('#calPrev').disabled = start <= MIN_YEAR;
      $('#calNext').disabled = endY >= thisYear;
      $('#calPrev').setAttribute('aria-label', t('earlierYears'));
      $('#calNext').setAttribute('aria-label', t('laterYears'));
      for (let y = start; y <= endY; y++) {
        const cls = ['cal-year', 'cal-cell'];
        if (y === thisYear) cls.push('is-today');
        if (y === sel.getFullYear()) cls.push('is-selected');
        html += `<button type="button" class="${cls.join(' ')}" data-year="${y}" ${y > thisYear || y < MIN_YEAR ? 'disabled' : ''}>${yearText(y)}</button>`;
      }
    }
    grid.innerHTML = html;
  }

  function focusCal() {
    const cal = $('#calendar');
    ($('.cal-cell.is-selected:not([disabled])', cal) || $('.cal-cell.is-today:not([disabled])', cal) || $('.cal-cell:not([disabled])', cal))?.focus();
  }

  function setCalMode(mode) {
    state.calMode = mode;
    if (mode === 'years') state.calYearPage = yearPageOf(new Date(state.calMonth).getFullYear());
    renderCalendar();
    focusCal();
  }

  function openCalendar(open) {
    const cal = $('#calendar');
    if (open) { state.calMonth = monthStart(logDay()); state.calMode = 'days'; renderCalendar(); }
    cal.hidden = !open;
    $('#dateChip').setAttribute('aria-expanded', String(open));
    if (open) focusCal();
  }

  function pickDay(day) {
    state.logDay = day === startOfDay(now()) ? null : day;   // null keeps following "today" past midnight
    state.logPage = 0;
    openCalendar(false);
    renderDateChip();
    renderLog();
    $('#dateChip').focus();
  }

  function bindCalendar() {
    $('#dateChip').addEventListener('click', () => openCalendar($('#calendar').hidden));
    $('#calTitle').addEventListener('click', () => setCalMode(state.calMode === 'days' ? 'months' : 'years'));
    const step = (dir) => {
      if (state.calMode === 'days') state.calMonth = addMonths(state.calMonth, dir);
      else if (state.calMode === 'months') state.calMonth = addMonths(state.calMonth, 12 * dir);
      else state.calYearPage += 12 * dir;
      renderCalendar();
    };
    $('#calPrev').addEventListener('click', () => step(-1));
    $('#calNext').addEventListener('click', () => step(1));
    $('#calToday').addEventListener('click', () => pickDay(startOfDay(now())));

    $('#calGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.cal-cell');
      if (!b || b.disabled) return;
      if (b.dataset.day) return pickDay(Number(b.dataset.day));
      if (b.dataset.month) { state.calMonth = Number(b.dataset.month); return setCalMode('days'); }
      if (b.dataset.year) {
        // keep the same month in the new year, but never jump into the future
        const y = Number(b.dataset.year);
        const m = Math.min(new Date(y, new Date(state.calMonth).getMonth(), 1).getTime(), monthStart(now()));
        state.calMonth = m;
        setCalMode('months');
      }
    });

    // Arrow keys move around the grid, like a normal date picker.
    $('#calGrid').addEventListener('keydown', (e) => {
      const cols = state.calMode === 'days' ? 7 : 3;
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
      if (!delta) return;
      e.preventDefault();
      if (state.calMode === 'days') {
        const cur = Number(document.activeElement.dataset.day || logDay());
        const next = startOfDay(cur + delta * 86400000 + 3600000);
        if (next > startOfDay(now())) return;
        if (monthStart(next) !== state.calMonth) { state.calMonth = monthStart(next); renderCalendar(); }
        $(`.cal-day[data-day="${next}"]`)?.focus();
      } else {
        const cells = $$('#calGrid .cal-cell');
        const i = cells.indexOf(document.activeElement);
        const target = cells[i + delta];
        if (target && !target.disabled) target.focus();
      }
    });

    document.addEventListener('click', (e) => {
      // composedPath() still knows where the click happened even if the grid was redrawn by that click
      if (!$('#calendar').hidden && !e.composedPath().some((n) => n.id === 'datePicker')) openCalendar(false);
    });
    // Esc steps back one level (years → months → days), then closes.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || $('#calendar').hidden) return;
      if (state.calMode === 'years') return setCalMode('months');
      if (state.calMode === 'months') return setCalMode('days');
      openCalendar(false);
      $('#dateChip').focus();
    });
  }

  function bind() {
    bindCalendar();
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

    $('#soundBtn').addEventListener('click', () => {
      state.sound = !state.sound;
      const b = $('#soundBtn');
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');   // little press bounce
      renderSound();
      if (state.sound) beep(false);
    });

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
  initLang();
  bind();
  initTheme();
  bindNavPills();
  initSidebar();
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
