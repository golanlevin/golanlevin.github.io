import { AREA, HOME, UNITS_PER_MM, PLOT_CENTER, FIT_BOX, insideArea } from './area.js';
import { parseSVG } from './svg.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const canvas = $('#view');
const ctx = canvas.getContext('2d');

// Visible region in machine units (includes the robot body for context).
const VIEW = { minX: -300, maxX: 2050, minY: -1700, maxY: 1700 };
const ROBOT = { x0: -250, x1: 250, y0: -1350, y1: 560 };
const RESAMPLE = 8; // max machine units between area-boundary checks

const S = {
  drawing: null, // { polylines (mm, y down), bbox, warnings }
  name: '',
  place: { x: PLOT_CENTER.x, y: PLOT_CENTER.y, scale: 1, rot: 0 },
  machine: null, // { all, inside, clipped, lengthMM, points }
  status: { connected: false },
  job: { state: 'idle' },
  phCorner: null,
};
let view = { k: 1, ox: 0, oy: 0, dpr: 1 };

// ------------------------------------------------------------------ helpers

async function api(path, body) {
  const opts = body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function logLine(text, kind = 'info') {
  const box = $('#log');
  const div = document.createElement('div');
  div.className = kind;
  div.textContent = text;
  box.append(div);
  while (box.childElementCount > 300) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    logLine(err.message, 'error');
  }
}

const jobActive = () => ['running', 'paused', 'stopping'].includes(S.job.state);

// --------------------------------------------------------- placement maths

function makeTransform() {
  const { bbox } = S.drawing;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const { x, y, scale, rot } = S.place;
  const k = scale * UNITS_PER_MM;
  const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot]; // rot × 90° clockwise
  return (p) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return [x + (dx * c - dy * s) * k, y - (dx * s + dy * c) * k];
  };
}

function rotatedSize() {
  const { w, h } = S.drawing.bbox;
  return S.place.rot % 2 ? [h, w] : [w, h];
}

// Transform to machine units and clip against the drawing area. Segments are
// checked every RESAMPLE units, but only original vertices and boundary
// crossings are kept, so straight lines stay as single moves.
function compute() {
  if (!S.drawing) {
    S.machine = null;
    return;
  }
  const T = makeTransform();
  const all = [];
  const inside = [];
  let clipped = false;
  for (const pl of S.drawing.polylines) {
    const m = pl.map(T);
    all.push(m);
    let run = [];
    let lastIn = insideArea(m[0][0], m[0][1]);
    if (lastIn) run.push(m[0]);
    else clipped = true;
    for (let i = 1; i < m.length; i++) {
      const [ax, ay] = m[i - 1];
      const [bx, by] = m[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / RESAMPLE));
      let lastP = m[i - 1];
      for (let j = 1; j <= n; j++) {
        const p = j === n ? m[i] : [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n];
        const pin = insideArea(p[0], p[1]);
        if (pin && !lastIn) run = [p];
        else if (!pin && lastIn) {
          run.push(lastP);
          inside.push(run);
          run = [];
        }
        if (!pin) clipped = true;
        lastIn = pin;
        lastP = p;
      }
      if (lastIn) run.push(m[i]);
    }
    if (run.length) inside.push(run);
  }
  let len = 0;
  let points = 0;
  for (const r of inside) {
    points += r.length;
    for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
  }
  S.machine = { all, inside, clipped, lengthMM: len / UNITS_PER_MM, points };
}

function fit() {
  const [w, h] = rotatedSize();
  S.place.scale = Math.min(FIT_BOX.w / (w * UNITS_PER_MM), FIT_BOX.h / (h * UNITS_PER_MM));
  S.place.x = PLOT_CENTER.x;
  S.place.y = PLOT_CENTER.y;
}

