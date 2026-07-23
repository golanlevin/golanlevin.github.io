const APP_W = 1024;
const APP_H = 768;
const NO_SELECTED_NUMBER = -999;
const DATA_MARGIN = 10;
const DATA_PER_ROW = 100;
const PLOT_SCALE = 3;
const PLOT_W = PLOT_SCALE * DATA_PER_ROW + 2;
const THUMB_W = 30;
const GRAPH_W = 355;
const GLOBAL_TOP = 10;
const GRAPH_HELP = 0;
const PLOT_HELP = 1;

let app;

/**
 * Creates the p5 canvas and installs browser-level input guards before starting the app.
 */
function setup() {
  const canvas = createCanvas(APP_W, APP_H);
  canvas.parent(document.querySelector("main"));
  pixelDensity(2);
  canvas.elt.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("mouseup", () => {
    if (app) app.forceMouseReleased();
  });
  window.addEventListener("blur", () => {
    if (app) app.clearHeldKeys();
  });
  frameRate(30);
  noSmooth();
  textLeading(10);
  app = new SecretLivesApp();
}

/**
 * Advances one animation frame and redraws all panels.
 */
function draw() {
  app.update();
  app.draw();
}

/**
 * Forwards p5 mouse presses to the app with the browser event for button detection.
 *
 * @param {MouseEvent} event Browser mouse event supplied by p5.
 * @returns {boolean} false to prevent default browser handling.
 */
function mousePressed(event) {
  return app.mousePressed(mouseX, mouseY, event);
}

/**
 * Forwards p5 mouse releases to the app.
 *
 * @returns {boolean} false to prevent default browser handling.
 */
function mouseReleased() {
  return app.mouseReleased(mouseX, mouseY);
}

/**
 * Forwards p5 mouse movement to the app.
 *
 * @returns {boolean} false to prevent default browser handling.
 */
function mouseMoved() {
  return app.mouseMoved(mouseX, mouseY);
}

/**
 * Forwards p5 mouse drags to the app.
 *
 * @returns {boolean} false to prevent default browser handling.
 */
function mouseDragged() {
  return app.mouseDragged(mouseX, mouseY);
}

/**
 * Forwards p5 wheel events to scroll whichever visualization panel is under the cursor.
 *
 * @param {WheelEvent} event Browser wheel event supplied by p5.
 * @returns {boolean} false when the app consumes the wheel event.
 */
function mouseWheel(event) {
  return app.mouseWheel(event);
}

/**
 * Handles global keyboard shortcuts.
 *
 * @returns {boolean} false when the app consumes the key.
 */
function keyPressed() {
  return app.keyPressed(key, keyCode);
}

/**
 * Stops app-managed key repeat when a held arrow key is released.
 *
 * @returns {boolean} false when the app consumes the key.
 */
function keyReleased() {
  return app.keyReleased(key, keyCode);
}

/**
 * Owns shared state, panel geometry, global input routing, and the left-side interface.
 */
class SecretLivesApp {
  /**
   * Builds the fixed 1024x768 layout and instantiates the visualization panels.
   */
  constructor() {
    this.colors = new ColorScheme();
    this.datasets = window.SLON_DATA.datasets.map((source) => new DataSource(source));
    this.legacyPhrases = window.SLON_DATA.phrases;
    this.phrases2026 = window.SLON_DATA_2026_PHRASES || null;
    this.currentDatasetIndex = 0;
    this.currentPhrases = null;
    this.clock = 0;
    this.heldArrowKeyCode = null;
    this.heldArrowDirection = null;
    this.nextArrowRepeatTime = 0;
    this.arrowRepeatInitialDelay = 220;
    this.arrowRepeatInterval = 30;
    this.searchActive = false;
    this.searchBuffer = "";
    this.graphArrowDetached = false;
    this.heldOneShotKeys = new Set();

    const plL = APP_W - PLOT_W - 10;
    const gcL = APP_W - (GRAPH_W + PLOT_W) - 20;
    const thL = APP_W - (GRAPH_W + PLOT_W + THUMB_W) - 20;
    this.inW = thL - 11;

    this.graphRect = new Rect(gcL, GLOBAL_TOP, GRAPH_W, APP_H - 10);
    this.thumbRect = new Rect(thL, GLOBAL_TOP, THUMB_W, APP_H - 10);
    this.plotRect = new Rect(plL, GLOBAL_TOP, PLOT_W, APP_H - 10);

    this.mainStrings = [
      "This interactive visualization invites you to explore how",
      "the usage patterns of numbers reflect our culture, history, ",
      "and biology. The data shown represents the \"popularity\" ",
      "of every integer between 0 and 100000, collected at",
      "periodic intervals since 1997 from an Internet search ",
      "engine. The results form an intimate portrait of what we",
      "consider important, quantitatively rendered. ",
      " ",
      "For this project, we defined an integer's \"popularity\" ",
      "to mean the number of Web pages that were reported to",
      "contain it. We recorded the popularity of all the numbers ",
      "from 1 to 100000, on multiple occasions. When possible, ",
      "phrases that were commonly associated with these ",
      "numbers were also retrieved, and are shown below.",
      " ",
      "Many patterns are immediately evident, such as the peak ",
      "between 1700 and 2000, which reflects the hegemony of ",
      "the Western calendric system. Regular spikes on powers ",
      "and multiples of ten reflect the importance of our ",
      "biologically driven, base-10 numbering system. Some",
      "numbers, such as 911, 1040 or 90210, achieve individual",
      "prominence because of the role they play in our culture. ",
      "Other numbers stand out simply because they are easier ",
      "to remember, such as 12345. What patterns and secrets",
      "can you discover?",
      " ",
      "Created by Golan Levin et al., 2002.",
      "Concept and interface: Golan Levin",
      "Interface suggestions: Martin Wattenberg",
      "Database: Jonathan Feinberg, David Becker",
      "Statistics consulting: David Elashoff",
      "Essay and research: Shelly Wynecoop",
      "Commissioned by: Turbulence.org",
      "Funded by the Greenwall Foundation.",
    ];

    this.textSeparationY = 20;
    this.nInterfaceTexts = 5;
    this.titleHeight = 26;
    const mainHeight = 22 + this.mainStrings.length * 10 + this.titleHeight;
    this.mainStringRect = new Rect(10, GLOBAL_TOP, this.inW, mainHeight);
    this.interfaceRect = new Rect(
      10,
      GLOBAL_TOP + this.mainStringRect.h + 10,
      this.inW,
      8 * this.textSeparationY + 112 + 16
    );
    this.interfaceTextYs = [];
    for (let i = 0; i < this.nInterfaceTexts; i++) {
      this.interfaceTextYs.push(26 + this.interfaceRect.y + this.textSeparationY * i);
    }
    const hbrL = this.mainStringRect.x + this.inW - 16;
    const hbrT = this.interfaceRect.y + this.interfaceRect.h + 9;
    this.linlogBoxRect = new Rect(hbrL, hbrT, 16, 16);

    this.balloon = new HelpBalloon(this.colors);
    this.graph = new GraphView(this, this.graphRect);
    this.thumb = new ThumbView(this, this.thumbRect);
    this.plot = new PlotView(this, this.plotRect);
    this.graph.plot = this.plot;
    this.init2026PhraseData();

    this.mainPalIndex = 0;
    this.interfacePalIndex = 0;
    this.palSkip = 20;
    this.activeTarget = null;
    this.prevGraphFocus = false;
    this.prevPlotFocus = false;
    this.lastMouseMoveTime = millis();
    this.initDatasetDropdown();
    this.retrievePhrases(NO_SELECTED_NUMBER);
  }

  /**
   * Computes the custom dataset dropdown geometry inside the info panel.
   */
  initDatasetDropdown() {
    textFont("Courier");
    textSize(11);
    const dscL = 11 + textWidth("Range high:") + 4 + this.mainStringRect.x;
    const guiW = this.graphRect.x - (THUMB_W + dscL) - 12;
    this.datasetDropdownRect = new Rect(dscL, this.interfaceTextYs[0] - this.textSeparationY + 6, guiW, this.textSeparationY);
    this.datasetDropdownOpen = false;
  }

  /**
   * Returns the currently selected popularity-count dataset.
   *
   * @returns {DataSource} Active dataset wrapper.
   */
  get dataset() {
    return this.datasets[this.currentDatasetIndex];
  }

  /**
   * Refreshes the phrase display after asynchronous 2026 phrase decoding finishes.
   */
  init2026PhraseData() {
    if (!this.phrases2026 || !this.phrases2026.ready) return;
    this.phrases2026.ready.then(() => {
      if (this.uses2026Phrases()) this.retrievePhrases(this.graph.selectedNumber);
    });
  }

  /**
   * Returns whether the active dataset should use the 2026 phrase associations.
   *
   * @returns {boolean} true when the July 2026 dataset is selected.
   */
  uses2026Phrases() {
    return this.dataset && this.dataset.nick === "2026 July";
  }

  /**
   * Loads cached phrase associations for the selected integer from the active phrase lookup.
   *
   * @param {number} num Integer whose phrases should be displayed.
   */
  retrievePhrases(num) {
    if (num < 0 || num > 100000) {
      this.currentPhrases = null;
      return;
    }

    if (this.uses2026Phrases()) {
      if (!this.phrases2026) {
        this.currentPhrases = null;
      } else if (this.phrases2026.error) {
        this.currentPhrases = ["2026 associations unavailable."];
      } else if (!this.phrases2026.loaded) {
        this.currentPhrases = ["Loading 2026 associations..."];
      } else {
        this.currentPhrases = this.phrases2026.get(num) || null;
      }
    } else {
      this.currentPhrases = this.legacyPhrases[String(num)] || null;
    }
  }

  /**
   * Switches datasets and refreshes each panel's dataset-dependent state.
   *
   * The visible range and scale settings are preserved so matching integer spans can be
   * compared across snapshots.
   *
   * @param {number} index Dataset index in `this.datasets`.
   */
  setDataset(index) {
    this.currentDatasetIndex = constrain(index, 0, this.datasets.length - 1);
    this.graph.setDataset({ preserveView: true });
    this.plot.setDataset();
    this.thumb.setDataset();
    this.retrievePhrases(this.graph.selectedNumber);
  }

  /**
   * Moves the selected integer by a keyboard step while keeping it inside the dataset range.
   *
   * @param {number} delta Amount to add to the currently selected integer.
   */
  stepSelectedNumber(delta) {
    if (this.graph.rect.contains(mouseX, mouseY)) {
      const hovered = this.graph.hoveredNumberAtY(mouseY - this.graph.rect.y);
      const selected = this.graph.selectedNumber >= this.dataset.xMin && this.graph.selectedNumber <= this.dataset.xMax ? this.graph.selectedNumber : hovered;
      if (this.graphArrowDetached) {
        const next = this.setKeyboardSelectedNumber(selected + delta);
        if (next === hovered) this.graphArrowDetached = false;
        return;
      }

      this.clearKeyboardSelection();
      if (!this.graph.scrollByInteger(delta)) {
        this.graphArrowDetached = true;
        this.setKeyboardSelectedNumber(selected + delta);
        return;
      }
      this.setKeyboardSelectedNumber(selected + delta);
      return;
    }

    const selected = this.graph.selectedNumber;
    const current = selected >= this.dataset.xMin && selected <= this.dataset.xMax ? selected : this.dataset.xMin;
    this.setKeyboardSelectedNumber(current + delta);
  }

  /**
   * Applies arrow-key stepping using the interaction rules for the hovered visualization.
   *
   * @param {"left"|"right"|"up"|"down"} direction Arrow direction to apply.
   */
  stepSelectionForArrow(direction) {
    if (this.plot.rect.contains(mouseX, mouseY)) {
      this.stepPlotSelection(direction);
      return;
    }
    this.stepSelectedNumber(direction === "down" || direction === "right" ? 1 : -1);
  }

  /**
   * Moves the pixel-view selection by cell or row and scrolls vertically for row movement.
   *
   * @param {"left"|"right"|"up"|"down"} direction Arrow direction to apply.
   */
  stepPlotSelection(direction) {
    const localX = mouseX - this.plot.rect.x;
    const localY = mouseY - this.plot.rect.y;
    const selected = this.graph.selectedNumber;
    const hovered = this.plot.hoveredNumberAt(localX, localY);
    const current = this.plot.keyboardSelectionActive && selected >= this.dataset.xMin && selected <= this.dataset.xMax ? selected : hovered;
    const rowStart = Math.floor(current / DATA_PER_ROW) * DATA_PER_ROW;
    const rowEnd = Math.min(rowStart + DATA_PER_ROW - 1, this.dataset.xMax);
    let next = current;
    if (direction === "left") next = Math.max(rowStart, current - 1);
    else if (direction === "right") next = Math.min(rowEnd, current + 1);
    else if (direction === "down") next = constrain(current + DATA_PER_ROW, this.dataset.xMin, this.dataset.xMax);
    else if (direction === "up") next = constrain(current - DATA_PER_ROW, this.dataset.xMin, this.dataset.xMax);

    const selectionDelta = next - current;
    if (selectionDelta !== 0) {
      const actualScroll = this.graph.scrollByInteger(selectionDelta);
      if (actualScroll) this.plot.shiftImageByDataDelta(actualScroll);
    }
    this.setKeyboardSelectedNumber(next);
  }

