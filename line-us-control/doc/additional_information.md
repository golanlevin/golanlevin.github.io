# Additional information

Technical notes for anyone maintaining or extending Line-us Control. For everyday use, see [`README.md`](../README.md).

## How it works

The app is a single web page that talks to the plotter directly over the plotter's WebSocket interface (`ws://<name>.local`). Each command is a line of G-code text, such as `G01 X1200 Y300 Z0`. The plotter replies `ok …` or `error …`.

- **Greeting:** on connecting, the plotter first sends a greeting such as `hello VERSION:3.1.1 NAME:line-us SERIAL:123456`.
- **Reply timing:** a move's reply arrives when the move *finishes*. Firmware 3.0.0 and later can buffer commands, so the app keeps up to 3 in flight ("Auto"), or 1 on older firmware.
- **Pen timing:** in a combined move like `G01 X Y Z0`, the pen lowers only at the end of the move. The app therefore lowers the pen with a separate command at the start of each line, and lifts it in place before travelling.
- **Coordinates:** 20 machine units per mm. Home is X1000 Y1000; pen up is Z1000 and pen down is Z0. X points away from the robot body, and Y points "up" when the robot is on the left.
- **Drawing area:** the reachable area in `js/area.js` is traced from the official Line-us [drawing-area diagram](drawing-area.png), not measured. Adjust its vertices if your plotter reaches more or less.
- **Line order:** lines are plotted in SVG document order. The app does no travel optimisation; tools like vpype's `linesort` can do that beforehand.
- **Join touching lines:** when ticked, lines whose ends lie within 0.1 mm (2 machine units) of each other are chained into single strokes, reversing pieces where needed, like vpype's `linemerge`. A spatial grid keeps this fast. Joining happens after clipping, so lines cut at the edge of the drawing area aren't rejoined across the gap.
- **G-code import** (`js/gcode.js`):
  - **Moves:** reads `G0`/`G1` moves and `G2`/`G3` arcs (with `I`/`J` or `R`), plus `G20`/`G21` (inches/mm) and `G90`/`G91` (absolute/relative). Comments, feed rates, `$` commands and other codes are ignored.
  - **Pen up/down:** if Z varies, lower Z means pen down (split halfway between the lowest and highest Z). Otherwise `M3`/`M5` switch the pen. Failing both, `G0` is travel and `G1` draws.
  - **Line-us G-code:** files with no unit command whose highest Z is 1000 are treated as Line-us machine coordinates. They keep their exact position at 100% and their Z values as written. Any other G-code is placed and scaled like an SVG.
- **Continuous pen height (G-code only):** each G-code point keeps its Z.
  - **Pen up and down:** the file's highest Z is pen up; anything lower is pen down.
  - **Mapping:** pen-down values are mapped linearly so the file's highest pen-down Z goes to **Lightest stroke** (default Line-us Z400) and its lowest to **Heaviest stroke** (default Z0). Travel and lifts use **Pen up** (default Z1000), which must be higher than every drawing height; the app refuses to plot otherwise. A file with a single pen-down height maps everything to Heaviest and travels at Z1000, which plots exactly like an SVG.
  - **Clipping and joining:** clipping interpolates Z at the cut. Join touching lines only joins ends whose heights match to within 5 units.
  - **Blending:** the evidence suggests the firmware applies a lowered Z at the end of a move, so the app does the blending itself. Wherever Z changes along a segment, it splits the segment into steps of at most 1 mm and 10 Z units, each with an interpolated height. The ramp is therefore smooth whatever the firmware does.
  - **SVGs** are always pen up (Z1000) or pen down (Z0).
- **SVG conversion:** SVGs are converted to polylines by the browser's own geometry engine. It handles paths, arcs, Béziers, basic shapes and nested transforms. Files are stripped of scripts, event handlers and external content first.

A full list of the plotter's commands is in the [Command reference](#command-reference) below; the reverse-engineering write-up of how the official app uses them is in [`findings.md`](findings.md).

### Files

```
index.html          the app
css/style.css
js/area.js          drawing-area outline and constants
js/svg.js           SVG → polylines
js/gcode.js         G-code → polylines
js/plotter.js       command queue, WebSocket link, virtual plotter
js/controller.js    plot jobs, pen-height wizard, machine commands
js/app.js           preview, placement, controls
node-server/        alternative Node.js version (disabled; see below)
```

