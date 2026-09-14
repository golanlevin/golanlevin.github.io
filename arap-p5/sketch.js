let myShapeVertices = [];
let myControlPoints = [];
let myPins = [];
let arapShape;
let arapReady = false;
let activeControl = -1;
let showMesh = false;

window.arapShape = null;
window.arapReady = false;

function setup() {
  createCanvas(400, 400);

  myShapeVertices = [
    [200, 150],
    [300,  50],
    [325,  75],
    [225, 175],
    [225, 350],
    [175, 350],
    [175, 175],
    [ 75,  75],
    [100,  50],
  ];

  myControlPoints = [
    [300,75],
    [100,75],
    [250,125],
    [150,125],
    [200,175],
    [200,250],
  ];

  myPins = [
    [200,325],
  ];

  arapShape = new ArapP5.ArapShape(myShapeVertices);
  arapShape.setResolution("medium");
  window.arapShape = arapShape;
  for (let i = 0; i < myPins.length; i++) {
    arapShape.addPin(myPins[i]);
  }
  for (let i = 0; i < myControlPoints.length; i++) {
    arapShape.addControl(myControlPoints[i]);
  }

  arapShape.build().then(function () {
    arapReady = true;
    window.arapReady = true;
  });
  
}

function draw() {
  background(220);
  strokeWeight(2); 

  if (!arapReady) {
    fill(40);
    noStroke();
    text("Loading ARAP...", 16, 24);
    return;
  }

  let boundary = arapShape.getBoundary();
  if (boundary.length > 0) {
    fill(255);
    stroke(0);
    beginShape();
    for (let i = 0; i < boundary.length; i++) {
      vertex(boundary[i].x, boundary[i].y);
    }
    endShape(CLOSE);
  }

  if (showMesh) {
    arapShape.drawDebug();
  }

  drawPinsAndControls();
}

function drawPinsAndControls() {
  let controls = arapShape.getControls();
  for (let i = 0; i < controls.length; i++) {
    let px = controls[i].x;
    let py = controls[i].y;
    stroke(255);
    strokeWeight(activeControl === i ? 3 : 1);
    fill(0);
    circle(px, py, activeControl === i ? 10 : 8);
  }

  let pins = arapShape.getPins();
  for (let i = 0; i < pins.length; i++) {
    let px = pins[i].x;
    let py = pins[i].y;
    noStroke();
    fill(220, 30, 30);
    square(px - 5, py - 5, 10);
  }
}

function mousePressed() {
  if (!arapReady) return;
  activeControl = arapShape.nearestControl(mouseX, mouseY, 18);
}

function mouseDragged() {
  if (!arapReady || activeControl < 0) return;
  arapShape.moveControl(activeControl, mouseX, mouseY);
}

function mouseReleased() {
  activeControl = -1;
}

function keyPressed() {
  if (key === "d" || key === "D") {
    showMesh = !showMesh;
  }
  if (key === "r" || key === "R") {
    arapShape.resetControls();
  }
}
