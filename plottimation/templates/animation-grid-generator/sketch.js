let nCols = 5; 
let nRows = 4;
let aspectFrame = 4/3;

const inch = 96;
const mmToInch = 1 / 25.4;
const topBottomSafetyMargin = 0.5 * inch;
const aspectRatioDetents = [0.666, 0.75, 0.80, 1.0, 1.2, 1.333, 1.5, 1.777];
const aspectRatioDetentThreshold = 0.03;
const warningDashPattern = [3, 4];
let bDrawFrame = false;
let bDrawNonReproGuide = true;
let bShowWarnings = true;
let pagePreset = "letter";
let pageOrientation = "landscape";
let markerType = "crosses";
let sideMarginInches = 0.75;
let markerSizeInches = 0.20;
let gutterInches = 0.30;
let guideGridInches = 0.125;

p5.disableFriendlyErrors = true; 
let bDoExportSvg = false; 
let paperPresetSelect;
let customPaperFields;
let customPaperWidthInput;
let customPaperHeightInput;
let orientationLandscapeRadio;
let orientationPortraitRadio;
let markerTypeCrossesRadio;
let markerTypeDotsRadio;
let marginSlider;
let marginValue;
let markerSizeSlider;
let markerSizeValue;
let gutterSlider;
let gutterValue;
let guideGridSlider;
let guideGridValue;
let aspectSlider;
let aspectValue;
let colsSlider;
let rowsSlider;
let colsValue;
let rowsValue;
let showWarningsCheckbox;
let drawGuidesCheckbox;
let drawFramesCheckbox;
let exportSvgButton;

const PAPER_PRESETS = {
  letter: { width: 11, height: 8.5, unit: "in" },
  legal: { width: 14, height: 8.5, unit: "in" },
  tabloid: { width: 17, height: 11, unit: "in" },
  "12x9": { width: 12, height: 9, unit: "in" },
  "18x12": { width: 18, height: 12, unit: "in" },
  "24x18": { width: 24, height: 18, unit: "in" },
  "36x24": { width: 36, height: 24, unit: "in" },
  a4: { width: 297, height: 210, unit: "mm" },
  a3: { width: 420, height: 297, unit: "mm" },
  a2: { width: 594, height: 420, unit: "mm" },
  a1: { width: 841, height: 594, unit: "mm" },
  custom: { width: 12, height: 12, unit: "in" },
};

const PAPER_PRESET_LABELS = {
  letter: "Letter",
  legal: "Legal",
  tabloid: "Tabloid",
  "12x9": "12×9",
  "18x12": "18×12",
  "24x18": "24×18",
  "36x24": "36×24",
  a4: "A4",
  a3: "A3",
  a2: "A2",
  a1: "A1",
  custom: "Custom",
};