The scripts are plain `<script>` files rather than ES modules, because browsers won't load modules from a page opened directly from disk.

### The virtual plotter's assumptions

The simulator mimics what the app can observe: the greeting, reply formats, command buffering, and replies arriving when each move finishes. A few details are educated guesses rather than measurements:

- **Speed:** about 30 mm/s, plus 150 ms per pen lift or drop.
- **Pen timing:** lowering takes effect at the end of a move and lifting at the start. This is based on the behaviour the beardicus library documents and relies on.
- **Uneven paper:** the paper surface is modelled with different "touch" heights at each corner (Z310–420), so the pen-height wizard can be rehearsed.
- **Ink width:** the deeper the pen is pushed below the surface, the wider the ink, like a squishy brush pen. The simulator doesn't apply the stored pen-height map to ordinary moves.
- **Invented replies:** replies to Wi-Fi and info commands are invented, because the real formats aren't documented.

### Known limitations and things to verify on hardware

- **Connecting from disk:** a page opened from disk sends `Origin: null` when connecting. If the plotter rejects that, serve the folder with `python3 -m http.server` instead.
- **Commands in flight:** smoothness with 3 commands in flight hasn't been confirmed on a real plotter.
- **Home calibration:** the `M374` flow and the setup-mode address (`192.168.4.1`) are inferred, not confirmed.
- **Secure pages:** the plotter doesn't support secure WebSockets (`wss://`), so the app can't be hosted on an `https://` website. It must be opened from disk or from a plain `http://` local server.
- **Wi-Fi setup is instructions, not a live feature:** the official spec disables `M587`/`M588` (and `M170`/`M171`) over the WebSocket interface, and Wi-Fi is configured in the plotter's setup-mode access point, which realistically only exposes the raw TCP:1337 interface. A browser can't open a raw TCP socket, so the **Wi-Fi setup** section instead builds a `nc 192.168.4.1 1337` + `M587 S"…" P"…"` command for the user to run in a terminal. `M550` (rename), `M122` and `M115` are *not* disabled over WebSocket, so the **Machine** section keeps those as live buttons. The disabled Node server version, which uses TCP:1337, could still send `M587`/`M588` directly if a live Wi-Fi feature is ever wanted.

## Command reference

Every command the Line-us plotter understands, as far as the reverse-engineered app, the official G-code spec (`Line-us/Line-us-Programming`) and the reference Python client reveal. The **App** column shows how this app uses each one: **✓** sent as part of normal use, **log** available only by typing it into the Log box, **term** issued by the user in a terminal (Wi-Fi setup), **—** not used.

Commands are plain text. Each may end with `\r`, `\n`, `\0` or a combination; replies are terminated `\r\n\0` and begin `ok` or `error`, optionally followed by `KEY:value` pairs. Coordinates are integer machine units (20 per mm); home is `X1000 Y1000`, pen up `Z1000`, pen down `Z0`. Several settings (`G54`, `G94`) reset on every connection.

### Motion

| Command | Meaning | App |
|---|---|---|
| `G01 X.. Y.. Z..` | Move, with stored XY calibration and the Z-map applied. The main drawing command. | ✓ |
| `G01 Z1000` / `G01 Z0` | Pen up / pen down (as a Z-only move). | ✓ |
| `G28` | Go home (`X1000 Y1000`, pen up). | ✓ |
| `G40 X.. Y.. Z..` | Move fully **uncompensated** (no XY calibration, no Z-map). | — |
| `G40 K<axis> …` | As `G40`, but `K` keeps compensation on the named axis. The pen-height wizard uses `G40 KXY` (calibrated XY, raw Z). | ✓ |
| `M114` | Get current position. Also sent as a heartbeat after 1 s idle. | ✓ |

### Speed and coordinate frame

| Command | Meaning | App |
|---|---|---|
| `G94 S<n>` | Step size for pen-**down** moves (1–30, default 5). Larger is faster but coarser. Resets on restart. | log |
| `G94 P<n>` | Step size for pen-**up** (travel) moves (default 15). Resets on restart. | log |
| `G54 X.. Y.. S..` | Set drawing origin and scale. Resets to `X0 Y0 S1` on every connection. The app sends absolute coordinates instead. | — |

