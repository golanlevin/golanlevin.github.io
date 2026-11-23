// Plotter connection: a command queue over a pluggable "link".
//
//   WsLink   - a real Line-us over its WebSocket interface (ws://<name>.local)
//   SimLink  - the virtual plotter (see Simulator below)
//
// Both deliver the greeting ("hello VERSION:... NAME:... SERIAL:...") first,
// then one reply per command, in order. A move's reply comes when the move
// FINISHES. Firmware 3.0.0+ buffers commands, so several may be in flight
// (`depth`); older firmware needs one at a time.

(function (LU) {
  'use strict';

  const HEARTBEAT_MS = 5000;

  function parseFields(line) {
    const fields = {};
    for (const m of line.matchAll(/(\w+):("[^"]*"|\S+)/g)) fields[m[1]] = m[2].replace(/^"|"$/g, '');
    return fields;
  }

  function firmwareAtLeast(version, major) {
    const m = /^(\d+)/.exec(version || '');
    return m ? Number(m[1]) >= major : false;
  }

  // Tiny event emitter.
  class Emitter {
    constructor() {
      this._handlers = {};
    }
    on(type, fn) {
      (this._handlers[type] ||= []).push(fn);
      return this;
    }
    emit(type, ...args) {
      for (const fn of this._handlers[type] || []) fn(...args);
    }
  }

  // ------------------------------------------------------------ WebSocket link

  class WsLink {
    constructor(host) {
      this.host = host;
      this.label = host;
      this.ws = null;
    }

    open(onLine, onClose) {
      return new Promise((resolve, reject) => {
        let ws;
        try {
          ws = new WebSocket(`ws://${this.host}/`);
        } catch {
          reject(new Error(`"${this.host}" is not a valid address`));
          return;
        }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        let opened = false;
        const decoder = new TextDecoder();
        ws.onopen = () => {
          opened = true;
          resolve();
        };
        ws.onmessage = (e) => {
          const text = typeof e.data === 'string' ? e.data : decoder.decode(e.data);
          // Tolerate NUL terminators, in case the firmware adds them here too.
          for (const part of text.split('\0')) {
            const line = part.trim();
            if (line) onLine(line);
          }
        };
        ws.onerror = () => {
          if (!opened) reject(new Error(`Could not reach a Line-us at ${this.host}`));
        };
        ws.onclose = () => {
          if (opened) onClose('connection closed');
          else reject(new Error(`Could not reach a Line-us at ${this.host}`));
        };
      });
    }

    write(cmd) {
      this.ws.send(cmd);
    }

    close() {
      if (!this.ws) return;
      this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  // ---------------------------------------------------------------- Plotter

  class Plotter extends Emitter {
    constructor() {
      super();
      this.link = null;
      this.hello = null;
      this.helloWaiter = null;
      this.inflight = [];
      this.waiting = [];
      this.depth = 1;
      this.lastIO = 0;
      setInterval(() => this._beat(), HEARTBEAT_MS);
    }

    get connected() {
      return this.link !== null && this.hello !== null;
    }
    get idle() {
      return this.inflight.length === 0 && this.waiting.length === 0;
    }
    get supportsBuffering() {
      return firmwareAtLeast(this.hello && this.hello.VERSION, 3);
    }
    get simulated() {
      return this.link instanceof LU.SimLink;
    }

    connect(link, timeoutMs = 8000) {
      this.disconnect();
      this.link = link;
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.helloWaiter = null;
          if (this.link === link) {
            link.close();
            this.link = null;
          }
          reject(err);
        };
        const timer = setTimeout(() => fail(new Error(`No answer from ${link.label} within ${timeoutMs / 1000} s`)), timeoutMs);
        this.helloWaiter = (line) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.hello = { raw: line, ...parseFields(line) };
          this.lastIO = Date.now();
          this.emit('status');
          resolve(this.hello);
        };
        link
          .open(
            (line) => this._onLine(line),
            (reason) => (settled ? this._drop(reason) : fail(new Error(reason))),
          )
          .catch(fail);
      });
    }

    disconnect() {
      if (this.link) this._drop('disconnected');
    }

    _drop(reason) {
      if (this.link) {
        this.link.close();
        this.link = null;
      }
      const wasConnected = this.hello !== null;
      this.hello = null;
      const err = new Error(`Line-us ${reason}`);
      for (const item of [...this.inflight, ...this.waiting]) {
        clearTimeout(item.timer);
        item.reject(err);
      }
      this.inflight = [];
      this.waiting = [];
      if (wasConnected) this.emit('status', reason);
    }

    _onLine(line) {
      if (this.helloWaiter) {
        const w = this.helloWaiter;
        this.helloWaiter = null;
        w(line);
        return;
      }
      const item = this.inflight.shift();
      if (item) {
        clearTimeout(item.timer);
        this.lastIO = Date.now();
        item.resolve(line);
      } else {
        this.emit('unsolicited', line);
      }
      this._pump();
    }

    _pump() {
      while (this.connected && this.inflight.length < this.depth && this.waiting.length) {
        const item = this.waiting.shift();
        item.timer = setTimeout(() => this._drop(`timed out waiting for a reply to "${item.cmd}"`), item.timeoutMs);
        this.inflight.push(item);
        this.link.write(item.cmd);
      }
    }

    // Send one command; resolves with the raw reply line.
    send(cmd, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        if (!this.connected) return reject(new Error('Not connected to Line-us'));
        this.waiting.push({ cmd, resolve, reject, timeoutMs, timer: null });
        this._pump();
      });
    }

    // Like send(), but throws unless the plotter answers "ok...".
    async ok(cmd, timeoutMs) {
      const reply = await this.send(cmd, timeoutMs);
      if (!/^ok/i.test(reply)) throw new Error(`Line-us rejected "${cmd}": ${reply}`);
      return reply;
    }

    // Poll M114 when idle (as the official app does) so a dropped
    // connection is noticed even when nothing is being plotted.
    _beat() {
      if (this.connected && this.idle && Date.now() - this.lastIO > HEARTBEAT_MS) {
        this.send('M114', 8000).catch(() => {});
      }
    }
  }

  // ------------------------------------------------------- virtual plotter
  //
  // Behaves like a Line-us as far as this app can tell: same greeting and
  // reply style, a command buffer, moves that take real time, and replies
  // sent when each move finishes. It draws "ink" so you can see the result.
  //
  // Modelled quirks and assumptions (not measured on hardware):
  //  - In "G01 X Y Z", lowering the pen happens at the END of the move (as
  //    documented by @beardicus/line-us), while lifting happens at the start
  //    (beardicus relies on Z1000 inside travel moves). So a move leaves ink
  //    only if the pen is touching at its start and isn't being lifted.
  //  - The pen touches the paper at a Z height that varies across the page
  //    (hidden per-corner values), so the pen-height wizard is testable.
  //  - Speed: about 30 mm/s plus 150 ms per pen lift/drop. A guess.

  const SPEED = 600; // machine units per second (30 mm/s)
  const Z_TIME = 150; // ms for a pen height change
  const OVERHEAD = 10; // ms per command
  const TOUCH = { tl: 420, tr: 360, br: 310, bl: 380 }; // Z where the pen meets the paper

  class Simulator extends Emitter {
    constructor() {
      super();
      this.timeScale = 4;
      this.pos = { x: 1000, y: 1000, z: 1000 };
      this.ink = []; // [x1, y1, x2, y2, depth] segments (a dot when both ends match); depth = how far below the paper surface the pen is pushed
      this.zmap = [0, 300, 490, 250];
      this.networks = ['SchoolWiFi'];
      this.name = 'virtual-line-us';
      this.firmware = '3.1.1';
    }

    // Z at which the pen touches the paper at (x, y): bilinear across the
    // four calibration corners (700..1600, -900..900).
    touchZ(x, y) {
      const u = Math.min(1, Math.max(0, (x - 700) / 900));
      const v = Math.min(1, Math.max(0, (900 - y) / 1800));
      const top = TOUCH.tl + (TOUCH.tr - TOUCH.tl) * u;
      const bottom = TOUCH.bl + (TOUCH.br - TOUCH.bl) * u;
      return top + (bottom - top) * v;
    }
    touching(p) {
      return p.z <= this.touchZ(p.x, p.y);
    }

    clearInk() {
      this.ink = [];
      this.emit('change');
    }

    // Work out the reply, the duration, and the state change for a command.
    plan(cmd) {
      const text = cmd.trim();
      const code = (text.split(/\s+/)[0] || '').toUpperCase();
      const num = (letter) => {
        const m = new RegExp(`(?:^|\\s)${letter}(-?\\d+(?:\\.\\d+)?)(?=\\s|$)`, 'i').exec(text);
        return m ? Number(m[1]) : undefined;
      };
      const quoted = (letter) => {
        const m = new RegExp(`(?:^|\\s)${letter}"([^"]*)"`, 'i').exec(text);
        return m ? m[1] : undefined;
      };
      const posReply = (p) => `ok X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`;

      const move = (target) => {
        const from = { ...this.pos };
        const dist = Math.hypot(target.x - from.x, target.y - from.y);
        const dur = (dist / SPEED) * 1000 + (target.z !== from.z ? Z_TIME : 0) + OVERHEAD;
        return {
          dur,
          reply: posReply(target),
          apply: () => {
            // A lift happens at the start of the move, a drop at the end.
            const wasTouching = this.touching({ ...from, z: Math.max(from.z, target.z) });
            const depth = (p) => this.touchZ(p.x, p.y) - p.z;
            if (wasTouching && dist > 0) this.ink.push([from.x, from.y, target.x, target.y, depth(from)]);
            this.pos = { ...target };
            if (!wasTouching && this.touching(this.pos)) this.ink.push([target.x, target.y, target.x, target.y, depth(this.pos)]);
            if (!LU.insideArea(target.x, target.y)) this.emit('warn', `move to X${target.x} Y${target.y} is outside the drawing area`);
            this.emit('change');
          },
        };
      };

      switch (code) {
        case 'G01':
        case 'G40': {
          const t = { x: num('X') ?? this.pos.x, y: num('Y') ?? this.pos.y, z: num('Z') ?? this.pos.z };
          if (![t.x, t.y, t.z].every(Number.isFinite)) return { dur: 1, reply: 'error INFO:"Bad coordinates"' };
          t.z = Math.min(1000, Math.max(0, t.z));
          return move(t);
        }
        case 'G28':
          return move({ x: 1000, y: 1000, z: 1000 });
        case 'M114':
          return { dur: 2, reply: posReply(this.pos) };
        case 'G31': {
          if (/S\s*clear/i.test(text)) {
            this.zmap = [0, 0, 0, 0];
            return { dur: 5, reply: 'ok' };
          }
          const m = /S(-?\d+);(-?\d+);(-?\d+);(-?\d+)/i.exec(text);
          if (m) {
            this.zmap = m.slice(1, 5).map(Number);
            return { dur: 5, reply: 'ok' };
          }
          if (/\sS/i.test(text)) return { dur: 2, reply: 'error INFO:"Bad Z-map"' };
          return { dur: 2, reply: `ok ZMAP:${this.zmap.join(';')}` };
        }
        case 'M374':
          return { dur: 5, reply: 'ok' };
        case 'M587': {
          const ssid = quoted('S');
          if (ssid === undefined) return { dur: 5, reply: `ok NETWORKS:"${this.networks.join(',')}"` };
          if (!this.networks.includes(ssid)) this.networks.push(ssid);
          return { dur: 5, reply: 'ok' };
        }
        case 'M588': {
          const ssid = quoted('S');
          this.networks = this.networks.filter((n) => n !== ssid);
          return { dur: 5, reply: 'ok' };
        }
        case 'M550': {
          const m = /P"?([A-Za-z0-9-]+)"?/i.exec(text);
          if (!m) return { dur: 2, reply: `ok MACHINENAME:${this.name}` };
          this.name = m[1];
          return { dur: 5, reply: 'ok' };
        }
        case 'M115':
          return { dur: 2, reply: `ok CONNECTMODE:SIM MACHINENAME:${this.name}` };
        case 'M122':
          return { dur: 2, reply: `ok INFO:"virtual plotter" FIRMWARE:${this.firmware}` };
        default:
          return { dur: 2, reply: `error INFO:"Unknown command ${code}"` };
      }
    }
  }

  // Zero-delay task scheduling that isn't clamped like setTimeout(0).
  const channel = new MessageChannel();
  const tasks = [];
  channel.port1.onmessage = () => tasks.shift()?.();
  function later(fn, ms) {
    if (ms > 0) return setTimeout(fn, ms);
    tasks.push(fn);
    channel.port2.postMessage(0);
    return null;
  }

  class SimLink {
    constructor(sim) {
      this.sim = sim;
      this.label = 'the virtual plotter';
      this.queue = [];
      this.running = false;
      this.closed = false;
      this.timer = null;
    }

    open(onLine, onClose) {
      this.onLine = onLine;
      this.onClose = onClose;
      later(() => {
        if (!this.closed) onLine(`hello VERSION:${this.sim.firmware} NAME:${this.sim.name} SERIAL:000000`);
      }, 300);
      return Promise.resolve();
    }

    write(cmd) {
      this.queue.push(cmd);
      if (!this.running) this._next();
    }

    _next() {
      if (this.closed) return;
      const cmd = this.queue.shift();
      if (cmd === undefined) {
        this.running = false;
        return;
      }
      this.running = true;
      const step = this.sim.plan(cmd);
      const scale = this.sim.timeScale;
      const ms = scale === Infinity ? 0 : step.dur / scale;
      this.timer = later(() => {
        if (this.closed) return;
        if (step.apply) step.apply();
        this.onLine(step.reply);
        this._next();
      }, ms);
    }

    close() {
      this.closed = true;
      if (this.timer) clearTimeout(this.timer);
      this.queue = [];
    }
  }

  Object.assign(LU, { Plotter, WsLink, SimLink, Simulator, Emitter, parseFields, firmwareAtLeast });
})((window.LU = window.LU || {}));