  /**
   * Sets the keyboard-driven selected integer while keeping it inside the dataset range.
   *
   * @param {number} num Desired integer to highlight.
   * @returns {number} Clamped integer that was highlighted.
   */
  setKeyboardSelectedNumber(num) {
    const next = constrain(num, this.dataset.xMin, this.dataset.xMax);
    this.graph.setKeyboardSelection(next);
    this.plot.setKeyboardSelection(next);
    this.retrievePhrases(next);
    return next;
  }

  /**
   * Centers the current graph span on an integer and makes that integer the highlight.
   *
   * @param {number} num Integer to find.
   */
  jumpToNumber(num) {
    const target = constrain(num, this.dataset.xMin, this.dataset.xMax);
    this.clearHeldArrowKey();
    this.graph.centerOnNumber(target);
    this.setKeyboardSelectedNumber(target);
    this.plot.snapToGraphRange();
  }

  /**
   * Returns pointer-driven highlighting to the graph and pixel panels.
   */
  clearKeyboardSelection() {
    this.graphArrowDetached = false;
    this.graph.clearKeyboardSelection();
    this.plot.clearKeyboardSelection();
  }

  /**
   * Runs per-frame state updates before drawing.
   */
  update() {
    this.clock++;
    this.balloon.updateIdle(millis() - this.lastMouseMoveTime >= 30000);
    this.updateFocus();
    this.updateHeldArrowKey();
    this.thumb.update();
    this.plot.update();
    this.graph.update();
  }

  /**
   * Applies steady repeat stepping while an arrow key remains held.
   */
  updateHeldArrowKey() {
    if (this.heldArrowKeyCode === null) return;
    const now = millis();
    if (now < this.nextArrowRepeatTime) return;
    this.stepSelectionForArrow(this.heldArrowDirection);
    this.nextArrowRepeatTime = now + this.arrowRepeatInterval;
  }

  /**
   * Updates panel focus flags and triggers help balloon entrance animation on panel entry.
   */
  updateFocus() {
    const graphFocus = this.graph.rect.contains(mouseX, mouseY) || this.graph.mouseDown;
    const plotFocus = this.plot.rect.contains(mouseX, mouseY) || this.plot.mouseDown;
    if (graphFocus && !this.prevGraphFocus) this.balloon.reset(GRAPH_HELP);
    if (plotFocus && !this.prevPlotFocus) this.balloon.reset(PLOT_HELP);
    this.graph.haveFocus = graphFocus;
    this.plot.haveFocus = plotFocus;
    this.thumb.haveFocus = this.thumb.rect.contains(mouseX, mouseY) || this.thumb.mouseDown;
    this.prevGraphFocus = graphFocus;
    this.prevPlotFocus = plotFocus;
  }

  /**
   * Draws the full application in back-to-front order.
   */
  draw() {
    background(this.colors.bg);
    this.balloon.clearBounds();
    this.thumb.draw();
    this.plot.draw();
    this.graph.draw();
    this.drawInterface();
  }

  /**
   * Draws the explanatory copy, statistics, phrase list, and custom controls.
   */
  drawInterface() {
    const c = this.colors;
    const mr = this.mainStringRect;
    const ir = this.interfaceRect;
    this.mainPalIndex = stepPalette(this.mainPalIndex, mr.contains(mouseX, mouseY), this.palSkip);
    this.interfacePalIndex = stepPalette(this.interfacePalIndex, ir.contains(mouseX, mouseY), this.palSkip);

    noStroke();
    fill(c.thumbPalette[this.mainPalIndex]);
    rect(mr.x, mr.y, mr.w, mr.h, 9);
    fill(c.thumbPalette[this.interfacePalIndex]);
    rect(ir.x, ir.y, ir.w, ir.h, 9);
    noFill();
    stroke(c.border);
    rect(ir.x, ir.y, ir.w, ir.h, 9);
    rect(mr.x, mr.y, mr.w, mr.h, 9);

    const textL = mr.x + 11;
    drawShadowText("The Secret Lives of Numbers", textL, mr.y + 26, 16, "Helvetica", ITALIC, c.interfaceText, c.interfaceTextShadow);

    textFont("Helvetica");
    textStyle(NORMAL);
    textSize(10);
    for (let i = 0; i < this.mainStrings.length; i++) {
      const y = i * 10 + 20 + mr.y + this.titleHeight;
      drawShadowText(this.mainStrings[i], textL, y, 10, "Helvetica", NORMAL, c.interfaceText, c.interfaceTextShadow);
    }

    const ds = this.dataset;
    const selected = this.graph.selectedNumber;
    let popularity = "...";
    let percentile = "...";
    let rank = "...";
    if (selected >= 0 && selected < ds.nData && ds.data[selected] > 0) {
      popularity = String(ds.data[selected]);
      rank = String(ds.rankFor(selected));
      percentile = nf(ds.percentileFor(selected), 0, 3) + "%";
    }

    const rows = [
      "Data set  : ",
      null,
      "Popularity: " + popularity,
      "Percentile: " + percentile,
      "Rank /100K: " + rank,
    ];
    for (let i = 0; i < rows.length; i++) {
      if (i === 1) this.drawSelectedNumberField(textL, this.interfaceTextYs[i]);
      else drawShadowText(rows[i], textL, this.interfaceTextYs[i], 11, "Courier", NORMAL, c.interfaceText, c.interfaceTextShadow);
    }

    let ty = this.interfaceTextYs[this.nInterfaceTexts - 1] + this.textSeparationY;
    drawShadowText("Associations for " + this.graph.getSelectedString() + ":", textL, ty, 11, "Courier", NORMAL, c.interfaceText, c.interfaceTextShadow);

    const phrx = ir.x + 5;
    const phry = ty + 5;
    const phrw = ir.w - 10;
    const phrh = ir.y + ir.h - ty - 10;
    noStroke();
    fill(c.thumbRect2);
    rect(phrx, phry, phrw, phrh);
    noFill();
    stroke(c.thumbShadow3);
    rect(phrx, phry, phrw, phrh);

    ty += 10;
    const phrases = this.currentPhrases && this.currentPhrases.length ? this.currentPhrases : ["None."];
    const maxLines = Math.floor((phrh - 7) / 11);
    for (let i = 0; i < Math.min(phrases.length, maxLines); i++) {
      ty += 11;
      drawShadowText(phrases[i], textL, ty, 10, "Helvetica", NORMAL, c.interfaceText, c.interfaceTextShadow);
    }

    this.drawLinLogToggle();
    this.drawDatasetDropdown();
  }

  /**
   * Draws the selected-number row, including the active numeric jump-entry field.
   *
   * @param {number} x Left baseline coordinate for the row label.
   * @param {number} y Text baseline coordinate for the row.
   */
  drawSelectedNumberField(x, y) {
    const c = this.colors;
    const label = "Selected #: ";
    if (!this.searchActive) {
      drawShadowText(label + this.graph.getSelectedString(), x, y, 11, "Courier", NORMAL, c.interfaceText, c.interfaceTextShadow);
      return;
    }

    drawShadowText(label, x, y, 11, "Courier", NORMAL, c.interfaceText, c.interfaceTextShadow);
    textFont("Courier");
    textStyle(NORMAL);
    textSize(11);
    const fieldRect = this.selectedNumberFieldRect();
    fill(252, 248, 236);
    stroke(0);
    rect(fieldRect.x, fieldRect.y, fieldRect.w, fieldRect.h);
    fill(0);
    noStroke();
    text(this.searchBuffer, fieldRect.x + 4, y);
    if (Math.floor(millis() / 450) % 2 === 0) {
      const caretX = fieldRect.x + 7 + textWidth(this.searchBuffer);
      stroke(0);
      line(caretX, fieldRect.y + 2, caretX, fieldRect.y + 11);
    }
  }

  /**
   * Computes the selected-number value area's clickable/editing rectangle.
   *
   * @returns {Rect} Canvas-space rectangle for numeric jump entry.
   */
  selectedNumberFieldRect() {
    textFont("Courier");
    textStyle(NORMAL);
    textSize(11);
    const displayText = this.searchActive ? this.searchBuffer : this.graph.getSelectedString();
    const fieldW = Math.max(textWidth("100000") + 13, textWidth(displayText) + 13);
    return new Rect(this.datasetDropdownRect.x, this.interfaceTextYs[1] - 11, fieldW, 14);
  }

  /**
   * Draws the linear/logarithmic scale toggle control.
   */
  drawLinLogToggle() {
    const c = this.colors;
    const r = this.linlogBoxRect;
    textFont("Helvetica");
    textStyle(NORMAL);
    textSize(10);
    const label = "linear / logarithmic ";
    const labelW = textWidth(label);
    fill(c.border);
    noStroke();
    text(label, r.x - labelW - 5, r.y + 12);
    fill(c.balloonBg);
    text(label, r.x - labelW - 6, r.y + 11);
    fill(c.helpRectOff);
    rect(r.x, r.y, r.w, r.h);
    stroke(c.helpRectOn);
    const isq = [4, 7, 9, 10, 11, 12, 13, 14, 14, 15, 15, 15, 16, 16];
    const base = r.y + 16;
    for (let i = 2; i < 16; i++) {
      const h = this.graph.scaleMode === "linear" ? i - 1 : isq[i - 2] - 2;
      line(r.x + i, base, r.x + i, base - h);
    }
    noFill();
    stroke(c.border);
    rect(r.x, r.y, r.w, r.h);
  }

  /**
   * Draws the custom dataset dropdown and its opened option list.
   */
  drawDatasetDropdown() {
    const c = this.colors;
    const r = this.datasetDropdownRect;
    textFont("Courier");
    textStyle(NORMAL);
    textSize(11);
    textAlign(LEFT, CENTER);
    stroke(c.border);
    fill(0);
    rect(r.x, r.y, r.w, r.h);
    noStroke();
    fill(c.interfaceText);
    text(this.datasets[this.currentDatasetIndex].nick, r.x + 6, r.y + r.h * 0.52);
    fill(c.interfaceText);
    triangle(r.x + r.w - 13, r.y + 7, r.x + r.w - 5, r.y + 7, r.x + r.w - 9, r.y + 13);

    if (!this.datasetDropdownOpen) return;
    const optionH = r.h;
    for (let i = 0; i < this.datasets.length; i++) {
      const y = r.y + r.h + i * optionH;
      const hot = mouseX >= r.x && mouseX < r.x + r.w && mouseY >= y && mouseY < y + optionH;
      stroke(c.border);
      fill(hot ? color(252, 248, 236) : i === this.currentDatasetIndex ? color(91, 103, 105) : color(0, 0, 0));
      rect(r.x, y, r.w, optionH);
      noStroke();
      fill(hot ? color(0, 0, 0) : c.interfaceText);
      text(this.datasets[i].nick, r.x + 6, y + optionH * 0.52);
    }
  }

  /**
   * Handles clicks on the custom dataset dropdown.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} true when the dropdown consumed the click.
   */
  handleDatasetDropdownPress(x, y) {
    const r = this.datasetDropdownRect;
    if (r.contains(x, y)) {
      this.datasetDropdownOpen = !this.datasetDropdownOpen;
      return true;
    }
    if (this.datasetDropdownOpen) {
      for (let i = 0; i < this.datasets.length; i++) {
        const optionRect = new Rect(r.x, r.y + r.h + i * r.h, r.w, r.h);
        if (optionRect.contains(x, y)) {
          this.setDataset(i);
          this.datasetDropdownOpen = false;
          return true;
        }
      }
      this.datasetDropdownOpen = false;
      return true;
    }
    return false;
  }

  /**
   * Activates numeric jump entry when the selected-number value area is clicked.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} true when the click activated the field.
   */
  handleSelectedNumberFieldPress(x, y) {
    const r = this.selectedNumberFieldRect();
    if (!new Rect(r.x, r.y, r.w, r.h + 6).contains(x, y)) return false;
    const selected = this.graph.selectedNumber;
    this.clearHeldArrowKey();
    this.searchActive = true;
    this.searchBuffer = selected >= this.dataset.xMin && selected <= this.dataset.xMax ? String(selected) : "";
    return true;
  }

  /**
   * Routes a mouse press to the topmost interactive region.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @param {MouseEvent|null} event Browser mouse event for physical button detection.
   * @returns {boolean} false to suppress default browser handling.
   */
  mousePressed(x, y, event = null) {
    this.updateFocus();
    if (this.balloon.dismissAt(x, y)) return false;
    if (this.handleDatasetDropdownPress(x, y)) return false;
    if (this.handleSelectedNumberFieldPress(x, y)) return false;
    if (this.linlogBoxRect.contains(x, y)) {
      this.graph.flipScaleMode();
      return false;
    }
    this.activeTarget = null;
    if (this.graph.rect.contains(x, y)) {
      this.clearKeyboardSelection();
      this.plot.clearSingleSelectionLatch();
      this.activeTarget = this.graph;
      const isRightMousePress = (event && event.button === 2) || mouseButton === RIGHT;
      return this.graph.mousePressed(x - this.graph.rect.x, y - this.graph.rect.y, isRightMousePress);
    }
    if (this.plot.rect.contains(x, y)) {
      this.clearKeyboardSelection();
      this.activeTarget = this.plot;
      return this.plot.mousePressed(x - this.plot.rect.x, y - this.plot.rect.y);
    }
    if (this.thumb.rect.contains(x, y)) {
      this.activeTarget = this.thumb;
      return this.thumb.mousePressed(x - this.thumb.rect.x, y - this.thumb.rect.y);
    }
    return false;
  }

