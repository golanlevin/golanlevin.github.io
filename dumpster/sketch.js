// TheDumpster — p5.js port, 16:9 (port_03)

var KOS; // KnowerOfSelections
var BM;  // BreakupManager
var HM;  // HeartManager
var PBM; // ParagraphBalloonManager
var HBC; // HeartBalloonConnector
var DH;  // DumpsterHistogram
var PV;  // PixelView
var HD;  // HelpDisplayer

var pixelFont;
var textsReady = false;

// Preloaded raw assets (synchronously available in setup)
var _langDataLines, _langTagsLines, _kamalLines, _accessLines;
var _summaryFile, _histLines;
var _histbg, _dumpsterimg;
var _pixelLayoutFiles = [];   // one per PIXELVIEW_LAYOUTS entry; null = classic sort

var _lastInteractionTime = 0;

// Arrow-key auto-repeat for the pixel-view cursor. p5 suppresses the browser's
// own key repeat (its _onkeydown returns early when the key is already in
// _downKeys), so keyPressed() fires exactly once per physical press. Holding a
// key therefore has to be driven from draw() by polling keyIsDown().
var _arrowHeldKey      = 0;
var _arrowNextRepeatMs = 0;
var _arrowLoupeStepped = false;   // a loupe arrow step forced the balloon open

var _nextAutoplayMs = 0;   // 0 = unscheduled; re-armed whenever the viewer acts

// ===== TEMPORARY — live-tune the halo physics from the mouse ================
// mouseY sweeps HALO_BOUND_FRACTION_LIVE (what share of the hearts stay in
// orbit rather than being released to gravity). mouseX is unmapped. Values
// print ~4x/second. Set
// HACK_HALO_TUNE false, or delete this block and the _hackUpdateHaloTuning()
// call in draw(), to restore the constants.
const HACK_HALO_TUNE      = false;   // mouse tuning + console output off
const HACK_HALO_BOUND_MIN = 0.0,   HACK_HALO_BOUND_MAX = 1.00;
var   _hackHaloNextPrintMs = 0;

function _hackUpdateHaloTuning() {
  if (!HACK_HALO_TUNE) return;
  HALO_BOUND_FRACTION_LIVE = map(mouseY, 0, height, HACK_HALO_BOUND_MIN, HACK_HALO_BOUND_MAX);
  const now = millis();
  if (now >= _hackHaloNextPrintMs) {
    _hackHaloNextPrintMs = now + 250;
    console.log(
      'hearts on screen = ' + HM.activeHeartIds.length +
      '   HEART_HALO_BOUND_FRACTION = ' + HALO_BOUND_FRACTION_LIVE.toFixed(3) +
      '   (~' + Math.round(HALO_BOUND_FRACTION_LIVE * HM.activeHeartIds.length) +
      ' in orbit, rest released)');
    // TEMP diagnostic: are released hearts actually sinking?
    let nB=0,nF=0,yB=0,yF=0;
    for (let i = 0; i < MAX_N_HEARTS; i++) {
      const h = HM.hearts[i];
      if (h.existState === STATE_HEART_GONE) continue;
      if (h.haloGrip > 0.9) { nB++; yB += h.py; }
      else if (h.haloGrip < 0.1) { nF++; yF += h.py; }
    }
    console.log('   bound n=' + nB + ' meanY=' + (nB?(yB/nB).toFixed(0):'-') +
                '   released n=' + nF + ' meanY=' + (nF?(yF/nF).toFixed(0):'-'));
  }
}
// ===== end temporary block =================================================

// ===== TEMPORARY — p5 slider panel for the FLOCK force constants ===========
// Fixed strip across the top of the page: name / slider / current value.
// Set HACK_FLOCK_SLIDERS false, or delete this block plus the two calls in
// setup() and draw(), to remove it; FLOCK then keeps its constant defaults.
const HACK_FLOCK_SLIDERS = false;
var   _flockSliders    = [];
var   _overSliderPanel = false;

// key in FLOCK, label, min, max, step, decimals
const HACK_FLOCK_SLIDER_DEFS = [
  ['simLo',    'SIM_LO',      0.0,  1.0,   0.01,  2],
  ['simHi',    'SIM_HI',      0.0,  1.0,   0.01,  2],
  ['gamma',    'GAMMA',       0.3,  3.0,   0.05,  2],
  ['attractK', 'ATTRACT_K',   0.0,  0.20,  0.002, 3],
  ['repelK',   'REPEL_K',     0.0,  0.20,  0.002, 3],
  ['coreR',    'CORE_R',      0,    120,   1,     0],
  ['taper',    'TAPER',       1,    150,   1,     0],
  ['swirl',    'SWIRL',      -0.05, 0.05,  0.001, 3],
  ['gravity',  'GRAVITY_MAX', 0.0,  2.0,   0.02,  2],
  ['heaping',  'HEAPING',     0.0,  1.0,   0.02,  2]
];

