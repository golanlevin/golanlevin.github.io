# Line-us app (v3.0.0 build 33): reverse-engineering findings

Source: the official Line-us app, version 3.0.0 build 33 — an Adobe AIR /
ActionScript 3 program (a SWF inside the macOS `.app`, and the same SWF wrapped
by the Windows `.exe`), decompiled with [JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler)
into 336 scripts. The decompiled sources are not included in this repository;
the file names cited below (`networking/Networking.as`, etc.) are references
into that decompiled tree, for provenance.

## Architecture (the parts that matter)

| File | Role |
|---|---|
| `networking/Networking.as` | TCP socket to the plotter, port **1337**. One command in flight at a time. |
| `gcode/Engin.as` | Every command the app can send (full list below). |
| `controller/DrawingController.as` | Plot loop: transforms drawing points to machine coordinates, sends the next point on each `ok`. |
| `view/penHeightSettings_3.as` | Four-corner pen-height (Z-map) calibration wizard. |
| `view/MachineSettingsView.as` | Home-position calibration (jog buttons + M374). |
| `networking/MDNSController.as`, `MdnsLookup.as` | mDNS discovery of `<name>.local`. |
| `binaryData/892_ConfigReader.bin` | Embedded JSON config (default name `line-us`, suffix `.local`). |

Everything else (about 85% of the code) is cloud sketchbooks, login, sharing,
"follow"/streams, galleries, camera tracing, and UI chrome.

## Transport protocol