  /**
   * Releases the currently active interaction target.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseReleased(x, y) {
    if (this.activeTarget) {
      this.activeTarget.mouseReleased(x - this.activeTarget.rect.x, y - this.activeTarget.rect.y);
      this.activeTarget = null;
    }
    return false;
  }

  /**
   * Clears all pressed states after a browser-level mouseup, including outside-canvas releases.
   */
  forceMouseReleased() {
    if (this.activeTarget) {
      this.activeTarget.mouseReleased(mouseX - this.activeTarget.rect.x, mouseY - this.activeTarget.rect.y);
      this.activeTarget = null;
    }
    this.graph.mouseDown = false;
    this.graph.mouseOutside = false;
    this.plot.mouseDown = false;
    this.thumb.mouseDown = false;
    this.thumb.grabbed = this.thumb.GRABBED_NONE;
  }

  /**
   * Routes passive mouse movement and resets the interaction-idle timer.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseMoved(x, y) {
    this.lastMouseMoveTime = millis();
    this.updateFocus();
    if (this.graph.rect.contains(x, y) || this.plot.rect.contains(x, y)) this.clearKeyboardSelection();
    this.graph.mouseMoved(x - this.graph.rect.x, y - this.graph.rect.y);
    this.plot.mouseMoved(x - this.plot.rect.x, y - this.plot.rect.y);
    this.thumb.mouseMoved(x - this.thumb.rect.x, y - this.thumb.rect.y);
    return false;
  }

  /**
   * Routes drag updates to whichever panel received the original press.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseDragged(x, y) {
    this.lastMouseMoveTime = millis();
    this.updateFocus();
    if (this.graph.rect.contains(x, y) || this.plot.rect.contains(x, y)) this.clearKeyboardSelection();
    if (this.activeTarget) {
      this.activeTarget.mouseDragged(x - this.activeTarget.rect.x, y - this.activeTarget.rect.y);
    }
    return false;
  }

  /**
   * Scrolls the current graph range when the wheel is used over the graph or pixel plot.
   *
   * @param {WheelEvent} event Browser wheel event supplied by p5.
   * @returns {boolean} false when consumed by the app.
   */
  mouseWheel(event) {
    if (this.graph.rect.contains(mouseX, mouseY) || this.plot.rect.contains(mouseX, mouseY)) {
      this.plot.clearSingleSelectionLatch();
      const span = this.graph.yHighTarget - this.graph.yLowTarget;
      const delta = event.delta > 0 ? span * 0.08 : -span * 0.08;
      this.graph.selectBlur(this.graph.yLowTarget + delta, this.graph.yHighTarget + delta);
      return false;
    }
    return true;
  }

  /**
   * Handles app-level keyboard shortcuts.
   *
   * @param {string} pressedKey Last key reported by p5.
   * @param {number} pressedKeyCode Last keyCode reported by p5.
   * @returns {boolean} false when the app consumes the key.
   */
  keyPressed(pressedKey, pressedKeyCode) {
    if (this.handleSearchKey(pressedKey, pressedKeyCode)) return false;

    if (pressedKey === "h" || pressedKey === "H") {
      if (this.consumeOneShotKey("h")) return false;
      this.showHelp();
      return false;
    }

    const datasetIndex = ["a", "s", "d", "f", "g"].indexOf(pressedKey.toLowerCase());
    if (Number.isInteger(datasetIndex) && datasetIndex >= 0 && datasetIndex < this.datasets.length) {
      if (this.consumeOneShotKey(pressedKey.toLowerCase())) return false;
      this.setDataset(datasetIndex);
      this.datasetDropdownOpen = false;
      return false;
    }

    const arrowDirection = this.arrowDirectionForKey(pressedKey, pressedKeyCode);
    if (arrowDirection) {
      const newHeldArrow = this.heldArrowKeyCode !== pressedKeyCode || this.heldArrowDirection !== arrowDirection;
      if (newHeldArrow) {
        this.stepSelectionForArrow(arrowDirection);
        this.heldArrowKeyCode = pressedKeyCode;
        this.heldArrowDirection = arrowDirection;
        this.nextArrowRepeatTime = millis() + this.arrowRepeatInitialDelay;
      }
      return false;
    }

    return true;
  }

  /**
   * Updates numeric jump-entry state from a key press.
   *
   * @param {string} pressedKey Last key reported by p5.
   * @param {number} pressedKeyCode Last keyCode reported by p5.
   * @returns {boolean} true when the key was consumed by search entry.
   */
  handleSearchKey(pressedKey, pressedKeyCode) {
    const digit = /^[0-9]$/.test(pressedKey) ? pressedKey : null;
    const isReturn = pressedKey === "Enter" || pressedKey === "Return" || pressedKeyCode === 13;
    const isEscape = pressedKey === "Escape" || pressedKeyCode === 27;
    const isBackspace = pressedKey === "Backspace" || pressedKeyCode === 8;

    if (!this.searchActive) {
      if (!digit) return false;
      this.clearHeldArrowKey();
      this.searchActive = true;
      this.searchBuffer = digit;
      return true;
    }

    if (digit) {
      const maxDigits = String(this.dataset.xMax).length;
      if (this.searchBuffer.length < maxDigits) this.searchBuffer += digit;
      return true;
    }
    if (isBackspace) {
      this.searchBuffer = this.searchBuffer.slice(0, -1);
      return true;
    }
    if (isEscape) {
      this.searchActive = false;
      this.searchBuffer = "";
      return true;
    }
    if (isReturn) {
      if (this.searchBuffer) this.jumpToNumber(Number(this.searchBuffer));
      this.searchActive = false;
      this.searchBuffer = "";
      return true;
    }
    return true;
  }

  /**
   * Stops repeating an arrow key when that physical key is released.
   *
   * @param {string} releasedKey Last released key reported by p5.
   * @param {number} releasedKeyCode Last released keyCode reported by p5.
   * @returns {boolean} false when the app consumes the key.
   */
  keyReleased(releasedKey, releasedKeyCode) {
    this.heldOneShotKeys.delete(releasedKey.toLowerCase());
    if (this.arrowDirectionForKey(releasedKey, releasedKeyCode)) {
      if (this.heldArrowKeyCode === releasedKeyCode) this.clearHeldArrowKey();
      return false;
    }
    return true;
  }

  /**
   * Clears app-managed arrow-key repeat state.
   */
  clearHeldArrowKey() {
    this.heldArrowKeyCode = null;
    this.heldArrowDirection = null;
    this.nextArrowRepeatTime = 0;
  }

  /**
   * Clears all app-managed held-key state.
   */
  clearHeldKeys() {
    this.clearHeldArrowKey();
    this.heldOneShotKeys.clear();
  }

  /**
   * Consumes a one-shot shortcut if it is already held, otherwise marks it held.
   *
   * @param {string} keyName Normalized shortcut key name.
   * @returns {boolean} true when this press is a repeated held-key press.
   */
  consumeOneShotKey(keyName) {
    if (this.heldOneShotKeys.has(keyName)) return true;
    this.heldOneShotKeys.add(keyName);
    return false;
  }

  /**
   * Converts p5/browser arrow key identifiers into arrow directions.
   *
   * @param {string} keyName Last key name reported by p5.
   * @param {number} code Last keyCode reported by p5.
   * @returns {"left"|"right"|"up"|"down"|null} Arrow direction, or null for non-arrow keys.
   */
  arrowDirectionForKey(keyName, code) {
    if (keyName === "ArrowDown" || code === 40) return "down";
    if (keyName === "ArrowRight" || code === 39) return "right";
    if (keyName === "ArrowUp" || code === 38) return "up";
    if (keyName === "ArrowLeft" || code === 37) return "left";
    return null;
  }

  /**
   * Re-enables dismissed help balloons and shows any balloon whose panel is active.
   */
  showHelp() {
    this.balloon.undismissAll();
    this.updateFocus();
    if (this.graph.haveFocus) this.balloon.reset(GRAPH_HELP);
    if (this.plot.haveFocus) this.balloon.reset(PLOT_HELP);
  }
}

/**
 * Wraps one popularity snapshot and computes cached rank/percentile lookups.
 */
class DataSource {
  /**
   * Initializes numeric and log-transformed data arrays for one snapshot.
   *
   * @param {object} source Decoded dataset payload from `window.SLON_DATA`.
   */
  constructor(source) {
    this.file = source.file;
    this.nick = source.nick;
    this.name = source.name;
    this.data = source.data;
    this.nData = 100001;
    this.xMin = 0;
    this.xMax = 100000;
    this.xRange = 100000;
    this.logData = this.data.map((v) => (v > 0 ? Math.log10(v) : 0));
    this.yMax = Math.max(...this.data);
    this.sortedValues = null;
  }

  /**
   * Lazily sorts values so Java-style rank/percentile can be computed by lower-bound search.
   */
  ensureSortedValues() {
    if (this.sortedValues) return;
    this.sortedValues = Array.from(this.data).sort((a, b) => a - b);
  }

  /**
   * Computes the Java applet's rank definition: `nData - count(values < selectedValue)`.
   *
   * @param {number} index Integer whose count should be ranked.
   * @returns {number} Rank among the 100001 stored values.
   */
  rankFor(index) {
    this.ensureSortedValues();
    return this.nData - lowerBound(this.sortedValues, this.data[index]);
  }

  /**
   * Computes percentile as the percentage of values below the selected count.
   *
   * @param {number} index Integer whose count should be measured.
   * @returns {number} Percentile in the range 0..100.
   */
  percentileFor(index) {
    this.ensureSortedValues();
    return (100 * lowerBound(this.sortedValues, this.data[index])) / this.nData;
  }
}

/**
 * Draws and interacts with the vertical popularity histogram from the Java `GraphCanvas`.
 */
class GraphView {
  /**
   * Creates graph geometry, smoothing state, and initial dataset bounds.
   *
   * @param {SecretLivesApp} app Owning application.
   * @param {Rect} rect Canvas-space panel rectangle.
   */
  constructor(app, rect) {
    this.app = app;
    this.rect = rect;
    this.W = rect.w;
    this.H = rect.h;
    this.gL = 60;
    this.gR = this.W;
    this.gT = 0;
    this.gB = this.H;
    this.gW = this.gR - this.gL;
    this.gH = this.gB - this.gT;
    this.gHm1 = this.gH - 1;
    this.keyIndent = 8;
    this.selectedNumber = NO_SELECTED_NUMBER;
    this.prevSelectedNumber = NO_SELECTED_NUMBER;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.haveFocus = false;
    this.mouseOutside = false;
    this.keyboardSelectionActive = false;
    this.zoomOut = false;
    this.isRightMousePress = false;
    this.lastMouseDownTime = millis();
    this.scaleMode = "linear";
    this.switchModesOnNextCompute = false;
    this.runningDataAverage = 1;
    this.dataScaleFactor = 1.1167109e-5;
    this.log10ofDataAvg = 3;
    this.visu = new Array(this.gH).fill(0);
    this.graphIsSparse = false;
    this.majorLabelSkip = 2500;
    this.prevMajorLabelSkip = 2500;
    this.labelSkipTime = millis();
    this.fadeLabelTime = 400;
    this.plot = null;
    this.setDataset();
  }

  /**
   * Rebinds the graph to the current dataset.
   *
   * @param {{preserveView?: boolean}} options Dataset switch options.
   */
  setDataset(options = {}) {
    const preserveView = Boolean(options.preserveView);
    const previous = preserveView
      ? {
          yLow: this.yLow,
          yHigh: this.yHigh,
          yLowTarget: this.yLowTarget,
          yHighTarget: this.yHighTarget,
          selectedNumber: this.selectedNumber,
        }
      : null;
    this.ds = this.app.dataset;
    if (preserveView && previous) {
      const range = this.clampRangeToView(previous.yLow, previous.yHigh);
      this.yLow = range.lo;
      this.yHigh = range.hi;
      this.yVals = this.yHigh - this.yLow;
      this.yValsInv = 1 / this.yVals;
      this.yLowI = Math.round(this.yLow);
      this.yHighI = Math.round(this.yHigh);
      const targetRange = this.clampRangeToView(previous.yLowTarget, previous.yHighTarget);
      this.yLowTarget = targetRange.lo;
      this.yHighTarget = targetRange.hi;
      this.selectedNumber =
        previous.selectedNumber === NO_SELECTED_NUMBER
          ? NO_SELECTED_NUMBER
          : constrain(previous.selectedNumber, this.ds.xMin, this.ds.xMax);
      this.prevSelectedNumber = NO_SELECTED_NUMBER;
    } else {
      this.select(this.ds.xMin - DATA_MARGIN, this.ds.xMax * 0.03);
    }
    this.runningDataAverage = 1;
    this.dataScaleFactor = 1.1167109e-5;
    this.log10ofDataAvg = 3;
  }

  /**
   * Requests a switch between linear and logarithmic horizontal count scaling.
   */
  flipScaleMode() {
    this.switchModesOnNextCompute = true;
  }

  /**
   * Runs the graph's smoothed scroll, selection, zoom, and rasterization updates.
   */
  update() {
    if (this.switchModesOnNextCompute) {
      this.scaleMode = this.scaleMode === "linear" ? "logarithmic" : "linear";
      this.runningDataAverage = 1;
      this.dataScaleFactor = 1.1167109e-5;
      this.log10ofDataAvg = 3;
      this.switchModesOnNextCompute = false;
    }
    this.computeScroll();
    this.computeBounds();
    this.computeSelection();
    this.computePossibleZoom();
    this.computeGraph();
    if (this.selectedNumber !== this.prevSelectedNumber) {
      this.app.retrievePhrases(this.selectedNumber);
      this.prevSelectedNumber = this.selectedNumber;
    }
  }