// ---------------------------------------------------------------- drawing

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const pad = 16 * dpr;
  const vw = VIEW.maxX - VIEW.minX;
  const vh = VIEW.maxY - VIEW.minY;
  const k = Math.min((canvas.width - 2 * pad) / vw, (canvas.height - 2 * pad) / vh);
  view = {
    k,
    dpr,
    ox: (canvas.width - k * vw) / 2 - k * VIEW.minX,
    oy: (canvas.height - k * vh) / 2 + k * VIEW.maxY,
  };
  render();
}

const sx = (X) => view.ox + X * view.k;
const sy = (Y) => view.oy - Y * view.k;
const toMachine = (cx, cy) => [(cx * view.dpr - view.ox) / view.k, (view.oy - cy * view.dpr) / view.k];

function path(pts, close = false) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
  if (close) ctx.closePath();
}

function render() {
  const css = getComputedStyle(document.documentElement);
  const c = (n) => css.getPropertyValue(n).trim();
  const d = view.dpr;
  ctx.fillStyle = c('--outside');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Drawing area with a 100-unit (5 mm) grid inside it.
  path(AREA, true);
  ctx.fillStyle = c('--area');
  ctx.fill();
  ctx.save();
  path(AREA, true);
  ctx.clip();
  ctx.strokeStyle = c('--grid');
  ctx.lineWidth = d;
  ctx.beginPath();
  for (let x = 0; x <= 2000; x += 100) {
    ctx.moveTo(sx(x), sy(VIEW.minY));
    ctx.lineTo(sx(x), sy(VIEW.maxY));
  }
  for (let y = -1600; y <= 1600; y += 100) {
    ctx.moveTo(sx(VIEW.minX), sy(y));
    ctx.lineTo(sx(VIEW.maxX), sy(y));
  }
  ctx.stroke();
  ctx.restore();
  path(AREA, true);
  ctx.strokeStyle = c('--muted');
  ctx.lineWidth = d;
  ctx.stroke();

  // Robot body and home position.
  ctx.fillStyle = c('--robot');
  ctx.beginPath();
  ctx.roundRect(sx(ROBOT.x0), sy(ROBOT.y1), (ROBOT.x1 - ROBOT.x0) * view.k, (ROBOT.y1 - ROBOT.y0) * view.k, 8 * d);
  ctx.fill();
  ctx.fillStyle = c('--panel');
  ctx.font = `${12 * d}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Line-us', sx(0), sy(-400));
  ctx.strokeStyle = c('--accent');
  ctx.lineWidth = 1.5 * d;
  ctx.beginPath();
  ctx.arc(sx(HOME.x), sy(HOME.y), 18 * view.k, 0, Math.PI * 2);
  ctx.stroke();

  if (!S.machine) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (S.machine.clipped) {
    ctx.strokeStyle = c('--stroke-out');
    ctx.lineWidth = d;
    for (const pl of S.machine.all) {
      path(pl);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = c('--stroke');
  ctx.lineWidth = 1.3 * d;
  for (const pl of S.machine.inside) {
    path(pl);
    ctx.stroke();
  }

  // Live pen position while plotting.
  if (jobActive() && S.job.pos) {
    const { x, y, z } = S.job.pos;
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), 5 * d, 0, Math.PI * 2);
    ctx.fillStyle = z < 500 ? c('--accent') : 'transparent';
    ctx.fill();
    ctx.strokeStyle = c('--accent');
    ctx.lineWidth = 2 * d;
    ctx.stroke();
  }

  // Dashed outline of the drawing's bounds.
  const [w, h] = rotatedSize();
  const k = S.place.scale * UNITS_PER_MM;
  ctx.setLineDash([4 * d, 4 * d]);
  ctx.strokeStyle = c('--accent');
  ctx.lineWidth = d;
  ctx.strokeRect(sx(S.place.x - (w * k) / 2), sy(S.place.y + (h * k) / 2), w * k * view.k, h * k * view.k);
  ctx.setLineDash([]);
}

// --------------------------------------------------------------- UI state

let pending = false;
function update() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    compute();
    render();
    syncUI();
  });
}

function syncUI() {
  const conn = S.status.connected;
  const active = jobActive();
  const badge = $('#conn-badge');
  badge.textContent = active ? `Plotting (${S.job.state})` : conn ? 'Connected' : 'Not connected';
  badge.className = `badge ${active ? 'busy' : conn ? 'on' : 'off'}`;
  $('#connect-btn').textContent = conn ? 'Disconnect' : 'Connect';
  $('#host').disabled = conn;
  const hi = S.status.hello;
  $('#hello').textContent = conn && hi ? [hi.NAME, hi.VERSION && `firmware ${hi.VERSION}`, hi.SERIAL && `s/n ${hi.SERIAL}`].filter(Boolean).join(' · ') : '';

  for (const b of $$('.needs-conn')) b.disabled = !conn || active;
  const plottable = S.machine && S.machine.inside.length > 0;
  $('#plot').disabled = !conn || active || !plottable || S.phCorner !== null;
  $('#pause').disabled = !['running', 'paused'].includes(S.job.state);
  $('#pause').textContent = S.job.state === 'paused' ? 'Resume' : 'Pause';
  $('#stop').disabled = !['running', 'paused'].includes(S.job.state);
  for (const el of $$('#place-controls input, #place-controls button')) el.disabled = active;

  $('#progress').max = S.job.total || 1;
  $('#progress').value = S.job.done || 0;
  const pct = S.job.total ? Math.round((100 * S.job.done) / S.job.total) : 0;
  $('#job-text').textContent = {
    idle: '',
    running: `Plotting… ${pct}%`,
    paused: `Paused at ${pct}% (pen lifted)`,
    stopping: 'Stopping…',
    stopped: 'Stopped.',
    done: 'Finished.',
    error: `Error: ${S.job.error}`,
  }[S.job.state] ?? S.job.state;

  // Corner buttons: only the running corner stays clickable (to stop it).
  for (const el of $$('.corner')) {
    const corner = Number(el.dataset.corner);
    const btn = el.querySelector('button');
    const running = S.phCorner === corner;
    btn.textContent = running ? 'Stop' : 'Start';
    btn.classList.toggle('active', running);
    if (S.phCorner !== null && !running) btn.disabled = true;
  }
  if (S.phCorner !== null) for (const b of $$('[data-ph], [data-cmd], [data-jog]')) b.disabled = true;

  if (!S.drawing) return;
  $('#place-controls').hidden = false;
  const [w, h] = rotatedSize();
  if (document.activeElement !== $('#scale')) $('#scale').value = Math.round(S.place.scale * 1000) / 10;
  if (document.activeElement !== $('#cx')) $('#cx').value = Math.round(S.place.x);
  if (document.activeElement !== $('#cy')) $('#cy').value = Math.round(S.place.y);
  $('#size').textContent = `${(w * S.place.scale).toFixed(1)} × ${(h * S.place.scale).toFixed(1)} mm`;
  const m = S.machine;
  $('#stats').innerHTML = '';
  if (m) {
    const parts = [`${m.inside.length} line${m.inside.length === 1 ? '' : 's'}`, `${m.points} points`, `${(m.lengthMM / 10).toFixed(1)} cm of ink`];
    $('#stats').textContent = parts.join(' · ');
    if (m.clipped) {
      const warn = document.createElement('div');
      warn.style.color = 'var(--error)';
      warn.textContent = 'Parts in red are outside the reachable area and will be skipped.';
      $('#stats').append(warn);
    }
  }
}

// ------------------------------------------------------------ file loading

async function loadFile(file) {
  try {
    const text = await file.text();
    const drawing = parseSVG(text, $('#svg-host'));
    S.drawing = drawing;
    S.name = file.name;
    S.place = { x: PLOT_CENTER.x, y: PLOT_CENTER.y, scale: 1, rot: 0 };
    compute();
    if (S.machine.clipped) fit(); // too big at real size: fit it
    $('#file-name').textContent = file.name;
    $('#warnings').replaceChildren(...drawing.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
    $('#hint').hidden = true;
    logLine(`Loaded ${file.name}: ${drawing.polylines.length} paths, ${drawing.bbox.w.toFixed(1)} × ${drawing.bbox.h.toFixed(1)} mm`);
    update();
  } catch (err) {
    logLine(`Could not load ${file.name}: ${err.message}`, 'error');
  }
}

$('#file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) loadFile(f);
  e.target.value = '';
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && !jobActive()) loadFile(f);
});

// ---------------------------------------------------- canvas interaction

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!S.drawing || jobActive()) return;
  drag = { x0: e.clientX, y0: e.clientY, px: S.place.x, py: S.place.y };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  S.place.x = drag.px + ((e.clientX - drag.x0) * view.dpr) / view.k;
  S.place.y = drag.py - ((e.clientY - drag.y0) * view.dpr) / view.k;
  update();
});
const endDrag = () => {
  drag = null;
  canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  if (!S.drawing || jobActive()) return;
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0015);
  const [mx, my] = toMachine(e.offsetX, e.offsetY);
  S.place.scale *= f;
  S.place.x = mx + (S.place.x - mx) * f;
  S.place.y = my + (S.place.y - my) * f;
  update();
}, { passive: false });

$('#scale').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) S.place.scale = v / 100;
  update();
});
$('#cx').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v)) S.place.x = v;
  update();
});
$('#cy').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v)) S.place.y = v;
  update();
});
$('#fit').addEventListener('click', () => {
  fit();
  update();
});
$('#real').addEventListener('click', () => {
  S.place.scale = 1;
  update();
});
$('#rotate').addEventListener('click', () => {
  S.place.rot = (S.place.rot + 1) % 4;
  update();
});

// ------------------------------------------------------------------ plotting

function orderForTravel(pls) {
  const left = pls.slice();
  const out = [];
  let cx = HOME.x;
  let cy = HOME.y;
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    let rev = false;
    for (let i = 0; i < left.length; i++) {
      const p = left[i];
      const a = p[0];
      const b = p[p.length - 1];
      const da = (a[0] - cx) ** 2 + (a[1] - cy) ** 2;
      const db = (b[0] - cx) ** 2 + (b[1] - cy) ** 2;
      if (da < bestD) [bestD, best, rev] = [da, i, false];
      if (db < bestD) [bestD, best, rev] = [db, i, true];
    }
    const p = left[best];
    left[best] = left[left.length - 1];
    left.pop();
    const q = rev ? p.slice().reverse() : p;
    out.push(q);
    [cx, cy] = q[q.length - 1];
  }
  return out;
}

$('#plot').addEventListener('click', () => guarded(async () => {
  // Round to whole machine units; drop any point that rounding nudged
  // just outside the boundary.
  let pls = S.machine.inside
    .map((pl) => pl.map(([x, y]) => [Math.round(x), Math.round(y)]).filter(([x, y]) => insideArea(x, y)))
    .filter((pl) => pl.length);
  if ($('#optimize').checked) pls = orderForTravel(pls);
  await api('/api/plot', { polylines: pls, depth: $('#depth').value });
}));
$('#pause').addEventListener('click', () => guarded(() => api('/api/job', { action: S.job.state === 'paused' ? 'resume' : 'pause' })));
$('#stop').addEventListener('click', () => guarded(() => api('/api/job', { action: 'stop' })));

// ---------------------------------------------------------------- connection

$('#connect-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guarded(async () => {
    if (S.status.connected) await api('/api/disconnect', {});
    else {
      $('#connect-btn').disabled = true;
      try {
        await api('/api/connect', { host: $('#host').value.trim() });
      } finally {
        $('#connect-btn').disabled = false;
      }
    }
  });
});

// ------------------------------------------------------- machine commands

for (const b of $$('[data-cmd]')) {
  b.addEventListener('click', () => guarded(async () => {
    const r = await api('/api/cmd', { action: b.dataset.cmd });
    if (r.jog) $('#jog-pos').textContent = `Pen at X${r.jog.x} Y${r.jog.y}`;
  }));
}
for (const b of $$('[data-jog]')) {
  b.addEventListener('click', () => guarded(async () => {
    const [dx, dy] = b.dataset.jog.split(',').map(Number);
    const r = await api('/api/cmd', { action: 'jog', dx, dy });
    $('#jog-pos').textContent = `Pen at X${r.jog.x} Y${r.jog.y}`;
  }));
}

$('#wifi-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guarded(() => api('/api/cmd', { action: 'wifiAdd', ssid: $('#ssid').value, password: $('#wifi-pw').value }));
});
$('#wifi-forget').addEventListener('click', () => guarded(() => api('/api/cmd', { action: 'wifiForget', ssid: $('#ssid').value })));
$('#rename-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guarded(async () => {
    await api('/api/cmd', { action: 'rename', name: $('#new-name').value.trim() });
    logLine('Renamed. Restart the plotter, then reconnect using the new name followed by .local.', 'warn');
  });
});
$('#raw-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guarded(async () => {
    await api('/api/cmd', { action: 'raw', gcode: $('#raw').value });
    $('#raw').value = '';
  });
});

// -------------------------------------------------------- pen-height wizard

const cornerInput = (i) => $(`.corner[data-corner="${i}"] input`);

for (const b of $$('[data-ph]')) {
  b.addEventListener('click', () => guarded(async () => {
    const action = b.dataset.ph;
    const body = { action };
    if (action === 'save') body.values = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1000, Math.round(Number(cornerInput(i).value) || 0))));
    const r = await api('/api/penheight', body);
    if (r.unsupported) logLine(r.message, 'warn');
    if (r.values) r.values.forEach((v, i) => (cornerInput(i).value = v));
    if (r.saved) logLine(`Saved pen-height map: ${r.saved.join(', ')}`);
  }));
}
for (const el of $$('.corner')) {
  const corner = Number(el.dataset.corner);
  el.querySelector('button').addEventListener('click', () => guarded(async () => {
    if (S.phCorner === corner) {
      const r = await api('/api/penheight', { action: 'stop' });
      cornerInput(corner).value = r.z;
    } else {
      S.phCorner = corner;
      syncUI();
      try {
        await api('/api/penheight', { action: 'start', corner });
      } catch (err) {
        S.phCorner = null;
        syncUI();
        throw err;
      }
    }
  }));
}

// ------------------------------------------------------------ server events

const events = new EventSource('/api/events');
events.addEventListener('status', (e) => {
  S.status = JSON.parse(e.data);
  syncUI();
});
events.addEventListener('job', (e) => {
  S.job = JSON.parse(e.data);
  syncUI();
  render();
});

// Remember the in-flight setting between visits (convenience only).
try {
  const saved = localStorage.getItem('lineus-depth');
  if (saved && [...$('#depth').options].some((o) => o.value === saved)) $('#depth').value = saved;
} catch {}
$('#depth').addEventListener('change', () => {
  try {
    localStorage.setItem('lineus-depth', $('#depth').value);
  } catch {}
});
events.addEventListener('log', (e) => {
  const { text, kind } = JSON.parse(e.data);
  logLine(text, kind);
});
events.addEventListener('penheight', (e) => {
  const { corner, z, running, bottomed } = JSON.parse(e.data);
  cornerInput(corner).value = z;
  if (!running) {
    S.phCorner = null;
    if (bottomed) logLine('The pen reached the bottom without you pressing Stop. Loosen the pen, lower it, and try again.', 'warn');
  }
  syncUI();
});
events.onerror = () => {
  S.status = { connected: false };
  syncUI();
};

window.addEventListener('resize', resize);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
resize();
syncUI();