- Plain TCP, port 1337, host `line-us.local` (or the machine's name + `.local`). In AP/setup mode the app uses a longer timeout (6 s, vs. 4 s).
- The app uses Flash `XMLSocket`, so each command it sends ends with a **NUL byte (`\0`)**. The plotter replies with one line per command; responses are tokenised on spaces/colons, and quoted strings are kept whole.
- On connect the plotter sends a greeting first (`hello ...`). Token 6 of that greeting is the serial number; token 2 is the firmware version.
- **Flow control:** the official app strictly sends one command, waits for the reply, then sends the next. If no reply arrives within 4 s, it treats the plotter as disconnected.
- **Buffering (from the [@beardicus/line-us](https://github.com/beardicus/line-us) library):** a move's reply arrives when the move *finishes*. Firmware **3.0.0+** buffers commands, so several can be in flight; beardicus uses 3. Older firmware needs one at a time.
- **Pen-down quirk (beardicus):** in `G01 X.. Y.. Z0`, the pen only drops at the *end* of the move. Lower the pen with a separate command at the line's start point (lineus-web does this).
- **WebSocket interface (beardicus):** the same commands also work over `ws://<name>.local` (port 80). beardicus sends each command as one WebSocket message with no NUL terminator. The plotter doesn't support `wss://`.
- **Heartbeat:** after 1 s idle the app sends `M114` (get position) to keep the link alive.

## Coordinates

- Machine units, integers only (floats can cause errors). Roughly 20 units/mm.
- Home / neutral: `X1000 Y1000`. Pen up `Z1000`, pen down `Z0`.
- Drawable area is D-shaped, approximately X 650–1775, Y −1000…1000 (see the official Line-us [drawing-area diagram](drawing-area.png)). Calibration corners used by the app: (700, ±900), (1600, ±900).
- Drawing transform in the app: `machine = point * scale + offset` (with Y offset subtracted).
- Points closer than 2 units to the previous pen-down point are skipped (`MinDistToMachineDraw`).
- After a drawing finishes, a timer sends `G01 Z1000` (pen up).

## Command set (from `Engin.as`)

The command strings are exact. Their meanings come from the app's function
names and how it uses them (e.g. `sendStringPosUnMapped` → `G40`). Verify against
the official Line-us G-code docs or the real plotter before relying on edge cases.

### Motion
| Command | Meaning |
|---|---|
| `G01 X.. Y.. Z..` | Move, with the stored calibration/Z-map applied. Main drawing command. |
| `G01 Z1000` / `G01 Z0` | Pen up / pen down. |
| `G28` | Go home. |
| `G40 X.. Y.. Z..` | Move, **unmapped** (calibration not applied). |
| `G40 KXY X.. Y.. Z..` | Move with XY calibration applied but **Z-map not applied**. Used by the pen-height wizard. |
| `M114` | Get current position (also the heartbeat). |

### Calibration
| Command | Meaning |
|---|---|
| `G31` | Read Z-map. Reply token 2 is `a;b;c;d`, or `error` on firmware that's too old. |
| `G31 Sa;b;c;d` | Write Z-map: per-corner pen-height offsets. Default `0;300;490;250`. |
| `G31 Sclear` | Clear Z-map. |
| `M374` | Save home calibration (after jogging the pen over the home hole). |
| `M374 Sclear` | Clear home calibration. |

### Machine / Wi-Fi
| Command | Meaning |
|---|---|
| `M115` | Capabilities. |
| `M122` | Info / diagnostics. |
| `M550 P<name>` | Rename the machine (changes its `.local` name). |
| `M587` | List saved Wi-Fi networks. |
| `M587 S"<ssid>" P"<pw>"` | Add a Wi-Fi network. |
| `M588 S"<ssid>"` | Forget a Wi-Fi network. |
| `M997` | Firmware update (the plotter fetches it itself). |
| `M170` | Returns `INFO`, `NAME`, `CAL`, `ZMAP` fields (used for the genuine-device check). |

### On-device storage / demo / cloud "follow" (probably not worth porting)
`M28 S<n>` / `M29` (record a drawing to slot n / stop), `M30 S<n>` (delete slot),
`M552 S1|S3` (unlock/lock demo mode), `M172 S1` (draw built-in grid),
`M23 S2 [P.. K.. C..]`, `M23 S3`, `M23 S2 Kdefault` (cloud "follow" subscription).

A legacy non-G-code dialect also exists (`1000z;`, `30g;`, `Nx Ny Nz;`), gated by
`UseGcode=false`. The shipped config sets `UseGcode: true`, so it's dead code.

## Calibration flows in detail

### 1. Home calibration (`MachineSettingsView.as`)
- Arrow buttons jog the pen ±15 units per press, limited to ±200 around (1000, 1000), using `G01`.
- The Home button sends `G01 X1000 Y1000 Z1000`.
- Calibrate sends `M374`; clear sends `M374 Sclear`.

### 2. Pen-height wizard (`penHeightSettings_3.as`)
1. Park the pen at `G40 KXY X1400 Y0 Z1000`.
2. "Start": read the existing Z-map (`G31`) and lower the pen to Z400 so the user can seat it.
3. Next: raise to Z1000.
4. For each corner (700,900), (1600,900), (1600,−900), (700,−900): Start/Stop steps Z down from 1000 by 10 per `ok`. Each step alternates between the corner point and (x+0, y−100), drawing a short dash. The user presses Stop when ink appears, and the current Z is recorded for that corner.
5. Save: subtract the lowest of the four values from all of them, send `G31 Sa;b;c;d`, and park the pen.

Simple pen up/down buttons send `G01 X1400 Y0 Z1000` / `Z0`.

## Things the app does that you probably don't want

- **Genuine-device check + telemetry:** after connecting it sends `M170` and verifies an RSA signature of SHA-256(serial) against an embedded public key. It then reports serial, key, firmware, name, CAL and ZMAP to `https://lineusapidev.herokuapp.com` (`machineLog`). It refuses to draw if the check fails. Not needed to drive the plotter.
- Cloud accounts, sketchbooks, sharing, the "drawing of the day" / follow feeds, galleries, camera tracing.
- Vinyl-cutter play modes (`cutter_210`, `cutter_loop_210`).

## Notably absent

**The app cannot import SVG (or any vector file).** The only file-browsing code is
for photos (tracing backgrounds). Drawings exist only as its own internal
`G54 X.. Y.. S..` header + `G01` point lists.

## Cross-check against the official spec (2026-11)

The protocol spec
(`Line-us/Line-us-Programming`, `Documentation/GCodeSpec.md`) and the reference
Python client (`Line-us/LineUsPythonModule`, `lineus/lineus.py`) confirm nearly
everything above. Notable confirmations, corrections and additions:

**Confirmed:** port 1337; `hello VERSION:.. NAME:.. SERIAL:..` greeting (VERSION
is a *quoted* build string with spaces); responses begin `ok`/`error` then
optional `KEY:value` pairs; origin (0,0) at the servo-shaft centre; 100 units ≈
5 mm; home (1000,1000); **Z 0 = pen down, 1000 = up, with Z<500 counted as
down**; the drawing area is non-rectangular and its exact bounds exist only as a
PDF diagram (so our traced polygon remains the best source).

**Framing:** commands may end with any of `\r`, `\n`, `\0` (or a combination);
device replies are terminated `\r\n\0`. Since firmware 3.0.0 the client need not
consume the `\0` before sending the next command (older firmware did).

**Corrections / clarifications:**
- **G40 `K` option:** `G40` is fully uncompensated; `K` *excludes* an axis from
  that, e.g. `G40 Kz` keeps calibrated Z. Our pen-height use of `G40 KXY`
  therefore means "calibrated XY, raw Z" — exactly what the wizard wants.
- **G54** (scale/origin) resets to `X0 Y0 S1` on every new connection. We don't
  use G54; we send absolute coordinates, so this doesn't affect us.
- **M23 button/playback modes:** `S0` = draw from memory (Red mode), `S1` = draw
  from memory (Blue mode), `S2` = follow a sketchbook (`S2 Kdefault` = default
  feed), `S3` = stop following. (Our decompiled notes only had the S2/S3 cloud
  "follow" meaning; S0/S1 are the offline-playback modes.)
- **Default Z-map** per the spec is `0;100;300;200` (the decompiled app used
  `0;300;490;250`). Either way the wizard measures its own values.

**New commands worth knowing:**
- **G94** — drawing speed: `S` = max step size for pen-*down* moves (1–30,
  default 5), `P` = step size for pen-*up* moves (default 15). Resets on restart.
  A possible future tweak for smoothness, separate from our network buffering.
- **M20** — list stored files (`FS:"/0000001.txt-9496;..."`).
- **M39** — storage report (`FSUsed:.. FSTotal:1562625 FSFree:.. FSPercent:..`).
- **M552** — startup/button mode: `S1` default Blue, `S2` Red, `S3` locked Red,
  `S4` Blue with 7-s long-press; `P` sets the Red-mode AP name.
- **M291 S1/S2** — enable/disable wave gestures. **M280** — reverse servo (don't).
- **M171 SCONFIRM** — factory reset (`SSPIFFS` also wipes the filesystem).
- **mDNS** service type is `_lineus._tcp.local.` (the Python client ignores the
  advertised port and always uses 1337).

**IMPORTANT — commands disabled over WebSocket:** the spec states that **M587,
M588, M171 and M170 are disabled over the WebSocket interface** for security
(available only over the raw TCP:1337 interface). This directly affects the
browser-only app's Wi-Fi setup (M587/M588): see additional_information.md.

**Ancient-firmware bug:** firmware ≤ 1.0.1 required x ≥ 700 whenever y < 0;
fixed later. Not worth handling.