### Calibration

| Command | Meaning | App |
|---|---|---|
| `G31` | Read the Z-map. Reply token 2 is `a;b;c;d`, or `error` on firmware too old to support it. | ✓ |
| `G31 Sa;b;c;d` | Write the Z-map: per-corner pen-height offsets. | ✓ |
| `G31 Sclear` | Clear the Z-map. | ✓ |
| `M374` | Save home calibration (after jogging the pen over the home hole). | ✓ |
| `M374 Sclear` | Clear home calibration. | ✓ |

#### Where the per-device calibration lives

Each Line-us keeps its calibration as tiny files on its internal flash
filesystem (SPIFFS). These are **hidden from the normal `M20` file list** —
which shows only user drawings — but they appear in the `M122` diagnostics
dump. There are two of them:

- **`/cal`** — the XY calibration written by `M374`. On a real unit it is only
  about **30 bytes**: it holds exactly three comma-separated floats and nothing
  else. The firmware applies it to ordinary ("mapped") moves and `G40` bypasses
  it. Three numbers is a **rigid/affine correction** (an XY offset plus a small
  rotation or skew term), **not** a point-by-point nonlinearity map — there
  simply isn't room in 30 bytes for one, and fine calibration grids still show
  residual "wiggle." The arm's inherent nonlinearity (its two-servo
  shoulder/elbow kinematics) is handled by firmware inverse kinematics that is
  identical on every unit, not by this file. The spec never defines the three
  fields (`M170` is "reserved, not available via WebSocket"), so their exact
  assignment would need the firmware source.
- **`/key`** — about **344 bytes**: the RSA signature used by the official app's
  genuine-device check (see [`findings.md`](findings.md)). Also hidden from `M20`.

The Z-map is **separate** from `/cal`: it is the four corner pen heights set by
`G31` (default `0;100;300;200`), reported as the `ZMap` field.

Real `M122` reply from a device (trimmed), showing both the visibility
difference and the real values:

```
M122 → … FS:"/0000001.txt-76033;/cal-30;/key-344; " Cal:"-10.29633,3.509979,-11.20068" ZMap:"0;260;560;320"
M20  → ok FS:"/0000001.txt-76033;"
```

Here `/0000001.txt` is the built-in demo drawing; `M20` lists only it, while
`M122` also exposes `/cal` and `/key`.

### Machine info and naming

| Command | Meaning | App |
|---|---|---|
| `M115` | Capabilities. | ✓ |
| `M122` | Info / diagnostics. Its `FS:` list reveals the hidden `/cal` and `/key` files (see Calibration). | ✓ |
| `M550 P<name>` | Rename the machine (changes its `.local` name). Not disabled over WebSocket. | ✓ |
| `M997` | Firmware update (the plotter fetches it itself). | — |
| `M170` | Returns `INFO`/`NAME`/`CAL`/`ZMAP` fields, used by the official genuine-device check. **Disabled over WebSocket.** | — |

### Wi-Fi

All of these are **disabled over the WebSocket interface** for security, so the browser app can't send them. The **Wi-Fi setup** section instead has the user run them over raw TCP in a terminal.

| Command | Meaning | App |
|---|---|---|
| `M587` | List saved Wi-Fi networks. | term |
| `M587 S"<ssid>" P"<pw>"` | Add a Wi-Fi network. | term |
| `M588 S"<ssid>"` | Forget a Wi-Fi network. | — |

### On-device storage and playback

Used for offline, computer-free drawing (see the next section). None are disabled over WebSocket.

| Command | Meaning | App |
|---|---|---|
| `M28 S<n>` | Start recording the following moves into file *n* (1–32). | — |
| `M29` | Stop recording. | — |
| `M30 S<n>` | Delete file *n*. Used by **Clear on-board plotter memory**. | ✓ |
| `M20` | List stored files (`FS:"/0000001.txt-9496;..."`). Shows only user drawings; hides the `/cal` and `/key` system files (see Calibration). Used to find which slots to delete. | ✓ |
| `M39` | Storage report (`FSUsed:.. FSTotal:1562625 FSFree:.. FSPercent:..`). | — |
| `M23 S0` / `S1` | Draw from memory: Red mode / Blue mode (the playback command). | — |
| `M23 S2 [Kdefault]` / `S3` | Subscribe to / stop following a cloud sketchbook feed. **Clear on-board plotter memory** sends `M23 S3` so the button stops drawing the cloud "drawing of the day." | ✓ |
| `M552 S1..S4` | Startup/button mode: default Blue / Red / locked Red / Blue with 7-s long-press. | — |