//-------------------------------------------------
function setup() {
  const canvas = createCanvas(11 * inch, 8.5 * inch);
  canvas.parent('canvasWrap');
  strokeWeight(1.0); 
  noFill(); 

  paperPresetSelect = select('#paperPreset');
  customPaperFields = select('#customPaperFields');
  customPaperWidthInput = select('#customPaperWidth');
  customPaperHeightInput = select('#customPaperHeight');
  orientationLandscapeRadio = select('#orientationLandscape');
  orientationPortraitRadio = select('#orientationPortrait');
  markerTypeCrossesRadio = select('#markerTypeCrosses');
  markerTypeDotsRadio = select('#markerTypeDots');
  marginSlider = select('#marginSlider');
  marginValue = select('#marginValue');
  markerSizeSlider = select('#markerSizeSlider');
  markerSizeValue = select('#markerSizeValue');
  gutterSlider = select('#gutterSlider');
  gutterValue = select('#gutterValue');
  guideGridSlider = select('#guideGridSlider');
  guideGridValue = select('#guideGridValue');
  aspectSlider = select('#aspectSlider');
  aspectValue = select('#aspectValue');
  colsSlider = select('#colsSlider');
  rowsSlider = select('#rowsSlider');
  colsValue = select('#colsValue');
  rowsValue = select('#rowsValue');
  showWarningsCheckbox = select('#showWarningsCheckbox');
  drawGuidesCheckbox = select('#drawGuidesCheckbox');
  drawFramesCheckbox = select('#drawFramesCheckbox');
  exportSvgButton = select('#exportSvgButton');

  paperPresetSelect.changed(updatePaperSize);
  customPaperWidthInput.input(updatePaperSize);
  customPaperHeightInput.input(updatePaperSize);
  orientationLandscapeRadio.changed(updatePaperSize);
  orientationPortraitRadio.changed(updatePaperSize);
  markerTypeCrossesRadio.changed(updateMarkerType);
  markerTypeDotsRadio.changed(updateMarkerType);
  marginSlider.input(updateMargins);
  markerSizeSlider.input(updateMarkerSize);
  gutterSlider.input(updateGutter);
  guideGridSlider.input(updateGuideGrid);
  aspectSlider.input(updateAspectRatio);
  colsSlider.input(updateGridSettings);
  rowsSlider.input(updateGridSettings);
  showWarningsCheckbox.changed(updateDrawingOptions);
  drawGuidesCheckbox.changed(updateDrawingOptions);
  drawFramesCheckbox.changed(updateDrawingOptions);
  exportSvgButton.mousePressed(function () {
    if (!canExportSvg()) return;
    bDoExportSvg = true;
    redraw();
  });

  updatePaperSize();
  updateGridSettings();
  noLoop();
}


//-------------------------------------------------
function keyPressed(){
  if (key == 's'){ 
    if (!canExportSvg()) return;
    bDoExportSvg = true; 
    redraw();
  } else if (key == 'd'){
    bDrawFrame = !bDrawFrame;
    redraw();
  }
}


