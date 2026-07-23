const { chromium } = require("playwright");

const url = process.argv[2] || `http://localhost:8766/?cachebust=${Date.now()}`;
const screenshotPath = process.argv[3] || "/private/tmp/slon-p5-verify.png";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
  });

  const messages = [];
  page.on("console", (msg) => messages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => messages.push({ type: "pageerror", text: err.stack || err.message }));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    app.graph.select(900, 1400);
  });
  await page.waitForTimeout(100);

  const before = await page.evaluate(() => ({
    nativeSelects: document.querySelectorAll("select").length,
    dropdown: app.datasetDropdownRect,
    datasetIndex: app.currentDatasetIndex,
    datasetName: app.dataset.name,
    graphRange: {
      low: app.graph.yLow,
      high: app.graph.yHigh,
      lowTarget: app.graph.yLowTarget,
      highTarget: app.graph.yHighTarget,
      scaleMode: app.graph.scaleMode,
    },
    canvasBacking: [document.querySelector("canvas").width, document.querySelector("canvas").height],
    canvasCss: [document.querySelector("canvas").clientWidth, document.querySelector("canvas").clientHeight],
  }));

  const cx = before.dropdown.x + before.dropdown.w / 2;
  const cy = before.dropdown.y + before.dropdown.h / 2;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(200);
  const dropdownOpened = await page.evaluate(() => app.datasetDropdownOpen);

  await page.mouse.click(cx, before.dropdown.y + before.dropdown.h * 3.5);
  await page.waitForTimeout(500);
  const afterDropdown = await page.evaluate(() => ({
    open: app.datasetDropdownOpen,
    datasetIndex: app.currentDatasetIndex,
    datasetName: app.dataset.name,
    graphRange: {
      low: app.graph.yLow,
      high: app.graph.yHigh,
      lowTarget: app.graph.yLowTarget,
      highTarget: app.graph.yHighTarget,
      scaleMode: app.graph.scaleMode,
    },
  }));

  const wheelBefore = await page.evaluate(() => ({
    low: app.graph.yLowTarget,
    high: app.graph.yHighTarget,
  }));
  await page.mouse.move(800, 500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(250);
  const wheelAfter = await page.evaluate(() => ({
    low: app.graph.yLowTarget,
    high: app.graph.yHighTarget,
  }));

  await page.evaluate(() => {
    window.contextMenuPrevented = false;
    document.addEventListener(
      "contextmenu",
      (event) => {
        window.contextMenuPrevented = event.defaultPrevented;
      },
      { once: true }
    );
  });
  await page.mouse.move(500, 220);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(100);
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(200);
  const rightClick = await page.evaluate(() => ({
    prevented: window.contextMenuPrevented,
    graphDown: app.graph.mouseDown,
    activeTarget: !!app.activeTarget,
  }));

  const zoomDirections = await page.evaluate(() => {
    const graph = app.graph;
    const leftX = graph.gL + graph.gW * 0.25;
    const rightX = graph.gL + graph.gW * 0.75;
    graph.mouseX = leftX;
    graph.isRightMousePress = false;
    graph.updateZoomDirection();
    const leftButtonLeftHalf = graph.zoomOut;
    graph.mouseX = rightX;
    graph.updateZoomDirection();
    const leftButtonRightHalf = graph.zoomOut;
    graph.mouseX = leftX;
    graph.isRightMousePress = true;
    graph.updateZoomDirection();
    const rightButtonLeftHalf = graph.zoomOut;
    graph.mouseX = rightX;
    graph.updateZoomDirection();
    const rightButtonRightHalf = graph.zoomOut;
    return {
      leftButtonLeftHalf,
      leftButtonRightHalf,
      rightButtonLeftHalf,
      rightButtonRightHalf,
    };
  });

  const realRightClickLeft = await testGraphButton(page, "right", 0.25);
  const realRightClickRight = await testGraphButton(page, "right", 0.75);
  const realLeftClickLeft = await testGraphButton(page, "left", 0.25);
  const realLeftClickRight = await testGraphButton(page, "left", 0.75);

  await page.mouse.move(100, 100);
  await page.waitForTimeout(100);
  await page.mouse.move(800, 500);
  await page.waitForTimeout(500);
  const balloonA = await page.evaluate(() => app.balloon.shown[1]);
  await page.mouse.move(804, 504);
  await page.waitForTimeout(150);
  const balloonB = await page.evaluate(() => app.balloon.shown[1]);

  const dismissBefore = await page.evaluate(() => app.balloon.bounds[1]);
  if (!dismissBefore) throw new Error("Expected plot balloon bounds before dismissal.");
  await page.mouse.click(dismissBefore.x + dismissBefore.w / 2, dismissBefore.y + dismissBefore.h / 2);
  await page.waitForTimeout(200);
  const afterDismiss = await page.evaluate(() => ({
    dismissed: app.balloon.dismissed[1],
    shown: app.balloon.shown[1],
    bounds: app.balloon.bounds[1],
  }));
  await page.mouse.move(806, 506);
  await page.waitForTimeout(200);
  const afterSmallMove = await page.evaluate(() => ({
    dismissed: app.balloon.dismissed[1],
    shown: app.balloon.shown[1],
    bounds: app.balloon.bounds[1],
  }));
  await page.mouse.move(100, 100);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    app.lastMouseMoveTime = millis() - 31000;
  });
  await page.waitForTimeout(100);
  const afterIdle = await page.evaluate(() => ({
    dismissed: app.balloon.dismissed[1],
    shown: app.balloon.shown[1],
  }));
  await page.mouse.move(800, 500);
  await page.waitForTimeout(300);
  const afterReenter = await page.evaluate(() => ({
    dismissed: app.balloon.dismissed[1],
    shown: app.balloon.shown[1],
    bounds: !!app.balloon.bounds[1],
  }));

  await page.waitForFunction(() => window.SLON_DATA_2026_PHRASES && window.SLON_DATA_2026_PHRASES.loaded);
  const phraseRouting = await page.evaluate(() => {
    app.setDataset(0);
    app.jumpToNumber(1);
    const legacy = {
      datasetIndex: app.currentDatasetIndex,
      datasetName: app.dataset.name,
      phrases: app.currentPhrases,
    };
    const dataset2026 = app.datasets.findIndex((dataset) => dataset.nick === "2026 July");
    app.setDataset(dataset2026);
    app.jumpToNumber(1);
    return {
      legacy,
      dataset2026,
      currentDatasetIndex: app.currentDatasetIndex,
      currentDatasetName: app.dataset.name,
      loaded2026: window.SLON_DATA_2026_PHRASES.loaded,
      phrases2026: app.currentPhrases,
    };
  });

  const rangeClamp = await page.evaluate(() => {
    app.setDataset(0);
    app.graph.select(0, 10);
    app.graph.selectBlur(-11, -1);
    app.graph.computeBounds();
    app.graph.computeSelection();
    app.plot.update();
    return {
      graphSelected: app.graph.selectedNumber,
      plotSelected: app.plot.selectedNumber,
      yLow: app.graph.yLow,
      yHigh: app.graph.yHigh,
      yLowTarget: app.graph.yLowTarget,
      yHighTarget: app.graph.yHighTarget,
      selectionStartIndex: app.plot.selectionStartIndex,
      selectionEndIndex: app.plot.selectionEndIndex,
    };
  });
  const bottomRangeClamp = await page.evaluate(() => {
    app.setDataset(0);
    app.graph.select(99990, 100000);
    app.graph.selectBlur(100001, 100011);
    app.graph.computeBounds();
    app.graph.computeSelection();
    app.plot.update();
    return {
      graphSelected: app.graph.selectedNumber,
      plotSelected: app.plot.selectedNumber,
      yLow: app.graph.yLow,
      yHigh: app.graph.yHigh,
      yLowTarget: app.graph.yLowTarget,
      yHighTarget: app.graph.yHighTarget,
      selectionStartIndex: app.plot.selectionStartIndex,
      selectionEndIndex: app.plot.selectionEndIndex,
    };
  });
  if (
    rangeClamp.yLowTarget < -10 ||
    rangeClamp.yHighTarget < 0 ||
    rangeClamp.yLow < -10 ||
    rangeClamp.yHigh < 0 ||
    rangeClamp.selectionStartIndex < 0 ||
    rangeClamp.selectionEndIndex < 0 ||
    (rangeClamp.graphSelected !== -999 && rangeClamp.graphSelected < 0) ||
    (rangeClamp.plotSelected !== -999 && rangeClamp.plotSelected < 0)
  ) {
    throw new Error(`Range clamp regression failed: ${JSON.stringify(rangeClamp)}`);
  }
  if (
    bottomRangeClamp.yLowTarget > 100000 ||
    bottomRangeClamp.yHighTarget > 100010 ||
    bottomRangeClamp.yLow > 100000 ||
    bottomRangeClamp.yHigh > 100010 ||
    bottomRangeClamp.selectionStartIndex > 100000 ||
    bottomRangeClamp.selectionEndIndex > 100000 ||
    (bottomRangeClamp.graphSelected !== -999 && bottomRangeClamp.graphSelected > 100000) ||
    (bottomRangeClamp.plotSelected !== -999 && bottomRangeClamp.plotSelected > 100000)
  ) {
    throw new Error(`Bottom range clamp regression failed: ${JSON.stringify(bottomRangeClamp)}`);
  }

  const zeroBarSelection = await page.evaluate(() => {
    const dataset2026 = app.datasets.findIndex((dataset) => dataset.nick === "2026 July");
    app.setDataset(dataset2026);
    app.graph.select(-10, 50);
    app.graph.setKeyboardSelection(0);
    const cr = app.graph.crossRect();
    return {
      datasetIndex: app.currentDatasetIndex,
      data0: app.dataset.data[0],
      crossX: cr.x,
      graphLeft: app.graph.gL,
      expectedX: app.graph.gL + app.graph.transformDataToScreen(0),
    };
  });
  if (
    zeroBarSelection.datasetIndex < 0 ||
    zeroBarSelection.data0 <= 0 ||
    zeroBarSelection.crossX <= zeroBarSelection.graphLeft ||
    zeroBarSelection.crossX !== zeroBarSelection.expectedX
  ) {
    throw new Error(`Zero bar selection regression failed: ${JSON.stringify(zeroBarSelection)}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  console.log(
    JSON.stringify(
      {
        url,
        screenshotPath,
        messages,
        before,
        dropdownOpened,
        afterDropdown,
        wheelBefore,
        wheelAfter,
        rightClick,
        zoomDirections,
        realRightClickLeft,
        realRightClickRight,
        realLeftClickLeft,
        realLeftClickRight,
        balloonA,
        balloonB,
        dismissBefore,
        afterDismiss,
        afterSmallMove,
        afterIdle,
        afterReenter,
        phraseRouting,
        rangeClamp,
        bottomRangeClamp,
        zeroBarSelection,
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function testGraphButton(page, button, xFrac) {
  const point = await page.evaluate((frac) => ({
    x: app.graph.rect.x + app.graph.gL + app.graph.gW * frac,
    y: app.graph.rect.y + app.graph.gH * 0.3,
  }), xFrac);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button });
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => ({
    isRightMousePress: app.graph.isRightMousePress,
    zoomOut: app.graph.zoomOut,
    graphDown: app.graph.mouseDown,
  }));
  await page.mouse.up({ button });
  await page.waitForTimeout(100);
  return state;
}
