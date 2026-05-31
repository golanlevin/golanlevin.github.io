/**
 * Status and panel-heading helpers.
 *
 * This module owns the Status text rendering plus the non-preview heading states that reflect
 * page-detection failures and Rectified Grid diagnostic mode.
 */
import { t } from "./i18n.js";

/**
 * Keep the Rectified Grid heading in sync with the currently displayed diagnostic mode.
 *
 * This is intentionally idempotent because Rectified Grid redraws can happen often, and rewriting
 * unchanged heading text makes the header appear to flicker and prevents text selection.
 *
 * @param {import("./dom-state.js").dom} dom
 * @param {import("./dom-state.js").state} state
 * @returns {void}
 */
export function updateRectifiedSheetHeading(dom, state) {
  const translatedTitle = state.preview.showRectifiedDiagnostic
    ? t("panels.convolutionDebugView")
    : t("panels.rectifiedSheet");
  if (dom.rectifiedSheetHeadingText) {
    const headingText = String(translatedTitle || "").replace(/^\s*\d+\s*[\.\):\-–—]?\s*/, "") || "Rectified Grid";
    if (dom.rectifiedSheetHeadingText.textContent !== headingText) {
      dom.rectifiedSheetHeadingText.textContent = headingText;
    }
  } else {
    if (dom.rectifiedSheetHeading.textContent !== translatedTitle) {
      dom.rectifiedSheetHeading.textContent = translatedTitle;
    }
  }
}

/**
 * Reflect page-boundary failure state in the Page & Grid Detection and Page Corners headings.
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
 * Prefix Status text with source-credit metadata when a settings file supplies it.
 *
 * @param {import("./dom-state.js").state} state
 * @param {string} text
 * @returns {string}
 */
function buildStatusTextWithSourceCredit(state, text) {
  const credit = String(state.source.sourceCredit || "").trim();
  if (!credit || text === t("status.loadingImage")) return text;
  return `${t("status.loadedCreditLabel")}\n${credit}\n\n${text}`;
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
  dom.statusText.textContent = buildStatusTextWithSourceCredit(state, text);
  const showWarning = Boolean(state.runtime.pageBoundaryWarningVisible);
  dom.statusText.classList.toggle("status-page-boundary-failure", showWarning);
  updatePageGridDetectionHeading(dom, showWarning);
}