function _buildFlockSliders() {
  if (!HACK_FLOCK_SLIDERS) return;
  const panel = createDiv('');
  panel.style('position', 'fixed');
  panel.style('top', '0'); panel.style('left', '0'); panel.style('right', '0');
  panel.style('z-index', '10');
  panel.style('background', 'rgba(0,0,0,0.80)');
  panel.style('padding', '6px 10px');
  panel.style('font', '11px/1.4 monospace');
  panel.style('color', '#ffffff');
  panel.style('display', 'flex');
  panel.style('flex-wrap', 'wrap');
  panel.style('gap', '3px 16px');
  // p5 dispatches mouse events window-wide, so without this a slider drag
  // would also land as a click on the artwork underneath.
  panel.mouseOver(function () { _overSliderPanel = true;  });
  panel.mouseOut (function () { _overSliderPanel = false; });

  for (let i = 0; i < HACK_FLOCK_SLIDER_DEFS.length; i++) {
    const d = HACK_FLOCK_SLIDER_DEFS[i];
    const key = d[0], label = d[1], lo = d[2], hi = d[3], step = d[4], dp = d[5];

    const row = createDiv(''); row.parent(panel);
    row.style('display', 'flex');
    row.style('align-items', 'center');
    row.style('gap', '5px');

    const nameEl = createSpan(label); nameEl.parent(row);
    nameEl.style('color', '#ffffff');
    nameEl.style('min-width', '78px');

    const sl = createSlider(lo, hi, FLOCK[key], step); sl.parent(row);
    sl.style('width', '96px');

    const valEl = createSpan(''); valEl.parent(row);
    valEl.style('color', '#ffffff');
    valEl.style('min-width', '42px');

    _flockSliders.push({ key: key, sl: sl, valEl: valEl, dp: dp });
  }
}

function _updateFlockSliders() {
  if (!HACK_FLOCK_SLIDERS) return;
  for (let i = 0; i < _flockSliders.length; i++) {
    const s = _flockSliders[i];
    FLOCK[s.key] = s.sl.value();
    s.valEl.html(nf(FLOCK[s.key], 1, s.dp));
  }
}
// ===== end temporary block =================================================

var _balloonClickActive = false;      // true while mouse is held on a balloon
var _bPixelViewMouseDownInView = false; // true from mouseDown in pixel view until mouseUp
var _bPixelViewDragActive = false;    // true once mouse has moved >= 20px from click origin
var _pixelViewClickOriginX = 0;
var _pixelViewClickOriginY = 0;
var _pixelViewClickBupId = DUMPSTER_INVALID;
var _bMagDragActive = false;   // true from mouseDown in the loupe until mouseUp

//------------------------------------------------------------
function preload() {
  _langDataLines = loadStrings('data/languageData.txt');
  _langTagsLines = loadStrings('data/languageTags.txt');
  _kamalLines    = loadStrings('data/kamalFlags.txt');
  _accessLines   = loadStrings('data/accessThemes.tsv');
  _summaryFile   = loadBytes ('data/breakupSummaryLengths.dat');
  _histLines     = loadStrings('data/breakupsPerDay2005.txt');
  pixelFont      = loadFont  ('data/6px2bus.ttf');
  _histbg        = loadImage ('data/hist_980x111.jpg');
  _dumpsterimg   = loadImage ('data/dumpster_980x609.jpg');

  // Precomputed PixelView layouts (keys 7/8/9). A null asset means the classic
  // four-pass sort; a failed load degrades to it too, so neither is fatal.
  for (let i = 0; i < PIXELVIEW_LAYOUTS.length; i++) {
    const path = PIXELVIEW_LAYOUTS[i].asset;
    if (!path) { _pixelLayoutFiles[i] = null; continue; }
    _pixelLayoutFiles[i] = loadBytes(path, undefined, (function(idx, p) {
      return function() {
        console.warn('Could not load ' + p + ' — layout ' +
                     PIXELVIEW_LAYOUTS[idx].label + ' will use the classic sort.');
        _pixelLayoutFiles[idx] = null;
      };
    })(i, path));
  }
}

