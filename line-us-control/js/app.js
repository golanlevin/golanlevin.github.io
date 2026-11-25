// Line-us controller UI. Talks to the plotter directly from the browser
// (WebSocket), or to the built-in virtual plotter.

(function (LU) {
  'use strict';

  const { AREA, HOME, UNITS_PER_MM, PLOT_CENTER, FIT_BOX, insideArea, parseSVG, parseGcode } = LU;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const canvas = $('#view');
  const ctx = canvas.getContext('2d');

  const plotter = new LU.Plotter();
  const sim = new LU.Simulator();
  const ctl = new LU.Controller(plotter);

  // Visible region in machine units (includes the robot body for context).
  // Extra room on the right and bottom holds the grid's unit labels.
  const VIEW = { minX: -300, maxX: 2200, minY: -1850, maxY: 1700 };
  const HANDLE_PX = 7; // resize handle size, in CSS pixels
  const MIN_SIZE_MM = 2; // smallest a drawing can be resized to
  const ROBOT = { x0: -250, x1: 250, y0: -1350, y1: 560 };
  const RESAMPLE = 8; // max machine units between area-boundary checks

  const S = {
    drawing: null, // { polylines (mm, y down), bbox, warnings }
    place: { x: PLOT_CENTER.x, y: PLOT_CENTER.y, scale: 1, rot: 0 },
    machine: null, // { all, inside, clipped, lengthMM, points }
    job: ctl.job,
    phCorner: null,
    cursor: null, // machine coords of the mouse when it's inside the drawing area
  };
  let view = { k: 1, ox: 0, oy: 0, dpr: 1 };

  // ---------------------------------------------------------------- helpers

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
  // A locked drawing (the test grid) has a fixed position and size.
  const locked = () => !!(S.drawing && S.drawing.locked);
  const target = () => document.querySelector('input[name="target"]:checked').value;
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };

  // ------------------------------------------------------- placement maths

  function makeTransform() {
    const { bbox } = S.drawing;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const { x, y, scale, rot } = S.place;
    const k = scale * UNITS_PER_MM;
    const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][rot]; // rot × 90° clockwise
    const zm = zMapper();
    return (p) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const out = [x + (dx * c - dy * s) * k, y - (dx * s + dy * c) * k];
      if (zm && p.length > 2) out.push(zm(p[2]));
      return out;
    };
  }

  // Pen pressure (G-code only). Returns a function from file Z to Line-us Z,
  // or null for plain pen-up/pen-down drawings. In 'mapped' files the
  // pen-down Z range (lowest = heaviest) is stretched between the Heaviest
  // and Lightest settings; 'native' (Line-us) files keep their Z as-is.
  function zMapper() {
    const zi = S.drawing && S.drawing.zInfo;
    if (!zi || zi.mode === 'none') return null;
    const clampZ = (v) => Math.max(0, Math.min(1000, v));
    if (zi.mode === 'native') return clampZ;
    const light = clampZ(Number($('#z-light').value) || 0);
    const heavy = clampZ(Number($('#z-heavy').value) || 0);
    if (zi.dMax === zi.dMin) return () => heavy;
    return (fz) => clampZ(heavy + ((fz - zi.dMin) / (zi.dMax - zi.dMin)) * (light - heavy));
  }

  // Interpolate between two points, including Z when present.
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function rotatedSize() {
    const { w, h } = S.drawing.bbox;
    return S.place.rot % 2 ? [h, w] : [w, h];
  }

  // Transform to machine units and clip against the drawing area. Segments
  // are checked every RESAMPLE units, but only original vertices and
  // boundary crossings are kept, so straight lines stay as single moves.
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
          const p = j === n ? m[i] : lerp(m[i - 1], m[i], j / n);
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
    const lines = $('#join').checked ? joinTouching(inside) : inside;
    let len = 0;
    let points = 0;
    for (const r of lines) {
      points += r.length;
      for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    }
    // Pen-height range (G-code pressure), for the preview's line widths.
    let zLo = Infinity;
    let zHi = -Infinity;
    for (const r of lines) {
      for (const p of r) {
        if (p.length > 2) {
          if (p[2] < zLo) zLo = p[2];
          if (p[2] > zHi) zHi = p[2];
        }
      }
    }
    const zRange = zLo <= zHi ? [zLo, zHi] : null;
    S.machine = { all, inside, lines, clipped, lengthMM: len / UNITS_PER_MM, points, zRange };
  }

  // Join lines whose ends meet (within JOIN_TOL machine units) into single
  // strokes, reversing pieces where needed, like vpype's `linemerge`. Each
  // join saves a pen lift and drop. Lines are visited in their original
  // order; a line only moves when it's attached to an earlier one.
  const JOIN_TOL = 2; // 0.1 mm
  function joinTouching(pls) {
    const cell = (v) => Math.round(v / JOIN_TOL);
    const grid = new Map(); // grid cell -> [{ i, end }] where end 0 = start, 1 = finish
    const endPoint = (i, end) => (end ? pls[i][pls[i].length - 1] : pls[i][0]);
    pls.forEach((pl, i) => {
      for (const end of [0, 1]) {
        const [x, y] = endPoint(i, end);
        const k = `${cell(x)},${cell(y)}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push({ i, end });
      }
    });
    const used = new Uint8Array(pls.length);
    const JOIN_DZ = 5; // pen heights must also match (G-code pressure)
    const nearest = ([x, y, z]) => {
      let best = null;
      let bestD = Infinity;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const e of grid.get(`${cell(x) + dx},${cell(y) + dy}`) || []) {
            if (used[e.i]) continue;
            const [qx, qy, qz] = endPoint(e.i, e.end);
            if (z !== undefined && qz !== undefined && Math.abs(qz - z) > JOIN_DZ) continue;
            const d = Math.hypot(qx - x, qy - y);
            if (d <= JOIN_TOL && d < bestD) [best, bestD] = [e, d];
          }
        }
      }
      return best;
    };
    const out = [];
    for (let i = 0; i < pls.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      let chain = pls[i].slice();
      // Grow forwards from the chain's finish…
      for (let e; (e = nearest(chain[chain.length - 1])); ) {
        used[e.i] = 1;
        const seg = e.end ? pls[e.i].slice().reverse() : pls[e.i];
        for (let j = 1; j < seg.length; j++) chain.push(seg[j]);
      }
      // …then backwards from its start.
      for (let e; (e = nearest(chain[0])); ) {
        used[e.i] = 1;
        const seg = e.end ? pls[e.i] : pls[e.i].slice().reverse();
        chain = seg.slice(0, -1).concat(chain);
      }
      out.push(chain);
    }
    return out;
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
    view = { k, dpr, ox: (canvas.width - k * vw) / 2 - k * VIEW.minX, oy: (canvas.height - k * vh) / 2 + k * VIEW.maxY };
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

  function penMarker(p, color) {
    const d = view.dpr;
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), 5 * d, 0, Math.PI * 2);
    ctx.fillStyle = p.z < 500 ? color : 'transparent';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * d;
    ctx.stroke();
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
    drawUnitLabels(c);
    drawCursorGuides(c);

    // Robot body and home position.
    ctx.fillStyle = c('--robot');
    ctx.beginPath();
    ctx.roundRect(sx(ROBOT.x0), sy(ROBOT.y1), (ROBOT.x1 - ROBOT.x0) * view.k, (ROBOT.y1 - ROBOT.y0) * view.k, 8 * d);
    ctx.fill();
    // Label the robot body: "Line-us" over the plotter's name/address, or
    // "virtual" for the simulator.
    ctx.fillStyle = c('--panel');
    ctx.textAlign = 'center';
    const robotName = target() === 'sim' ? 'virtual' : ($('#host').value.trim() || 'line-us.local');
    const tx = sx(0);
    const ty = sy(-400);
    ctx.font = `600 ${12 * d}px system-ui, sans-serif`;
    ctx.fillText('Line-us', tx, ty);
    ctx.font = `${10 * d}px ui-monospace, Menlo, monospace`;
    ctx.fillText(robotName, tx, ty + 14 * d);
    ctx.strokeStyle = c('--accent');
    ctx.lineWidth = 1.5 * d;
    ctx.beginPath();
    ctx.arc(sx(HOME.x), sy(HOME.y), 18 * view.k, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const showSim = target() === 'sim';

    if (S.machine) {
      if (S.machine.clipped) {
        ctx.strokeStyle = c('--stroke-out');
        ctx.lineWidth = d;
        for (const pl of S.machine.all) {
          path(pl);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = c('--stroke');
      ctx.globalAlpha = showSim && sim.ink.length ? 0.35 : 1;
      const zr = S.machine.zRange;
      if (zr && zr[1] > zr[0]) {
        // Pressure preview: lower Z (heavier) draws thicker.
        for (const pl of S.machine.lines) {
          for (let i = 1; i < pl.length; i++) {
            const zMid = (pl[i - 1][2] + pl[i][2]) / 2;
            ctx.lineWidth = (0.6 + 3 * (1 - (zMid - zr[0]) / (zr[1] - zr[0]))) * d;
            path([pl[i - 1], pl[i]]);
            ctx.stroke();
          }
        }
      } else {
        ctx.lineWidth = 1.3 * d;
        for (const pl of S.machine.inside) {
          path(pl);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Simulated ink, then the virtual pen.
    if (showSim) {
      // Wider ink the harder the pen presses (a squishy brush pen), in a few
      // width bands so each band is drawn in one go.
      ctx.strokeStyle = c('--sim-ink');
      const BANDS = 6;
      const bands = Array.from({ length: BANDS }, () => []);
      for (const seg of sim.ink) {
        const t = Math.max(0, Math.min(1, (seg[4] || 0) / 350));
        bands[Math.min(BANDS - 1, Math.floor(t * BANDS))].push(seg);
      }
      bands.forEach((segs, b) => {
        if (!segs.length) return;
        ctx.lineWidth = (0.8 + (3.2 * (b + 0.5)) / BANDS) * d;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of segs) {
          ctx.moveTo(sx(x1), sy(y1));
          ctx.lineTo(sx(x2), sy(y2));
        }
        ctx.stroke();
      });
      if (plotter.connected) penMarker(sim.pos, c('--sim-ink'));
    } else if (jobActive() && S.job.pos) {
      penMarker(S.job.pos, c('--accent'));
    }

    // Dashed outline of the drawing's bounds, with resize handles.
    if (S.drawing) {
      const [w, h] = rotatedSize();
      const k = S.place.scale * UNITS_PER_MM;
      ctx.setLineDash([4 * d, 4 * d]);
      ctx.strokeStyle = c('--accent');
      ctx.lineWidth = d;
      ctx.strokeRect(sx(S.place.x - (w * k) / 2), sy(S.place.y + (h * k) / 2), w * k * view.k, h * k * view.k);
      ctx.setLineDash([]);
      if (!jobActive() && !locked()) {
        const hs = HANDLE_PX * d;
        ctx.fillStyle = c('--panel');
        for (const hd of handles()) {
          ctx.fillRect(sx(hd.x) - hs / 2, sy(hd.y) - hs / 2, hs, hs);
          ctx.strokeRect(sx(hd.x) - hs / 2, sy(hd.y) - hs / 2, hs, hs);
        }
      }
    }
  }

  // Faint machine-unit labels along the bottom (X) and right (Y) edges,
  // like the official drawing-area diagram. Every 100 units when there's
  // room, otherwise every 200.
  // Where a line from (x, y) leaves the drawing area going straight down
  // (largest boundary crossing below y) or straight right (smallest
  // crossing to the right of x).
  function exitDown(x, y) {
    let best = -Infinity;
    for (let i = 0, j = AREA.length - 1; i < AREA.length; j = i++) {
      const [ax, ay] = AREA[j];
      const [bx, by] = AREA[i];
      if ((ax <= x && bx > x) || (bx <= x && ax > x)) {
        const yi = ay + ((x - ax) / (bx - ax)) * (by - ay);
        if (yi < y && yi > best) best = yi;
      }
    }
    return best;
  }
  function exitRight(x, y) {
    let best = Infinity;
    for (let i = 0, j = AREA.length - 1; i < AREA.length; j = i++) {
      const [ax, ay] = AREA[j];
      const [bx, by] = AREA[i];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const xi = ax + ((y - ay) / (by - ay)) * (bx - ax);
        if (xi > x && xi < best) best = xi;
      }
    }
    return best;
  }

  // Faint guides from the edge of the drawing area to the unit labels, in
  // line with the mouse, so its approximate coordinates can be read off.
  function drawCursorGuides(c) {
    if (!S.cursor) return;
    const [x, y] = S.cursor;
    const d = view.dpr;
    const yEdge = exitDown(x, y);
    const xEdge = exitRight(x, y);
    ctx.save();
    ctx.strokeStyle = c('--muted');
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = d;
    ctx.setLineDash([2 * d, 3 * d]);
    ctx.beginPath();
    if (Number.isFinite(yEdge)) {
      ctx.moveTo(sx(x), sy(yEdge));
      ctx.lineTo(sx(x), sy(-1600));
    }
    if (Number.isFinite(xEdge)) {
      ctx.moveTo(sx(xEdge), sy(y));
      ctx.lineTo(sx(2000), sy(y));
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawUnitLabels(c) {
    const d = view.dpr;
    const step = 100 * view.k >= 13 * d ? 100 : 200;
    ctx.save();
    ctx.fillStyle = c('--muted');
    ctx.globalAlpha = 0.45;
    ctx.font = `${9 * d}px system-ui, sans-serif`;
    // X labels, rotated to read downwards, below the area.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let x = 0; x <= 2000; x += step) {
      ctx.save();
      ctx.translate(sx(x), sy(-1610));
      ctx.rotate(Math.PI / 2);
      ctx.fillText(String(x), 0, 0);
      ctx.restore();
    }
    // Y labels to the right of the area.
    for (let y = -1600; y <= 1600; y += step) ctx.fillText(String(y), sx(2010), sy(y));
    // Scale note.
    ctx.textAlign = 'left';
    ctx.fillText('100 units = 5 mm', sx(ROBOT.x0), sy(ROBOT.y0 - 100));
    ctx.restore();
  }

  // Resize handles at the corners and edge midpoints of the drawing's
  // bounds. Each records the opposite point, which stays fixed while
  // dragging, and the cursor to show.
  function handles() {
    const [w, h] = rotatedSize();
    const k = S.place.scale * UNITS_PER_MM;
    const hx = (w * k) / 2;
    const hy = (h * k) / 2;
    const { x, y } = S.place;
    const spec = [
      ['nw', -1, 1, 'nwse-resize'], ['n', 0, 1, 'ns-resize'], ['ne', 1, 1, 'nesw-resize'], ['e', 1, 0, 'ew-resize'],
      ['se', 1, -1, 'nwse-resize'], ['s', 0, -1, 'ns-resize'], ['sw', -1, -1, 'nesw-resize'], ['w', -1, 0, 'ew-resize'],
    ];
    return spec.map(([name, ux, uy, cursor]) => ({
      name, cursor,
      x: x + ux * hx, y: y + uy * hy,
      ax: x - ux * hx, ay: y - uy * hy, // anchor: the opposite corner or edge
    }));
  }

  function handleAt(offsetX, offsetY) {
    if (!S.drawing || jobActive() || locked()) return null;
    const px = offsetX * view.dpr;
    const py = offsetY * view.dpr;
    const reach = (HANDLE_PX / 2 + 4) * view.dpr;
    return handles().find((hd) => Math.abs(sx(hd.x) - px) <= reach && Math.abs(sy(hd.y) - py) <= reach) || null;
  }

  // ------------------------------------------------------------- UI state

  let pending = false;
  function update(recompute = true) {
    if (pending) {
      if (recompute) pending = 'compute';
      return;
    }
    pending = recompute ? 'compute' : 'render';
    requestAnimationFrame(() => {
      if (pending === 'compute') compute();
      pending = false;
      render();
      syncUI();
    });
  }

  function syncUI() {
    const conn = plotter.connected;
    const active = jobActive();
    const isSim = target() === 'sim';
    const badge = $('#conn-badge');
    badge.textContent = active ? `Plotting (${S.job.state})` : conn ? (plotter.simulated ? 'Virtual plotter' : 'Connected') : 'Not connected';
    badge.className = `badge ${active ? 'busy' : conn ? 'on' : 'off'}`;
    $('#connect-btn').textContent = conn ? 'Disconnect' : 'Connect';
    $('#host').disabled = conn || isSim;
    $('#host').hidden = isSim;
    for (const r of $$('input[name="target"]')) r.disabled = conn;
    $('#sim-controls').hidden = !isSim;
    $('#sim-clear').disabled = sim.ink.length === 0; // nothing to clear
    const hi = plotter.hello;
    $('#hello').textContent = conn && hi ? [hi.NAME, hi.VERSION && `firmware ${hi.VERSION}`, hi.SERIAL && `s/n ${hi.SERIAL}`].filter(Boolean).join(' · ') : '';

    for (const b of $$('.needs-conn')) b.disabled = !conn || active;
    // "Clear on-board plotter memory": available whenever connected to a real
    // plotter and idle. The cloud-follow state can't be queried, so we don't try
    // to grey it out when "already clear" — clicking again is harmless.
    $('#clear-mem').disabled = !conn || active || plotter.simulated || S.phCorner !== null;
    const plottable = S.machine && S.machine.lines.length > 0;
    $('#plot').disabled = !conn || active || !plottable || S.phCorner !== null;
    $('#pause').disabled = !['running', 'paused'].includes(S.job.state);
    $('#pause').textContent = S.job.state === 'paused' ? 'Resume' : 'Pause';
    $('#stop').disabled = !['running', 'paused'].includes(S.job.state);
    for (const el of $$('#place-controls input, #place-controls button')) el.disabled = active || locked();

    $('#progress').max = S.job.total || 1;
    $('#progress').value = S.job.done || 0;
    const pct = S.job.total ? Math.round((100 * S.job.done) / S.job.total) : 0;
    $('#job-text').textContent =
      {
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
    // Pen-pressure box: only for G-code whose pen-down height varies.
    const zi = S.drawing.zInfo;
    const showZ = !!zi && (zi.mode === 'native' || (zi.mode === 'mapped' && zi.dMax > zi.dMin));
    $('#z-controls').hidden = !showZ;
    if (showZ) {
      const f = (v) => String(Math.round(v * 100) / 100);
      $('#z-map').hidden = zi.mode === 'native';
      $('#z-up-src').textContent = `← file Z ${f(zi.zUp)}`;
      $('#z-light-src').textContent = `← file Z ${f(zi.dMax)}`;
      $('#z-heavy-src').textContent = `← file Z ${f(zi.dMin)}`;
      const up = Number($('#z-up').value);
      const bad = !(up > Number($('#z-light').value) && up > Number($('#z-heavy').value));
      $('#z-info').textContent =
        zi.mode === 'native'
          ? `Line-us G-code: pen heights are used as written (Z ${f(zi.dMin)}–${f(zi.dMax)}).`
          : bad
            ? 'Pen up must be higher than both stroke heights, or the pen will drag between lines.'
            : 'Heights in between are blended smoothly along each line.';
      $('#z-info').style.color = bad && zi.mode !== 'native' ? 'var(--error)' : '';
    }
    for (const el of $$('#z-controls input')) el.disabled = active;

    const m = S.machine;
    if (m) {
      const n = m.lines.length;
      const joined = n < m.inside.length ? ` (joined from ${m.inside.length})` : '';
      $('#stats').textContent = [`${n} line${n === 1 ? '' : 's'}${joined}`, `${m.points} points`, `${(m.lengthMM / 10).toFixed(1)} cm of ink`].join(' · ');
      if (m.clipped) {
        const warn = document.createElement('div');
        warn.style.color = 'var(--error)';
        warn.textContent = 'Parts in red are outside the reachable area and will be skipped.';
        $('#stats').append(warn);
      }
    }
  }

  // ------------------------------------------------------------ file loading

  // kind: 'svg', 'gcode', or undefined to decide from the file itself.
  async function loadFile(file, kind) {
    try {
      const text = await file.text();
      if (!kind) kind = /\.svg$/i.test(file.name) || /^\s*(<\?xml|<svg|<!--)/i.test(text) ? 'svg' : 'gcode';
      const drawing = kind === 'svg' ? parseSVG(text, $('#svg-host')) : parseGcode(text);
      S.drawing = drawing;
      if (drawing.native) {
        // Line-us G-code: keep its exact position on the plotter.
        S.place = { x: drawing.native.x, y: drawing.native.y, scale: 1, rot: 0 };
        compute();
      } else {
        S.place = { x: PLOT_CENTER.x, y: PLOT_CENTER.y, scale: 1, rot: 0 };
        compute();
        if (S.machine.clipped) fit(); // too big at real size: fit it
      }
      $('#file-name').textContent = file.name;
      $('#warnings').replaceChildren(...drawing.warnings.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
      $('#hint').hidden = true;
      logLine(`Loaded ${file.name}: ${drawing.polylines.length} paths, ${drawing.bbox.w.toFixed(1)} × ${drawing.bbox.h.toFixed(1)} mm`);
      update();
    } catch (err) {
      logLine(`Could not load ${file.name}: ${err.message}`, 'error');
    }
  }

  for (const [sel, kind] of [['#file', 'svg'], ['#gcode-file', 'gcode']]) {
    $(sel).addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) loadFile(f, kind);
      e.target.value = '';
    });
  }

  // A 1 cm grid of long intersecting lines for testing and calibration. It
  // fills the D-shaped reachable area rather than a rectangle: every line is
  // aligned to a 1 cm lattice that has a vertex exactly on the home point, and
  // each row/column runs as far as it can while its vertices stay inside the
  // area (with a small margin). The edges therefore follow the D's outline,
  // except for a flat floor near the bottom that keeps the pen on the base
  // plate (see Y_FLOOR).
  function buildTestGrid() {
    const P = 10 * UNITS_PER_MM; // 1 cm cell, in machine units
    const M = 40; // keep each vertex at least this far inside the edge (~2 mm)
    const R = 15; // lattice steps to scan each way from Home (covers the area)
    // Don't draw below this: lower than the base of the plotter, the pen can
    // catch off the edge of the floor plate. (-1200 is lattice index j=-11.)
    const Y_FLOOR = -1200;
    const safe = (x, y) =>
      y >= Y_FLOOR &&
      insideArea(x, y) && insideArea(x + M, y) && insideArea(x - M, y) && insideArea(x, y + M) && insideArea(x, y - M);
    // Innermost/outermost safe lattice index along one row (fixed j) or
    // column (fixed i). The D is convex at every y and x, so the safe indices
    // form one unbroken run, giving a single line with all vertices inside.
    const span = (fixed, along) => {
      let lo = null;
      let hi = null;
      for (let k = -R; k <= R; k++) {
        const [x, y] = along === 'x' ? [HOME.x + P * k, fixed] : [fixed, HOME.y + P * k];
        if (safe(x, y)) {
          if (lo === null) lo = k;
          hi = k;
        }
      }
      return lo === null ? null : { lo, hi };
    };

    const toMM = ([mx, my]) => [mx / UNITS_PER_MM, -my / UNITS_PER_MM]; // machine → mm (y down)
    const polylines = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const note = (x, y) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };
    // Boustrophedon: draw each successive parallel line in the opposite
    // direction, so the pen ends one line beside the start of the next and
    // barely travels between them.
    let flip = false;
    for (let j = -R; j <= R; j++) {
      const s = span(HOME.y + P * j, 'x'); // horizontal line at this row
      if (!s || s.hi === s.lo) continue;
      const y = HOME.y + P * j;
      const pts = [[HOME.x + P * s.lo, y], [HOME.x + P * s.hi, y]];
      if (flip) pts.reverse();
      flip = !flip;
      polylines.push(pts.map(toMM));
      note(pts[0][0], y);
      note(pts[1][0], y);
    }
    flip = false;
    for (let i = -R; i <= R; i++) {
      const s = span(HOME.x + P * i, 'y'); // vertical line at this column
      if (!s || s.hi === s.lo) continue;
      const x = HOME.x + P * i;
      const pts = [[x, HOME.y + P * s.lo], [x, HOME.y + P * s.hi]];
      if (flip) pts.reverse();
      flip = !flip;
      polylines.push(pts.map(toMM));
      note(x, pts[0][1]);
      note(x, pts[1][1]);
    }

    const bbox = { minX: minX / UNITS_PER_MM, maxX: maxX / UNITS_PER_MM, minY: -maxY / UNITS_PER_MM, maxY: -minY / UNITS_PER_MM };
    bbox.w = bbox.maxX - bbox.minX;
    bbox.h = bbox.maxY - bbox.minY;
    return {
      polylines,
      bbox,
      warnings: [],
      zInfo: { mode: 'none' },
      native: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, // place exactly on the lattice
      size: { w: (maxX - minX) / P, h: (maxY - minY) / P }, // in 1 cm cells
      locked: true, // fixed to the lattice: can't be moved, scaled or rotated
    };
  }

  $('#test-grid').addEventListener('click', () => {
    if (jobActive()) return;
    const drawing = buildTestGrid();
    S.drawing = drawing;
    S.place = { x: drawing.native.x, y: drawing.native.y, scale: 1, rot: 0 };
    compute();
    $('#file-name').textContent = `Test grid — 1 cm, fills ${drawing.size.w} × ${drawing.size.h} cm`;
    $('#warnings').replaceChildren();
    $('#hint').hidden = true;
    logLine(`Loaded test grid: ${drawing.polylines.length} lines on a 1 cm lattice, home on a vertex`);
    update();
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && !jobActive()) loadFile(f);
  });

  // ------------------------------------------------------ canvas interaction

  // Dragging a handle resizes uniformly about the opposite corner or edge;
  // dragging anywhere else moves the drawing.
  let drag = null;
  // Is the pointer inside the drawing's (dashed) bounding box?
  function inBox(offsetX, offsetY) {
    if (!S.drawing || jobActive() || locked()) return false;
    const [mx, my] = toMachine(offsetX, offsetY);
    const [w, h] = rotatedSize();
    const k = S.place.scale * UNITS_PER_MM;
    return Math.abs(mx - S.place.x) <= (w * k) / 2 && Math.abs(my - S.place.y) <= (h * k) / 2;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!S.drawing || jobActive()) return;
    const hd = handleAt(e.offsetX, e.offsetY);
    if (!hd && !inBox(e.offsetX, e.offsetY)) return; // only grab the drawing itself
    S.cursor = null; // hide the coordinate guides while dragging
    if (hd) {
      const vx = hd.x - hd.ax;
      const vy = hd.y - hd.ay;
      const [w, h] = rotatedSize();
      drag = {
        mode: 'resize', hd, vx, vy, len2: vx * vx + vy * vy,
        scale0: S.place.scale, cx0: S.place.x, cy0: S.place.y,
        minScale: MIN_SIZE_MM / Math.max(w, h),
      };
      canvas.style.cursor = hd.cursor;
    } else {
      drag = { mode: 'move', x0: e.clientX, y0: e.clientY, px: S.place.x, py: S.place.y };
      canvas.classList.add('dragging');
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const hd = handleAt(e.offsetX, e.offsetY);
      canvas.style.cursor = hd ? hd.cursor : '';
      canvas.classList.toggle('can-grab', !hd && inBox(e.offsetX, e.offsetY));
      setCursor(e);
      return;
    }
    if (drag.mode === 'move') {
      S.place.x = drag.px + ((e.clientX - drag.x0) * view.dpr) / view.k;
      S.place.y = drag.py - ((e.clientY - drag.y0) * view.dpr) / view.k;
    } else {
      // Project the pointer onto the anchor→handle direction to get one
      // uniform scale factor, so edges and corners both scale evenly.
      const { hd, vx, vy, len2 } = drag;
      const [mx, my] = toMachine(e.offsetX, e.offsetY);
      let f = ((mx - hd.ax) * vx + (my - hd.ay) * vy) / len2;
      f = Math.max(f, drag.minScale / drag.scale0);
      S.place.scale = drag.scale0 * f;
      S.place.x = hd.ax + (drag.cx0 - hd.ax) * f;
      S.place.y = hd.ay + (drag.cy0 - hd.ay) * f;
    }
    update();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('dragging');
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    setCursor(null);
    canvas.classList.remove('can-grab');
  });

  // Track the mouse for the coordinate guides (only inside the area).
  function setCursor(e) {
    let next = null;
    if (e) {
      const [mx, my] = toMachine(e.offsetX, e.offsetY);
      if (insideArea(mx, my)) next = [mx, my];
    }
    if (next || S.cursor) {
      S.cursor = next;
      update(false);
    }
  }
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!inBox(e.offsetX, e.offsetY)) return; // only zoom over the drawing
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const [mx, my] = toMachine(e.offsetX, e.offsetY);
      S.place.scale *= f;
      S.place.x = mx + (S.place.x - mx) * f;
      S.place.y = my + (S.place.y - my) * f;
      update();
    },
    { passive: false },
  );

  const numInput = (sel, apply) =>
    $(sel).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) apply(v);
      update();
    });
  numInput('#scale', (v) => v > 0 && (S.place.scale = v / 100));
  numInput('#cx', (v) => (S.place.x = v));
  numInput('#cy', (v) => (S.place.y = v));
  $('#fit').addEventListener('click', () => {
    fit();
    update();
  });
  $('#real').addEventListener('click', () => {
    S.place.scale = 1;
    update();
  });
  $('#join').addEventListener('change', () => update());
  for (const id of ['z-up', 'z-light', 'z-heavy']) {
    const saved = store.get(`lineus-${id}`);
    if (saved !== null && saved !== '') $(`#${id}`).value = saved;
    $(`#${id}`).addEventListener('change', (e) => {
      store.set(`lineus-${id}`, e.target.value);
      update();
    });
  }
  $('#rotate').addEventListener('click', () => {
    S.place.rot = (S.place.rot + 1) % 4;
    update();
  });

  // ---------------------------------------------------------------- plotting

  $('#plot').addEventListener('click', () =>
    guarded(() => {
      // Round to whole machine units; drop any point that rounding nudged
      // just outside the boundary.
      const pls = S.machine.lines
        .map((pl) => pl.map((p) => [Math.round(p[0]), Math.round(p[1]), ...p.slice(2)]).filter(([x, y]) => insideArea(x, y)))
        .filter((pl) => pl.length);
      // Pen-up height: the setting for pressure G-code, otherwise 1000.
      const zi = S.drawing.zInfo;
      const upZ = zi && zi.mode === 'mapped' && zi.dMax > zi.dMin ? Math.round(Number($('#z-up').value)) : LU.PEN_UP;
      ctl.plot(pls, $('#depth').value, upZ);
    }),
  );
  $('#pause').addEventListener('click', () => (S.job.state === 'paused' ? ctl.resume() : ctl.pause()));
  $('#stop').addEventListener('click', () => ctl.stop());

  // Keep the computer awake while plotting, where the browser allows it.
  let wakeLock = null;
  async function updateWakeLock() {
    try {
      if (jobActive() && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      } else if (!jobActive() && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      /* not available (e.g. tab hidden); harmless */
    }
  }

  // -------------------------------------------------------------- connection

  $('#connect-form').addEventListener('submit', (e) => {
    e.preventDefault();
    guarded(async () => {
      if (plotter.connected) {
        if (jobActive()) ctl.stop();
        plotter.disconnect();
        return;
      }
      let link;
      if (target() === 'sim') {
        sim.firmware = $('#sim-fw').value;
        link = new LU.SimLink(sim);
      } else {
        const host = $('#host').value.trim();
        if (!/^[A-Za-z0-9.:-]{1,253}$/.test(host)) throw new Error('Enter a hostname like line-us.local or an IP address');
        store.set('lineus-host', host);
        link = new LU.WsLink(host);
      }
      logLine(`Connecting to ${link.label}…`);
      $('#connect-btn').disabled = true;
      try {
        const hello = await plotter.connect(link);
        logLine(`Connected: ${hello.raw}`);
      } finally {
        $('#connect-btn').disabled = false;
      }
    });
  });

  for (const r of $$('input[name="target"]')) {
    r.addEventListener('change', () => {
      store.set('lineus-target', target());
      update(false);
    });
  }
  // Keep the robot-body address label in sync as the host is edited.
  $('#host').addEventListener('input', () => update(false));

  // --------------------------------------------------------- simulator UI

  $('#sim-speed').addEventListener('change', (e) => {
    sim.timeScale = Number(e.target.value);
    store.set('lineus-sim-speed', e.target.value);
  });
  $('#sim-clear').addEventListener('click', () => sim.clearInk());
  sim.on('change', () => update(false));
  sim.on('warn', (msg) => logLine(`(virtual plotter) ${msg}`, 'warn'));

  // -------------------------------------------------------- machine commands

  const showJog = (r) => r && r.jog && ($('#jog-pos').textContent = `Pen at X${r.jog.x} Y${r.jog.y}`);
  for (const b of $$('[data-cmd]')) {
    b.addEventListener('click', () => guarded(async () => showJog(await ctl.command(b.dataset.cmd))));
  }
  // Clear everything the plotter's button could draw on its own: stop following
  // the cloud daily-drawing feed (M23 S3) and delete any saved drawings (M30).
  $('#clear-mem').addEventListener('click', () =>
    guarded(async () => {
      const { cleared } = await ctl.command('clearDrawings');
      logLine(
        `Cleared the plotter's on-board memory${
          cleared ? ` (${cleared} saved drawing${cleared === 1 ? '' : 's'})` : ''
        } and stopped the cloud drawing-of-the-day feed. The plotter's button won't draw on its own now.`,
        'info',
      );
    }),
  );
  for (const b of $$('[data-jog]')) {
    b.addEventListener('click', () =>
      guarded(async () => {
        const [dx, dy] = b.dataset.jog.split(',').map(Number);
        showJog(await ctl.command('jog', { dx, dy }));
      }),
    );
  }
  // Wi-Fi setup is instructions only (M587/M588 are blocked over WebSocket, and
  // happen in the plotter's setup mode over a raw connection). Build the two
  // terminal commands from the typed network name and password.
  const clean = (s) => s.replace(/["\0\r\n]/g, ''); // keep the quoted command well-formed
  function updateWifiCmds() {
    $('#cmd-connect').value = 'nc 192.168.4.1 1337';
    const ssid = clean($('#ssid').value.trim());
    const pw = clean($('#wifi-pw').value);
    const s = ssid || 'myNetwork';
    $('#cmd-wifi').value = pw ? `M587 S"${s}" P"${pw}"` : `M587 S"${s}"`;
  }
  $('#ssid').addEventListener('input', updateWifiCmds);
  $('#wifi-pw').addEventListener('input', updateWifiCmds);
  updateWifiCmds();

  for (const btn of $$('.copy')) {
    btn.addEventListener('click', async () => {
      const input = $(`#${btn.dataset.copy}`);
      let ok = false;
      try {
        await navigator.clipboard.writeText(input.value);
        ok = true;
      } catch {
        input.focus();
        input.select();
        try {
          ok = document.execCommand('copy');
        } catch {}
      }
      const was = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Press ⌘/Ctrl-C';
      if (!ok) {
        input.focus();
        input.select();
      }
      setTimeout(() => (btn.textContent = was), 1500);
    });
  }
  $('#rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    guarded(async () => {
      const name = $('#new-name').value.trim();
      await ctl.command('rename', { name });
      logLine(`Renamed. Restart the plotter, then reconnect to "${name}.local" in the address box at the top.`, 'warn');
    });
  });
  $('#raw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    guarded(async () => {
      await ctl.command('raw', { gcode: $('#raw').value });
      $('#raw').value = '';
    });
  });

  // ------------------------------------------------------- pen-height wizard

  const cornerInput = (i) => $(`.corner[data-corner="${i}"] input`);

  for (const b of $$('[data-ph]')) {
    b.addEventListener('click', () =>
      guarded(async () => {
        const action = b.dataset.ph;
        const opts = {};
        if (action === 'save') opts.values = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1000, Math.round(Number(cornerInput(i).value) || 0))));
        const r = await ctl.penHeight(action, opts);
        if (r.unsupported) logLine(r.message, 'warn');
        if (r.values) r.values.forEach((v, i) => (cornerInput(i).value = v));
        if (r.saved) logLine(`Saved pen-height map: ${r.saved.join(', ')}`);
      }),
    );
  }
  for (const el of $$('.corner')) {
    const corner = Number(el.dataset.corner);
    el.querySelector('button').addEventListener('click', () =>
      guarded(async () => {
        if (S.phCorner === corner) {
          const r = await ctl.penHeight('stop');
          cornerInput(corner).value = r.z;
        } else {
          S.phCorner = corner;
          syncUI();
          try {
            await ctl.penHeight('start', { corner });
          } catch (err) {
            S.phCorner = null;
            syncUI();
            throw err;
          }
        }
      }),
    );
  }

  // ----------------------------------------------------------------- events

  plotter.on('status', (reason) => {
    if (!plotter.connected && reason) logLine(`Line-us ${reason}`, 'warn');
    update(false);
  });
  ctl.on('log', ({ text, kind }) => logLine(text, kind));
  ctl.on('job', (job) => {
    S.job = job;
    updateWakeLock();
    update(false);
  });
  ctl.on('penheight', ({ corner, z, running, bottomed }) => {
    cornerInput(corner).value = z;
    if (!running) {
      S.phCorner = null;
      if (bottomed) logLine('The pen reached the bottom without you pressing Stop. Loosen the pen, lower it, and try again.', 'warn');
    }
    syncUI();
  });

  // ---------------------------------------------- restore per-viewer settings

  const savedHost = store.get('lineus-host');
  if (savedHost) $('#host').value = savedHost;
  const savedTarget = store.get('lineus-target');
  if (savedTarget) {
    const r = document.querySelector(`input[name="target"][value="${savedTarget === 'sim' ? 'sim' : 'real'}"]`);
    r.checked = true;
  }
  const savedSpeed = store.get('lineus-sim-speed');
  if (savedSpeed && [...$('#sim-speed').options].some((o) => o.value === savedSpeed)) {
    $('#sim-speed').value = savedSpeed;
    sim.timeScale = Number(savedSpeed);
  }
  const savedDepth = Number(store.get('lineus-depth'));
  if (Number.isInteger(savedDepth) && savedDepth >= 1) $('#depth').value = String(savedDepth);
  $('#depth').addEventListener('change', () => store.set('lineus-depth', $('#depth').value));

  window.addEventListener('resize', resize);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  resize();
  syncUI();
})(window.LU);