### Other

| Command | Meaning | App |
|---|---|---|
| `M172 S1` | Draw the built-in demo grid. | — |
| `M291 S1` / `S2` | Enable / disable the wave gesture. | — |
| `M280` | Reverse the servo direction. Avoid — it inverts the machine. | — |
| `M171 SCONFIRM` | Factory reset. `SSPIFFS` also wipes the filesystem. **Disabled over WebSocket.** | — |

A legacy non-G-code dialect (`1000z;`, `30g;`, `Nx Ny Nz;`) also exists but is dead code on shipped firmware (`UseGcode: true`). Meanings here come from the app's own usage and the official spec; verify edge cases against your plotter. The fuller write-up, including the calibration flows step by step, is in [`findings.md`](findings.md).

## Future feature: offline drawing (not implemented)

The Line-us firmware can store a drawing in its own memory and draw it later with no computer, network or app. You just power it from any USB source and press its button. The official app called this **"Draw without a network."** This app doesn't implement it yet. These notes are for whoever adds it. Much of this is now confirmed by the official spec (`Line-us/Line-us-Programming`, `Documentation/GCodeSpec.md`); see `findings.md`.

**Evidence**
- The decompiled official app has the recording commands (`saveToMachine`, `stopSaveToMachine`, `deleteSaveMachine`) and a "save to machine" panel, with help text for the save and stop dialogs.
- A plotter's info page (`http://<name>.local/`) lists stored files — for example `Files: /0000001.txt-75991;` (about 76 KB in slot 1), along with `DrawingCounter` and filesystem usage (about 1.5 MB total).

**Protocol** (confirmed by the official spec unless noted)

| Command | Meaning |
|---|---|
| `M28 S<n>` | Start recording into file *n* (1–32); overwrites any existing |
| *(normal `G01` moves)* | The drawing, sent exactly as for a normal plot |
| `M29` | Stop recording |
| `M30 S<n>` | Delete file *n* |
| `M20` | List stored files (`FS:"/0000001.txt-9496;..."`) |
| `M39` | Storage report (`FSUsed:.. FSTotal:1562625 FSFree:.. FSPercent:..`) |
| `M23 S0` / `M23 S1` | Draw from memory: Red mode / Blue mode (this is the playback command) |
| `M552 S1..S4` | Startup/button mode (default Blue / Red / locked Red / Blue + 7-s long-press); sets what the button does on power-up. The old app's "Lock Demo"/"Unlock" buttons were `M552 S3`/`S1`. |

While recording (between `M28` and `M29`) the firmware disables `M374`, `M997`, `M171` and `M30`.

**Playback,** from the official help text: "Connect Line-us to the USB for power. Press the red button. Line-us will draw your selected drawing on its own… the button must be red or flashing red." Red means setup mode: hold the button until it turns red, then press it to draw. Under the hood this is `M23 S0`, and `M552` chooses the startup mode.

**Suggested implementation**
- **Save to plotter** button: `M28 S<n>`, then the same commands `Controller.buildPlot()` produces (minus the final `G28`), then `M29`. It reuses placement, clipping, join and pen pressure unchanged.
- **Manage files:** `M20` to list, `M39` to show free space, `M30 S<n>` to delete. Slots are 1–32.
- Send with 1 command in flight while recording, to be safe.
- **Virtual plotter:** record the commands between `M28` and `M29` and replay them on a "press button" action.
- Note: all of these are TCP:1337 commands. They are *not* among the four disabled over WebSocket (M587/M588/M170/M171), so the browser app can send them.

