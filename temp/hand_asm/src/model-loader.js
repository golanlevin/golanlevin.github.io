/**
 * Runtime model loader.
 *
 * This module adapts the offline Python model JSON into compact typed arrays
 * used by the realtime fitter. It also merges full-mesh metadata, contour
 * boundary metadata, and the learned MediaPipe correspondence map into one
 * runtime object.
 */

const MODEL_PATHS = {
  lightweight: {
    full: "model_out/runtime/hand_full_mesh_model_11m.json",
    contour: "model_out/runtime/hand_contour_model_11m.json",
  },
  default: {
    full: "model_out/runtime/hand_full_mesh_model_20m.json",
    contour: "model_out/runtime/hand_contour_model_20m.json",
  },
  quality: {
    full: "model_out/runtime/hand_full_mesh_model_30m.json",
    contour: "model_out/runtime/hand_contour_model_30m.json",
  },
};

const CORRESPONDENCE_PATH = "model_out/mediapipe_correspondence_learned.json";

/**
 * Flatten a JSON `[[x,y], ...]` shape into packed `[x0,y0,x1,y1,...]` storage.
 *
 * @param {number[][]} shape - JSON shape array from the PDM model.
 * @returns {Float64Array} Packed shape coordinates.
 */
function flattenShape(shape) {
  const out = new Float64Array(shape.length * 2);
  for (let i = 0; i < shape.length; i += 1) {
    out[2 * i] = shape[i][0];
    out[2 * i + 1] = shape[i][1];
  }
  return out;
}

/**
 * Flatten PCA component rows into one packed typed array.
 *
 * Components are stored row-major as `mode * dims + dim`.
 *
 * @param {number[][]} components - JSON PCA components.
 * @returns {Float64Array} Packed component matrix.
 */
function flattenComponents(components) {
  const modes = components.length;
  const dims = components[0].length;
  const out = new Float64Array(modes * dims);
  for (let i = 0; i < modes; i += 1) {
    out.set(components[i], i * dims);
  }
  return out;
}

/**
 * Normalize the learned correspondence JSON into a 21-entry runtime array.
 *
 * Each MediaPipe landmark maps to one or more mesh vertices with normalized
 * interpolation weights.
 *
 * @param {object} raw - Loaded correspondence JSON.
 * @returns {Array<object>} Runtime correspondence entries.
 */
function normalizeCorrespondence(raw) {
  const source = raw.landmarks ?? raw;
  const entries = new Array(21);
  for (let i = 0; i < 21; i += 1) {
    const entry = source[String(i)];
    if (!entry) throw new Error(`missing MediaPipe correspondence ${i}`);
    let total = 0;
    for (const point of entry.mesh_points) total += Number(point.weight);
    entries[i] = {
      name: entry.name ?? `mp_${i}`,
      landmarkWeight: Number(entry.landmark_weight ?? entry.weight ?? 1),
      points: entry.mesh_points.map((point) => ({
        vertex: Number(point.vertex),
        weight: Number(point.weight) / total,
      })),
    };
  }
  return entries;
}

/**
 * Precompute previous/next indices for the closed 95-point boundary loop.
 *
 * @param {Int16Array} boundary - Ordered native boundary vertex indices.
 * @returns {{prev: Int16Array, next: Int16Array}} Boundary neighbor arrays.
 */
function boundaryNeighbors(boundary) {
  const prev = new Int16Array(boundary.length);
  const next = new Int16Array(boundary.length);
  for (let i = 0; i < boundary.length; i += 1) {
    prev[i] = (i - 1 + boundary.length) % boundary.length;
    next[i] = (i + 1) % boundary.length;
  }
  return { prev, next };
}

/**
 * Return the coarse anatomical region for a 151-mesh vertex index.
 *
 * @param {number} vertex - Native 151-mesh vertex index.
 * @returns {string} Region label used by snapping and diagnostics.
 */
function regionForVertex(vertex) {
  if (vertex >= 0 && vertex <= 20) return "thumb";
  if (vertex >= 21 && vertex <= 41) return "pinky";
  if (vertex >= 42 && vertex <= 62) return "ring";
  if (vertex >= 63 && vertex <= 83) return "middle";
  if (vertex >= 84 && vertex <= 104) return "index";
  if (vertex >= 105 && vertex <= 116) return "wrist";
  if (vertex >= 117 && vertex <= 143) return "palm";
  return "thumb_web";
}

/**
 * Fetch and parse JSON, preserving a useful error message on failure.
 *
 * @param {string} path - URL relative to the runtime page.
 * @returns {Promise<object>} Parsed JSON.
 */
async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`failed to load ${path}: ${response.status}`);
  return response.json();
}

/**
 * Build the final runtime model object from full, contour, and correspondence JSON.
 *
 * @param {string} preset - UI preset name: lightweight/default/quality.
 * @param {object} full - Full 151-vertex PDM JSON.
 * @param {object} contour - Contour metadata/PDM JSON.
 * @param {Array<object>} correspondence - Normalized MediaPipe correspondence.
 * @returns {object} Runtime model object consumed by the fitter/ASM stages.
 */
function buildRuntimeModel(preset, full, contour, correspondence) {
  const triangles = full.canonical_triangles.map((tri) => tri.map(Number));
  const boundary = Int16Array.from(contour.boundary_vertex_indices.map(Number));
  const boundaryRegions = Array.from(boundary, regionForVertex);
  const pca = full.pca;
  const nModes = pca.n_components;
  const model = {
    preset,
    nVertices: full.vertex_count,
    nModes,
    mean: flattenShape(pca.mean_shape),
    components: flattenComponents(pca.components),
    eigenvalues: Float64Array.from(pca.eigenvalues),
    triangles,
    semanticVertexMap: full.semantic_vertex_map,
    orientation: full.metadata?.orientation ?? {},
    boundary,
    boundaryEdges: contour.boundary_edges ?? [],
    boundaryRegions,
    handBoundaryMask: boundaryRegions.map((region) => region !== "wrist"),
    ...boundaryNeighbors(boundary),
    correspondence,
  };
  return model;
}

/**
 * Loads and caches model presets for the browser demo.
 */
export class HandModelLoader {
  /**
   * Construct an empty model cache. Correspondence is shared by all presets.
   */
  constructor() {
    this.cache = new Map();
    this.correspondence = null;
  }

  /**
   * Load one preset and return the runtime model object.
   *
   * @param {string} [preset="default"] - `lightweight`, `default`, or `quality`.
   * @returns {Promise<object>} Runtime model.
   */
  async load(preset = "default") {
    if (this.cache.has(preset)) return this.cache.get(preset);
    const paths = MODEL_PATHS[preset];
    if (!paths) throw new Error(`unknown model preset: ${preset}`);
    if (!this.correspondence) {
      this.correspondence = normalizeCorrespondence(await fetchJson(CORRESPONDENCE_PATH));
    }
    const [full, contour] = await Promise.all([fetchJson(paths.full), fetchJson(paths.contour)]);
    const model = buildRuntimeModel(preset, full, contour, this.correspondence);
    this.cache.set(preset, model);
    return model;
  }
}