  /**
   * Draws the graph panel into its clipped frame.
   */
  draw() {
    push();
    translate(this.rect.x, this.rect.y);
    beginPanelClip(0, 0, this.W, this.H);
    const c = this.app.colors;
    noStroke();
    fill(c.graphBg);
    rect(this.gL, this.gT, this.gW, this.gH);
    this.paintGrid();
    this.paintGraph();
    this.paintCross();
    this.paintKey();
    if (this.haveFocus) this.app.balloon.draw(this.W - 160, this.H, 150, this.H, GRAPH_HELP, this.rect.x, this.rect.y);
    endPanelClip();
    noFill();
    stroke(c.border);
    rect(0, 0, this.W, this.H-0.5);
    pop();
  }

  /**
   * Draws horizontal-scale grid lines and rotated count labels, fading density by zoom level.
   */
  paintGrid() {
    const c = this.app.colors;
    const maxIndex = c.palSize - 1;
    const power0 = Math.floor(this.log10ofDataAvg);
    const unit0 = Math.pow(10, power0);
    const sdu0 = unit0 * this.dataScaleFactor;
    if (sdu0 <= 1) return;

    if (this.scaleMode === "linear") {
      const lineDensity = 1 / sdu0;
      const dense = lineDensity > 0.05;
      let densFrac0 = constrain(lineDensity / 0.05, 0, 1);
      densFrac0 = Math.pow(1 - densFrac0, 0.5);
      const index0 = Math.round(dense ? maxIndex : densFrac0 * maxIndex);
      const power1 = dense ? power0 + 1 : power0 - 1;
      const unit1 = Math.pow(10, power1);
      const sdu1 = unit1 * this.dataScaleFactor;
      const dxSmall = dense ? sdu0 : sdu1;
      const dxLarge = dense ? sdu1 : sdu0;
      let densFrac1 = dense
        ? (lineDensity - 0.05) / (0.21 - 0.05)
        : (0.05 - lineDensity) / (0.05 - 0.021);
      densFrac1 = constrain(densFrac1, 0, 1);
      const index1 = Math.round(Math.pow(densFrac1, dense ? 0.22 : 0.45) * maxIndex);
      const index2 = Math.round(Math.pow(densFrac1, dense ? 0.18 : 0.37) * maxIndex);
      stroke(c.gridLinePalette0[index0]);
      let count = 0;
      for (let x = this.gL; x < this.gR; x += dxSmall) {
        if (count % 10 !== 0) line(Math.round(x), this.gT, Math.round(x), this.gB);
        count++;
      }
      const strunit = Math.pow(10, dense ? power0 : power0 - 1);
      count = 0;
      for (let x = this.gL; x < this.gR; x += dxLarge) {
        const xi = Math.round(x);
        stroke(c.gridLinePalette1[index1]);
        line(xi, this.gT, xi, this.gB);
        if (count > 0) {
          fill(c.gridLinePalette2[index2]);
          noStroke();
          drawVerticalText(String(count * strunit), xi + 3, 10, 9);
          drawVerticalText(String(count * strunit), xi + 3, this.gB - 70, 9);
        }
        count += 10;
      }
    } else {
      const hlineDensity = 1 / sdu0;
      const minorIndex = Math.round(maxIndex * constrain(1 - 13 * hlineDensity, 0, 1));
      let count = 0;
      for (let x = this.gL; x < this.gR; x += this.dataScaleFactor) {
        count++;
        stroke(c.gridLinePalette0[minorIndex]);
        for (let i = 1; i <= 9; i++) {
          const xi = Math.round(x + this.dataScaleFactor * Math.log10(i));
          line(xi, this.gT, xi, this.gB);
        }
        stroke(c.gridLinePalette1[maxIndex]);
        line(Math.round(x), this.gT, Math.round(x), this.gB);
        fill(c.gridLinePalette2[Math.round(maxIndex * 0.75)]);
        noStroke();
        drawVerticalText(String(Math.pow(10, count)), Math.round(x) + 3, 10, 9);
        drawVerticalText(String(Math.pow(10, count)), Math.round(x) + 3, this.gB - 70, 9);
      }
    }
  }

  /**
   * Captures visible data into one value per scanline.
   *
   * When the graph is dense, this preserves the Java applet's anti-twinkling behavior by
   * using the maximum value within each pixel-bin rather than an arbitrary sampled value.
   */
  computeGraph() {
    const data = this.ds.data;
    const logData = this.ds.logData;
    const yvgInv = this.yVals / this.gHm1;
    this.graphIsSparse = yvgInv <= 1;
    let dataAvg = 0;
    let globalMax = Number.MIN_VALUE;
    let widthFactor = this.scaleMode === "linear" ? 5.1 : 1.7;

    for (let i = 0; i < this.gH; i++) {
      const a = Math.floor(this.yLow + i * yvgInv);
      const b = Math.floor(this.yLow + (i + 1) * yvgInv);
      let value = 0;
      if (this.graphIsSparse) {
        if (a >= 0 && a < this.ds.nData) value = this.scaleMode === "linear" ? data[a] : logData[a];
      } else {
        const lo = Math.max(0, a);
        const hi = Math.min(this.ds.nData - 1, b);
        for (let j = lo; j <= hi; j++) {
          const bit = this.scaleMode === "linear" ? data[j] : logData[j];
          if (bit > value) value = bit;
        }
      }
      dataAvg += value;
      if (value > globalMax) globalMax = value;
      this.visu[i] = value;
    }
    dataAvg /= this.gH;
    if (this.scaleMode === "linear") {
      dataAvg = 0.985 * dataAvg + 0.015 * globalMax;
      dataAvg = Math.max(10, dataAvg);
    } else {
      dataAvg = Math.max(0.01, dataAvg);
    }
    const displayRange = 0.97 * this.gW;
    this.runningDataAverage = 0.75 * this.runningDataAverage + 0.25 * dataAvg;
    const newScaleFactor = displayRange / (this.runningDataAverage * widthFactor);
    this.dataScaleFactor = 0.875 * this.dataScaleFactor + 0.125 * newScaleFactor;
    this.log10ofDataAvg = Math.log10(this.runningDataAverage);
  }

  /**
   * Draws the orange popularity bars using the per-scanline values computed by `computeGraph`.
   */
  paintGraph() {
    const c = this.app.colors;
    noStroke();
    fill(c.graphData);
    for (let i = 0; i < this.gH; i++) {
      const w = Math.min(this.gW, (this.dataScaleFactor * this.visu[i]));
      rect(this.gL, i, w, 1);
    }
  }

  /**
   * Draws the selected-number crosshair row and attached rotated popularity label.
   */
  paintCross() {
    if (this.selectedNumber === NO_SELECTED_NUMBER) return;
    const c = this.app.colors;
    const cr = this.crossRect();
    const valid = this.selectedNumber >= 0 && this.selectedNumber <= this.ds.xMax;
    const dat = valid ? this.ds.data[this.selectedNumber] : 0;
    noStroke();
    if (dat > 0 && valid) {
      fill(c.crossDinkPalette[0]);
      rect(this.gL, cr.y - 1, this.gW, cr.h + 2);
      fill(c.crossDinkPalette[c.crossDinkPalette.length - 1]);
      rect(cr.x, cr.y, this.gW, cr.h);
      for (let i = 0; i < c.crossDinkPalette.length; i++) {
        stroke(c.crossDinkPalette[i]);
        line(cr.x + i, cr.y, cr.x + i, cr.y + cr.h - 1);
      }
      noStroke();
      fill(c.graphDataSelect);
      rect(this.gL, cr.y, Math.max(0, cr.x - this.gL), cr.h);
    } else {
      fill(c.graphDataFauxHilite);
      rect(this.gL, cr.y, this.gW, cr.h);
    }

    const valueText = dat > 0 ? String(dat) : "N/A";
    const infoY = cr.y < 70 ? cr.y + cr.h + 8 : cr.y - 8;
    drawVerticalText(valueText, this.gR - 16, infoY, 10, c.graphCrossText, c.graphCrossTextShadow);
  }

  /**
   * Draws the green integer label column and selected-number label highlight.
   */
  paintKey() {
    const c = this.app.colors;
    const cr = this.crossRect();
    noStroke();
    fill(c.graphKey);
    rect(0, 0, this.gL, this.H);
    stroke(c.border);
    line(this.gL - 0, 0, this.gL - 0, this.H);
    noStroke();
    fill(c.graphKeyHilite);
    rect(0, cr.y, this.gL, cr.h);

    textFont("Courier");
    textSize(11);
    textStyle(NORMAL);
    const startNum = Math.max(this.ds.xMin, this.yLowI);
    const endNum = Math.min(this.ds.xMax, this.yHighI);
    const skip = Math.max(1, Math.floor((10 / 11.25) / (this.gH / this.yVals)));
    const prevSkip = this.majorLabelSkip;
    this.majorLabelSkip = nearestSkip(Math.max(1, Math.floor((10 * 11.25) / (this.gH / this.yVals))));
    if (prevSkip !== this.majorLabelSkip) {
      this.prevMajorLabelSkip = prevSkip;
      this.labelSkipTime = millis();
    }
    const fadeFrac = constrain((millis() - this.labelSkipTime) / this.fadeLabelTime, 0, 1);
    const prevLabelCol = lerpColor(c.graphKeyLabel, c.graphLightKeyLabel, fadeFrac);
    const majorLabelCol = lerpColor(c.graphLightKeyLabel, c.graphKeyLabel, fadeFrac);
    const labelOffset = 0.5 * (this.yValsInv * this.gH) + 3;
    fill(c.graphLightKeyLabel);
    for (let i = startNum; i <= endNum; i++) {
      if (i % skip === startNum % skip) {
        const y = labelOffset + Math.ceil((i - this.yLow) * this.yValsInv * this.gHm1);
        textAlign(RIGHT, BASELINE);
        text(String(i), this.gL - this.keyIndent, y);
      }
    }
    for (let i = startNum; i <= endNum; i++) {
      const wasMajor = i % this.prevMajorLabelSkip === 0;
      const isMajor = i % this.majorLabelSkip === 0;
      if (fadeFrac < 1 && wasMajor && !isMajor) {
        fill(prevLabelCol);
        const y = labelOffset + Math.ceil((i - this.yLow) * this.yValsInv * this.gHm1);
        text(String(i), this.gL - this.keyIndent, y);
      }
      if (isMajor) {
        fill(wasMajor ? c.graphKeyLabel : majorLabelCol);
        const y = labelOffset + Math.ceil((i - this.yLow) * this.yValsInv * this.gHm1);
        text(String(i), this.gL - this.keyIndent, y);
      }
    }
    if (this.selectedNumber >= startNum && this.selectedNumber <= endNum) {
      const y = labelOffset + Math.ceil((this.selectedNumber - this.yLow) * this.yValsInv * this.gHm1);
      const selectedLabel = String(this.selectedNumber);
      const sw = textWidth(selectedLabel) + this.keyIndent;
      fill(c.graphKeyHilite);
      rect(this.gL - sw - 5, y - 9.5, sw, 12);
      fill(c.graphShadKeyLabel);
      text(selectedLabel, this.gL - this.keyIndent + 1, y + 1);
      fill(c.graphMainKeyLabel);
      text(selectedLabel, this.gL - this.keyIndent, y);
    }
  }

  /**
   * Computes the selected-number crosshair rectangle in graph-local coordinates.
   *
   * @returns {{x:number,y:number,h:number}} Crosshair position and row height.
   */
  crossRect() {
    const sn = this.selectedNumber;
    const frac0 = (sn - this.yLow) * this.yValsInv * this.gHm1;
    const frac1 = (sn + 1 - this.yLow) * this.yValsInv * this.gHm1;
    let x = this.gL;
    if (sn >= this.ds.xMin && sn <= this.ds.xMax) x = this.gL + this.transformDataToScreen(sn);
    const y0 = Math.ceil(frac0);
    const y1 = Math.ceil(frac1);
    return { x, y: y0, h: Math.max(1, y1 - y0) };
  }

  /**
   * Converts one count value into a horizontal bar length using the active scale mode.
   *
   * @param {number} index Integer index in the current dataset.
   * @returns {number} Width in graph pixels.
   */
  transformDataToScreen(index) {
    const value = this.scaleMode === "linear" ? this.ds.data[index] : this.ds.logData[index];
    return Math.min(this.gW, Math.round(this.dataScaleFactor * value));
  }

  /**
   * Selects the hovered integer, using the local maximum in the hovered bin when zoomed out.
   */
  computeSelection() {
    if (this.keyboardSelectionActive) return;
    this.selectedNumber = NO_SELECTED_NUMBER;
    if (this.haveFocus) {
      this.selectedNumber = this.hoveredNumberAtY(this.mouseY);
    } else if (this.plot && this.plot.selectedNumber >= this.ds.xMin && this.plot.selectedNumber <= this.ds.xMax) {
      this.selectedNumber = this.plot.selectedNumber;
    }
  }

