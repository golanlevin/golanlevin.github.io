/**
 * Status and panel-heading helpers.
 *
 * This module owns the Status text rendering plus the non-preview heading states that reflect
 * page-detection failures and Rectified Sheet diagnostic mode.
 */

/**
 * Keep the Rectified Sheet heading in sync with the currently displayed diagnostic mode.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updateRectifiedSheetHeading(dom, state) {
  dom.rectifiedSheetHeading.textContent = state.preview.showRectifiedDiagnostic
    ? "2. Convolution Debug View"
    : "2. Rectified Sheet";
}

/**
 * Reflect page-boundary failure state in the Page & Grid Detection heading.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {boolean} [showWarning=false]
 * @returns {void}
 */
export function updatePageGridDetectionHeading(dom, showWarning = false) {
  dom.pageGridDetectionSummary.textContent = showWarning
    ? "Page & Grid Detection ⚠️"
    : "Page & Grid Detection";
}

/**
 * Update the Status panel text and any dependent warning state.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {string} text
 * @returns {void}
 */
export function setStatus(dom, text) {
  dom.statusText.textContent = text;
  const showWarning = String(text || "").startsWith("Unable to find page boundary.");
  dom.statusText.classList.toggle("status-page-boundary-failure", showWarning);
  updatePageGridDetectionHeading(dom, showWarning);
}
