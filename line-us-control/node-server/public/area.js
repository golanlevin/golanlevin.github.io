// Line-us machine geometry, shared by the browser UI and the Node server.
//
// Machine coordinates: integers, 20 units per mm. X points away from the
// robot body, Y points "up" when the robot sits on the left (as in the
// official Line-us drawing-area diagram). Pen up = Z1000, pen down = Z0.

export const UNITS_PER_MM = 20;
export const HOME = { x: 1000, y: 1000 };
export const PEN_UP = 1000;
export const PEN_DOWN = 0;

// Reachable drawing area: the D-shape, traced pixel-by-pixel from the official
// diagram, calibrated against its 100-unit grid (~47.7 px per 100 units) and
// offset to the boundary centerline. The left edge is asymmetric: x=500 above the
// axis and x=700 below it, stepping across at y=0. The right edge is a smooth arc
// reaching x≈1952 at y=0. It's traced from a diagram, not measured on hardware,
// so adjust these vertices if your plotter reaches more or less than this.
export const AREA = [
  [500, 0], [500, 1520], [532, 1530], [567, 1540], [614, 1550], [662, 1560],
  [767, 1570], [823, 1575], [880, 1570], [982, 1560], [1029, 1550], [1073, 1540],
  [1112, 1530], [1144, 1520], [1167, 1510], [1194, 1500], [1219, 1490], [1360, 1400],
  [1457, 1300], [1540, 1200], [1614, 1100], [1673, 1000], [1733, 900], [1780, 800],
  [1824, 700], [1859, 600], [1887, 500], [1912, 400], [1931, 300], [1941, 200],
  [1950, 100], [1952, 0], [1950, -100], [1943, -200], [1931, -300], [1910, -400],
  [1889, -500], [1859, -600], [1824, -700], [1777, -800], [1733, -900], [1675, -1000],
  [1614, -1100], [1540, -1200], [1457, -1300], [1362, -1400], [1240, -1480], [1217, -1490],
  [1192, -1500], [1154, -1510], [1129, -1520], [1106, -1530], [1066, -1540], [1020, -1550],
  [955, -1560], [823, -1570], [700, -1560], [700, 0],
];

// Where a freshly loaded drawing is centred: the middle of the largest
// convenient rectangle inside the area.
export const PLOT_CENTER = { x: 1240, y: 0 };
// The comfortable rectangle used by "Fit" (the old app's whole drawing area).
export const FIT_BOX = { w: 1075, h: 2000 };

// Even-odd ray-casting point-in-polygon test.
export function insideArea(x, y, poly = AREA) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