  /**
   * Computes which integer should be highlighted at a graph-local y coordinate.
   *
   * @param {number} y Graph-local y coordinate.
   * @returns {number} Integer under the cursor, clamped to the dataset range.
   */
  hoveredNumberAtY(y) {
    y -= 1;
    const yvgInv = this.yVals / this.gHm1;
    let out;
    if (this.graphIsSparse) {
      out = Math.floor(this.yLow + y * yvgInv);
    } else {
      const lo = Math.max(this.ds.xMin, Math.floor(this.yLow + y * yvgInv));
      const hi = Math.min(this.ds.xMax, Math.floor(this.yLow + (y + 1) * yvgInv));
      out = lo;
      let localMax = Number.MIN_VALUE;
      for (let j = lo; j <= hi; j++) {
        if (this.ds.data[j] > localMax) {
          localMax = this.ds.data[j];
          out = j;
        }
      }
    }
    return constrain(out, this.ds.xMin, this.ds.xMax);
  }

  /**
   * Sets the graph highlight from a keyboard shortcut instead of pointer hover.
   *
   * @param {number} num Integer to highlight.
   */
  setKeyboardSelection(num) {
    this.keyboardSelectionActive = true;
    this.selectedNumber = constrain(num, this.ds.xMin, this.ds.xMax);
    this.prevSelectedNumber = NO_SELECTED_NUMBER;
  }

  /**
   * Allows pointer hover to drive graph highlighting again.
   */
  clearKeyboardSelection() {
    this.keyboardSelectionActive = false;
  }

  /**
   * Auto-scrolls the visible integer range when the cursor is near the graph's top or bottom.
   */
  computeScroll() {
    if (!this.haveFocus) return;
    const edge = 100;
    let ydif = 0;
    if (this.mouseY < edge) ydif = Math.abs(edge - this.mouseY);
    else if (this.mouseY > this.gB - edge) ydif = Math.abs(this.mouseY - (this.gB - edge));
    if (this.mouseY < edge || this.mouseY > this.gB - edge) {
      let dn = 0.01 * (this.yHighTarget - this.yLowTarget);
      dn *= ydif * 0.018;
      if (this.mouseY < edge) {
        const lo = Math.max(this.ds.xMin - DATA_MARGIN, this.yLowTarget - dn);
        const hi = Math.max(this.yHighTarget - dn, lo + this.fewestPossibleElements());
        this.selectBlur(lo, hi);
      } else if (this.mouseY > this.H - edge) {
        const hi = Math.min(this.ds.xMax + DATA_MARGIN, this.yHighTarget + dn);
        const lo = Math.min(this.yLowTarget + dn, hi - this.fewestPossibleElements());
        this.selectBlur(lo, hi);
      }
    }
  }

  /**
   * Applies press-and-hold zooming around the selected number.
   *
   * The selected number's proportional placement in the visible range is preserved while the
   * range is magnified or reduced; dragging outside the panel shifts the range instead.
   */
  computePossibleZoom() {
    if (this.selectedNumber === NO_SELECTED_NUMBER || !this.mouseDown) return;
    const now = millis();
    const howLong = now - this.lastMouseDownTime;
    if (this.mouseOutside) {
      const holdIncrease = 1 + howLong / 20000;
      let distIncrease = 1;
      if (this.mouseY > this.gB) distIncrease += (this.mouseY - this.gB) / 6;
      else if (this.mouseY < this.gT) distIncrease += (this.gT - this.mouseY) / 6;
      const skip = Math.max(0.01, (holdIncrease * distIncrease * this.yVals) / this.gH);
      if (this.selectedNumber <= this.yLowI && this.yLowI > this.ds.xMin) this.selectBlur(this.yLow - skip, this.yHigh - skip);
      else if (this.selectedNumber >= this.yHighI) this.selectBlur(this.yLow + skip, this.yHigh + skip);
      return;
    }

    const totalRange = this.ds.xRange;
    let zoomFactor = this.zoomOut ? 1 / 0.9 : 0.9;
    const halfW = this.gW / 2;
    const centerX = this.gL + halfW;
    const influence = Math.sqrt(constrain(Math.abs(this.mouseX - centerX) / halfW, 0, 1));
    zoomFactor = influence * zoomFactor + (1 - influence);
    let magFactor = (zoomFactor * this.yVals) / totalRange;
    const minMag = this.gH / totalRange / 30;
    const maxMag = ThumbView.maximumDataFraction;
    magFactor = constrain(magFactor, minMag, maxMag);
    const selectedFrac = (this.selectedNumber - this.yLow) * this.yValsInv;
    const newSpan = magFactor * totalRange;
    this.selectBlur(this.selectedNumber - selectedFrac * newSpan, this.selectedNumber + (1 - selectedFrac) * newSpan);
  }

  /**
   * Smooths the visible integer bounds toward their current target bounds.
   */
  computeBounds() {
    this.yLow = 0.7 * this.yLow + 0.3 * this.yLowTarget;
    this.yHigh = 0.7 * this.yHigh + 0.3 * this.yHighTarget;
    this.yVals = this.yHigh - this.yLow;
    this.yValsInv = 1 / this.yVals;
    this.yLowI = Math.round(this.yLow);
    this.yHighI = Math.round(this.yHigh);
  }

  /**
   * Clamps a proposed visible range to the graph's visual limits.
   *
   * The visible graph is allowed to extend slightly before/after the dataset so endpoint labels
   * and bars have breathing room, but it must still overlap real data.
   *
   * @param {number} lo Proposed lower visible integer bound.
   * @param {number} hi Proposed upper visible integer bound.
   * @returns {{lo:number,hi:number}} View-bounded range.
   */
  clampRangeToView(lo, hi) {
    const minSpan = this.fewestPossibleElements();
    const viewMin = this.ds.xMin - DATA_MARGIN;
    const viewMax = this.ds.xMax + DATA_MARGIN;
    const maxSpan = viewMax - viewMin;
    const span = constrain(Math.max(minSpan, hi - lo), minSpan, maxSpan);
    let nextLo = lo;
    let nextHi = lo + span;
    if (nextLo < viewMin) {
      nextLo = viewMin;
      nextHi = nextLo + span;
    }
    if (nextHi > viewMax) {
      nextHi = viewMax;
      nextLo = nextHi - span;
    }
    if (nextHi < this.ds.xMin) {
      nextHi = this.ds.xMin;
      nextLo = nextHi - span;
    }
    if (nextLo > this.ds.xMax) {
      nextLo = this.ds.xMax;
      nextHi = nextLo + span;
    }
    if (nextLo < viewMin) {
      nextLo = viewMin;
      nextHi = nextLo + span;
    }
    if (nextHi > viewMax) {
      nextHi = viewMax;
      nextLo = nextHi - span;
    }
    return { lo: nextLo, hi: nextHi };
  }

  /**
   * Immediately sets the visible integer range.
   *
   * @param {number} lo Lower visible integer bound.
   * @param {number} hi Upper visible integer bound.
   */
  select(lo, hi) {
    if (lo <= hi) {
      const range = this.clampRangeToView(lo, hi);
      this.yLow = range.lo;
      this.yHigh = range.hi;
      this.yVals = this.yHigh - this.yLow;
      this.yValsInv = 1 / this.yVals;
      this.yLowI = Math.round(this.yLow);
      this.yHighI = Math.round(this.yHigh);
      this.yLowTarget = this.yLow;
      this.yHighTarget = this.yHigh;
    }
  }

  /**
   * Repositions the visible range so an integer is vertically centered when bounds allow.
   *
   * @param {number} num Integer to center in the graph.
   */
  centerOnNumber(num) {
    const span = this.yHigh - this.yLow;
    const minLow = this.ds.xMin - DATA_MARGIN;
    const maxHigh = this.ds.xMax + DATA_MARGIN;
    let lo = num - span * 0.5;
    let hi = lo + span;
    if (lo < minLow) {
      lo = minLow;
      hi = lo + span;
    }
    if (hi > maxHigh) {
      hi = maxHigh;
      lo = hi - span;
    }
    this.select(lo, hi);
  }

  /**
   * Sets target visible integer bounds that the graph will ease toward.
   *
   * @param {number} lo Target lower visible integer bound.
   * @param {number} hi Target upper visible integer bound.
   */
  selectBlur(lo, hi) {
    if (lo <= hi) {
      const range = this.clampRangeToView(lo, hi);
      this.yLowTarget = range.lo;
      this.yHighTarget = range.hi;
    }
  }

  /**
   * Scrolls the graph range by a fixed integer amount, preserving the current span.
   *
   * @param {number} delta Signed integer offset to apply to the visible range.
   * @returns {number} Actual signed integer-range movement applied.
   */
  scrollByInteger(delta) {
    const oldLow = this.yLow;
    const span = this.yHigh - this.yLow;
    const minLow = this.ds.xMin - DATA_MARGIN;
    const maxHigh = this.ds.xMax + DATA_MARGIN;
    let lo = this.yLow + delta;
    let hi = this.yHigh + delta;
    if (lo < minLow) {
      lo = minLow;
      hi = lo + span;
    }
    if (hi > maxHigh) {
      hi = maxHigh;
      lo = hi - span;
    }
    this.select(lo, hi);
    return this.yLow - oldLow;
  }

  /**
   * Returns the minimum span allowed by the graph's maximum element height.
   *
   * @returns {number} Minimum visible integer span.
   */
  fewestPossibleElements() {
    return this.H / 30;
  }

  /**
   * Formats the currently selected integer for the interface panel.
   *
   * @returns {string} Selected integer or an ellipsis placeholder.
   */
  getSelectedString() {
    return this.selectedNumber < 0 || this.selectedNumber > this.ds.xMax ? "..." : String(this.selectedNumber);
  }

  /**
   * Starts graph hover/zoom interaction and records the initiating mouse button.
   *
   * @param {number} x Mouse x in graph-local coordinates.
   * @param {number} y Mouse y in graph-local coordinates.
   * @param {boolean} isRightMousePress Whether the physical right button initiated the press.
   * @returns {boolean} false to suppress default browser handling.
   */
  mousePressed(x, y, isRightMousePress = false) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    this.haveFocus = true;
    this.lastMouseDownTime = millis();
    this.isRightMousePress = isRightMousePress;
    this.updateZoomDirection();
    this.computeSelection();
    this.app.retrievePhrases(this.selectedNumber);
    return false;
  }

  /**
   * Ends graph press/zoom interaction.
   *
   * @param {number} x Mouse x in graph-local coordinates.
   * @param {number} y Mouse y in graph-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseReleased(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = false;
    this.mouseOutside = false;
    this.app.retrievePhrases(this.selectedNumber);
    return false;
  }

  /**
   * Updates graph-local hover coordinates.
   *
   * @param {number} x Mouse x in graph-local coordinates.
   * @param {number} y Mouse y in graph-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseMoved(x, y) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    return false;
  }

  /**
   * Updates graph-local drag coordinates and recomputes zoom direction by chart half.
   *
   * @param {number} x Mouse x in graph-local coordinates.
   * @param {number} y Mouse y in graph-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseDragged(x, y) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    this.updateZoomDirection();
    this.mouseOutside = y < 0 || y > this.gB;
    return false;
  }

  /**
   * Computes zoom-in/zoom-out state from current x-position and initiating mouse button.
   */
  updateZoomDirection() {
    const onRightHalf = this.mouseX >= this.gL + this.gW / 2;
    this.zoomOut = onRightHalf !== this.isRightMousePress;
  }
}

/**
 * Draws the 100-column pixel overview from the Java `PlotCanvas`.
 */
class PlotView {
  /**
   * Creates overview images for every dataset and initializes selection state.
   *
   * @param {SecretLivesApp} app Owning application.
   * @param {Rect} rect Canvas-space panel rectangle.
   */
  constructor(app, rect) {
    this.app = app;
    this.rect = rect;
    this.W = rect.w;
    this.H = rect.h;
    this.margin = 1;
    this.selectedNumber = NO_SELECTED_NUMBER;
    this.mouseIndex = NO_SELECTED_NUMBER;
    this.mouseDownIndex = NO_SELECTED_NUMBER;
    this.selectionStartIndex = 0;
    this.selectionEndIndex = 100;
    this.plotImageTop = 0;
    this.plotTopBlur = 0;
    this.mouseX = this.W / 2;
    this.mouseY = this.H / 3;
    this.ergonomicY = this.mouseY - 2 * PLOT_SCALE;
    this.mouseDown = false;
    this.haveFocus = false;
    this.draggingHappened = false;
    this.manualSelection = false;
    this.keyboardSelectionActive = false;
    this.mouseUpSelectHappened = false;
    this.singleSelectCondition = false;
    this.lastMouseDownTime = millis();
    this.images = this.app.datasets.map((ds) => ({
      unselected: buildPlotImage(ds, this.app.colors, false),
      selected: buildPlotImage(ds, this.app.colors, true),
    }));
    this.setDataset();
  }

  /**
   * Rebinds the overview to the current dataset.
   */
  setDataset() {
    this.ds = this.app.dataset;
  }

