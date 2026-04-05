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
  const summaryLabel = dom.pageGridDetectionSummary?.querySelector("[data-i18n='detection.summary']");
  if (summaryLabel) {
    summaryLabel.textContent = t("detection.summary");
  } else {
    dom.pageGridDetectionSummary.textContent = t("detection.summary");
  }
  if (dom.pageGridDetectionWarning) {
    dom.pageGridDetectionWarning.hidden = !showWarning;
  }
  if (dom.rawPhotoWarning) {
    dom.rawPhotoWarning.hidden = !showWarning;
  }
}

/**
 * Update the Status panel text and any dependent warning state.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @param {string} text
 * @returns {void}
 */
export function setStatus(dom, state, text) {
  dom.statusText.textContent = text;
  const showWarning = Boolean(state.runtime.pageBoundaryWarningVisible);
  dom.statusText.classList.toggle("status-page-boundary-failure", showWarning);
  updatePageGridDetectionHeading(dom, showWarning);
}