//------------------------------------------------------------
function setup() {
  createCanvas(DUMPSTER_APP_W, DUMPSTER_APP_H);
  pixelDensity(2); 
  noSmooth();

  KOS = new KnowerOfSelections();
  BM  = new BreakupManager();
  BM.loadFromAssets(_langDataLines, _langTagsLines, _kamalLines,
                    _summaryFile.bytes, _accessLines);

  HM  = new HeartManager(KOS, BM);
  PBM = new ParagraphBalloonManager();
  HBC = new HeartBalloonConnector(PBM, HM);
  DH  = new DumpsterHistogram(pixelFont, 0, HEART_WALL_B, DUMPSTER_APP_W, HISTOGRAM_H,
                               KOS, _histLines, _histbg);
  PV  = new PixelView(BM, KOS,
          _pixelLayoutFiles.map(function(f) { return f ? f.bytes : null; }));
  HD  = new HelpDisplayer(pixelFont, BM, KOS);

  // ?regime=2 pins a regime at launch — handy for A/B captures, and for an
  // installation build that should always come up in one mode. Set directly
  // rather than via setRegime(), since the asset fetch is still in flight.
  const urlRegime = parseInt(new URLSearchParams(window.location.search).get('regime'));
  if (REGIME_KEYS.indexOf(urlRegime) !== -1) {
    BM.requestedRegime = urlRegime;
  }

  // ?layout=7|8|9 pins the PixelView layout at launch, matching the key digits.
  const urlLayout = new URLSearchParams(window.location.search).get('layout');
  if (urlLayout) {
    const li = PIXELVIEW_LAYOUTS.findIndex(function(L) { return L.key === urlLayout; });
    if (li !== -1) PV.setLayoutIndex(li);
  }

  // Embedding assets for regimes 2-4, if present. Absent files are a
  // no-op: the regime stays unready and BM falls back to regime 1.
  _tryLoadEmbeddingAssets();

  _buildFlockSliders();      // TEMPORARY: HACK_FLOCK_SLIDERS

  // Text corpus loads in the background; textsReady gates balloon text lookups.
  loadClips(function() {
    textsReady = true;
    console.log('Text snippets loaded:', Object.keys(Files).length);

    // Initial selection: ?sel=N pins it (so two regimes can be compared on the
    // same breakup), otherwise pick a random valid one.
    const urlSel = parseInt(new URLSearchParams(window.location.search).get('sel'));
    let startId;
    if (Number.isInteger(urlSel) && urlSel >= 0 &&
        urlSel < N_BREAKUP_DATABASE_RECORDS_20K && BM.bups[urlSel].VALID) {
      startId = urlSel;
    } else {
      do { startId = Math.floor(random(N_BREAKUP_DATABASE_RECORDS_20K)); }
      while (!BM.bups[startId].VALID);
    }
    const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(startId);
    _enactSelection(heartId);
  });
}

//------------------------------------------------------------
function draw() {
  _updateFlockSliders();     // TEMPORARY: HACK_FLOCK_SLIDERS
  _hackUpdateHaloTuning();   // TEMPORARY: see the HACK_HALO_TUNE block above

  // Background
  background(0);
  image(_dumpsterimg, HEART_WALL_L, HEART_WALL_T);

  // HeartManager
  const bMouseInHeartArea = mouseX >= HEART_WALL_L && mouseX <= HEART_WALL_R &&
                             mouseY >= HEART_WALL_T && mouseY <= HEART_WALL_B;
  HM.informOfMouse(mouseX, mouseY, mouseIsPressed && bMouseInHeartArea && !_balloonClickActive);
  HM.mouseTestHearts();
  HM.updateHearts();
  HM.renderHeartObjects();
  if (!_bPixelViewDragActive) HM.performScheduledShuffling();

  // ParagraphBalloonManager
  PBM.informOfMouse(mouseX, mouseY, mouseIsPressed);
  PBM.render();

  // HeartBalloonConnector
  HBC.renderConnections();

  _updateBalloonHoverPreview();

  // DumpsterHistogram
  DH.informOfMouse(mouseX, mouseY, mouseIsPressed);
  DH.loop();

  // PixelView
  PV.informOfMouse(mouseX, mouseY, mouseIsPressed);
  _updateArrowRepeat();
  if (_bMagDragActive && mouseIsPressed) _enactMagDrag();
  if (_bPixelViewMouseDownInView && mouseIsPressed) {
    if (!_bPixelViewDragActive) {
      const dx = mouseX - _pixelViewClickOriginX;
      const dy = mouseY - _pixelViewClickOriginY;
      if (dx * dx + dy * dy >= PIXELVIEW_DRAG_THRESHOLD_PX * PIXELVIEW_DRAG_THRESHOLD_PX) _bPixelViewDragActive = true;
    }
    if (_bPixelViewDragActive) _enactPixelDrag();
  }
  PV.render();

  // HelpDisplayer
  HD.update(mouseX, mouseY);
  HD.render();

  if (!_bPixelViewDragActive && !HM.bCurrentlyDraggingSelectedHeart) _autoPlay();

  drawLayoutToggle();
  drawRegimeLabel();

  fill(67,41,40);
  textFont(pixelFont, 6);
  textAlign(LEFT, BASELINE); 
  text("THE DUMPSTER", 12,height-3); 
  // drawDraft();
}

