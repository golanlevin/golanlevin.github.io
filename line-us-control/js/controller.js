// Plot jobs, the pen-height wizard, and one-off machine commands.
// Emits: 'log' {text, kind}, 'job' (job object), 'penheight' {corner, z, running, bottomed}

(function (LU) {
  'use strict';

  const { HOME, PEN_UP, PEN_DOWN } = LU;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Pen-height corners, in the order the Z-map stores them (same as the
  // official app): top-left, top-right, bottom-right, bottom-left.
  const CORNERS = [[700, 900], [1600, 900], [1600, -900], [700, -900]];
  const PARK = 'G40 KXY X1400 Y0';
  const JOG_LIMIT = 200;

  function safeArg(s, what, max = 64) {
    if (typeof s !== 'string' || s.length < 1 || s.length > max || /["\0\r\n]/.test(s)) {
      throw new Error(`${what} must be 1-${max} characters with no quotes or line breaks`);
    }
    return s;
  }

  class Controller extends LU.Emitter {
    constructor(plotter) {
      super();
      this.plotter = plotter;
      this.job = { state: 'idle', done: 0, total: 0, error: null, startedAt: 0, pos: null };
      this.jobCtl = null;
      this.lastPush = 0;
      this.ph = { corner: null, z: PEN_UP, stop: false, promise: null, bottomed: false };
      this.jog = { x: HOME.x, y: HOME.y };
      plotter.on('unsolicited', (line) => this.log(`← ${line}`));
    }

    log(text, kind = 'info') {
      this.emit('log', { text, kind });
    }

    get busy() {
      return this.jobCtl !== null || this.ph.promise !== null;
    }
    get jobActive() {
      return this.jobCtl !== null;
    }

    requireConnected() {
      if (!this.plotter.connected) throw new Error('Not connected to Line-us');
    }
    requireIdle() {
      this.requireConnected();
      if (this.busy) throw new Error('Line-us is busy (plotting or calibrating)');
    }

    // Send a command on behalf of the UI, logging it and its reply.
    async talk(cmd, { requireOk = true, logAs = cmd } = {}) {
      this.log(`→ ${logAs}`);
      const reply = await this.plotter.send(cmd);
      const good = /^ok/i.test(reply);
      this.log(`← ${reply}`, good ? 'info' : 'warn');
      if (requireOk && !good) throw new Error(`Line-us replied: ${reply}`);
      return reply;
    }

    // ------------------------------------------------------------- plotting

    pushJob(force = false) {
      const now = Date.now();
      if (force || now - this.lastPush > 100) {
        this.lastPush = now;
        this.emit('job', this.job);
      }
    }

    // Points are [x, y] (pen down at Z0) or [x, y, z] (continuous pen
    // height, G-code only). Where Z changes along a segment, the segment is
    // split into short steps with in-between heights, so the pressure ramps
    // smoothly instead of jumping at the end of the move.
    // upZ: pen-up (travel) height; 1000 unless a pressure G-code sets it lower.
    static buildPlot(polylines, upZ = PEN_UP) {
      const RAMP_XY = 20; // max step length on a ramp (1 mm)
      const RAMP_Z = 10; // max Z change per step
      const cmds = [];
      let last = null;
      const g = (x, y, z) => {
        x = Math.round(x);
        y = Math.round(y);
        z = Math.round(z);
        if (last && last.x === x && last.y === y && last.z === z) return;
        last = { text: `G01 X${x} Y${y} Z${z}`, x, y, z };
        cmds.push(last);
      };
      for (const pl of polylines) {
        if (!pl.length) continue;
        const zOf = (p) => (p.length > 2 ? p[2] : PEN_DOWN);
        const [sx, sy] = pl[0];
        g(sx, sy, upZ); // travel to the start, pen up
        g(sx, sy, zOf(pl[0])); // pen drops in place at the start
        for (let i = 1; i < pl.length; i++) {
          const [ax, ay] = pl[i - 1];
          const [bx, by] = pl[i];
          const az = zOf(pl[i - 1]);
          const bz = zOf(pl[i]);
          const n = az === bz ? 1 : Math.min(500, Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / RAMP_XY), Math.ceil(Math.abs(bz - az) / RAMP_Z)));
          for (let j = 1; j <= n; j++) {
            const t = j / n;
            g(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
          }
        }
        g(last.x, last.y, upZ); // lift in place
      }
      cmds.push({ text: 'G28', x: HOME.x, y: HOME.y, z: PEN_UP });
      return cmds;
    }

    // depth: 'auto' (3 on firmware 3.0.0+, else 1) or 1-4.
    plot(polylines, depthSetting = 'auto', upZ = PEN_UP) {
      if (!(upZ >= 0 && upZ <= PEN_UP)) throw new Error('The pen-up height must be between 0 and 1000');
      this.requireIdle();
      if (!Array.isArray(polylines) || !polylines.length) throw new Error('Nothing to plot');
      let outside = 0;
      for (const pl of polylines) {
        for (const p of pl) {
          if (!LU.insideArea(p[0], p[1])) outside++;
          if (p.length > 2 && !(p[2] >= 0 && p[2] <= PEN_UP)) throw new Error('Pen heights must be between 0 and 1000');
          if (p.length > 2 && p[2] >= upZ) throw new Error(`The pen-up height (${upZ}) must be higher than the drawing heights, or the pen would drag between lines`);
        }
      }
      if (outside) throw new Error(`${outside} points are outside the drawing area`);
      const depth = depthSetting === 'auto' ? (this.plotter.supportsBuffering ? 3 : 1) : Number(depthSetting);
      if (![1, 2, 3, 4].includes(depth)) throw new Error('Commands in flight must be auto or 1-4');
      this.runJob(Controller.buildPlot(polylines, upZ), depth, upZ);
    }

    pause() {
      if (this.jobCtl) this.jobCtl.paused = true;
    }
    resume() {
      if (this.jobCtl) this.jobCtl.paused = false;
    }
    stop() {
      if (this.jobCtl) this.jobCtl.stop = true;
    }

    // Keeps `depth` commands in flight so the plotter's buffer never runs dry.
    // Before pausing or stopping, the window is drained so we know exactly
    // where the pen is.
    async runJob(cmds, depth, upZ = PEN_UP) {
      const p = this.plotter;
      const job = this.job;
      this.jobCtl = { paused: false, stop: false };
      const ctl = this.jobCtl;
      Object.assign(job, { state: 'running', done: 0, total: cmds.length, error: null, startedAt: Date.now(), depth, pos: null });
      this.pushJob(true);
      this.log(`Plotting: ${cmds.length} commands, ${depth} in flight`);
      p.depth = depth;
      const window = [];
      const drain = async () => {
        while (window.length) await window.shift();
      };
      let last = null;
      try {
        for (let i = 0; i < cmds.length; i++) {
          if (ctl.paused && !ctl.stop) {
            await drain();
            if (last && last.z < upZ) await p.ok(`G01 X${last.x} Y${last.y} Z${upZ}`);
            job.state = 'paused';
            this.pushJob(true);
            while (ctl.paused && !ctl.stop) await sleep(100);
            if (!ctl.stop) {
              job.state = 'running';
              this.pushJob(true);
              if (last && last.z < upZ) await p.ok(`G01 X${last.x} Y${last.y} Z${last.z}`);
            }
          }
          if (ctl.stop) break;
          const c = cmds[i];
          const pr = p.ok(c.text).then(() => {
            job.done++;
            job.pos = { x: c.x, y: c.y, z: c.z };
            this.pushJob();
          });
          pr.catch(() => {}); // handled when this entry is awaited
          window.push(pr);
          last = c;
          if (window.length >= depth) await window.shift();
        }
        await drain();
        if (ctl.stop) {
          job.state = 'stopping';
          this.pushJob(true);
          await p.ok(`G01 Z${PEN_UP}`);
          await p.ok('G28');
          job.state = 'stopped';
          this.log('Plot stopped');
        } else {
          job.state = 'done';
          this.log(`Plot finished in ${Math.round((Date.now() - job.startedAt) / 1000)} s`);
        }
      } catch (err) {
        job.state = 'error';
        job.error = err.message;
        this.log(`Plot failed: ${err.message}`, 'error');
        await Promise.allSettled(window);
      }
      p.depth = 1;
      this.jobCtl = null;
      this.pushJob(true);
    }

    // ------------------------------------------------ pen-height wizard
    // Same procedure as the official app (view/penHeightSettings_3.as): at
    // each corner the pen steps down 10 units per reply, drawing a short dash,
    // until the user sees ink and presses Stop. "G40 KXY" applies the XY
    // calibration but not the stored Z-map, so the readings are raw.

    async penHeightLoop(corner) {
      const p = this.plotter;
      const ph = this.ph;
      const [cx, cy] = CORNERS[corner];
      Object.assign(ph, { corner, z: PEN_UP, stop: false, bottomed: false, x: cx, y: cy });
      await p.ok(`G40 KXY X${cx} Y${cy} Z${PEN_UP}`);
      for (let i = 1; !ph.stop; i++) {
        ph.z -= 10;
        if (ph.z < 0) {
          ph.z = 0;
          ph.bottomed = true;
          break;
        }
        const y = i % 2 === 1 ? cy : cy - 100;
        this.emit('penheight', { corner, z: ph.z, running: true });
        await p.ok(`G40 KXY X${cx} Y${y} Z${ph.z}`);
        ph.y = y;
      }
    }

    // Lift in place first, then travel to the park position, so the pen
    // never drags across the paper whatever the firmware does with Z.
    async parkFromCorner() {
      const ph = this.ph;
      if (ph.x !== undefined) await this.plotter.ok(`G40 KXY X${ph.x} Y${ph.y} Z${PEN_UP}`);
      await this.plotter.ok(`${PARK} Z${PEN_UP}`);
    }

    async penHeight(action, opts = {}) {
      this.requireConnected();
      if (this.jobCtl) throw new Error('A plot is running');
      const ph = this.ph;
      if (ph.promise && action !== 'stop') throw new Error('Stop the current corner first');
      switch (action) {
        case 'prepare': {
          await this.talk(`${PARK} Z${PEN_UP}`);
          const reply = await this.talk('G31', { requireOk: false });
          if (/^error/i.test(reply)) return { unsupported: true, message: 'This firmware does not support pen-height mapping (G31).' };
          const m = reply.match(/(-?\d+);(-?\d+);(-?\d+);(-?\d+)/);
          return { values: m ? m.slice(1, 5).map(Number) : [0, 0, 0, 0] };
        }
        case 'seat':
          await this.talk(`${PARK} Z400`);
          return {};
        case 'raise':
          await this.talk(`${PARK} Z${PEN_UP}`);
          return {};
        case 'start': {
          const corner = Number(opts.corner);
          if (![0, 1, 2, 3].includes(corner)) throw new Error('corner must be 0-3');
          this.log(`Pen height: stepping down at corner ${corner + 1}`);
          ph.promise = this.penHeightLoop(corner)
            .catch((err) => this.log(`Pen height failed: ${err.message}`, 'error'))
            .finally(async () => {
              ph.promise = null;
              await this.parkFromCorner().catch(() => {});
              this.emit('penheight', { corner: ph.corner, z: ph.z, running: false, bottomed: ph.bottomed });
            });
          return {};
        }
        case 'stop':
          ph.stop = true;
          if (ph.promise) await ph.promise;
          return { corner: ph.corner, z: ph.z };
        case 'save': {
          const vals = opts.values;
          if (!Array.isArray(vals) || vals.length !== 4 || !vals.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000)) {
            throw new Error('Pen heights must be four whole numbers from 0 to 1000');
          }
          const lowest = Math.min(...vals);
          const norm = vals.map((v) => v - lowest);
          await this.talk(`G31 S${norm.join(';')}`);
          await this.talk(`${PARK} Z${PEN_UP}`);
          return { saved: norm };
        }
        case 'clear':
          await this.talk('G31 Sclear');
          return {};
        default:
          throw new Error('Unknown pen-height action');
      }
    }

    // --------------------------------------------------- one-off commands

    async command(action, opts = {}) {
      this.requireIdle();
      const jog = this.jog;
      switch (action) {
        case 'penUp':
          return { reply: await this.talk(`G01 X1400 Y0 Z${PEN_UP}`) };
        case 'penDown':
          return { reply: await this.talk(`G01 X1400 Y0 Z${PEN_DOWN}`) };
        case 'home':
          return { reply: await this.talk('G28') };
        case 'jogHome':
          jog.x = HOME.x;
          jog.y = HOME.y;
          return { reply: await this.talk(`G01 X${jog.x} Y${jog.y} Z${PEN_UP}`), jog };
        case 'jog': {
          const dx = Math.sign(Number(opts.dx) || 0) * 15;
          const dy = Math.sign(Number(opts.dy) || 0) * 15;
          jog.x = Math.max(HOME.x - JOG_LIMIT, Math.min(HOME.x + JOG_LIMIT, jog.x + dx));
          jog.y = Math.max(HOME.y - JOG_LIMIT, Math.min(HOME.y + JOG_LIMIT, jog.y + dy));
          return { reply: await this.talk(`G01 X${jog.x} Y${jog.y} Z${PEN_UP}`), jog };
        }
        case 'saveHome':
          return { reply: await this.talk('M374') };
        case 'clearHome':
          return { reply: await this.talk('M374 Sclear') };
        case 'info':
          return { reply: await this.talk('M122', { requireOk: false }) };
        case 'caps':
          return { reply: await this.talk('M115', { requireOk: false }) };
        case 'wifiList':
          return { reply: await this.talk('M587', { requireOk: false }) };
        case 'wifiAdd': {
          const ssid = safeArg(opts.ssid, 'Network name');
          const pw = opts.password ? safeArg(opts.password, 'Password') : '';
          const cmd = pw ? `M587 S"${ssid}" P"${pw}"` : `M587 S"${ssid}"`;
          return { reply: await this.talk(cmd, { requireOk: false, logAs: `M587 S"${ssid}"${pw ? ' P"••••"' : ''}` }) };
        }
        case 'wifiForget':
          return { reply: await this.talk(`M588 S"${safeArg(opts.ssid, 'Network name')}"`, { requireOk: false }) };
        case 'rename': {
          const name = String(opts.name || '');
          if (!/^[A-Za-z0-9-]{1,32}$/.test(name)) throw new Error('Name may use letters, digits and hyphens only');
          return { reply: await this.talk(`M550 P${name}`, { requireOk: false }) };
        }
        case 'raw': {
          const g = String(opts.gcode || '').trim();
          if (!g || /[\0\r\n]/.test(g) || g.length > 200) throw new Error('One command per line, max 200 characters');
          return { reply: await this.talk(g, { requireOk: false }) };
        }
        default:
          throw new Error('Unknown command');
      }
    }
  }

  Object.assign(LU, { Controller });
})((window.LU = window.LU || {}));
