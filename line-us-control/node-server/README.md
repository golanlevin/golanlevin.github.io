# Line-us web controller: Node server version (disabled)

> **Disabled.** This was the first version, where a local Node server bridged the page to the plotter over TCP port 1337. It has been replaced by the browser-only version in `../index.html`, which talks to the plotter directly over WebSocket. It's kept for reference. To run it anyway: `LINEUS_ENABLE_SERVER=1 node server.js` (or `npm start`).

A small replacement for the abandoned Line-us app. It does three things:

1. **Plots SVG files.** It handles lines, polylines, polygons, rects, circles, ellipses and paths (arcs, quadratic and cubic Béziers), including nested transforms. Drag the drawing to move it and scroll to resize it. It can also be rotated in 90° steps. Anything outside the plotter's reach is shown in red and skipped.
2. **Calibrates.** It has the four-corner pen-height wizard (Z-map) and home calibration, using the same procedure as the original app.
3. **Sets up Wi-Fi.** It can add or forget networks, list saved ones, and rename the plotter.

It does not support accounts, cloud features, "drawing of the day", or the genuine-device check.

## Run it

Requires Node.js 18 or newer. There are no dependencies to install.

```sh
cd lineus-web
node server.js
```

Then open <http://localhost:8137/>. Set the `PORT` environment variable to use a different port.

## How it's built

```
server.js         HTTP server + plot job runner + calibration/Wi-Fi commands
lib/lineus.js     TCP connection to the plotter (port 1337, NUL-terminated text)
public/area.js    Drawing-area outline and constants, shared by page and server
public/svg.js     SVG → polylines using the browser's own geometry engine
public/app.js     Preview canvas, placement, controls
```

Browsers can't open raw TCP sockets, so the Node server holds the plotter connection. The page talks to the server.

**Security:** the server listens on 127.0.0.1 only. It rejects requests whose `Host` or `Origin` isn't itself, which blocks DNS-rebinding and cross-site attacks. POSTs must be JSON, so a form on another website can't trigger them. It also re-checks that every plotted point is inside the drawing area. SVG files are stripped of scripts, event handlers and external content before the browser parses them.

## Things to know

- **Drawing area:** the outline in `public/area.js` is traced from the official Line-us drawing-area diagram, not measured. If your plotter can reach further, or can't reach some edge, adjust the vertices there.
- **SVG size:** an SVG with physical units (`width="80mm"` plus a `viewBox`) loads at true size, or scales down to fit if it's too big. Without physical units, 1 px is taken as 1/96 inch.
- **Text and `<use>` clones are ignored.** Convert text to paths and unlink clones in your editor first.
- **Coordinates:** 20 machine units per mm. Home is X1000 Y1000. The preview matches the official diagram, with the robot on the left.
- **Commands in flight:** a move's reply only arrives when the move finishes. With **Auto**, the server keeps 3 commands queued on firmware 3.0.0+ (which buffers them, per the @beardicus/line-us library) so the arm doesn't stop at every vertex. Older firmware gets 1 at a time, like the official app. If plots misbehave, set it to 1.
- Command meanings come from the decompiled official app and the beardicus library; see `../doc/findings.md`.

## Tested so far

Everything was tested against a simulated plotter: the protocol, a plot with pause/resume/stop, the pen-height stepping loop, Z-map save, jog limits, Wi-Fi argument validation and the security checks. SVG parsing, placement and clipping were tested in headless Chrome. **None of it has been tested on a real Line-us yet.** Things to check on hardware:

- Whether 3 commands in flight is smooth over the raw TCP port. beardicus tested buffering over WebSocket; the simulated plotter only shows that the windowing logic is correct.
- The home calibration flow (M374).
- The setup-mode address (`192.168.4.1` is the usual ESP8266 default, but that's unverified).
- Whether the drawing-area outline matches what the arm can actually reach.