//------------------------------------------------------------
// Small A/B square that swaps the PixelView between the age/sex-grouped layout
// and the global shufflesnap arrangement. Drawn after PV.render() so it sits on
// top of the histogram's black left panel.
function drawLayoutToggle() {
  const b = _isInLayoutToggle(mouseX, mouseY) ? LAYOUT_TOGGLE_HOVER_BRIGHTEN : 0;

  noStroke();
  fill(LAYOUT_TOGGLE_BG[0] + b, LAYOUT_TOGGLE_BG[1] + b, LAYOUT_TOGGLE_BG[2] + b);
  rect(LAYOUT_TOGGLE_X, LAYOUT_TOGGLE_Y, LAYOUT_TOGGLE_SIZE-2, LAYOUT_TOGGLE_SIZE);

  fill(LAYOUT_TOGGLE_FG[0] + b, LAYOUT_TOGGLE_FG[1] + b, LAYOUT_TOGGLE_FG[2] + b);
  textFont(pixelFont, LAYOUT_TOGGLE_TEXTSIZE);
  textAlign(CENTER, CENTER);
  text(_layoutToggleLetter(),
       LAYOUT_TOGGLE_X + LAYOUT_TOGGLE_SIZE / 2,
       LAYOUT_TOGGLE_Y + LAYOUT_TOGGLE_SIZE / 2);
  textAlign(LEFT, BASELINE);   // the rest of the sketch assumes these
}

// 'B' only for the global arrangement; every other layout is age-based.
function _layoutToggleLetter() {
  return (PV.layoutLabel() === LAYOUT_TOGGLE_B_LABEL) ? 'B' : 'A';
}

function _isInLayoutToggle(mx, my) {
  return mx >= LAYOUT_TOGGLE_X && mx < LAYOUT_TOGGLE_X + LAYOUT_TOGGLE_SIZE &&
         my >= LAYOUT_TOGGLE_Y && my < LAYOUT_TOGGLE_Y + LAYOUT_TOGGLE_SIZE;
}

function _toggleLayoutMode() {
  const want = (_layoutToggleLetter() === 'B') ? LAYOUT_TOGGLE_A_LABEL
                                               : LAYOUT_TOGGLE_B_LABEL;
  const i = PIXELVIEW_LAYOUTS.findIndex(function(L) { return L.label === want; });
  if (i !== -1) PV.setLayoutIndex(i);
}

//------------------------------------------------------------
// Which similarity regime is live, and what a full pass costs. The cost matters
// because _enactPixelDrag() recomputes every frame — see notes_july27.md.
function drawRegimeLabel(){
  if (!SHOW_DEBUG_STATUS_LABEL) return;
  noStroke();
  fill(110);
  textFont(pixelFont, 6);
  text(BM.regimeLabel() + '  ' + PV.layoutLabel(), HELP_TEXT_L, DUMPSTER_APP_H - 6);
}

function drawDraft(){
  textFont("Helvetica");
  textStyle(BOLD);
  textSize(288); 
  noStroke();
  fill(255,255,255, 40); 
  textAlign(CENTER);
  push(); 
  translate(width/2, height * 0.6); 
  rotate(radians(-15));
  text("DRAFT", 0,0); 
  pop(); 
  textAlign(LEFT);
}

//------------------------------------------------------------
// Load whichever embedding assets this build ships, per data/embeddings.json.
// Going through a manifest means we never request a .bin that isn't there —
// a bare fetch() of a missing file logs a 404 in the browser's console no
// matter how the promise rejection is handled.
function _tryLoadEmbeddingAssets() {
  fetch(EMBEDDING_MANIFEST_PATH)
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(manifest => {
      const assets = (manifest && manifest.assets) || {};
      const regimes = Object.keys(assets);
      if (regimes.length === 0) {
        console.log('No embedding assets in this build — regime 1 only. ' +
                    'Run textanalysis/make_embedding_asset.py to add regimes 2-4.');
        return;
      }
      for (const key of regimes) {
        const regime = parseInt(key);
        const entry  = assets[key];
        const prov   = BM.providers[regime];
        if (!prov || !entry || !entry.file) continue;
        prov.assetPath = 'data/' + entry.file;
        if (entry.label) prov.name = entry.label;
        _fetchEmbeddingAsset(regime, prov.assetPath);
      }
    })
    .catch(e => console.warn(`Could not read ${EMBEDDING_MANIFEST_PATH} — ` +
                             `regime 1 only. (${e.message})`));
}