  /**
   * Updates image positioning, hovered number, and selection rectangles.
   */
  update() {
    const dragTime = millis() - this.lastMouseDownTime;
    this.manualSelection = this.mouseDown && this.draggingHappened && dragTime >= 0;
    if (this.singleSelectCondition && !this.mouseUpSelectHappened && !this.mouseDown && !this.haveFocus) {
      this.singleSelectCondition = false;
    }
    if (!this.manualSelection || (this.draggingHappened && (this.mouseY < 0 || this.mouseY > this.H))) {
      const minDataVal = this.ds.xMin - DATA_MARGIN;
      const dataRange = this.ds.xRange + 2 * DATA_MARGIN;
      const fracT = (this.app.graph.yLow - minDataVal) / dataRange;
      const fracB = (this.app.graph.yHigh - minDataVal) / dataRange;
      const fracC = ((this.app.graph.yHigh + this.app.graph.yLow) * 0.5 - minDataVal) / dataRange;
      const imageH = DATA_PER_ROW * 10 * PLOT_SCALE;
      const yc = Math.round(this.H / 2 - fracC * imageH);
      const suppressSingleClickRecentering = this.singleSelectCondition && this.haveFocus;
      if (!suppressSingleClickRecentering) this.plotTopBlur = 0.925 * this.plotTopBlur + 0.075 * yc;
      this.plotImageTop = Math.round(this.plotTopBlur);
    }
    if (this.keyboardSelectionActive) {
      this.selectedNumber = this.app.graph.selectedNumber;
      this.mouseIndex = this.selectedNumber;
      this.selectionStartIndex = Math.max(this.ds.xMin, this.app.graph.yLowI);
      this.selectionEndIndex = Math.min(this.ds.xMax, this.app.graph.yHighI);
    } else if (!this.mouseUpSelectHappened) {
      this.mouseIndex = this.haveFocus ? this.pixelToIndex(this.mouseX, this.ergonomicY) : -1;
      const graphSelected = this.app.graph.selectedNumber;
      this.selectedNumber = this.haveFocus
        ? this.mouseIndex
        : graphSelected >= this.ds.xMin && graphSelected <= this.ds.xMax
          ? graphSelected
          : NO_SELECTED_NUMBER;
      this.computeSelectionIndices();
      if (this.haveFocus) this.app.retrievePhrases(this.mouseIndex);
    }
    this.computeSelectionRects();
  }

  /**
   * Nudges the overview image by the same amount as a graph-range scroll.
   *
   * @param {number} dataDelta Signed number of integer rows moved in the graph.
   */
  shiftImageByDataDelta(dataDelta) {
    const pixelDelta = (-dataDelta / DATA_PER_ROW) * PLOT_SCALE;
    this.plotTopBlur += pixelDelta;
    this.plotImageTop = Math.round(this.plotTopBlur);
  }

  /**
   * Immediately aligns the overview image to the graph's current visible range.
   */
  snapToGraphRange() {
    const minDataVal = this.ds.xMin - DATA_MARGIN;
    const dataRange = this.ds.xRange + 2 * DATA_MARGIN;
    const fracC = ((this.app.graph.yHigh + this.app.graph.yLow) * 0.5 - minDataVal) / dataRange;
    const imageH = DATA_PER_ROW * 10 * PLOT_SCALE;
    this.plotTopBlur = Math.round(this.H / 2 - fracC * imageH);
    this.plotImageTop = Math.round(this.plotTopBlur);
  }

  /**
   * Draws the overview plot, selected range, inspector, and optional help balloon.
   */
  draw() {
    push();
    translate(this.rect.x, this.rect.y);
    beginPanelClip(0, 0, this.W, this.H);
    const c = this.app.colors;
    fill(c.plotBg);
    noStroke();
    rect(0, 0, this.W, this.H);
    this.paintGrid();
    this.paintImages();
    this.paintInspector();
    this.paintBalloon();
    if (this.haveFocus) this.app.balloon.draw(this.W - 160, this.H, 150, this.H, PLOT_HELP, this.rect.x, this.rect.y);
    endPanelClip();
    noFill();
    strokeWeight(1);
    stroke(c.border);
    rect(0.5, 0.5, this.W-1, this.H-1);
    pop();
  }

  /**
   * Draws overview grid lines and top/bottom image boundary markers.
   */
  paintGrid() {
    const c = this.app.colors;
    stroke(c.plotGrid);
    for (let gx = this.margin + 1; gx < this.W; gx += PLOT_SCALE * 10) {
      line(gx, 0, gx, this.H);
    }
    stroke(0);
    if (this.plotImageTop > 0 && this.plotImageTop < this.H) {
      line(this.margin, this.plotImageTop - 0, this.W, this.plotImageTop - 0);
    } else {
      const bot = this.plotImageTop + DATA_PER_ROW * 10 * PLOT_SCALE;
      if (bot > 0 && bot < this.H) line(this.margin, bot, this.W, bot);
    }
  }

  /**
   * Draws the dim overview image plus clipped bright strips for the selected range.
   */
  paintImages() {
    const imgs = this.images[this.app.currentDatasetIndex];
    image(imgs.unselected, this.margin, this.plotImageTop);
    const r = this.selectionRects;
    this.drawImageClip(imgs.selected, r.t);
    this.drawImageClip(imgs.selected, r.c);
    this.drawImageClip(imgs.selected, r.b);
  }

  /**
   * Draws an overview image through a rectangular clip.
   *
   * @param {p5.Image} img Image to draw.
   * @param {{x:number,y:number,w:number,h:number}} r Clip rectangle in plot-local coordinates.
   */
  drawImageClip(img, r) {
    if (r.w <= 0 || r.h <= 0) return;
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(r.x, r.y, r.w, r.h);
    drawingContext.clip();
    image(img, this.margin, this.plotImageTop);
    drawingContext.restore();
    pop();
  }

  /**
   * Draws the cyan square inspector around the selected overview cell.
   */
  paintInspector() {
    if (this.selectedNumber < 0 || this.selectedNumber >= this.ds.nData) return;
    const p = this.indexToPixel(this.selectedNumber);
    const c = this.app.colors;
    noFill();
    stroke(0);
    rect(p.x - 1, p.y - 1, 5, 5);
    rect(p.x - 4, p.y - 4, 11, 11);
    stroke(c.plotIndicator);
    rect(p.x - 2, p.y - 2, 7, 7);
    rect(p.x - 3, p.y - 3, 9, 9);
  }

  /**
   * Draws the small number/count label inside the overview plot.
   */
  paintBalloon() {
    if (!this.haveFocus && this.selectedNumber === NO_SELECTED_NUMBER) return;
    const valid = this.selectedNumber > -1 && this.selectedNumber < this.ds.nData;
    const popularity = valid ? this.ds.data[this.selectedNumber] : 0;
    const label = valid ? this.selectedNumber + (popularity <= 0 ? " : N/A" : " : " + popularity) : "";
    if (!label) return;
    drawShadowText(label, 8, 16, 11, "Courier", NORMAL, this.app.colors.plotBalloonText, this.app.colors.plotBalloonTextShadow);
  }

  /**
   * Updates the selected integer range from drag selection or the graph's current bounds.
   */
  computeSelectionIndices() {
    if (this.manualSelection) {
      let a = this.mouseDownIndex;
      let b = this.mouseIndex;
      if (a < b) {
        this.selectionStartIndex = a;
        this.selectionEndIndex = Math.max(b, a + this.app.graph.fewestPossibleElements());
      } else {
        this.selectionStartIndex = b;
        this.selectionEndIndex = Math.max(a, b + this.app.graph.fewestPossibleElements());
      }
      this.app.graph.selectBlur(this.selectionStartIndex, this.selectionEndIndex);
    } else {
      if (this.haveFocus) {
        const edge = 100;
        let ydif = 0;
        if (this.mouseY < edge) ydif = Math.abs(edge - this.mouseY);
        else if (this.mouseY > this.H - edge) ydif = Math.abs(this.mouseY - (this.H - edge));
        if (!this.mouseDown && (this.mouseY < edge || this.mouseY > this.H - edge)) {
          const yLow = this.app.graph.yLowTarget;
          const yHigh = this.app.graph.yHighTarget;
          const diff = yHigh - yLow;
          let dn = 0.01 * diff * ydif * 0.018;
          if (this.mouseY < edge) {
            this.clearSingleSelectionLatch();
            const lo = Math.max(this.ds.xMin - DATA_MARGIN, yLow - dn);
            const hi = Math.max(yHigh - dn, lo + this.app.graph.fewestPossibleElements());
            this.app.graph.selectBlur(lo, hi);
          } else if (this.mouseY > this.H - edge) {
            this.clearSingleSelectionLatch();
            const hi = Math.min(this.ds.xMax + DATA_MARGIN, yHigh + dn);
            const lo = Math.min(yLow + dn, hi - this.app.graph.fewestPossibleElements());
            this.app.graph.selectBlur(lo, hi);
          }
        }
      }
      this.selectionStartIndex = Math.max(this.ds.xMin, this.app.graph.yLowI);
      this.selectionEndIndex = Math.min(this.ds.xMax, this.app.graph.yHighI);
    }
  }

  /**
   * Computes the top, middle, and bottom clipped rectangles that highlight a wrapped range.
   */
  computeSelectionRects() {
    const lo = this.indexToPixel(this.selectionStartIndex);
    const hi = this.indexToPixel(this.selectionEndIndex);
    const t = { x: lo.x, y: constrain(lo.y, 0, this.H), w: this.W - this.margin - lo.x, h: lo.y < 0 || lo.y > this.H ? 0 : PLOT_SCALE };
    let c = { x: this.margin, y: lo.y + PLOT_SCALE, w: this.W - this.margin * 2, h: hi.y - (lo.y + PLOT_SCALE) };
    if (c.y < 0) {
      c.h += c.y;
      c.y = 0;
    }
    if (c.y > this.H) {
      c.y = this.H;
      c.h = 0;
    }
    if (c.y + c.h > this.H) c.h = this.H - c.y;
    const b = { x: this.margin, y: constrain(hi.y, 0, this.H), w: hi.x - this.margin, h: hi.y < 0 || hi.y > this.H ? 0 : PLOT_SCALE };
    if (this.app.graph.yHighI - this.app.graph.yLowI < DATA_PER_ROW) {
      if (lo.y === hi.y) {
        c.w = 0;
        b.w = 0;
        t.w = hi.x - lo.x;
      } else {
        c.w = 0;
      }
    }
    this.selectionRects = { t, c, b };
  }

  /**
   * Converts a plot-local pixel coordinate to the integer represented by that cell.
   *
   * @param {number} x Plot-local x coordinate.
   * @param {number} y Plot-local y coordinate.
   * @returns {number} Clamped integer index.
   */
  pixelToIndex(x, y) {
    x = constrain(x - 1, this.margin, this.W - this.margin - 1);
    const col = Math.floor((x - this.margin) / PLOT_SCALE);
    const row = Math.floor((y - 1 - this.plotImageTop) / PLOT_SCALE);
    return constrain(DATA_PER_ROW * row + col, this.ds.xMin, this.ds.xMax);
  }

  /**
   * Computes which integer is under a plot-local cursor coordinate.
   *
   * @param {number} x Plot-local x coordinate.
   * @param {number} y Plot-local y coordinate.
   * @returns {number} Integer under the cursor, clamped to the dataset range.
   */
  hoveredNumberAt(x, y) {
    const ergonomicY = Math.max(y - 2 * PLOT_SCALE, this.plotImageTop);
    return this.pixelToIndex(x, ergonomicY);
  }

  /**
   * Converts an integer index to the top-left pixel of its 100-column overview cell.
   *
   * @param {number} index Integer index.
   * @returns {{x:number,y:number}} Plot-local pixel coordinate.
   */
  indexToPixel(index) {
    const col = index % DATA_PER_ROW;
    const row = Math.floor(index / DATA_PER_ROW);
    return { x: col * PLOT_SCALE + this.margin, y: row * PLOT_SCALE + this.plotImageTop };
  }

  /**
   * Sets the overview inspector from a keyboard shortcut instead of pointer hover.
   *
   * @param {number} num Integer to highlight.
   */
  setKeyboardSelection(num) {
    this.keyboardSelectionActive = true;
    this.selectedNumber = constrain(num, this.ds.xMin, this.ds.xMax);
    this.mouseIndex = this.selectedNumber;
  }

  /**
   * Allows pointer hover to drive overview highlighting again.
   */
  clearKeyboardSelection() {
    this.keyboardSelectionActive = false;
  }

  /**
   * Releases the one-click plot-selection latch so the overview follows graph range changes.
   */
  clearSingleSelectionLatch() {
    this.singleSelectCondition = false;
    this.mouseUpSelectHappened = false;
  }

