// Turn a G-code file into polylines in millimetres (y pointing down), the
// same shape parseSVG() returns, so G-code drawings can be placed, scaled
// and plotted like SVGs.
//
// Understands G0/G1 moves, G2/G3 arcs (I/J or R), G20/G21 (inches/mm) and
// G90/G91 (absolute/relative). Comments, feed rates, $ commands, M2 etc.
// are ignored. Pen up/down is worked out automatically:
//   - if Z varies, the file's HIGHEST Z is pen up and anything lower is pen
//     down; lower = more pressure. Each point keeps its Z (third value) so
//     the app can turn it into continuous pen pressure.
//   - otherwise, if M3/M5 appear, M3 = pen down and M5 = pen up
//   - otherwise G0 = travel and G1/G2/G3 = drawing
// "Line-us G-code" (Line-us machine units, highest Z is 1000, no G20/G21)
// is recognised: it keeps its exact position and its Z values as-is.

(function (LU) {
  'use strict';

  const ARC_STEP_MM = 0.2; // max chord length when flattening arcs

  // Split a file into commands: [{ code: 'G1', words: { X: 10, Y: 5 } }, …]
  function tokenize(text) {
    const cmds = [];
    for (let line of text.split(/\r?\n/)) {
      line = line.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
      if (!line || line.startsWith('$') || line.startsWith('%')) continue;
      line = line.replace(/\*\d+$/, ''); // checksum
      const words = {};
      const codes = [];
      for (const m of line.toUpperCase().matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g)) {
        const letter = m[1];
        const value = Number(m[2]);
        if (letter === 'G' || letter === 'M') codes.push(letter + Number(value));
        else if (letter !== 'N') words[letter] = value;
      }
      if (!codes.length && Object.keys(words).length) codes.push(null); // modal: reuse last motion
      for (const code of codes) cmds.push({ code, words });
    }
    return cmds;
  }

  function parseGcode(text) {
    const cmds = tokenize(text);

    // First pass: which pen convention does this file use?
    const zs = new Set();
    let hasM3 = false;
    let hasUnits = false;
    for (const { code, words } of cmds) {
      if ('Z' in words) zs.add(words.Z);
      if (code === 'M3' || code === 'M4') hasM3 = true;
      if (code === 'G20' || code === 'G21') hasUnits = true;
    }
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);
    const penMode = zs.size >= 2 ? 'z' : hasM3 ? 'm' : 'g';
    const zDown = (z) => z < zMax;
    const lineUs = !hasUnits && zs.size >= 2 && zMin >= 0 && zMax === 1000;
    const keepZ = penMode === 'z';

    // Second pass: walk the moves.
    let unit = lineUs ? 1 / LU.UNITS_PER_MM : 1; // file units -> mm
    let absolute = true;
    let motion = 'G0';
    let x = 0;
    let y = 0;
    let z = penMode === 'z' ? zMax : 0;
    let mDown = false;
    const polylines = [];
    let current = null;

    const isDown = (m) => (penMode === 'z' ? zDown(z) : penMode === 'm' ? mDown : m !== 'G0');
    const pt = (px, py, pz) => (keepZ ? [px, py, pz] : [px, py]);
    // The new point takes the current Z; the stroke's first point takes
    // the Z it started at (zFrom), so a move can ramp between the two.
    const lineTo = (nx, ny, down, zFrom = z, zTo = z) => {
      if (down) {
        if (!current) {
          current = [pt(x, y, zFrom)];
          polylines.push(current);
        }
        current.push(pt(nx, ny, zTo));
      } else {
        current = null;
      }
      x = nx;
      y = ny;
    };

    for (const { code, words } of cmds) {
      switch (code) {
        case 'G20':
          unit = 25.4;
          continue;
        case 'G21':
          unit = 1;
          continue;
        case 'G90':
          absolute = true;
          continue;
        case 'G91':
          absolute = false;
          continue;
        case 'M3':
        case 'M4':
          mDown = true;
          continue;
        case 'M5':
          mDown = false;
          current = null;
          continue;
        case 'G0':
        case 'G1':
        case 'G2':
        case 'G3':
          motion = code;
          break;
        case null:
          break;
        default:
          continue; // G28, G92, M2, F-only lines, etc.
      }
      if (!('X' in words || 'Y' in words || 'Z' in words)) continue;

      const coord = (letter, cur) => (letter in words ? (absolute ? words[letter] * unit : cur + words[letter] * unit) : cur);
      const nx = coord('X', x);
      const ny = coord('Y', y);
      const z0 = z;
      if ('Z' in words) {
        z = absolute ? words.Z : z + words.Z;
        if (!isDown(motion)) current = null;
      }
      const down = isDown(motion);
      // A stroke that begins with this move starts at the new Z if the old
      // one was pen-up height, otherwise it ramps from the old Z.
      const zStart = penMode === 'z' && !zDown(z0) ? z : z0;

      if ((motion === 'G2' || motion === 'G3') && down) {
        // Arc centre from I/J (offsets from the start) or from R.
        let cx;
        let cy;
        if ('I' in words || 'J' in words) {
          cx = x + (words.I || 0) * unit;
          cy = y + (words.J || 0) * unit;
        } else if ('R' in words) {
          const r = words.R * unit;
          const mx = (x + nx) / 2;
          const my = (y + ny) / 2;
          const dx = nx - x;
          const dy = ny - y;
          const d = Math.hypot(dx, dy);
          if (d === 0 || Math.abs(r) < d / 2) {
            lineTo(nx, ny, true, zStart, z);
            continue;
          }
          const h = Math.sqrt(r * r - (d / 2) ** 2) * ((motion === 'G2') === r > 0 ? -1 : 1);
          cx = mx - (dy / d) * h;
          cy = my + (dx / d) * h;
        } else {
          lineTo(nx, ny, true, zStart, z);
          continue;
        }
        const r = Math.hypot(x - cx, y - cy);
        const a0 = Math.atan2(y - cy, x - cx);
        let a1 = Math.atan2(ny - cy, nx - cx);
        const cw = motion === 'G2'; // clockwise in G-code's Y-up frame
        let sweep = a1 - a0;
        if (cw && sweep >= 0) sweep -= 2 * Math.PI;
        if (!cw && sweep <= 0) sweep += 2 * Math.PI;
        const steps = Math.max(2, Math.ceil((Math.abs(sweep) * r) / ARC_STEP_MM));
        for (let i = 1; i <= steps; i++) {
          const a = a0 + (sweep * i) / steps;
          const zi = zStart + ((z - zStart) * i) / steps; // helical arcs ramp Z
          const zPrev = zStart + ((z - zStart) * (i - 1)) / steps;
          if (i === steps) lineTo(nx, ny, true, zPrev, z);
          else lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a), true, zPrev, zi);
        }
      } else {
        lineTo(nx, ny, down, zStart, z);
      }
    }

    // Flip to y-down drawing space; drop zero-length strokes.
    const out = polylines.filter((pl) => pl.length >= 2).map((pl) => pl.map(([px, py, pz]) => (keepZ ? [px, -py, pz] : [px, -py])));
    if (!out.length) throw new Error('No drawing moves found in this G-code.');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pl of out) {
      for (const [px, py] of pl) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    const bbox = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    // Z information for pen pressure. mode: 'native' (Line-us Z, use as-is),
    // 'mapped' (file Z, remapped by the app), or 'none' (plain up/down).
    let dMin = Infinity;
    let dMax = -Infinity;
    if (keepZ) {
      for (const pl of out) {
        for (const p of pl) {
          if (p[2] < dMin) dMin = p[2];
          if (p[2] > dMax) dMax = p[2];
        }
      }
    }
    const zInfo = { mode: !keepZ ? 'none' : lineUs ? 'native' : 'mapped', dMin, dMax, zUp: zMax };
    const result = { polylines: out, bbox, warnings: [], zInfo };
    // Line-us G-code keeps its exact position: centre of its bounds, in
    // machine units, at 100% scale.
    if (lineUs) {
      result.native = { x: ((minX + maxX) / 2) * LU.UNITS_PER_MM, y: (-(minY + maxY) / 2) * LU.UNITS_PER_MM };
    }
    return result;
  }

  Object.assign(LU, { parseGcode });
})((window.LU = window.LU || {}));