function _fetchEmbeddingAsset(regime, assetPath) {
  fetch(assetPath)
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))
    .then(buf => {
      if (BM.loadEmbeddingAsset(regime, buf) && BM.requestedRegime === regime) {
        BM.computeSimilarityOfAllBupsToCurrBup();
        _refreshSimilarityViews();
      }
    })
    .catch(e => console.warn(`Regime ${regime}: could not load ${assetPath} — ${e.message}. ` +
                             `Check that data/embeddings.json matches what is on disk.`));
}

//------------------------------------------------------------
// While the mouse is over a text balloon, recolour the pixel view to show the
// corpus's similarity to that balloon's breakup. Recomputes only when the
// hovered balloon changes, so a steady hover costs nothing.
var _pvPreviewSims  = null;
var _pvPreviewBupId = DUMPSTER_INVALID;

function _updateBalloonHoverPreview() {
  if (!BALLOON_HOVER_PREVIEWS_PIXELVIEW) return;

  let hoverBup = DUMPSTER_INVALID;
  const idx = PBM.getMouseContainingBalloon();
  if (idx !== DUMPSTER_INVALID) {
    const b = PBM.balloons[idx];
    if (b && b.breakupId !== DUMPSTER_INVALID) hoverBup = b.breakupId;
  }
  if (hoverBup !== DUMPSTER_INVALID) {
    // Re-aim every frame, not just on change: the heart manager rewrites
    // KOS.currentMouseoverBreakupId earlier in draw() and would win otherwise.
    PV.setExternalMouseover(hoverBup);
  } else if (_pvPreviewBupId !== DUMPSTER_INVALID) {
    // Release exactly once, on leaving. Calling this every idle frame would
    // clobber KOS and kill normal heart / pixel-view hovering.
    PV.setExternalMouseover(DUMPSTER_INVALID);
  }

  if (hoverBup === _pvPreviewBupId) return;
  _pvPreviewBupId = hoverBup;

  if (hoverBup === DUMPSTER_INVALID) {
    PV.setPreviewSimilarities(null);
  } else {
    if (_pvPreviewSims === null) {
      _pvPreviewSims = new Float64Array(N_BREAKUP_DATABASE_RECORDS);
    }
    BM.computeSimilaritiesInto(hoverBup, _pvPreviewSims);
    PV.setPreviewSimilarities(_pvPreviewSims);
  }
}

//------------------------------------------------------------
// Push freshly recomputed similarities into the views, without pushing a new
// balloon or spawning a heart (used when the regime changes under us).
function _refreshSimilarityViews() {
  const bupId = KOS.currentSelectedBreakupId;
  if (bupId === DUMPSTER_INVALID) return;
  HM.refreshHeartColors(BM, bupId);
  PV.updateImage();
}

//------------------------------------------------------------
// Called every frame. The initial step still comes from keyPressed(), so a tap
// responds immediately; this only supplies the repeats after ARROW_REPEAT_DELAY.
function _updateArrowRepeat() {
  const arrows = [LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW];
  let held = 0;
  for (let i = 0; i < arrows.length; i++) {
    if (keyIsDown(arrows[i])) { held = arrows[i]; break; }
  }
  if (held === 0) {
    _arrowHeldKey = 0;
    if (_arrowLoupeStepped) {          // let the top balloon return to its
      PBM.restoreTopmostBalloonHeight();  // natural height, as mouseReleased does
      _arrowLoupeStepped = false;
    }
    return;
  }

  const now = millis();
  if (held !== _arrowHeldKey) {
    // Newly pressed (or switched direction): keyPressed() has already moved one
    // step, so just schedule when repeating should begin.
    _arrowHeldKey = held;
    _arrowNextRepeatMs = now + ARROW_REPEAT_DELAY_MS;
    return;
  }
  // Single step per frame at most, so a long stall cannot burst-scroll.
  if (now >= _arrowNextRepeatMs) {
    if (!PV.bMouseInView) _enactArrowStepInLoupe(held);
    else                  PV.sendArrowKey(held);
    _arrowNextRepeatMs = now + ARROW_REPEAT_RATE_MS;
    _lastInteractionTime = now;
  }
}

