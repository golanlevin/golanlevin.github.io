// Line-us web controller: a local bridge between a browser page and the
// plotter. Run with `node server.js`, then open http://localhost:8137/
//
// The browser can't open raw TCP sockets, so this server holds the plotter
// connection. It listens on 127.0.0.1 only, and refuses requests whose Host
// or Origin isn't this server, so other websites can't drive your plotter.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineUs } from './lib/lineus.js';
import { insideArea, HOME, PEN_UP, PEN_DOWN } from './public/area.js';

// DISABLED: the browser-only version (../index.html) replaced this server.
// It's kept for reference; set LINEUS_ENABLE_SERVER=1 to run it anyway.
if (process.env.LINEUS_ENABLE_SERVER !== '1') {
  console.error('The Node server version is disabled. Open ../index.html instead,');
  console.error('or run with LINEUS_ENABLE_SERVER=1 to start it anyway.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 8137;
const BIND = '127.0.0.1';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));
const MAX_BODY = 50 * 1024 * 1024;

const lineus = new LineUs();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- events (SSE)

const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
function log(text, kind = 'info') {
  broadcast('log', { text, kind, t: Date.now() });
}
lineus.on('status', (reason) => {
  broadcast('status', lineus.info());
  if (!lineus.connected && reason) log(`Line-us ${reason}`, 'warn');
});
lineus.on('unsolicited', (line) => log(`← ${line}`));

// Send a command on behalf of the UI, logging it and its reply.
async function talk(cmd, { requireOk = true } = {}) {
  log(`→ ${cmd}`);
  const reply = await lineus.send(cmd);
  log(`← ${reply}`, /^ok/i.test(reply) ? 'info' : 'warn');
  if (requireOk && !/^ok/i.test(reply)) throw new Error(`Line-us replied: ${reply}`);
  return reply;
}

// ----------------------------------------------------------------- plot job

const job = { state: 'idle', done: 0, total: 0, error: null, startedAt: 0 };
let jobCtl = null;
let lastPush = 0;

function pushJob(force = false) {
  const now = Date.now();
  if (force || now - lastPush > 150) {
    lastPush = now;
    broadcast('job', job);
  }
}

const busy = () => jobCtl !== null || ph.promise !== null;

function buildPlot(polylines) {
  const cmds = [];
  const g = (x, y, z) => cmds.push({ text: `G01 X${x} Y${y} Z${z}`, x, y, z });
  for (const pl of polylines) {
    const pts = [];
    let px = null;
    let py = null;
    for (const [x, y] of pl) {
      const X = Math.round(x);
      const Y = Math.round(y);
      if (X === px && Y === py) continue;
      pts.push([X, Y]);
      px = X;
      py = Y;
    }
    if (!pts.length) continue;
    g(pts[0][0], pts[0][1], PEN_UP); // travel to the start with the pen up
    for (const [x, y] of pts) g(x, y, PEN_DOWN); // first point lowers the pen
    const [lx, ly] = pts[pts.length - 1];
    g(lx, ly, PEN_UP);
  }
  cmds.push({ text: 'G28', x: HOME.x, y: HOME.y, z: PEN_UP });
  return cmds;
}