**Unknowns to check on hardware first**
- Does the arm draw while recording, or only record?
- ~~Which file does the button play, and how is it chosen?~~ **Confirmed on hardware:** in **Blue** mode (connected to Wi-Fi) the button draws the latest drawing from the cloud sketchbook the plotter follows — the default **"drawing of the day"** feed — *not* a stored file; in **Red** mode it draws the internal memory (`M23 S0`, cycling through saved drawings and the factory "chicken"/quality-test drawing). So emptying the filesystem does **not** silence the button in Blue mode; `M23 S3` (stop following) does. The **Clear on-board plotter memory** button sends `M23 S3` and then deletes any saved slots.
- Size limit: the old app capped drawings at `maxDrawlength` 36000 points ("about 700K").
- Are continuous Z values (pen pressure) stored and replayed faithfully? Probably, if commands are stored verbatim.

## The Node.js server version (disabled)

`node-server/` contains an alternative version of the app in which a small Node.js server sits between the browser page and the plotter. It talks to the plotter over raw TCP on port 1337, where commands and replies are terminated by a NUL byte. It has the same features as the browser version, apart from the virtual plotter. It has no dependencies.

It's disabled because the browser version doesn't need a server, but it's kept as a fallback, for example if a plotter's WebSocket interface proves unreliable. To run it anyway:

```sh
cd node-server
LINEUS_ENABLE_SERVER=1 node server.js
```

Then open <http://localhost:8137/>.

**Security:** the server listens on 127.0.0.1 only. It rejects requests whose `Host` or `Origin` isn't itself, which blocks DNS-rebinding and cross-site attacks. It accepts JSON POSTs only, and re-checks that every plotted point is inside the drawing area. More detail is in [`node-server/README.md`](../node-server/README.md).

Changes made later to the browser version haven't been copied back to the server version:
- The browser version lifts the pen in place before parking after the pen-height wizard.
- The browser version replaced "reorder lines to reduce pen travel" with "join touching lines".

## History

This app was made in a single session in November 2026, working with Claude Code.

1. **Why:** the official Line-us app (version 3.0.0, build 33, last updated in 2019) was built on Adobe AIR, which macOS will no longer run. It was also cluttered with cloud accounts, sketchbook sharing and a "drawing of the day" feature.
2. **Reverse engineering:** the app's Flash file (`Line-us.swf`) was decompiled with JPEXS into readable ActionScript. That revealed every command the app sends, including the calibration and Wi-Fi procedures. It also showed that about 85% of the code was cloud features. It turned up a "genuine device" check that sends the plotter's serial number to the manufacturer's server, and showed the official app couldn't import SVG files at all. These findings are written up in `findings.md`.
3. **First version:** a Node.js server that bridged a web page to the plotter over TCP, with SVG import, placement, clipping to the reachable area, calibration and Wi-Fi setup. It was tested against a simulated plotter and in headless Chrome.
4. **Lessons from beardicus:** Brian Boucheron's line-us library showed three things. Newer firmware buffers commands, so the app now keeps several in flight for smoother drawing. The pen lowers at the end of a move. And the plotter speaks WebSocket.
5. **Browser-only version:** to avoid running a server, the app was rebuilt to connect directly over WebSocket from a page opened from disk. The server version was kept but disabled.
6. **The virtual plotter:** the real plotter was in another building, so a simulator was built into the page. It immediately caught a problem: parking the pen after the pen-height wizard could drag a line across the paper. Since then the app lifts the pen in place before moving.
7. **Line ordering:** a greedy nearest-neighbour reordering of lines was removed, because Line-us drawings are small and students already have tools like vpype for that. It was replaced by an option to join touching lines.
8. **G-code import:** an **Open G-code…** button was added, so drawings exported as plotter G-code can be placed and plotted like SVGs.
9. **Pen pressure:** G-code Z heights now carry through to the plotter as continuous pen height. The app remaps them to an adjustable Line-us range and blends ramps along each line, for use with brush pens. SVGs stay pen-up/pen-down.
10. **Official spec cross-check:** Line-us's own GitHub (protocol spec + Python client) surfaced and confirmed most of the reverse-engineered protocol (see `findings.md`). It also revealed that `M587`/`M588` are disabled over WebSocket, so the live Wi-Fi panel was replaced with a guided terminal command (connect with `nc`, then `M587`), keeping rename and machine info as live buttons.