//------------------------------------------------------------
// Pick the next featured breakup: usually a close match to the current one, so
// the sequence reads as a drift rather than a teleport. Returns DUMPSTER_INVALID
// if nothing is eligible.
function _pickNextAutoplayBupId() {
  const N   = N_BREAKUP_DATABASE_RECORDS_20K;
  const cur = KOS.currentSelectedBreakupId;

  // No selection yet, or an occasional deliberate jump out of the cluster.
  if (cur === DUMPSTER_INVALID || random(1) < AUTOPLAY_WANDER_PROB) {
    for (let t = 0; t < 64; t++) {
      const id = Math.floor(random(N));
      if (BM.bups[id].VALID && id !== cur) return id;
    }
    return DUMPSTER_INVALID;
  }

  // Find the similarity cut-off for the top slice with a 256-bin histogram,
  // then reservoir-sample one record above it. Two O(N) passes, no sort and no
  // candidate array — this runs on a frame that is already doing a full
  // similarity recompute.
  const S    = BM.SIMILARITIES;
  const NBIN = 256;
  const bins = new Int32Array(NBIN);
  let nElig = 0;
  for (let i = 0; i < N; i++) {
    if (!BM.bups[i].VALID || i === cur) continue;
    let b = (S[i] * (NBIN - 1)) | 0;
    if (b < 0) b = 0; else if (b >= NBIN) b = NBIN - 1;
    bins[b]++;
    nElig++;
  }
  if (nElig === 0) return DUMPSTER_INVALID;

  const want = Math.max(1, Math.round(nElig * AUTOPLAY_SIMILARITY_PERCENTILE));
  let cum = 0, cutBin = 0;
  for (let b = NBIN - 1; b >= 0; b--) {
    cum += bins[b];
    if (cum >= want) { cutBin = b; break; }
  }
  const cutoff = cutBin / (NBIN - 1);

  let chosen = DUMPSTER_INVALID, seen = 0;
  for (let i = 0; i < N; i++) {
    if (!BM.bups[i].VALID || i === cur || S[i] < cutoff) continue;
    seen++;
    if (random(1) < 1.0 / seen) chosen = i;
  }
  return chosen;
}

//------------------------------------------------------------
function _autoPlay() {
  const now = millis();
  if (now - _lastInteractionTime <= DUMPSTER_LONELY_TIME) {
    _nextAutoplayMs = 0;          // viewer is active; re-arm when they stop
    return;
  }
  if (_nextAutoplayMs === 0) {    // first hop of this idle spell
    _nextAutoplayMs = now + random(AUTOPLAY_MIN_INTERVAL_MS, AUTOPLAY_MAX_INTERVAL_MS);
    return;
  }
  if (now < _nextAutoplayMs) return;

  const nextId = _pickNextAutoplayBupId();
  if (nextId !== DUMPSTER_INVALID) {
    HM.decimateCurrentHeartPopulation();
    const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(nextId);
    _enactSelection(heartId);
  }
  // Reschedule even if the pick failed, so a bad draw cannot retry every frame.
  _nextAutoplayMs = now + random(AUTOPLAY_MIN_INTERVAL_MS, AUTOPLAY_MAX_INTERVAL_MS);
}

//------------------------------------------------------------
function _enactSelection(heartId) {
  if (heartId === DUMPSTER_INVALID || heartId < 0 || heartId >= MAX_N_HEARTS) return;
  const bupId = HM.hearts[heartId].breakupId;
  if (bupId === DUMPSTER_INVALID) return;

  PBM.execute(bupId, heartId);
  BM.informOfNewlySelectedBreakup(bupId);
  HM.refreshHeartColors(BM, bupId);
  PV.updateImage();
}

//------------------------------------------------------------
// Move the selection to bupId and preview it in place: no new balloon, no new
// heart. Shared by the pixel-view drag, the loupe pan, and loupe arrow steps.
function _applySelectionPreview(bupId) {
  PV.snapSelectionToBupId(bupId);
  KOS.currentMouseoverBreakupId           = bupId;
  KOS.currentMouseoverBreakupIdWithOffset = bupId;
  HM.updateSelectedHeartBreakupId(bupId);
  PBM.updateTopmostBalloonInPlace(bupId, HM.mouseSelectedHeartID);
  BM.informOfNewlySelectedBreakup(bupId);
  HM.refreshHeartColors(BM, bupId);
  PV.updateImage();
}

