// TCP connection to a Line-us plotter (port 1337).
//
// Wire format, confirmed from the official Line-us G-code spec and its
// reference clients: every command is sent as text followed by a NUL
// byte, and every reply ends with a NUL byte. On connect the plotter sends a
// greeting such as "hello VERSION:3.0.0 NAME:line-us SERIAL:123456".
//
// Replies arrive in order, and a move's reply comes when the move FINISHES.
// Firmware 3.0.0+ can buffer a few commands, so keeping several in flight
// avoids a stop at every vertex (per the @beardicus/line-us library, which
// uses 3). Older firmware must get one command at a time. `depth` sets how
// many commands may be in flight; it defaults to 1.

import net from 'node:net';
import { EventEmitter } from 'node:events';

const PORT = 1337;
const HEARTBEAT_MS = 5000;

export function parseFields(line) {
  const fields = {};
  for (const m of line.matchAll(/(\w+):("[^"]*"|\S+)/g)) {
    fields[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return fields;
}

// Version strings like "3.1.1" -> [3,1,1] for comparison.
export function firmwareAtLeast(version, major) {
  const m = /^(\d+)/.exec(version || '');
  return m ? Number(m[1]) >= major : false;
}

export class LineUs extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.helloWaiter = null;
    this.inflight = []; // commands written, awaiting replies (FIFO)
    this.waiting = []; // commands not yet written
    this.depth = 1;
    this.host = null;
    this.hello = null;
    this.lastIO = 0;
    this.heartbeat = setInterval(() => this._beat(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  get connected() {
    return this.sock !== null && this.hello !== null;
  }

  get idle() {
    return this.inflight.length === 0 && this.waiting.length === 0;
  }

  // Firmware 3.0.0+ buffers commands; older firmware needs one at a time.
  get supportsBuffering() {
    return firmwareAtLeast(this.hello?.VERSION, 3);
  }

  info() {
    return { connected: this.connected, host: this.host, hello: this.hello, buffering: this.connected && this.supportsBuffering };
  }

  connect(host, timeoutMs = 8000) {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host, port: PORT });
      sock.setNoDelay(true);
      this.sock = sock;
      this.host = host;
      this.buf = Buffer.alloc(0);

      let settled = false;
      const timer = setTimeout(
        () => fail(new Error(`No answer from ${host} within ${timeoutMs / 1000} s`)),
        timeoutMs,
      );
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.helloWaiter = null;
        this.disconnect();
        reject(err);
      };

      // The first thing the plotter sends is its greeting.
      this.helloWaiter = (line) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.hello = { raw: line, ...parseFields(line) };
        this.lastIO = Date.now();
        this.emit('status');
        resolve(this.hello);
      };

      sock.on('data', (chunk) => this._onData(chunk));
      sock.on('error', (err) => {
        if (!settled) fail(err);
        else this._drop(err.message);
      });
      sock.on('close', () => {
        if (!settled) fail(new Error(`${host} closed the connection`));
        else if (this.sock === sock) this._drop('connection closed');
      });
    });
  }

  disconnect() {
    if (!this.sock) return;
    const sock = this.sock;
    this.sock = null;
    sock.destroy();
    this._drop('disconnected');
  }

  _drop(reason) {
    if (this.sock) {
      this.sock.destroy();
      this.sock = null;
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

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    let idx;
    while ((idx = this.buf.indexOf(0)) !== -1) {
      const line = this.buf.subarray(0, idx).toString('utf8').trim();
      this.buf = this.buf.subarray(idx + 1);
      if (this.helloWaiter) {
        const w = this.helloWaiter;
        this.helloWaiter = null;
        w(line);
        continue;
      }
      const item = this.inflight.shift();
      if (item) {
        clearTimeout(item.timer);
        this.lastIO = Date.now();
        item.resolve(line);
      } else if (line) {
        this.emit('unsolicited', line);
      }
    }
    this._pump();
  }

  _pump() {
    while (this.connected && this.inflight.length < this.depth && this.waiting.length) {
      const item = this.waiting.shift();
      item.timer = setTimeout(() => {
        this._drop(`timed out waiting for a reply to "${item.cmd}"`);
      }, item.timeoutMs);
      this.inflight.push(item);
      this.sock.write(item.cmd + '\0');
    }
  }

  // Send one command; resolves with the raw reply line. Replies are matched
  // to commands in order. At most `depth` commands are in flight at once.
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

  // The official app polls M114 when idle. We do the same, less often, so a
  // dropped connection is noticed even when nothing is being plotted.
  _beat() {
    if (this.connected && this.idle && Date.now() - this.lastIO > HEARTBEAT_MS) {
      this.send('M114', 8000).catch(() => {});
    }
  }
}