//-------------------------------------------------
function updateGridSettings(){
  nCols = int(colsSlider.value());
  nRows = int(rowsSlider.value());
  colsValue.html(nCols);
  rowsValue.html(nRows);
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function updateMarkerType(){
  markerType = markerTypeDotsRadio.elt.checked ? "dots" : "crosses";
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function getCurrentPageDimensionsInPresetUnits(){
  const preset = PAPER_PRESETS[pagePreset] || PAPER_PRESETS.letter;
  if (pagePreset === "custom") {
    const customWidth = Math.max(1, Number(customPaperWidthInput.value()) || preset.width);
    const customHeight = Math.max(1, Number(customPaperHeightInput.value()) || preset.height);
    const pageWidth = pageOrientation === "portrait" ? customHeight : customWidth;
    const pageHeight = pageOrientation === "portrait" ? customWidth : customHeight;
    return {
      width: pageWidth,
      height: pageHeight,
      unit: "in",
    };
  }
  const pageWidth = pageOrientation === "portrait" ? preset.height : preset.width;
  const pageHeight = pageOrientation === "portrait" ? preset.width : preset.height;
  return {
    width: pageWidth,
    height: pageHeight,
    unit: preset.unit,
  };
}


//-------------------------------------------------
function formatFilenameNumber(value){
  return String(value).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}


//-------------------------------------------------
function buildExportFilename(){
  const page = getCurrentPageDimensionsInPresetUnits();
  const paperWidth = formatFilenameNumber(page.width);
  const paperHeight = formatFilenameNumber(page.height);
  const frameAspect = Number(aspectFrame).toFixed(2);
  return `grid_${paperWidth}x${paperHeight}_${nCols}x${nRows}_${frameAspect}.svg`;
}


//-------------------------------------------------
function formatPhysicalLength(inchesValue, unit){
  if (unit === "mm") {
    return `${Math.round(inchesValue / mmToInch)} mm`;
  }
  return `${nf(inchesValue, 1, 2)} in`;
}


//-------------------------------------------------
function getMarkerSizePx(){
  return markerSizeInches * inch;
}


//-------------------------------------------------
function getCenterDotDiameterPx(){
  return 0.001 * inch;
}


//-------------------------------------------------
function getDotRingCount(){
  const markerDiameterMm = markerSizeInches / mmToInch;
  return Math.max(1, Math.round(markerDiameterMm / 0.6));
}


//-------------------------------------------------
function getMaximumGutterInches(page){
  return page.unit === "mm" ? 20 * mmToInch : 0.75;
}


//-------------------------------------------------
function updateMargins(){
  const page = getCurrentPageDimensionsInPresetUnits();
  marginSlider.elt.min = "0.5";
  marginSlider.elt.max = "1.5";
  sideMarginInches = Math.min(1.5, Math.max(0.5, Number(marginSlider.value())));
  marginSlider.value(sideMarginInches);
  marginValue.html(formatPhysicalLength(sideMarginInches, page.unit));
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function updateMarkerSize(){
  const page = getCurrentPageDimensionsInPresetUnits();
  markerSizeSlider.elt.min = "0.20";
  markerSizeSlider.elt.max = "0.40";
  markerSizeInches = Math.min(0.40, Math.max(0.20, Number(markerSizeSlider.value())));
  markerSizeSlider.value(markerSizeInches);
  markerSizeValue.html(formatPhysicalLength(markerSizeInches, page.unit));
  updateGutter();
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function updateGutter(){
  const page = getCurrentPageDimensionsInPresetUnits();
  const maximumGutterInches = getMaximumGutterInches(page);
  const minimumGutterInches = markerSizeInches + 0.05;
  gutterSlider.elt.min = minimumGutterInches.toFixed(4);
  gutterSlider.elt.max = maximumGutterInches.toFixed(4);
  gutterInches = Math.min(maximumGutterInches, Math.max(minimumGutterInches, Number(gutterSlider.value())));
  gutterSlider.value(gutterInches);
  gutterValue.html(formatPhysicalLength(gutterInches, page.unit));
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function updateGuideGrid(){
  const page = getCurrentPageDimensionsInPresetUnits();
  guideGridSlider.elt.min = "0.1";
  guideGridSlider.elt.max = "0.5";
  guideGridInches = Math.min(0.5, Math.max(0.1, Number(guideGridSlider.value())));
  guideGridSlider.value(guideGridInches);
  guideGridValue.html(formatPhysicalLength(guideGridInches, page.unit));
  redraw();
}


//-------------------------------------------------
function snapAspectRatioIfClose(value){
  let snappedValue = value;
  let bestDistance = aspectRatioDetentThreshold;
  for (const detent of aspectRatioDetents) {
    const distance = Math.abs(value - detent);
    if (distance <= bestDistance) {
      bestDistance = distance;
      snappedValue = detent;
    }
  }
  return snappedValue;
}


//-------------------------------------------------
function updateAspectRatio(){
  const rawValue = Number(aspectSlider.value());
  aspectFrame = snapAspectRatioIfClose(rawValue);
  aspectSlider.value(aspectFrame);
  aspectValue.html(nf(aspectFrame, 1, 2));
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function updateDrawingOptions(){
  bShowWarnings = showWarningsCheckbox.elt.checked;
  bDrawNonReproGuide = drawGuidesCheckbox.elt.checked;
  bDrawFrame = drawFramesCheckbox.elt.checked;
  guideGridSlider.elt.disabled = !bDrawNonReproGuide;
  redraw();
}


//-------------------------------------------------
function updatePaperPresetLabels(){
  const isPortrait = orientationPortraitRadio.elt.checked;
  const options = paperPresetSelect.elt.options;
  for (const option of options) {
    const presetKey = option.value;
    if (presetKey === "custom") {
      option.textContent = PAPER_PRESET_LABELS.custom;
      continue;
    }
    const preset = PAPER_PRESETS[presetKey];
    if (!preset) continue;
    const firstDimension = isPortrait ? preset.height : preset.width;
    const secondDimension = isPortrait ? preset.width : preset.height;
    option.textContent = `${PAPER_PRESET_LABELS[presetKey]} (${firstDimension}×${secondDimension} ${preset.unit})`;
  }
}


//-------------------------------------------------
function updatePaperSize(){
  pagePreset = paperPresetSelect.value();
  pageOrientation = orientationPortraitRadio.elt.checked ? "portrait" : "landscape";
  updatePaperPresetLabels();
  customPaperFields.elt.hidden = pagePreset !== "custom";
  const page = getCurrentPageDimensionsInPresetUnits();
  const widthInches = page.unit === "mm" ? page.width * mmToInch : page.width;
  const heightInches = page.unit === "mm" ? page.height * mmToInch : page.height;
  resizeCanvas(widthInches * inch, heightInches * inch);
  updateMargins();
  updateMarkerSize();
  updateGutter();
  updateGuideGrid();
  updateExportButtonState();
  redraw();
}


//-------------------------------------------------
function canExportSvg(){
  return !hasOutOfBoundsGraphics();
}


//-------------------------------------------------
function updateExportButtonState(){
  if (!exportSvgButton) return;
  const exportBlocked = !canExportSvg();
  exportSvgButton.elt.classList.toggle('is-disabled', exportBlocked);
  exportSvgButton.elt.setAttribute('aria-disabled', exportBlocked ? 'true' : 'false');
  exportSvgButton.elt.dataset.tooltip = exportBlocked ? 'Fit all graphics within safety bounds to export.' : '';
  exportSvgButton.elt.removeAttribute('title');
}


//-------------------------------------------------
function hasOutOfBoundsGraphics(){
  for (let row = 0; row <= nRows; row++) {
    for (let col = 0; col <= nCols; col++) {
      const marker = getCellAndFrameCoords(row, col);
      if (markerOverflowsPage(marker.cellx, marker.celly)) {
        return true;
      }
    }
  }
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const frame = getCellAndFrameCoords(row, col);
      if (frameOverflowsPage(row, frame)) {
        return true;
      }
    }
  }
  return false;
}


//-------------------------------------------------
function draw() {
  background('white');
  const shouldExportSvg = bDoExportSvg;
  if (bDoExportSvg){
    let fn = buildExportFilename();
    beginRecordSvg(this, fn);
    setSvgGroupByStrokeColor(true); 
    setSvgFlattenTransforms(true); 
  }
  
  drawRegistrationFeatures(false); 
  drawDrawingGuides(false); 

  if (bDoExportSvg){
    endRecordSvg();
    bDoExportSvg = false;
  }

  if (bShowWarnings) {
    drawRegistrationFeatures(true);
    drawDrawingGuides(true);
    drawSafetyFrame();
  }
}


//-------------------------------------------------
function drawSafetyFrame(){
  if (!bShowWarnings) return;
  push();
  noFill();
  stroke('red');
  drawingContext.setLineDash(warningDashPattern);
  rect(topBottomSafetyMargin, topBottomSafetyMargin, width - 2 * topBottomSafetyMargin, height - 2 * topBottomSafetyMargin);
  drawingContext.setLineDash([]);
  pop();
}


//-------------------------------------------------
function markerOverflowsPage(x, y){
  const radius = getMarkerSizePx() / 2;
  return (
    (x - radius) < 0 ||
    (x + radius) > width ||
    (y - radius) < topBottomSafetyMargin ||
    (y + radius) > (height - topBottomSafetyMargin)
  );
}


//-------------------------------------------------
function markerRowViolatesTopSafety(row){
  const markerY = getCellAndFrameCoords(row, 0).celly;
  return (markerY - (getMarkerSizePx() / 2)) < topBottomSafetyMargin;
}


//-------------------------------------------------
function markerRowViolatesBottomSafety(row){
  const markerY = getCellAndFrameCoords(row, 0).celly;
  return (markerY + (getMarkerSizePx() / 2)) > (height - topBottomSafetyMargin);
}


//-------------------------------------------------
function frameOverflowsPage(row, frame){
  return (
    frame.framex < 0 ||
    frame.framey < topBottomSafetyMargin ||
    (frame.framex + frame.framew) > width ||
    (frame.framey + frame.frameh) > (height - topBottomSafetyMargin) ||
    markerRowViolatesTopSafety(row) ||
    markerRowViolatesBottomSafety(row + 1)
  );
}


//-------------------------------------------------
function drawRegistrationFeatures(warningOnly = false){
  beginSvgGroup("RegistrationMarkers");
  for (let row=0; row<=nRows; row++){
    for (let col=0; col<=nCols; col++){
      let C = getCellAndFrameCoords(row,col); 
      const isOverflowing = markerOverflowsPage(C.cellx, C.celly);
      if (warningOnly && !isOverflowing) continue;
      if (!warningOnly && isOverflowing) continue;
      drawingContext.setLineDash(warningOnly ? warningDashPattern : []);
      stroke(warningOnly ? 'red' : 'black');
      noFill();
      beginSvgGroup("marker_" + nf(row,2) + "_" + nf(col,2));
      if (markerType === "dots") {
        drawDotMarker(C.cellx, C.celly);
      } else {
        drawCrossMarker(C.cellx, C.celly);
      }
      endSvgGroup(); 
    }
  }
  endSvgGroup(); 
  drawingContext.setLineDash([]);
}


//-------------------------------------------------
function drawCrossMarker(x, y){
  let d = getMarkerSizePx() / 2;
  line(x, y - d, x, y + d);
  line(x - d, y, x + d, y);
}


//-------------------------------------------------
function drawDotMarker(x, y){
  const dotRingCount = getDotRingCount();
  for (let i = dotRingCount - 1; i >= 0; i--) {
    const diameter =
      i === 0
        ? getCenterDotDiameterPx()
        : getMarkerSizePx() * (i / (dotRingCount - 1));
    circle(x, y, diameter);
  }
}


//-------------------------------------------------
function drawDrawingGuides(warningOnly = false){
  if (!bDrawNonReproGuide && !bDrawFrame) return;

  beginSvgGroup("DrawingGuides");
  strokeWeight(0.5);
  for (let row=0; row<=nRows; row++){
    for (let col=0; col<=nCols; col++){
      let C = getCellAndFrameCoords(row,col); 
      if (row<nRows && col<nCols){
        const isOverflowing = frameOverflowsPage(row, C);
        if (warningOnly && !isOverflowing) continue;
        if (!warningOnly && isOverflowing) continue;

        beginSvgGroup("guide_" + nf(row,2) + "_" + nf(col,2)); 
        drawingContext.setLineDash(warningOnly ? warningDashPattern : []);

        if (bDrawNonReproGuide){
          let nGuideCols = max(1, floor(C.framew / (guideGridInches * inch)));
          let nGuideRows = max(1, floor(C.frameh / (guideGridInches * inch)));
          stroke(warningOnly ? 'red' : color(200,221,255));
          for (let c=0; c<=nGuideCols; c++){
            let x = map(c,0,nGuideCols, C.framex,C.framex+C.framew);
            line(x,C.framey,x,C.framey+C.frameh);
          }
          for (let r=0; r<=nGuideRows; r++){
            let y = map(r,0,nGuideRows, C.framey,C.framey+C.frameh);
            line(C.framex,y,C.framex+C.framew,y); 
          }
        }

        if (bDrawFrame){
          stroke(warningOnly ? 'red' : 'black');
          rect(C.framex,C.framey, C.framew,C.frameh); 
        }
        endSvgGroup(); 
      }
    }
  }
  strokeWeight(1.0);
  endSvgGroup(); 
  drawingContext.setLineDash([]);
}





//-------------------------------------------------
function getCellAndFrameCoords(row, col){
  let marginPageX = sideMarginInches * inch;
  let markerRadius = getMarkerSizePx() / 2;
  let marginCell = (gutterInches * inch) / 2;
  let centerLeft = marginPageX + markerRadius;
  let centerRight = width - marginPageX - markerRadius;
  let cx = map(col,0,nCols, centerLeft, centerRight);
  let cw = (centerRight - centerLeft) / nCols;
  let fw = cw - 2*marginCell;
  let fh = fw/aspectFrame;
  let ch = fh + 2*marginCell;
  let marginPageY = (height - nRows*ch)/2;
  let cy = marginPageY + row*ch;
  let fx = cx + marginCell;
  let fy = cy + marginCell; 
  
  return { 
    cellx: cx,
    celly: cy,
    cellw: cw,
    cellh: ch, 
    framex: fx, 
    framey: fy, 
    framew: fw,
    frameh: fh
  };
}