//------------------------------------------------------------
// Arrow keys while the cursor is over the loupe: step the selection one pixel.
function _enactArrowStepInLoupe(k) {
  const bupId = PV.arrowStepFromSelection(k);
  if (bupId === DUMPSTER_INVALID) return false;
  _applySelectionPreview(bupId);
  _arrowLoupeStepped = true;
  _lastInteractionTime = millis();
  return true;
}

//------------------------------------------------------------
// Panning inside the loupe. Mirrors _enactPixelDrag(): the selection follows
// the pixel under the loupe centre, and the topmost balloon previews its text
// in place rather than a new balloon being pushed for every pixel crossed.
function _enactMagDrag() {
  const bupId = PV.updateMagDrag(mouseX, mouseY);
  if (bupId === DUMPSTER_INVALID) return;          // below the move threshold
  if (bupId === KOS.currentSelectedBreakupId) return;

  _applySelectionPreview(bupId);
  _lastInteractionTime = millis();
}

//------------------------------------------------------------
function _enactPixelDrag() {
  if (!PV.bMouseInView) return;
  const bupId = PV.getMousePixelBupId();
  if (bupId === DUMPSTER_INVALID || !BM.bups[bupId].VALID) return;
  if (bupId === KOS.currentSelectedBreakupId) return;

  _applySelectionPreview(bupId);
}