// `depth` commands are kept in flight so the plotter's buffer never runs dry
// (firmware 3.0.0+). Before pausing or stopping, the window is drained so we
// know exactly where the pen is.
async function runJob(cmds, depth) {
  jobCtl = { paused: false, stop: false };
  Object.assign(job, { state: 'running', done: 0, total: cmds.length, error: null, startedAt: Date.now(), depth, pos: null });
  pushJob(true);
  log(`Plotting: ${cmds.length} commands, ${depth} in flight`);
  lineus.depth = depth;
  const window = [];
  const drain = async () => {
    while (window.length) await window.shift();
  };
  let last = null;
  try {
    for (let i = 0; i < cmds.length; i++) {
      if (jobCtl.paused && !jobCtl.stop) {
        await drain();
        if (last && last.z === PEN_DOWN) await lineus.ok(`G01 X${last.x} Y${last.y} Z${PEN_UP}`);
        job.state = 'paused';
        pushJob(true);
        while (jobCtl.paused && !jobCtl.stop) await sleep(100);
        if (!jobCtl.stop) {
          job.state = 'running';
          pushJob(true);
          if (last && last.z === PEN_DOWN) await lineus.ok(`G01 X${last.x} Y${last.y} Z${PEN_DOWN}`);
        }
      }
      if (jobCtl.stop) break;
      const c = cmds[i];
      const p = lineus.ok(c.text).then(() => {
        job.done++;
        job.pos = { x: c.x, y: c.y, z: c.z };
        pushJob();
      });
      p.catch(() => {}); // rejection is handled when this entry is awaited
      window.push(p);
      last = c;
      if (window.length >= depth) await window.shift();
    }
    await drain();
    if (jobCtl.stop) {
      job.state = 'stopping';
      pushJob(true);
      await lineus.ok(`G01 Z${PEN_UP}`);
      await lineus.ok('G28');
      job.state = 'stopped';
      log('Plot stopped');
    } else {
      job.state = 'done';
      log(`Plot finished in ${Math.round((Date.now() - job.startedAt) / 1000)} s`);
    }
  } catch (err) {
    job.state = 'error';
    job.error = err.message;
    log(`Plot failed: ${err.message}`, 'error');
    await Promise.allSettled(window);
  }
  lineus.depth = 1;
  jobCtl = null;
  pushJob(true);
}

// ------------------------------------------------- pen-height (Z-map) wizard
// Same procedure as the official app (view/penHeightSettings_3.as): at each
// corner the pen steps down 10 units per reply, drawing a short dash, until
// the user sees ink and presses Stop. Moves use "G40 KXY", which applies the
// XY calibration but not the existing Z-map, so the readings are raw.

const CORNERS = [[700, 900], [1600, 900], [1600, -900], [700, -900]];
const PARK = 'G40 KXY X1400 Y0';
const ph = { corner: null, z: PEN_UP, stop: false, promise: null, bottomed: false };

async function penHeightLoop(corner) {
  const [cx, cy] = CORNERS[corner];
  Object.assign(ph, { corner, z: PEN_UP, stop: false, bottomed: false });
  await lineus.ok(`G40 KXY X${cx} Y${cy} Z${PEN_UP}`);
  for (let i = 1; !ph.stop; i++) {
    ph.z -= 10;
    if (ph.z < 0) {
      ph.z = 0;
      ph.bottomed = true;
      break;
    }
    const y = i % 2 === 1 ? cy : cy - 100;
    broadcast('penheight', { corner, z: ph.z, running: true });
    await lineus.ok(`G40 KXY X${cx} Y${y} Z${ph.z}`);
  }
}

