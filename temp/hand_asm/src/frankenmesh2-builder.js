/**
 * Frankenmesh2: a deliberately tiny mesh variant.
 *
 * This is not the old contour-rebuilding Frankenmesh. It starts from the final
 * TPS mesh and only overwrites five anatomically important interior vertices:
 * the wrist center and the four finger/palm crown vertices.
 */

const OVERRIDES = [
  { mp: 0, vertex: 115 }, // wrist / center-base of palm
  { mp: 17, vertex: 137 }, // pinky MCP crown
  { mp: 13, vertex: 139 }, // ring MCP crown
  { mp: 9, vertex: 141 }, // middle MCP crown
  { mp: 5, vertex: 143 }, // index MCP crown
];

/**
 * Builder for the current experimental Frankenmesh2 output.
 */
export class Frankenmesh2Builder {
  /**
   * @param {number} [vertexCount=151] - Number of vertices in the runtime hand mesh.
   */
  constructor(vertexCount = 151) {
    this.mesh = new Float64Array(vertexCount * 2);
    this.last = { overrides: 0 };
  }

  /**
   * Copy the TPS mesh and overwrite selected vertices from MediaPipe landmarks.
   *
   * @param {Float64Array} tpsMesh - Packed final TPS mesh.
   * @param {Array<{x:number,y:number}>} landmarks - 21 MediaPipe landmark points.
   * @returns {Float64Array} Packed Frankenmesh2 output mesh.
   */
  build(tpsMesh, landmarks) {
    if (!tpsMesh) return this.mesh;
    if (this.mesh.length !== tpsMesh.length) this.mesh = new Float64Array(tpsMesh.length);
    this.mesh.set(tpsMesh);

    let overrides = 0;
    for (const { mp, vertex } of OVERRIDES) {
      const p = landmarks?.[mp];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      this.mesh[2 * vertex] = p.x;
      this.mesh[2 * vertex + 1] = p.y;
      overrides += 1;
    }
    this.last = { overrides };
    return this.mesh;
  }
}
