/**
 * Frame Alignment Markers UI helpers.
 *
 * This module renders the marker diagnostic grid, draws the reticle overlays, and handles the
 * pointer interactions for manual marker overrides.
 */
/**
 * Build one marker-ROI tile wrapper with its overlay reticle and optional editing behavior.
 *
 * @param {{
 *   tile: object,
 *   state: import("./dom-state.js").state,
 *   getMarkerKey: (col:number, row:number) => string,
 *   syncMarkerEditingUi: () => void,
 *   onApplyOverride: (tile:object, local:{x:number,y:number}, finalize:boolean) => void,
 *   onRestoreOverride: (tile:object) => void,
 * }} deps
 * @returns {HTMLDivElement}
 */
function buildMarkerTileElement({
  tile,
  state,
  getMarkerKey,
  syncMarkerEditingUi,
  onApplyOverride,
  onRestoreOverride,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "cross-roi-tile-wrap";
  if (state.runtime.markerEditingEnabled) wrapper.classList.add("editing-enabled");
  if (state.geometry.manualMarkerOverrides.has(getMarkerKey(tile.col, tile.row))) {
    wrapper.classList.add("manual-override");
  }

  tile.canvas.classList.add("cross-roi-tile");
  const overlay = document.createElement("canvas");
  overlay.className = "cross-roi-overlay";
  overlay.width = tile.canvas.width;
  overlay.height = tile.canvas.height;
  overlay.style.width = `${tile.canvas.width}px`;
  overlay.style.height = `${tile.canvas.height}px`;
  drawMarkerTileOverlay(overlay, tile, state, getMarkerKey);
  wrapper.appendChild(tile.canvas);
  wrapper.appendChild(overlay);

  if (tile.kind === "unrefined") {
    wrapper.title = "";
  } else if (state.runtime.tooltipsEnabled) {
    const colContrast = Number.isFinite(tile.colContrast) ? tile.colContrast.toFixed(2) : "--";
    const rowContrast = Number.isFinite(tile.rowContrast) ? tile.rowContrast.toFixed(2) : "--";
    const darkFrac = Number.isFinite(tile.darkFrac) ? tile.darkFrac.toFixed(4) : "--";
    const convStrength = Number.isFinite(tile.convolutionStrength) ? ` | conv ${tile.convolutionStrength.toFixed(4)}` : "";
    const manualTag = state.geometry.manualMarkerOverrides.has(getMarkerKey(tile.col, tile.row)) ? " | manual override" : "";
    wrapper.title = `(${tile.col}, ${tile.row}) ${tile.accepted ? "accepted" : "rejected"} | col ${colContrast} | row ${rowContrast} | ink ${darkFrac}${convStrength}${manualTag}`;
  } else {
    wrapper.title = "";
  }

  if (state.runtime.markerEditingEnabled) {
    wrapper.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const markerKey = getMarkerKey(tile.col, tile.row);
      const now = performance.now();
      const isDoubleClick =
        state.geometry.manualMarkerOverrides.has(markerKey) &&
        state.runtime.lastMarkerClickKey === markerKey &&
        (now - state.runtime.lastMarkerClickTime) <= 320;
      state.runtime.lastMarkerClickKey = markerKey;
      state.runtime.lastMarkerClickTime = now;
      if (isDoubleClick) {
        onRestoreOverride(tile);
        return;
      }
      const updateOverlayFromEvent = (pointerEvent) => {
        const local = getMarkerTileLocalPoint(pointerEvent, wrapper, tile.canvas.width, tile.canvas.height);
        drawMarkerTileOverlay(overlay, tile, state, getMarkerKey, local);
        return local;
      };
      let local = updateOverlayFromEvent(event);
      onApplyOverride(tile, local, false);
      const handleMove = (moveEvent) => {
        local = updateOverlayFromEvent(moveEvent);
        onApplyOverride(tile, local, false);
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        onApplyOverride(tile, local, true);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    });
  }

  syncMarkerEditingUi();
  return wrapper;
}

/**
 * Draw the marker reticle overlay for one ROI tile.
 *
 * @param {HTMLCanvasElement} overlay
 * @param {object} tile
 * @param {import("./dom-state.js").state} state
 * @param {(col:number, row:number) => string} getMarkerKey
 * @param {{x:number, y:number} | null} [localOverride=null]
 * @returns {void}
 */
