/**
 * Status and panel-heading helpers.
 *
 * This module owns the Status text rendering plus the non-preview heading states that reflect
 * page-detection failures and Rectified Sheet diagnostic mode.
 */
import { t } from "./i18n.js";

/**
 * Keep the Rectified Sheet heading in sync with the currently displayed diagnostic mode.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updateRectifiedSheetHeading(dom, state) {
  dom.rectifiedSheetHeading.textContent = state.preview.showRectifiedDiagnostic
    ? t("panels.convolutionDebugView")
    : t("panels.rectifiedSheet");
}

/**
 * Reflect page-boundary failure state in the Page & Grid Detection and Raw Photo headings.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {boolean} [showWarning=false]
 * @returns {void}
 */
export function updatePageGridDetectionHeading(dom, showWarning = false) {
  dom.pageGridDetectionSummary.textContent = showWarning
    ? t("detection.summaryWarning")
    : t("detection.summary");
  if (dom.rawPhotoWarning) {
    dom.rawPhotoWarning.hidden = !showWarning;
  }
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
  // Warning detection stays string-based so both the full pipeline and the lighter threshold-preview
  // path can drive the same heading state without introducing another shared error enum.
  const showWarning = String(text || "").startsWith(t("status.pageBoundaryFailure"));
  dom.statusText.classList.toggle("status-page-boundary-failure", showWarning);
  updatePageGridDetectionHeading(dom, showWarning);
}