async function penHeight(body) {
  switch (body.action) {
    case 'prepare': {
      // Park with the pen up and read the stored Z-map.
      await talk(`${PARK} Z${PEN_UP}`);
      const reply = await talk('G31', { requireOk: false });
      if (/^error/i.test(reply)) {
        return { unsupported: true, message: 'This firmware does not support pen-height mapping (G31).' };
      }
      const m = reply.match(/(-?\d+);(-?\d+);(-?\d+);(-?\d+)/);
      return { values: m ? m.slice(1, 5).map(Number) : [0, 0, 0, 0] };
    }
    case 'seat':
      // Lower partway so the pen can be dropped in and tightened.
      await talk(`${PARK} Z400`);
      return {};
    case 'raise':
      await talk(`${PARK} Z${PEN_UP}`);
      return {};
    case 'start': {
      const corner = Number(body.corner);
      if (![0, 1, 2, 3].includes(corner)) throw httpError(400, 'corner must be 0-3');
      if (busy()) throw httpError(409, 'Busy');
      log(`Pen height: stepping down at corner ${corner + 1}`);
      ph.promise = penHeightLoop(corner)
        .catch((err) => log(`Pen height failed: ${err.message}`, 'error'))
        .finally(async () => {
          ph.promise = null;
          await lineus.ok(`${PARK} Z${PEN_UP}`).catch(() => {});
          broadcast('penheight', { corner: ph.corner, z: ph.z, running: false, bottomed: ph.bottomed });
        });
      return {};
    }
    case 'stop': {
      ph.stop = true;
      if (ph.promise) await ph.promise;
      return { corner: ph.corner, z: ph.z };
    }
    case 'save': {
      const vals = body.values;
      if (!Array.isArray(vals) || vals.length !== 4 || !vals.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) {
        throw httpError(400, 'values must be four integers 0-1000');
      }
      const lowest = Math.min(...vals);
      const norm = vals.map((v) => v - lowest);
      await talk(`G31 S${norm.join(';')}`);
      await talk(`${PARK} Z${PEN_UP}`);
      return { saved: norm };
    }
    case 'clear':
      await talk('G31 Sclear');
      return {};
    default:
      throw httpError(400, 'Unknown pen-height action');
  }
}

// ------------------------------------------------------- one-off commands

const jog = { x: HOME.x, y: HOME.y };
const JOG_LIMIT = 200;

function safeArg(s, what, max = 64) {
  if (typeof s !== 'string' || s.length < 1 || s.length > max || /["\0\r\n]/.test(s)) {
    throw httpError(400, `${what} must be 1-${max} characters with no quotes or line breaks`);
  }
  return s;
}

async function command(body) {
  switch (body.action) {
    case 'penUp':
      return { reply: await talk(`G01 X1400 Y0 Z${PEN_UP}`) };
    case 'penDown':
      return { reply: await talk(`G01 X1400 Y0 Z${PEN_DOWN}`) };
    case 'home':
      return { reply: await talk('G28') };
    case 'jogHome':
      jog.x = HOME.x;
      jog.y = HOME.y;
      return { reply: await talk(`G01 X${jog.x} Y${jog.y} Z${PEN_UP}`), jog };
    case 'jog': {
      const dx = Math.sign(Number(body.dx) || 0) * 15;
      const dy = Math.sign(Number(body.dy) || 0) * 15;
      jog.x = Math.max(HOME.x - JOG_LIMIT, Math.min(HOME.x + JOG_LIMIT, jog.x + dx));
      jog.y = Math.max(HOME.y - JOG_LIMIT, Math.min(HOME.y + JOG_LIMIT, jog.y + dy));
      return { reply: await talk(`G01 X${jog.x} Y${jog.y} Z${PEN_UP}`), jog };
    }
    case 'saveHome':
      return { reply: await talk('M374') };
    case 'clearHome':
      return { reply: await talk('M374 Sclear') };
    case 'info':
      return { reply: await talk('M122', { requireOk: false }) };
    case 'caps':
      return { reply: await talk('M115', { requireOk: false }) };
    case 'wifiList':
      return { reply: await talk('M587', { requireOk: false }) };
    case 'wifiAdd': {
      const ssid = safeArg(body.ssid, 'Network name');
      const pw = body.password ? safeArg(body.password, 'Password') : '';
      const cmd = pw ? `M587 S"${ssid}" P"${pw}"` : `M587 S"${ssid}"`;
      log(`→ M587 S"${ssid}"${pw ? ' P"••••"' : ''}`);
      const reply = await lineus.send(cmd);
      log(`← ${reply}`);
      return { reply };
    }
    case 'wifiForget':
      return { reply: await talk(`M588 S"${safeArg(body.ssid, 'Network name')}"`, { requireOk: false }) };
    case 'rename': {
      const name = String(body.name || '');
      if (!/^[A-Za-z0-9-]{1,32}$/.test(name)) throw httpError(400, 'Name may use letters, digits and hyphens only');
      return { reply: await talk(`M550 P${name}`, { requireOk: false }) };
    }
    case 'raw': {
      const g = String(body.gcode || '').trim();
      if (!g || /[\0\r\n]/.test(g) || g.length > 200) throw httpError(400, 'One command per line, max 200 characters');
      return { reply: await talk(g, { requireOk: false }) };
    }
    default:
      throw httpError(400, 'Unknown command');
  }
}

// --------------------------------------------------------------- HTTP layer

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readJSON(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw httpError(413, 'Request too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Invalid JSON');
  }
}

