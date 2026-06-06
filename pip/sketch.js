const CANVAS_W = 580;
const CANVAS_H = 434;

// Original applet geometry: a 24x21 grid of 20-pixel cells,
// offset inside the gray Java-style control frame.
const WORK_X = 93;
const WORK_Y = 7;
const CELL = 20;
const GRID_W = 24;
const GRID_H = 21;
const WORK_W = GRID_W * CELL;
const WORK_H = GRID_H * CELL;

const TOOL_ARROW = 0;
const TOOL_PEN = 1;

const WHITE = 0;
const BLACK = 1;

// The original UI also had zoom icons, but only cursor and pencil
// were implemented. This port keeps the two working tools.
const toolDefs = [
  { file: "arrowtool.gif" },
  { file: "pentool.gif" },
];

// Ink order matches PipConstants.java and the original button layout.
const inkDefs = [
  { file: "w.gif" },
  { file: "b.gif" },
  { file: "wdu.gif" },
  { file: "bdu.gif" },
  { file: "wdd.gif" },
  { file: "bdd.gif" },
  { file: "wuu.gif" },
  { file: "buu.gif" },
  { file: "wd.gif" },
  { file: "bd.gif" },
  { file: "wu.gif" },
  { file: "bu.gif" },
  { file: "wc.gif" },
  { file: "bc.gif" },
];

const initValueFSA = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

// editorMatrix stores the ink painted in each cell.
// runtimeMatrix stores the current black/white state during play mode.
let toolImages = [];
let inkImages = [];
let upButtonImage;
let downButtonImage;

let toolButtons = [];
let inkButtons = [];
let activeButton = null;

let currentTool = TOOL_PEN;
let currentInk = 3;
let editorMatrix = [];
let runtimeMatrix = [];
let sharedInputMatrix = [];
let isPointerDown = false;
let lastWorkX = 0;
let lastWorkY = 0;
let assetsReady = false;

async function setup() {
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  canvas.parent("sketch-holder");
  pixelDensity(1);
  noSmooth();
  noLoop();
  await loadAssets();
  initializeMatrices();
  initializeButtons();
  rebuildSharedInputs();
  resetRuntimeFromEditor();
  assetsReady = true;
  loop();
}

async function loadAssets() {
  // p5.js 2 loads assets with promises; preload() no longer blocks setup.
  [upButtonImage, downButtonImage, toolImages, inkImages] = await Promise.all([
    loadImage("images/upicon31.gif"),
    loadImage("images/downicon31.gif"),
    Promise.all(toolDefs.map((tool) => loadImage(`images/${tool.file}`))),
    Promise.all(inkDefs.map((ink) => loadImage(`images/${ink.file}`))),
  ]);
}

function draw() {
  if (!assetsReady) {
    background(128);
    return;
  }

  drawAppletFrame();
  drawButtons();
  drawSelectionIcon();
  drawWorkArea();
  updateCursor();
}

function initializeMatrices() {
  editorMatrix = Array.from({ length: GRID_W }, () => Array(GRID_H).fill(0));
  runtimeMatrix = Array.from({ length: GRID_W }, () => Array(GRID_H).fill(0));
  sharedInputMatrix = Array.from({ length: GRID_W }, () => Array(GRID_H).fill(null));
}

function initializeButtons() {
  toolButtons = [];
  for (let index = 0; index < toolDefs.length; index += 1) {
    toolButtons.push({ type: "tool", index, x: 12 + index * 36, y: 32 });
  }

  inkButtons = [];
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const index = x + y * 2;
      inkButtons.push({ type: "ink", index, x: 12 + x * 36, y: 171 + y * 36 });
    }
  }
}

