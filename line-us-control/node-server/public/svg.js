// Turn an SVG file into polylines in millimetres (y pointing down).
//
// The SVG is placed in a hidden part of the page so the browser's own
// geometry engine does the work: getTotalLength()/getPointAtLength() handle
// lines, polylines, polygons, rects, circles, ellipses and paths (arcs,
// quadratic and cubic Béziers), and getScreenCTM() handles nested transforms.

const GEOMETRY = 'path, line, polyline, polygon, rect, circle, ellipse';
const NON_RENDERED = 'defs, clipPath, mask, marker, symbol, pattern';
const MAX_SAMPLES_PER_ELEMENT = 20000;

const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

function lengthToMM(attr) {
  const m = /^\s*([\d.]+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(attr || '');
  return m ? parseFloat(m[1]) * UNIT_MM[(m[2] || '').toLowerCase()] : null;
}

// Strip anything active before the file touches the page.
function sanitize(svg) {
  svg.querySelectorAll('script, foreignObject, iframe, image, audio, video').forEach((n) => n.remove());
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    }
  }
}

// Ramer–Douglas–Peucker polyline simplification.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Sample one element along its length, splitting it wherever the path jumps
// (an "M" in the middle of a path).
function sampleElement(el, stepLocal) {
  const total = el.getTotalLength();
  if (!(total > 0)) return [];
  const n = Math.min(MAX_SAMPLES_PER_ELEMENT, Math.max(1, Math.ceil(total / stepLocal)));
  const ds = total / n;
  const at = (L) => el.getPointAtLength(L);
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const slack = (len) => len * 1.5 + 1e-6 * (1 + total);

  const runs = [];
  let run = [at(0)];
  let prevL = 0;
  let prev = run[0];
  for (let i = 1; i <= n; i++) {
    const L = i === n ? total : i * ds;
    const p = at(L);
    if (d(prev, p) > slack(L - prevL)) {
      // Find where the jump happens by bisection.
      let a = prevL;
      let pa = prev;
      let b = L;
      let pb = p;
      for (let k = 0; k < 40 && b - a > 1e-9 * (1 + total); k++) {
        const m = (a + b) / 2;
        const pm = at(m);
        if (d(pa, pm) <= slack(m - a)) {
          a = m;
          pa = pm;
        } else {
          b = m;
          pb = pm;
        }
      }
      run.push(pa);
      runs.push(run);
      run = [pb];
    }
    run.push(p);
    prev = p;
    prevL = L;
  }
  runs.push(run);
  return runs;
}

export function parseSVG(text, host) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not valid SVG.');
  const src = doc.documentElement;
  if (src.localName !== 'svg') throw new Error('This file is not an SVG.');
  sanitize(src);

  host.replaceChildren(document.importNode(src, true));
  const svg = host.firstElementChild;
  try {
    // Millimetres per root user unit, from width + viewBox.
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const widthMM = lengthToMM(svg.getAttribute('width'));
    let mmPerUnit = 25.4 / 96;
    if (vb && vb.width > 0) {
      if (widthMM) mmPerUnit = widthMM / vb.width;
    }
    const physical = widthMM !== null && vb && vb.width > 0;

    const rootInv = svg.getScreenCTM().inverse();
    let bb;
    try {
      bb = svg.getBBox();
    } catch {
      bb = { width: 100, height: 100 };
    }
    const stepRoot = Math.max(Math.hypot(bb.width, bb.height) / 4000, 1e-6);

    const skipped = { text: svg.querySelectorAll('text').length, use: svg.querySelectorAll('use').length };
    const polylines = [];
    for (const el of svg.querySelectorAll(GEOMETRY)) {
      if (el.closest(NON_RENDERED)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const screen = el.getScreenCTM();
      if (!screen) continue;
      const M = rootInv.multiply(screen); // element space -> root user space
      const scale = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
      for (const run of sampleElement(el, stepRoot / scale)) {
        const pts = run.map((p) => [
          (M.a * p.x + M.c * p.y + M.e) * mmPerUnit,
          (M.b * p.x + M.d * p.y + M.f) * mmPerUnit,
        ]);
        polylines.push(pts);
      }
    }
    if (!polylines.length) throw new Error('No drawable lines or shapes found in this SVG.');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pl of polylines) {
      for (const [x, y] of pl) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const tol = Math.max(Math.hypot(maxX - minX, maxY - minY) / 8000, 0.005);
    const simplified = polylines.map((pl) => simplify(pl, tol));

    const warnings = [];
    if (skipped.text) warnings.push(`${skipped.text} text element(s) ignored. Convert text to paths in your editor.`);
    if (skipped.use) warnings.push(`${skipped.use} <use> element(s) ignored. Unlink clones/symbols in your editor.`);
    if (!physical) warnings.push('The SVG has no physical size (mm/in), so 1 px is taken as 1/96 inch.');

    return {
      polylines: simplified,
      bbox: { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY },
      warnings,
    };
  } finally {
    host.replaceChildren();
  }
}