//------------------------------------------------------------
// Look up text for a breakup by 0-based index.
// Files keys look like "0/0/0/00000".
function getBreakupText(id) {
  if (!textsReady) return '';
  const s = String(id).padStart(5, '0');
  const txt = Files[s[0] + '/' + s[1] + '/' + s[2] + '/' + s] || '';
  const nl = txt.indexOf('\n');
  const body = nl !== -1 ? txt.slice(nl + 1) : txt;
  return body.replace(/ ` /g, "'").replace(/ ' /g, "'");
}

function getBreakupAuthorDisplay(id) {
  if (!textsReady || !BALLOON_SHOW_AUTHOR_NAME) return '';
  const s = String(id).padStart(5, '0');
  const txt = Files[s[0] + '/' + s[1] + '/' + s[2] + '/' + s] || '';
  const nl = txt.indexOf('\n');
  const authorLine = nl !== -1 ? txt.slice(0, nl) : txt;
  const paren = authorLine.indexOf('(');
  const name = (paren !== -1 ? authorLine.slice(paren + 1) : authorLine).trim().replace(/\s+/g, '');
  return name + ' >';
}

//------------------------------------------------------------
function _enactHistogramDayClick(dayIndex) {
  if (dayIndex < 0 || dayIndex + 1 > 365) return;

  // Collect all valid breakups whose date matches this day.
  const candidates = [];
  for (let i = 0; i < N_BREAKUP_DATABASE_RECORDS; i++) {
    if (BM.bups[i].VALID && BM.bups[i].date === dayIndex + 1) candidates.push(i);
  }
  if (candidates.length === 0) return;

  // Pick one to become the main selected breakup (same flow as a pixel click).
  const selectedBupId = candidates[Math.floor(random(candidates.length))];
  HM.decimateCurrentHeartPopulation();
  const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(selectedBupId);
  _enactSelection(heartId);

  // console.log(`Histogram click: dayIndex=${dayIndex}, ${candidates.length} candidates`);
  // console.log(`  Selected: bupId=${selectedBupId}, date=${BM.bups[selectedBupId].date}`);

  // Immediately seed several more hearts from the same day.
  const beforeIds = new Set(HM.activeHeartIds);
  HM.initiateHeartsFromList(candidates, candidates.length);
  for (const hid of HM.activeHeartIds) {
    if (!beforeIds.has(hid)) {
      const bupId = HM.hearts[hid].breakupId;
      // console.log(`  Added heart ${hid}: bupId=${bupId}, date=${BM.bups[bupId].date}`);
    }
  }
}

//------------------------------------------------------------
function mousePressed() {
  if (_overSliderPanel) return;   // TEMPORARY: keep slider drags off the artwork
  _lastInteractionTime = millis();

  // Layout A/B toggle. Must be tested before the histogram branch below, which
  // swallows every click with mouseY >= HEART_WALL_B.
  if (_isInLayoutToggle(mouseX, mouseY)) {
    _toggleLayoutMode();
    return;
  }

  // Loupe: a press starts a pan. A press that never moves is treated as a
  // click on that cell instead, resolved in mouseReleased().
  if (PV.isInMagView(mouseX, mouseY)) {
    if (PV.beginMagDrag(mouseX, mouseY)) {
      _bMagDragActive = true;
      return;
    }
  }

  // Histogram-area clicks: handle day selection, then stop.
  if (mouseY >= HEART_WALL_B) {
    if (mouseY <= DUMPSTER_APP_H && mouseX >= DH.histogramL && mouseX <= DH.histogramR) {
      _enactHistogramDayClick(DH.dataIndexOfCursor);
    }
    return;
  }

  // Balloon clicks are handled exclusively — they do not propagate to the
  // heart or pixel-view systems.
  const clickedBalloonIdx = PBM.getMouseContainingBalloon();
  if (clickedBalloonIdx !== DUMPSTER_INVALID) {
    _balloonClickActive = true;
    if (clickedBalloonIdx !== PBM.currentBalloonIndex) {
      const b = PBM.balloons[clickedBalloonIdx];
      if (b.heartId !== DUMPSTER_INVALID) {
        HM.causeHeartToBecomeTheMainSelection(b.heartId);
        _enactSelection(b.heartId);
      }
    }
    return;
  }

  HM.mousePressed();
  const heartClicked = HM.mouseClickedHeartID;
  if (heartClicked !== DUMPSTER_INVALID) {
    _enactSelection(heartClicked);
  } else if (PV.bMouseInView) {
    _pixelViewClickBupId = PV.getMousePixelBupId();
    _pixelViewClickOriginX = mouseX;
    _pixelViewClickOriginY = mouseY;
    _bPixelViewMouseDownInView = true;
    _bPixelViewDragActive = false;

    // Immediate click: snap yellow cursor and add to balloon stack + particle system.
    if (_pixelViewClickBupId !== DUMPSTER_INVALID && BM.bups[_pixelViewClickBupId].VALID) {
      PV.snapSelectionToBupId(_pixelViewClickBupId);
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(_pixelViewClickBupId);
      _enactSelection(heartId);
    }
  }
}

function mouseReleased() {
  if (_bMagDragActive) {
    const wasPan = PV.endMagDrag();
    _bMagDragActive = false;
    if (wasPan) {
      PBM.restoreTopmostBalloonHeight();
    } else {
      // Never moved: treat it as a click on the cell under the cursor.
      const magClickedBupId = PV.checkMagClick(mouseX, mouseY);
      if (magClickedBupId !== DUMPSTER_INVALID) {
        PV.activateBupId(magClickedBupId);
        HM.decimateCurrentHeartPopulation();
        const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(magClickedBupId);
        _enactSelection(heartId);
      }
    }
    _lastInteractionTime = millis();
    return;
  }
  _balloonClickActive = false;
  _bPixelViewMouseDownInView = false;
  if (_bPixelViewDragActive) PBM.restoreTopmostBalloonHeight();
  _bPixelViewDragActive = false;
  HM.mouseReleased();
  _lastInteractionTime = millis();
}

function mouseMoved() {
  _lastInteractionTime = millis();
}

function keyPressed() {
  _lastInteractionTime = millis();

  // Digit keys: 1-4 pick the similarity regime, 7-9 pick the PixelView layout.
  // Off by default — see ENABLE_DEBUG_KEYS. ?regime= / ?layout= still work.
  if (ENABLE_DEBUG_KEYS && key >= '1' && key <= '9') {
    if (REGIME_KEYS.indexOf(parseInt(key)) !== -1) {
      BM.setRegime(parseInt(key));
      _refreshSimilarityViews();
      return;
    }
    const li = PIXELVIEW_LAYOUTS.findIndex(function(L) { return L.key === key; });
    if (li !== -1) { PV.setLayoutIndex(li); return; }
  }

  // Arrow keys work wherever the pointer happens to be. Over the grid they
  // nudge the offset cursor (ENTER confirms); anywhere else — the loupe, the
  // A/B toggle, the heart wall — they step the selection one pixel. Gating
  // this on the pointer being over the grid or the loupe made the keys go dead
  // the moment you clicked the A/B button, which sits between the two.
  if (!PV.bMouseInView) {
    if (_enactArrowStepInLoupe(keyCode)) return;
  }
  PV.sendArrowKey(keyCode);

  if (keyCode === ENTER && PV.bMouseInView) {
    const bupId = KOS.currentMouseoverBreakupIdWithOffset;
    if (bupId !== DUMPSTER_INVALID &&
        bupId !== KOS.currentSelectedBreakupId &&
        BM.bups[bupId].VALID) {
      HM.decimateCurrentHeartPopulation();
      const heartId = HM.addSelectedBreakupFromOutsideAndGetNewHeartId(bupId);
      _enactSelection(heartId);
    }
  }
}