function requireConnected() {
  if (!lineus.connected) throw httpError(409, 'Not connected to Line-us');
}
function requireIdle() {
  requireConnected();
  if (busy()) throw httpError(409, 'Line-us is busy (plotting or calibrating)');
}

const routes = {
  'GET /api/status': () => ({ ...lineus.info(), job }),

  'POST /api/connect': async (body) => {
    if (busy()) throw httpError(409, 'Busy');
    const host = String(body.host || '').trim();
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) throw httpError(400, 'Enter a hostname like line-us.local or an IP address');
    log(`Connecting to ${host}…`);
    const hello = await lineus.connect(host);
    log(`Connected: ${hello.raw}`);
    return lineus.info();
  },

  'POST /api/disconnect': () => {
    if (jobCtl) jobCtl.stop = true;
    lineus.disconnect();
    return lineus.info();
  },

  'POST /api/plot': (body) => {
    requireIdle();
    const pls = body.polylines;
    if (!Array.isArray(pls) || !pls.length) throw httpError(400, 'Nothing to plot');
    let outside = 0;
    for (const pl of pls) {
      if (!Array.isArray(pl)) throw httpError(400, 'Bad polyline');
      for (const p of pl) {
        if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw httpError(400, 'Bad point');
        if (!insideArea(p[0], p[1])) outside++;
      }
    }
    if (outside) throw httpError(400, `${outside} points are outside the drawing area`);
    // "auto": 3 in flight on firmware 3.0.0+ (which buffers), else 1.
    let depth = body.depth === 'auto' || body.depth === undefined ? (lineus.supportsBuffering ? 3 : 1) : Number(body.depth);
    if (![1, 2, 3, 4].includes(depth)) throw httpError(400, 'depth must be auto or 1-4');
    runJob(buildPlot(pls), depth);
    return { total: job.total };
  },

  'POST /api/job': (body) => {
    if (!jobCtl) throw httpError(409, 'No plot running');
    if (body.action === 'pause') jobCtl.paused = true;
    else if (body.action === 'resume') jobCtl.paused = false;
    else if (body.action === 'stop') jobCtl.stop = true;
    else throw httpError(400, 'Unknown job action');
    return {};
  },

  'POST /api/cmd': (body) => {
    requireIdle();
    return command(body);
  },

  'POST /api/penheight': (body) => {
    requireConnected();
    if (jobCtl) throw httpError(409, 'A plot is running');
    if (ph.promise && body.action !== 'stop') throw httpError(409, 'Stop the current corner first');
    return penHeight(body);
  },
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // Block DNS-rebinding and cross-site requests.
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, { error: 'Forbidden host' });
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'Forbidden origin' });

  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: status\ndata: ${JSON.stringify(lineus.info())}\n\n`);
    res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const route = routes[`${req.method} ${pathname}`];
  if (!route) {
    if (req.method === 'GET' && !pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
    return send(res, 404, { error: 'Not found' });
  }
  try {
    let body = {};
    if (req.method === 'POST') {
      // JSON-only POSTs can't be forged by a plain HTML form on another site.
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        return send(res, 415, { error: 'Expected application/json' });
      }
      body = await readJSON(req);
    }
    send(res, 200, (await route(body)) ?? {});
  } catch (err) {
    send(res, err.status || 500, { error: err.message });
  }
});

server.listen(PORT, BIND, () => {
  console.log(`Line-us controller running at http://localhost:${PORT}/`);
});