  /**
   * Begins plot selection or single-row selection.
   *
   * @param {number} x Mouse x in plot-local coordinates.
   * @param {number} y Mouse y in plot-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mousePressed(x, y) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    this.haveFocus = true;
    this.ergonomicY = Math.max(y - 2 * PLOT_SCALE, this.plotImageTop);
    this.mouseDownIndex = this.pixelToIndex(x, this.ergonomicY);
    this.lastMouseDownTime = millis();
    this.draggingHappened = false;
    this.mouseUpSelectHappened = false;
    this.singleSelectCondition = true;
    this.app.retrievePhrases(this.mouseDownIndex);
    return false;
  }

  /**
   * Finalizes a plot click or drag selection.
   *
   * @param {number} x Mouse x in plot-local coordinates.
   * @param {number} y Mouse y in plot-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseReleased(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = false;
    this.ergonomicY = Math.max(y - 2 * PLOT_SCALE, this.plotImageTop);
    if (!this.draggingHappened) {
      this.mouseIndex = this.mouseDownIndex = this.pixelToIndex(x, this.ergonomicY);
      this.selectionStartIndex = this.mouseDownIndex - (this.mouseDownIndex % DATA_PER_ROW);
      this.selectionEndIndex = this.mouseDownIndex + DATA_PER_ROW - (this.mouseDownIndex % DATA_PER_ROW);
      this.selectionStartIndex = constrain(this.selectionStartIndex, this.ds.xMin, this.ds.xMax);
      this.selectionEndIndex = constrain(this.selectionEndIndex, this.ds.xMin, this.ds.xMax);
      this.singleSelectCondition = true;
      this.mouseUpSelectHappened = true;
      this.app.graph.select(this.selectionStartIndex, this.selectionEndIndex);
      this.computeSelectionRects();
      this.app.retrievePhrases(this.mouseIndex);
    } else {
      this.mouseUpSelectHappened = false;
      this.singleSelectCondition = false;
    }
    return false;
  }

  /**
   * Updates plot-local hover position.
   *
   * @param {number} x Mouse x in plot-local coordinates.
   * @param {number} y Mouse y in plot-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseMoved(x, y) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    this.ergonomicY = Math.max(y - 2 * PLOT_SCALE, this.plotImageTop);
    this.mouseUpSelectHappened = false;
    if (!this.haveFocus) this.clearSingleSelectionLatch();
    return false;
  }

  /**
   * Updates plot-local drag position while selecting a range.
   *
   * @param {number} x Mouse x in plot-local coordinates.
   * @param {number} y Mouse y in plot-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseDragged(x, y) {
    this.clearKeyboardSelection();
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    this.ergonomicY = Math.max(y - 2 * PLOT_SCALE, this.plotImageTop);
    this.draggingHappened = true;
    this.mouseUpSelectHappened = false;
    this.singleSelectCondition = false;
    return false;
  }
}

/**
 * Draws and manages the vertical range thumb from the Java `ThumbCanvas`.
 */
class ThumbView {
  static maximumDataFraction = 1;

  /**
   * Creates thumb geometry and drag state.
   *
   * @param {SecretLivesApp} app Owning application.
   * @param {Rect} rect Canvas-space panel rectangle.
   */
  constructor(app, rect) {
    this.app = app;
    this.rect = rect;
    this.W = rect.w;
    this.H = rect.h;
    this.margin = 3;
    this.MIN_RECT_HEIGHT = 12;
    this.GRAB_EDGE_TOLERANCE = 3;
    this.GRABBED_NONE = 0;
    this.GRABBED_THUMB = 1;
    this.GRABBED_MIN = 2;
    this.GRABBED_MAX = 3;
    this.grabbed = this.GRABBED_NONE;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDy = 0;
    this.mouseDown = false;
    this.haveFocus = false;
    this.palIndex = 0;
    this.frect = { x: this.margin, y: 0, w: this.W - 2 * this.margin, h: this.MIN_RECT_HEIGHT };
    this.rectThumb = { ...this.frect };
    this.setDataset();
  }

  /**
   * Updates dataset-dependent thumb density limits.
   */
  setDataset() {
    this.ds = this.app.dataset;
    this.criticalDensity = Math.floor((this.ds.nData * this.MIN_RECT_HEIGHT) / this.H) - 11;
  }

  /**
   * Updates thumb position/size or applies drag changes to the graph range.
   */
  update() {
    const graph = this.app.graph;
    const minDataVal = this.ds.xMin - DATA_MARGIN;
    const dataRange = this.ds.xRange + 2 * DATA_MARGIN;
    const yLow = graph.yLowTarget;
    const yHigh = graph.yHighTarget;
    const yDiff = yHigh - yLow;
    const fracH = yDiff / dataRange;
    const systemOverZoomed = yDiff < this.criticalDensity;
    ThumbView.maximumDataFraction = (this.H - this.MIN_RECT_HEIGHT) / this.H;
    const tf = 0;
    const bf = this.H;
    let ry;
    let rh;
    let lo;
    let hi;

    if (this.grabbed === this.GRABBED_THUMB) {
      ry = constrain(this.mouseY - this.mouseDy, tf, bf - this.frect.h);
      this.frect.y = 0.6 * this.frect.y + 0.4 * ry;
      lo = ((ry - tf) / this.H) * dataRange + minDataVal;
      hi = ((ry + this.frect.h - tf) / this.H) * dataRange + minDataVal;
      if (systemOverZoomed) hi = lo + yDiff;
      graph.selectBlur(lo, hi);
    } else if (this.grabbed === this.GRABBED_MAX) {
      rh = constrain(this.mouseY - this.frect.y, this.MIN_RECT_HEIGHT, bf - this.frect.y);
      this.frect.h = 0.6 * this.frect.h + 0.4 * rh;
      lo = (this.frect.y / this.H) * dataRange + minDataVal;
      hi = ((this.frect.y + rh) / this.H) * dataRange + minDataVal;
      graph.selectBlur(lo, hi);
    } else if (this.grabbed === this.GRABBED_MIN) {
      ry = constrain(this.mouseY, tf, this.frect.y + this.frect.h - this.MIN_RECT_HEIGHT);
      rh = Math.max(this.MIN_RECT_HEIGHT, this.frect.y + this.frect.h - ry);
      this.frect.y = 0.6 * this.frect.y + 0.4 * ry;
      this.frect.h = 0.6 * this.frect.h + 0.4 * rh;
      lo = (this.frect.y / this.H) * dataRange + minDataVal;
      hi = ((this.frect.y + rh) / this.H) * dataRange + minDataVal;
      graph.selectBlur(lo, hi);
    } else {
      const fracT = (yLow - minDataVal) / dataRange;
      ry = Math.min(fracT * this.H, this.H - this.MIN_RECT_HEIGHT);
      this.frect.y = 0.6 * this.frect.y + 0.4 * ry;
      this.frect.h = constrain(fracH * this.H, this.MIN_RECT_HEIGHT, this.H - this.MIN_RECT_HEIGHT);
    }

    this.rectThumb = {
      x: Math.round(this.frect.x),
      y: Math.round(this.frect.y),
      w: Math.round(this.frect.w),
      h: Math.round(this.frect.h),
    };
  }

  /**
   * Draws the draggable thumb, bevel, border, and plot-range guide lines.
   */
  draw() {
    push();
    translate(this.rect.x, this.rect.y);
    const c = this.app.colors;
    fill(c.thumbBg);
    noStroke();
    rect(0, 0, this.W, this.H);
    const hover = this.hitThumb(this.mouseX, this.mouseY) || this.grabbed !== this.GRABBED_NONE;
    this.palIndex = stepPalette(this.palIndex, hover, 20);
    const r = this.rectThumb;
    const thumbColor = c.thumbPalette[this.palIndex];
    fill(thumbColor);
    rect(r.x, r.y, r.w - 1, r.h - 1);

    this.drawGripLines(r, thumbColor);

    stroke(c.thumbHilitePalette[this.palIndex]);
    line(r.x + 1, r.y + 1, r.x + r.w - 3, r.y + 1);
    line(r.x + 1, r.y + 1, r.x + 1, r.y + r.h - 3);
    stroke(c.thumbShadowPalette[this.palIndex]);
    line(r.x + r.w - 2, r.y + 2, r.x + r.w - 2, r.y + r.h - 2);
    line(r.x + 2, r.y + r.h - 1, r.x + r.w - 2, r.y + r.h - 1);
    noFill();
    stroke(c.border);
    rect(r.x, r.y, r.w - 1, r.h - 1);
    pop();
  }

  /**
   * Draws short paired highlight/shadow grip marks on taller thumb rectangles.
   *
   * @param {{x:number,y:number,w:number,h:number}} r Current thumb rectangle.
   * @param {p5.Color} thumbColor Base thumb fill color.
   */
  drawGripLines(r, thumbColor) {
    const pairCount = constrain(Math.floor(map(r.h, 18, 60, 0, 5)), 0, 5);
    if (pairCount <= 0) return;

    const x0 = Math.round(r.x + r.w * 0.15);
    const x1 = Math.round(r.x + r.w * 0.85);
    const pairGap = 3;
    const pairStep = 2 + pairGap;
    const stackH = 2 + (pairCount - 1) * pairStep;
    const minY = r.y + Math.max(8, Math.floor(r.h * 0.18));
    const maxY = r.y + r.h - Math.max(9, Math.floor(r.h * 0.18)) - 1;
    const centeredY = Math.round(r.y + (r.h - stackH) * 0.5);
    const startY = constrain(centeredY, minY, maxY - stackH + 1);
    const light = lerpColor(thumbColor, color(255), 0.22);
    const dark = lerpColor(thumbColor, color(0), 0.24);

    for (let i = 0; i < pairCount; i++) {
      const y = startY + pairStep * i;
      stroke(light);
      line(x0, y, x1, y);
      stroke(dark);
      line(x0, y + 1, x1, y + 1);
    }
  }

  /**
   * Tests whether a thumb-local point is inside the draggable thumb rectangle.
   *
   * @param {number} x Thumb-local x coordinate.
   * @param {number} y Thumb-local y coordinate.
   * @returns {boolean} true when the point is inside the thumb.
   */
  hitThumb(x, y) {
    const r = this.rectThumb;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  /**
   * Decides whether a press grabs the thumb body, top edge, bottom edge, or nothing.
   */
  computeMouseDownConsequences() {
    const r = this.rectThumb;
    this.grabbed = this.GRABBED_NONE;
    if (Math.abs(this.mouseY - r.y) < this.GRAB_EDGE_TOLERANCE && this.mouseX >= r.x && this.mouseX < r.x + r.w) {
      this.mouseDy = this.mouseY - r.y;
      this.grabbed = this.GRABBED_MIN;
    } else if (Math.abs(this.mouseY - (r.y + r.h)) < this.GRAB_EDGE_TOLERANCE && this.mouseX >= r.x && this.mouseX < r.x + r.w) {
      this.mouseDy = this.mouseY - r.y;
      this.grabbed = this.GRABBED_MAX;
    } else if (this.hitThumb(this.mouseX, this.mouseY)) {
      this.mouseDy = this.mouseY - r.y;
      this.grabbed = this.GRABBED_THUMB;
    }
  }

  /**
   * Begins a thumb drag.
   *
   * @param {number} x Mouse x in thumb-local coordinates.
   * @param {number} y Mouse y in thumb-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mousePressed(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    this.haveFocus = true;
    this.computeMouseDownConsequences();
    return false;
  }

  /**
   * Ends a thumb drag.
   *
   * @param {number} x Mouse x in thumb-local coordinates.
   * @param {number} y Mouse y in thumb-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseReleased(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = false;
    this.grabbed = this.GRABBED_NONE;
    return false;
  }

  /**
   * Updates thumb hover coordinates.
   *
   * @param {number} x Mouse x in thumb-local coordinates.
   * @param {number} y Mouse y in thumb-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseMoved(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    if (!this.mouseDown) this.grabbed = this.GRABBED_NONE;
    return false;
  }

  /**
   * Updates thumb drag coordinates.
   *
   * @param {number} x Mouse x in thumb-local coordinates.
   * @param {number} y Mouse y in thumb-local coordinates.
   * @returns {boolean} false to suppress default browser handling.
   */
  mouseDragged(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.mouseDown = true;
    return false;
  }
}

/**
 * Manages animated help balloons, per-balloon dismissal, and hit testing.
 */
class HelpBalloon {
  /**
   * Initializes help text and animation/dismissal state.
   *
   * @param {ColorScheme} colors Shared color palette.
   */
  constructor(colors) {
    this.colors = colors;
    this.texts = [
      "This histogram displays the popularity of every integer from 1 to 100,000, taken from the number of web pages which contain that integer. Click at left to zoom in, or at right to zoom out.",
      "The cells in this graph represent the popularity of the integers between 1 and 100,000. Integers which are more popular have brighter cells. The grid is arranged in rows of 100; click or drag to select a range of interest.",
    ];
    this.shown = [0, 0];
    this.heights = [0, 0];
    this.dismissed = [false, false];
    this.bounds = [null, null];
  }

  /**
   * Starts the entrance animation for a balloon unless it has been dismissed.
   *
   * @param {number} which Balloon identifier.
   */
  reset(which) {
    if (this.dismissed[which]) return;
    this.shown[which] = 1;
  }

  /**
   * Re-arms dismissed balloons after the app has been idle long enough.
   *
   * @param {boolean} isIdle Whether the app has seen no mouse movement for the idle period.
   */
  updateIdle(isIdle) {
    if (!isIdle) return;
    for (let i = 0; i < this.dismissed.length; i++) {
      if (this.dismissed[i]) {
        this.dismissed[i] = false;
        this.shown[i] = 0;
      }
    }
  }

  /**
   * Makes all dismissed balloons eligible to appear again.
   */
  undismissAll() {
    for (let i = 0; i < this.dismissed.length; i++) {
      this.dismissed[i] = false;
      this.shown[i] = 0;
    }
  }

  /**
   * Clears per-frame hit boxes before visible balloons redraw them.
   */
  clearBounds() {
    for (let i = 0; i < this.bounds.length; i++) {
      this.bounds[i] = null;
    }
  }

  /**
   * Dismisses the visible balloon under a canvas-space point.
   *
   * @param {number} x Mouse x in canvas coordinates.
   * @param {number} y Mouse y in canvas coordinates.
   * @returns {boolean} true when a balloon consumed the click.
   */
  dismissAt(x, y) {
    for (let i = 0; i < this.bounds.length; i++) {
      if (this.bounds[i] && this.bounds[i].contains(x, y)) {
        this.dismissed[i] = true;
        this.shown[i] = 0;
        this.bounds[i] = null;
        return true;
      }
    }
    return false;
  }