function drawMarkerTileOverlay(overlay, tile, state, getMarkerKey, localOverride = null) {
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const current = localOverride || getMarkerTileCurrentLocalPoint(tile);
  const isManual = !!localOverride || state.geometry.manualMarkerOverrides.has(getMarkerKey(tile.col, tile.row));
  ctx.save();
  ctx.strokeStyle = isManual ? "rgba(0, 128, 0, 0.95)" : (tile.accepted ? "rgba(255, 0, 0, 0.55)" : "rgba(255, 0, 0, 0.3)");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(current.x + 0.5, 0);
  ctx.lineTo(current.x + 0.5, overlay.height);
  ctx.moveTo(0, current.y + 0.5);
  ctx.lineTo(overlay.width, current.y + 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Convert a tile's current detected or manually overridden marker position into tile-local pixels.
 *
 * @param {object} tile
 * @returns {{x:number, y:number}}
 */
function getMarkerTileCurrentLocalPoint(tile) {
  const center = (tile.canvas.width - 1) * 0.5;
  return {
    x: center + (tile.detectedX - tile.x),
    y: center + (tile.detectedY - tile.y),
  };
}

/**
 * Convert a pointer event over a marker tile into a clamped local tile coordinate.
 *
 * @param {PointerEvent} event
 * @param {HTMLElement} element
 * @param {number} width
 * @param {number} height
 * @returns {{x:number, y:number}}
 */
function getMarkerTileLocalPoint(event, element, width, height) {
  const rect = element.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * height;
  return {
    x: Math.max(0, Math.min(width - 1, x)),
    y: Math.max(0, Math.min(height - 1, y)),
  };
}

/**
 * Rebuild the marker diagnostic grid from the latest alignment result.
 *
 * @param {{
 *   dom: import("./dom-state.js").dom,
 *   state: import("./dom-state.js").state,
 *   alignmentInfo: object | null,
 *   getMarkerKey: (col:number, row:number) => string,
 *   syncMarkerEditingUi: () => void,
 *   onApplyOverride: (tile:object, local:{x:number,y:number}, finalize:boolean) => void,
 *   onRestoreOverride: (tile:object) => void,
 * }} deps
 * @returns {void}
 */
export function renderCrossRoiGrid({
  dom,
  state,
  alignmentInfo,
  getMarkerKey,
  syncMarkerEditingUi,
  onApplyOverride,
  onRestoreOverride,
}) {
  const grid = dom.crossRoiGrid;
  const viewport = dom.crossRoiViewport;
  grid.innerHTML = "";
  if (!alignmentInfo || !alignmentInfo.crossRoiTiles || alignmentInfo.crossRoiTiles.length === 0) {
    grid.classList.add("is-empty");
    viewport?.classList.add("is-empty");
    grid.textContent = "";
    syncMarkerEditingUi();
    return;
  }
  grid.classList.remove("is-empty");
  viewport?.classList.remove("is-empty");
  grid.style.gridTemplateColumns = `repeat(${alignmentInfo.cols + 1}, max-content)`;
  for (let row = 0; row <= alignmentInfo.rows; row++) {
    for (let col = 0; col <= alignmentInfo.cols; col++) {
      const isCorner = ((col === 0) || (col === alignmentInfo.cols)) && ((row === 0) || (row === alignmentInfo.rows));
      if (isCorner && !alignmentInfo.includeCornerCrosses) {
        const spacer = document.createElement("div");
        spacer.className = "cross-roi-empty";
        grid.appendChild(spacer);
        continue;
      }
      const tile = alignmentInfo.crossRoiTileMap.get(`${col},${row}`);
      if (tile) {
        grid.appendChild(buildMarkerTileElement({
          tile,
          state,
          getMarkerKey,
          syncMarkerEditingUi,
          onApplyOverride,
          onRestoreOverride,
        }));
      } else {
        const spacer = document.createElement("div");
        spacer.className = "cross-roi-empty";
        grid.appendChild(spacer);
      }
    }
  }
  syncMarkerEditingUi();
}