function drawAppletFrame() {
  // Recreate the spare 1998 applet frame around the drawing grid.
  background(128);

  fill(0);
  noStroke();
  rect(91, 5, 484, 424);

  rect(5, 5, 81, 101);
  fill(192);
  rect(7, 7, 77, 97);

  fill(0);
  rect(5, 111, 81, 318);
  fill(192);
  rect(7, 113, 77, 314);

  fill(0, 0, 96);
  noStroke();
  beginShape();
  vertex(34, 131);
  vertex(55, 131);
  vertex(62, 138);
  vertex(62, 159);
  vertex(55, 166);
  vertex(34, 166);
  vertex(27, 159);
  vertex(27, 138);
  endShape(CLOSE);
}

function drawButtons() {
  for (const button of toolButtons) {
    drawButton(button, toolImages[button.index], button.index === currentTool);
  }
  for (const button of inkButtons) {
    drawButton(button, inkImages[button.index], false, currentTool === TOOL_ARROW);
  }
}

function drawButton(button, icon, selected, disabled = false) {
  const pressed = activeButton === button;
  image(pressed ? downButtonImage : upButtonImage, button.x, button.y, 31, 31);
  image(icon, button.x + (pressed ? 6 : 5), button.y + (pressed ? 6 : 5), 21, 21);

  if (disabled) {
    drawMutedOverlay(button.x + 2, button.y + 2, 27, 27);
  }

  if (selected) {
    push();
    noFill();
    stroke(0);
    strokeWeight(2);
    rect(button.x + 2, button.y + 2, 27, 27);
    stroke(255);
    strokeWeight(1);
    rect(button.x + 4, button.y + 4, 23, 23);
    pop();
  }
}

function drawSelectionIcon() {
  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(35, 139, 19, 19);
  drawingContext.clip();
  image(inkImages[currentInk], 34, 138, 21, 21);
  if (currentTool === TOOL_ARROW) {
    drawMutedOverlay(34, 138, 21, 21);
  }
  drawingContext.restore();
  pop();
}

function drawMutedOverlay(x, y, w, h) {
  push();
  noStroke();
  fill(192, 168);
  rect(x, y, w, h);
  pop();
}