  /**
   * Draws one animated balloon and records its canvas-space hit box.
   *
   * @param {number} x Panel-local left coordinate.
   * @param {number} y Unused legacy y parameter retained for call-site similarity.
   * @param {number} w Balloon width.
   * @param {number} h Panel height used to anchor the balloon to the bottom.
   * @param {number} which Balloon identifier.
   * @param {number} globalX Panel's canvas-space x offset.
   * @param {number} globalY Panel's canvas-space y offset.
   */
  draw(x, y, w, h, which, globalX = 0, globalY = 0) {
    if (this.dismissed[which] || this.shown[which] <= 0) return;
    const c = this.colors;
    const full = this.texts[which];
    const shownText = full.slice(0, this.shown[which]);
    this.shown[which] = Math.min(full.length, this.shown[which] + 60);
    const lines = wrapWords(shownText, w - 20, 10, "Helvetica");
    const th = Math.max(this.heights[which], lines.length * 10 + 21);
    this.heights[which] = th;
    const top = h - (th + 10);
    this.bounds[which] = new Rect(globalX + x, globalY + top, w, th);
    fill(c.balloonBg);
    noStroke();
    rect(x, top, w, th, 9);
    noFill();
    stroke(c.border);
    rect(x, top, w, th, 9);
    for (let i = 0; i < lines.length; i++) {
      drawShadowText(lines[i], x + 10, top + 17 + i * 10, 10, "Helvetica", NORMAL, c.balloonText, c.balloonTextShadow);
    }
  }
}

/**
 * Defines the color palette and interpolated palettes used by the port.
 */
class ColorScheme {
  /**
   * Builds fixed colors and 256-step palettes matching the Java `ColorScheme`.
   */
  constructor() {
    this.bg = color(57, 71, 72);
    this.thumbBg = this.bg;
    this.border = color(16, 7, 0);
    this.plotBg = color(2, 2, 15);
    this.graphBg = color(2, 2, 15);
    this.graphInfoBg = color(50, 70, 86);
    this.graphNumLabel0 = color(2, 18, 31);
    this.graphNumLabel1 = color(60, 82, 98);
    this.thumbRect = color(107, 121, 122);
    this.thumbRect2 = color(120, 136, 138);
    this.thumbHilite = color(140, 148, 146);
    this.thumbHilite2 = color(151, 163, 165);
    this.thumbShadow = color(97, 109, 110);
    this.thumbShadow2 = color(108, 123, 124);
    this.thumbShadow3 = color(77, 90, 91);
    this.graphKey = color(66, 99, 55);
    this.graphData = color(255, 161, 9);
    this.graphDataSelect = color(116, 245, 255);
    this.graphDataFauxHilite = color(30, 64, 79);
    this.graphDataSelectEdge = color(60, 130, 130);
    this.graphCrossText = color(253, 249, 240);
    this.graphCrossTextShadow = color(0, 0, 0);
    this.graphKeyHilite = color(43, 69, 35);
    this.graphKeyLabel = color(187, 231, 173);
    this.graphMainKeyLabel = color(253, 249, 240);
    this.graphShadKeyLabel = color(2, 15, 2);
    this.graphLightKeyLabel = color(82, 123, 69);
    this.graphGrid = color(2, 49, 67);
    this.plotGrid = color(2, 49, 67);
    this.plotIndicator = color(116, 245, 255);
    this.helpRectOn = color(255, 161, 9);
    this.helpRectOff = color(107, 121, 122);
    this.balloonBg = color(107, 121, 122);
    this.balloonTextShadow = color(86, 97, 98);
    this.balloonText = color(253, 249, 240);
    this.interfaceText = color(253, 249, 240);
    this.interfaceTextShadow = color(86, 97, 98);
    this.plotBalloonText = color(253, 249, 240);
    this.plotBalloonTextShadow = color(2, 15, 2);
    this.palSize = 256;
    this.thumbPalette = palette(this.thumbRect, this.thumbRect2);
    this.thumbHilitePalette = palette(this.thumbHilite, this.thumbHilite2);
    this.thumbShadowPalette = palette(this.thumbShadow, this.thumbShadow2);
    this.graphKeyLabelPalette = palette(this.graphKeyLabel, this.graphLightKeyLabel);
    this.gridLinePalette0 = palette(this.graphBg, this.graphGrid);
    this.gridLinePalette1 = palette(this.graphGrid, this.graphInfoBg);
    this.gridLinePalette2 = palette(this.graphNumLabel0, this.graphNumLabel1);
    this.crossDinkPalette = [];
    for (let i = 0; i < 64; i++) {
      const f = i / 63;
      this.crossDinkPalette.push(color(
        lerp(red(this.graphBg), 36, f),
        lerp(green(this.graphBg), 70, f),
        lerp(blue(this.graphBg), 86, f)
      ));
    }
  }
}

/**
 * Lightweight rectangle with p5-friendly point containment.
 */
class Rect {
  /**
   * Stores a rectangle.
   *
   * @param {number} x Left coordinate.
   * @param {number} y Top coordinate.
   * @param {number} w Width.
   * @param {number} h Height.
   */
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  /**
   * Tests whether a point lies inside this rectangle.
   *
   * @param {number} x Point x coordinate.
   * @param {number} y Point y coordinate.
   * @returns {boolean} true when inside the rectangle.
   */
  contains(x, y) {
    return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
  }
}

/**
 * Builds a scaled overview image whose cells are arranged in rows of 100 integers.
 *
 * This ports the Java `PlotGenerator`: counts are log-transformed, normalized, shaped with
 * bias/gain curves, and written to a non-linear color palette.
 *
 * @param {DataSource} ds Dataset to visualize.
 * @param {ColorScheme} colors Shared color palette.
 * @param {boolean} selected Whether to use the selected-range palette.
 * @returns {p5.Image} Pre-rendered overview image.
 */
function buildPlotImage(ds, colors, selected) {
  const img = createImage(DATA_PER_ROW * PLOT_SCALE, 1000 * PLOT_SCALE);
  const pal = buildPlotPalette(selected, colors);
  const bits = new Float32Array(100000);
  let dataMax = Number.MIN_VALUE;
  let dataMin = Number.MAX_VALUE;
  for (let i = 0; i < 100000; i++) {
    const bit = ds.data[i] === 0 ? 0 : Math.log(ds.data[i]);
    bits[i] = bit;
    if (bit > dataMax) dataMax = bit;
    if (bit !== 0 && bit < dataMin) dataMin = bit;
  }
  const dataRange = Math.max(1e-9, dataMax - dataMin);
  img.loadPixels();
  for (let src = 0; src < 100000; src++) {
    let value = Math.max(0, (bits[src] - dataMin) / dataRange);
    value *= Math.pow(src / 100000, 0.1);
    value = gain(0.8, value);
    value = bias(0.8, value);
    value = gain(0.6, value);
    let palIndex = Math.round(value * 255);
    if (!Number.isFinite(palIndex)) palIndex = 0;
    palIndex = Math.max(0, Math.min(255, palIndex));
    const col = pal[palIndex];
    const sx = src % DATA_PER_ROW;
    const sy = Math.floor(src / DATA_PER_ROW);
    for (let yy = 0; yy < PLOT_SCALE; yy++) {
      for (let xx = 0; xx < PLOT_SCALE; xx++) {
        const px = ((sy * PLOT_SCALE + yy) * img.width + sx * PLOT_SCALE + xx) * 4;
        img.pixels[px] = col[0];
        img.pixels[px + 1] = col[1];
        img.pixels[px + 2] = col[2];
        img.pixels[px + 3] = 255;
      }
    }
  }
  img.updatePixels();
  return img;
}

/**
 * Creates the overview palette used for selected or unselected data cells.
 *
 * @param {boolean} selected Whether to build the selected-range palette.
 * @param {ColorScheme} colors Shared color palette.
 * @returns {number[][]} RGB triples indexed by intensity.
 */
function buildPlotPalette(selected, colors) {
  const gr = selected ? 0.2 : 1.5;
  const gg = selected ? 0.55 : 1.0;
  const gb = selected ? 1.95 : 1.8;
  const out = [];
  for (let i = 0; i < 256; i++) {
    const p = i / 255;
    out.push([
      Math.round(255 * Math.pow(p, gr)),
      Math.round(255 * Math.pow(p, gg)),
      Math.round(255 * Math.pow(p, gb)),
    ]);
  }
  return out;
}

/**
 * Builds a 256-color linear interpolation between two p5 colors.
 *
 * @param {p5.Color} c0 Start color.
 * @param {p5.Color} c1 End color.
 * @returns {p5.Color[]} Interpolated palette.
 */
function palette(c0, c1) {
  const out = [];
  for (let i = 0; i < 256; i++) {
    const f = i / 255;
    out.push(color(lerp(red(c0), red(c1), f), lerp(green(c0), green(c1), f), lerp(blue(c0), blue(c1), f)));
  }
  return out;
}

/**
 * Advances or retreats a palette index for hover/bevel fades.
 *
 * @param {number} index Current palette index.
 * @param {boolean} active Whether the element is active/hovered.
 * @param {number} amount Step amount per frame.
 * @returns {number} Clamped palette index.
 */
function stepPalette(index, active, amount) {
  return constrain(index + (active ? amount : -amount), 0, 255);
}

/**
 * Chooses the nearest human-friendly integer label spacing.
 *
 * @param {number} target Desired spacing.
 * @returns {number} Nearest spacing from the Java skip list.
 */
function nearestSkip(target) {
  const skips = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  let best = skips[0];
  let bestDist = Infinity;
  for (const skip of skips) {
    const skipDistance = Math.abs(skip / target - 1);
    if (skipDistance < bestDist) {
      bestDist = skipDistance;
      best = skip;
    }
  }
  return best;
}

/**
 * Finds the first sorted-array position whose value is not less than `needle`.
 *
 * @param {number[]} values Sorted numeric values.
 * @param {number} needle Value to search for.
 * @returns {number} Lower-bound index.
 */
function lowerBound(values, needle) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < needle) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Begins a rectangular canvas clip for a panel.
 *
 * @param {number} x Clip left coordinate.
 * @param {number} y Clip top coordinate.
 * @param {number} w Clip width.
 * @param {number} h Clip height.
 */
function beginPanelClip(x, y, w, h) {
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(x, y, w, h);
  drawingContext.clip();
}

/**
 * Ends the most recent panel clip.
 */
function endPanelClip() {
  drawingContext.restore();
}

/**
 * Draws one text string with the applet-style one-pixel shadow.
 *
 * @param {string} valueText Text to draw.
 * @param {number} x Baseline x coordinate.
 * @param {number} y Baseline y coordinate.
 * @param {number} size Font size in pixels.
 * @param {string} family Font family.
 * @param {string|number} style p5 text style.
 * @param {p5.Color} fg Foreground color.
 * @param {p5.Color} shadow Shadow color.
 */
function drawShadowText(valueText, x, y, size, family, style, fg, shadow) {
  textFont(family);
  textStyle(style);
  textSize(size);
  textAlign(LEFT, BASELINE);
  noStroke();
  fill(shadow);
  text(valueText, x + 1, y + 1);
  fill(fg);
  text(valueText, x, y);
}

/**
 * Draws a 90-degree rotated text label.
 *
 * @param {string} valueText Text to draw.
 * @param {number} x Rotation origin x coordinate.
 * @param {number} y Rotation origin y coordinate.
 * @param {number} size Font size in pixels.
 * @param {p5.Color|null} fg Optional foreground color.
 * @param {p5.Color|null} shadow Optional shadow color.
 */
function drawVerticalText(valueText, x, y, size, fg = null, shadow = null) {
  push();
  translate(x, y);
  rotate(HALF_PI);
  textFont("Courier");
  textStyle(NORMAL);
  textSize(size);
  textAlign(LEFT, BASELINE);
  noStroke();
  if (shadow) {
    fill(shadow);
    text(valueText, 1, 1);
  }
  fill(fg || app.colors.gridLinePalette2[180]);
  text(valueText, 0, 0);
  pop();
}

/**
 * Wraps a string into lines that fit within a target pixel width.
 *
 * @param {string} valueText Text to wrap.
 * @param {number} maxWidth Maximum line width in pixels.
 * @param {number} size Font size used for measuring.
 * @param {string} family Font family used for measuring.
 * @returns {string[]} Wrapped lines.
 */
function wrapWords(valueText, maxWidth, size, family) {
  textFont(family);
  textSize(size);
  const words = valueText.split(/(\s+)/);
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    const trial = currentLine + word;
    if (currentLine && textWidth(trial) > maxWidth) {
      lines.push(currentLine.trimEnd());
      currentLine = word.trimStart();
    } else {
      currentLine = trial;
    }
  }
  if (currentLine) lines.push(currentLine.trimEnd());
  return lines;
}

/**
 * Applies the classic graphics-gems bias curve used by the Java plot generator.
 *
 * @param {number} b Bias amount.
 * @param {number} val Input value in the range 0..1.
 * @returns {number} Biased value.
 */
function bias(b, val) {
  if (val <= 0) return 0;
  return Math.pow(val, Math.log(b) / Math.log(0.5));
}

/**
 * Applies the classic gain curve used by the Java plot generator.
 *
 * @param {number} g Gain amount.
 * @param {number} val Input value in the range 0..1.
 * @returns {number} Gain-adjusted value.
 */
function gain(g, val) {
  if (val < 0.5) return bias(1 - g, 2 * val) * 0.5;
  return 1 - bias(1 - g, 2 - 2 * val) * 0.5;
}