function drawWorkArea() {
  push();
  translate(WORK_X, WORK_Y);
  noStroke();

  if (currentTool === TOOL_ARROW) {
    // Play mode shows only the live black/white runtime state.
    for (let x = 0; x < GRID_W; x += 1) {
      for (let y = 0; y < GRID_H; y += 1) {
        fill(runtimeMatrix[x][y] === BLACK ? 0 : 255);
        rect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  } else {
    // Draw mode shows the symbolic ink icons painted into the grid.
    fill(255);
    rect(0, 0, WORK_W, WORK_H);
    for (let x = 0; x < GRID_W; x += 1) {
      for (let y = 0; y < GRID_H; y += 1) {
        image(inkImages[editorMatrix[x][y]], x * CELL, y * CELL, 21, 21);
      }
    }
  }

  pop();
}

function updateCursor() {
  if (!screenToCell(mouseX, mouseY)) {
    cursor(ARROW);
    return;
  }
  cursor(currentTool === TOOL_PEN ? "crosshair" : "pointer");
}

function mousePressed() {
  // The old Java canvas sent both mouseDownEvent and mouseButtonIsDown
  // on press; keep that behavior so drawing and play interactions match.
  const button = buttonAt(mouseX, mouseY);
  if (button) {
    activeButton = button;
    return false;
  }

  const local = screenToWork(mouseX, mouseY);
  if (!local) {
    return true;
  }

  isPointerDown = true;
  lastWorkX = local.x;
  lastWorkY = local.y;
  mouseDownEvent(local.x, local.y);
  mouseButtonIsDown(local.x, local.y);
  return false;
}

function mouseDragged() {
  if (activeButton || !isPointerDown) {
    return false;
  }

  const local = { x: mouseX - WORK_X, y: mouseY - WORK_Y };
  dragMouseButton(lastWorkX, lastWorkY, local.x, local.y);
  lastWorkX = local.x;
  lastWorkY = local.y;
  return false;
}

function mouseReleased() {
  if (activeButton) {
    if (buttonAt(mouseX, mouseY) === activeButton) {
      selectButton(activeButton);
    }
    activeButton = null;
    return false;
  }

  if (isPointerDown) {
    const local = { x: mouseX - WORK_X, y: mouseY - WORK_Y };
    mouseUpEvent(local.x, local.y);
    isPointerDown = false;
    return false;
  }

  return true;
}

function buttonAt(x, y) {
  return [...toolButtons, ...inkButtons].find((button) => (
    !(button.type === "ink" && currentTool === TOOL_ARROW) &&
    x >= button.x && x < button.x + 31 && y >= button.y && y < button.y + 31
  ));
}

function selectButton(button) {
  if (button.type === "tool") {
    const previousTool = currentTool;
    currentTool = button.index;
    if (currentTool === TOOL_ARROW && previousTool !== TOOL_ARROW) {
      resetRuntimeFromEditor();
    }
  } else {
    currentInk = button.index;
  }
}

function screenToWork(x, y) {
  const local = { x: x - WORK_X, y: y - WORK_Y };
  if (local.x < 0 || local.x >= WORK_W || local.y < 0 || local.y >= WORK_H) {
    return null;
  }
  return local;
}

function screenToCell(x, y) {
  const local = screenToWork(x, y);
  if (!local) {
    return null;
  }
  return { x: floor(local.x / CELL), y: floor(local.y / CELL) };
}

function localToCell(x, y) {
  if (x < 0 || x >= WORK_W || y < 0 || y >= WORK_H) {
    return null;
  }
  return { x: floor(x / CELL), y: floor(y / CELL) };
}

function dragMouseButton(fromX, fromY, toX, toY) {
  if (fromX === toX && fromY === toY) {
    return;
  }

  const xDiff = toX - fromX;
  const yDiff = toY - fromY;
  const xAbs = abs(xDiff);
  const yAbs = abs(yDiff);

  // Fill in the cells between drag events, like DSCanvas.mouseDrag did.
  if (xAbs > yAbs) {
    const direction = toX > fromX ? 1 : -1;
    for (let i = 1; i < xAbs; i += 1) {
      mouseButtonIsDown(fromX + direction * i, fromY + floor((yDiff * i) / xAbs));
    }
  } else {
    const direction = toY > fromY ? 1 : -1;
    for (let i = 1; i < yAbs; i += 1) {
      mouseButtonIsDown(fromX + floor((xDiff * i) / yAbs), fromY + direction * i);
    }
  }

  mouseButtonIsDown(toX, toY);
}

function mouseButtonIsDown(x, y) {
  const cell = localToCell(x, y);
  if (cell) {
    cellIsClicked(cell.x, cell.y);
  }
  return true;
}

function mouseDownEvent(x, y) {
  const cell = localToCell(x, y);
  if (cell) {
    cellMouseDown(cell.x, cell.y);
  }
  return true;
}

function mouseUpEvent(x, y) {
  const cell = localToCell(x, y);
  if (cell) {
    cellMouseUp(cell.x, cell.y);
  }
  return true;
}

function cellIsClicked(x, y) {
  if (currentTool !== TOOL_PEN) {
    return;
  }

  const oldInk = editorMatrix[x][y];
  if (oldInk !== currentInk) {
    editorMatrix[x][y] = currentInk;
    rebuildSharedInputs();
  }
  runtimeMatrix[x][y] = initValueFSA[currentInk];
}

function cellMouseDown(x, y) {
  // Interactive inks share input across their connected component.
  // A click on any member is delivered to every member.
  const inputVector = sharedInputMatrix[x][y];
  if (!inputVector) {
    interactiveCellMouseDown(x, y);
    return true;
  }

  for (const cell of inputVector) {
    interactiveCellMouseDown(cell.x, cell.y);
  }
  return true;
}

function cellMouseUp(x, y) {
  const inputVector = sharedInputMatrix[x][y];
  if (!inputVector) {
    interactiveCellMouseUp(x, y);
    return true;
  }

  for (const cell of inputVector) {
    interactiveCellMouseUp(cell.x, cell.y);
  }
  return true;
}

function interactiveCellMouseDown(x, y) {
  if (currentTool !== TOOL_ARROW) {
    return false;
  }

  const oldState = runtimeMatrix[x][y];
  const fsaNo = editorMatrix[x][y];
  runtimeMatrix[x][y] = nextValueMouseDownFSA(fsaNo, oldState);
  return true;
}

function interactiveCellMouseUp(x, y) {
  if (currentTool !== TOOL_ARROW) {
    return false;
  }

  const oldState = runtimeMatrix[x][y];
  const fsaNo = editorMatrix[x][y];
  runtimeMatrix[x][y] = nextValueMouseUpFSA(fsaNo, oldState);
  return true;
}

function resetRuntimeFromEditor() {
  // Entering play mode starts every cell from its ink's initial state.
  for (let x = 0; x < GRID_W; x += 1) {
    for (let y = 0; y < GRID_H; y += 1) {
      runtimeMatrix[x][y] = initValueFSA[editorMatrix[x][y]];
    }
  }
}

function rebuildSharedInputs() {
  // Rebuild the connected components of interactive cells.
  // This replaces the original Vector-sharing algorithm with the same result.
  sharedInputMatrix = Array.from({ length: GRID_W }, () => Array(GRID_H).fill(null));

  for (let x = 0; x < GRID_W; x += 1) {
    for (let y = 0; y < GRID_H; y += 1) {
      if (isInteractiveInk(editorMatrix[x][y]) && !sharedInputMatrix[x][y]) {
        const component = floodInteractiveComponent(x, y);
        for (const cell of component) {
          sharedInputMatrix[cell.x][cell.y] = component;
        }
      }
    }
  }
}

function floodInteractiveComponent(startX, startY) {
  const component = [];
  const stack = [{ x: startX, y: startY }];
  sharedInputMatrix[startX][startY] = component;

  while (stack.length > 0) {
    const cell = stack.pop();
    component.push(cell);

    for (const neighbor of adjacentPixels(cell.x, cell.y)) {
      if (
        isInteractiveInk(editorMatrix[neighbor.x][neighbor.y]) &&
        !sharedInputMatrix[neighbor.x][neighbor.y]
      ) {
        sharedInputMatrix[neighbor.x][neighbor.y] = component;
        stack.push(neighbor);
      }
    }
  }

  return component;
}

function adjacentPixels(xPos, yPos) {
  // Diagonal neighbors count, matching the original getAdjecentPixels().
  const result = [];
  for (let x = xPos - 1; x < xPos + 2; x += 1) {
    for (let y = yPos - 1; y < yPos + 2; y += 1) {
      if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !(x === xPos && y === yPos)) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

function isInteractiveInk(ink) {
  return ink > 1;
}

function nextValueMouseDownFSA(fsaNo, currentState) {
  // The ink behaviors are a pair of tiny finite-state tables:
  // one transition for mouse-down, and one for mouse-up.
  switch (fsaNo) {
    case 0:
      return WHITE;
    case 1:
      return BLACK;
    case 2:
      return BLACK;
    case 3:
      return WHITE;
    case 4:
    case 5:
      return currentState === WHITE ? BLACK : WHITE;
    case 6:
    case 7:
      return currentState;
    case 8:
      return BLACK;
    case 9:
      return WHITE;
    case 10:
    case 11:
    case 12:
    case 13:
      return currentState;
    default:
      return WHITE;
  }
}

function nextValueMouseUpFSA(fsaNo, currentState) {
  switch (fsaNo) {
    case 0:
      return WHITE;
    case 1:
      return BLACK;
    case 2:
      return WHITE;
    case 3:
      return BLACK;
    case 4:
    case 5:
      return currentState;
    case 6:
    case 7:
      return currentState === WHITE ? BLACK : WHITE;
    case 8:
    case 9:
      return currentState;
    case 10:
      return BLACK;
    case 11:
      return WHITE;
    case 12:
    case 13:
      return currentState;
    default:
      return WHITE;
  }
}
