// Ported from PixelView.pde
// p5 pixel adaptation: img.pixels is a flat Uint8ClampedArray [R,G,B,A, ...].
// A separate _pixData buffer mirrors the pixel values for magnification readback
// without GPU round-trips.

class PixelView {

  constructor(BM, KOS, layoutBytesList) {
    this.BM  = BM;
    this.KOS = KOS;

    this.myMouseX = 0;
    this.myMouseY = 0;
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;

    this.bMouseInView    = false;
    this.mousePixelIndex = DUMPSTER_INVALID;

    this.currentSelectedBreakupId  = DUMPSTER_INVALID;
    this.currentMouseoverBreakupId = DUMPSTER_INVALID;
    this.pixelClickedBreakupId     = DUMPSTER_INVALID;
    this.pixelIndexOfSelectedBupId  = DUMPSTER_INVALID;
    this.pixelIndexOfMouseoverBupId = DUMPSTER_INVALID;

    this.hiliteXf   = DUMPSTER_INVALID;
    this.hiliteYf   = DUMPSTER_INVALID;
    this.hiliteMoXf = DUMPSTER_INVALID;
    this.hiliteMoYf = DUMPSTER_INVALID;
    this.moAlph = 1.0;

    this.magXc = DUMPSTER_INVALID; // center pixel col of the current mag view
    this.magYc = DUMPSTER_INVALID; // center pixel row of the current mag view

    this.bHasMagSelection = false; // true after a mag click, cleared when mouse enters pixel view

    // Loupe panning. While dragging, the loupe stops tracking the mouseover and
    // becomes a viewport onto the grid at magCenterXf/Yf (float pixel coords).
    this.magDragging     = false;
    this.magCenterXf     = 0;
    this.magCenterYf     = 0;
    this._magMouseX0     = 0;
    this._magMouseY0     = 0;
    this._magCenterX0    = 0;
    this._magCenterY0    = 0;
    this._magMovedEnough = false;

    this.L = PIXELVIEW_L;
    this.T = PIXELVIEW_T;
    this.R = PIXELVIEW_L + PIXELVIEW_W;
    this.B = PIXELVIEW_T + PIXELVIEW_H;
    this.W = PIXELVIEW_W;
    this.H = PIXELVIEW_H;

    this.nPixels = PIXELVIEW_W * PIXELVIEW_H;

    // p5.js image for displaying the pixel grid
    this.img = createImage(PIXELVIEW_W, PIXELVIEW_H);

    // Mirror buffer for magnification readback (RGBA, same layout as img.pixels)
    this._pixData = new Uint8Array(this.nPixels * 4);

    // Magnification loupe parameters
    this.nmagX = MAGVIEW_NX;
    this.nmagY = MAGVIEW_NY;
    this.nmagScale = MAGVIEW_SCALE;

    // When non-null, the pixel grid is coloured from this array instead of
    // BM.SIMILARITIES (balloon-hover preview). Set before the first recalculate.
    this._previewSims = null;

    this._constructLUTs();

    // One PixelIndexer per entry in PIXELVIEW_LAYOUTS, built lazily and cached
    // so switching is instant after the first visit. ~160 KB each.
    this._layoutBytesList = layoutBytesList || [];
    this._pinCache  = [];
    this.layoutIndex = DUMPSTER_INVALID;
    this.setLayoutIndex(PixelView.defaultLayoutIndex());
  }

  //=======================================================================
  // bDoGlobalPixelArrangement overrides the configured default.
  static defaultLayoutIndex() {
    if (typeof bDoGlobalPixelArrangement !== 'undefined' && bDoGlobalPixelArrangement) {
      const gi = PIXELVIEW_LAYOUTS.findIndex(function(L) { return L.label === 'GLOBAL'; });
      if (gi !== -1) return gi;
    }
    return PIXELVIEW_LAYOUT_DEFAULT;
  }

  //=======================================================================
  // Switch the spatial layout (keys 7/8/9). Every pixel position changes, so
  // the cursors have to be re-derived rather than animated.
  setLayoutIndex(i) {
    if (i < 0 || i >= PIXELVIEW_LAYOUTS.length || i === this.layoutIndex) return false;

    if (!this._pinCache[i]) {
      this._pinCache[i] = new PixelIndexer(
        this.BM, this._layoutBytesList[i] || null, PIXELVIEW_LAYOUTS[i].label);
    }
    this.PIN = this._pinCache[i];
    this.layoutIndex = i;

    // Force the highlight bookkeeping to re-resolve against the new mapping.
    this.currentSelectedBreakupId   = DUMPSTER_INVALID;
    this.currentMouseoverBreakupId  = DUMPSTER_INVALID;
    this.pixelIndexOfMouseoverBupId = DUMPSTER_INVALID;
    const sel = this.KOS.currentSelectedBreakupId;
    if (sel !== DUMPSTER_INVALID) this.snapSelectionToBupId(sel);

    this.recalculate();
    return true;
  }

  layoutLabel() {
    const L = PIXELVIEW_LAYOUTS[this.layoutIndex];
    return L ? L.label : '?';
  }

  //=======================================================================
  _constructLUTs() {
    this.rLUT = new Uint8Array(256);
    this.gLUT = new Uint8Array(256);
    this.bLUT = new Uint8Array(256);

    // The per-channel exponents are multiplied by PIXELVIEW_LUMINANCE_GAMMA, which
    // is identical to raising similarity to that power before indexing
    // (pow(pow(x,g),p) === pow(x,g*p)) but costs nothing per pixel. Note this is
    // why a higher gamma also shifts the hue toward red: green and blue already
    // have steeper exponents, so scaling them all magnifies the difference.
    const G = PIXELVIEW_LUMINANCE_GAMMA;
    const r0 = 0,   r1 = 255, rpow = 1.20 * G;
    const g0 = 16,  g1 = 190, gpow = 2.50 * G;
    const b0 = 16,  b1 = 255 - MALE_BLUE_AMOUNT, bpow = 2.60 * G;

    for (let i = 0; i < 256; i++) {
      const frac = i / 255.0;
      this.rLUT[i] = Math.floor(r0 + (r1 - r0) * Math.pow(frac, rpow));
      this.gLUT[i] = Math.floor(g0 + (g1 - g0) * Math.pow(frac, gpow));
      this.bLUT[i] = Math.floor(b0 + (b1 - b0) * Math.pow(frac, bpow));
    }
  }

  //=======================================================================
  // Aim the blue mouseover cursor at an arbitrary breakup — used when the mouse
  // is over a text balloon rather than over the grid. The loupe follows for
  // free: _renderMagnificationView() centres on hiliteMoXf/Yf whenever a
  // mouseover is live, and takes its border colour from HelpDisplayer, which
  // goes blue as soon as KOS reports a mouseover distinct from the selection.
  //
  // Writes pixelIndexOfMouseoverBupId directly rather than routing through
  // _updateMouseoverInfo(), which early-returns when KOS matches its cached id
  // and would otherwise fail to re-arm when the same balloon is re-entered.
  setExternalMouseover(bupId) {
    if (bupId === DUMPSTER_INVALID) {
      this.KOS.currentMouseoverBreakupId           = DUMPSTER_INVALID;
      this.KOS.currentMouseoverBreakupIdWithOffset = DUMPSTER_INVALID;
      this.currentMouseoverBreakupId               = DUMPSTER_INVALID;
      return;
    }
    this.KOS.currentMouseoverBreakupId           = bupId;
    this.KOS.currentMouseoverBreakupIdWithOffset = bupId;

    const pindex = this.PIN.BupIndexToPixelIndex[bupId];
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) return;

    this.currentMouseoverBreakupId  = bupId;
    this.pixelIndexOfMouseoverBupId = pindex;
    if (this.hiliteMoXf === DUMPSTER_INVALID) {   // otherwise let it glide over
      this.hiliteMoXf = (pindex % PIXELVIEW_W) * PIXELVIEW_SCALE;
      this.hiliteMoYf = Math.floor(pindex / PIXELVIEW_W) * PIXELVIEW_SCALE;
    }
  }

  //=======================================================================
  // Pass an array to colour the grid by similarity to something other than the
  // current selection, or null to go back to it.
  setPreviewSimilarities(arr) {
    if (this._previewSims === arr) return;
    this._previewSims = arr || null;
    this.recalculate();
  }

  //=======================================================================
  updateImage() {
    this.recalculate();
  }

  //=======================================================================
  recalculate() {
    this.img.loadPixels();
    const pd = this._pixData;
    const ip = this.img.pixels;

    if (this.BM.currentlySelectedBreakupId === DUMPSTER_INVALID) {
      for (let i = 0; i < this.nPixels; i++) {
        const idx = i * 4;
        ip[idx] = ip[idx+1] = ip[idx+2] = 0;
        ip[idx+3] = 255;
        pd[idx] = pd[idx+1] = pd[idx+2] = 0;
        pd[idx+3] = 255;
      }
    } else {
      const MALES       = this.BM.MALES;
      const SIMILARITIES = this._previewSims || this.BM.SIMILARITIES;
      const pixToBup    = this.PIN.PixelIndexToBupIndex;
      const rLUT = this.rLUT, gLUT = this.gLUT, bLUT = this.bLUT;

      for (let i = 0; i < this.nPixels; i++) {
        const bupIndex = pixToBup[i];
        // Luminance nonlinearity lives in the LUTs — see _constructLUTs().
        const c = Math.floor(255.0 * SIMILARITIES[bupIndex]);
        const m = MALES[bupIndex];
        const idx = i * 4;

        const rv = rLUT[c];
        const gv = gLUT[c];
        const bv = Math.min(255, bLUT[c] + m);

        ip[idx]   = rv;  ip[idx+1] = gv;  ip[idx+2] = bv;  ip[idx+3] = 255;
        pd[idx]   = rv;  pd[idx+1] = gv;  pd[idx+2] = bv;  pd[idx+3] = 255;
      }
    }
    this.img.updatePixels();
  }

  //=======================================================================
  render() {
    this._updateSelectionInfo();
    this._updateMouseoverInfo();


    // Draw scaled pixel image
    image(this.img, PIXELVIEW_L, PIXELVIEW_T, PIXELVIEW_W * PIXELVIEW_SCALE, PIXELVIEW_H * PIXELVIEW_SCALE);

    // Border
    noFill();
    stroke(0);
    rect(PIXELVIEW_L - 1, PIXELVIEW_T - 1, PIXELVIEW_W * PIXELVIEW_SCALE + 1, PIXELVIEW_H * PIXELVIEW_SCALE + 1);

    this._drawCurrentMouseoverBreakupId();
    this._drawCurrentSelectedBreakupId();
    this._renderMagnificationView();
  }

  //=======================================================================
  _renderMagnificationView() {
    let pid = DUMPSTER_INVALID;
    let bMouseover = false;

    if (this.hiliteMoXf !== DUMPSTER_INVALID &&
        this.pixelIndexOfMouseoverBupId < this.nPixels &&
        this.pixelIndexOfMouseoverBupId > DUMPSTER_INVALID) {
      pid = this.pixelIndexOfMouseoverBupId;
      bMouseover = true;
    } else if (this.pixelIndexOfSelectedBupId > DUMPSTER_INVALID &&
               this.pixelIndexOfSelectedBupId < this.nPixels) {
      pid = this.pixelIndexOfSelectedBupId;
    }

    if (pid === DUMPSTER_INVALID) return;

    let xc = Math.round(this.hiliteMoXf / PIXELVIEW_SCALE) % PIXELVIEW_W;
    let yc = Math.round(this.hiliteMoYf / PIXELVIEW_SCALE) % PIXELVIEW_H;
    if (!bMouseover) {
      xc = pid % PIXELVIEW_W;
      yc = Math.floor(pid / PIXELVIEW_W);
    }

    // While panning, the loupe is a viewport at magCenterXf/Yf instead of a
    // readout of the mouseover. cxF/cyF are float pixel coords; the fractional
    // part is what makes the image slide under the window.
    let cxF = xc, cyF = yc;
    if (this.magDragging && this._magMovedEnough) {
      cxF = Math.floor(this.magCenterXf) + this._magSnapEase(this.magCenterXf % 1);
      cyF = Math.floor(this.magCenterYf) + this._magSnapEase(this.magCenterYf % 1);
      xc  = Math.round(this.magCenterXf);
      yc  = Math.round(this.magCenterYf);
    }
    this.magXc = xc;
    this.magYc = yc;

    const xMagStart = MAGVIEW_L;
    const yMagStart = MAGVIEW_T;
    const yo = Math.floor(this.nmagY / 2);
    const xo = Math.floor(this.nmagX / 2);

    // Sample one extra ring of pixels so the window stays covered at any
    // sub-pixel offset, and clip to the loupe rect so the surplus is hidden.
    const dc = drawingContext;
    dc.save();
    dc.beginPath();
    dc.rect(xMagStart, yMagStart, MAGVIEW_W, MAGVIEW_H);
    dc.clip();

    noStroke();
    const p0x = Math.round(cxF) - xo - 1, p1x = Math.round(cxF) + xo + 1;
    const p0y = Math.round(cyF) - yo - 1, p1y = Math.round(cyF) + yo + 1;
    for (let yp = p0y; yp <= p1y; yp++) {
      if (yp < 0 || yp >= PIXELVIEW_H) continue;
      const sy = yMagStart + (yp - cyF + yo) * this.nmagScale;
      for (let xp = p0x; xp <= p1x; xp++) {
        if (xp < 0 || xp >= PIXELVIEW_W) continue;
        const idx = (yp * PIXELVIEW_W + xp) * 4;
        fill(this._pixData[idx], this._pixData[idx+1], this._pixData[idx+2]);
        rect(xMagStart + (xp - cxF + xo) * this.nmagScale, sy,
             this.nmagScale, this.nmagScale);
      }
    }
    dc.restore();

    // Colorful border using HelpDisplayer's current text color
    let rectR = 200, rectG = 200, rectB = 200;
    if (typeof HD !== 'undefined' && HD) {
      rectR = HD.textr; rectG = HD.textg; rectB = HD.textb;
    }

    push();
    translate(xMagStart, yMagStart - 0);
    noFill();
    stroke(rectR * 0.7, rectG * 0.7, rectB * 0.7);
    rect(0, 0, MAGVIEW_W, MAGVIEW_H);
    rect(-1, -1, MAGVIEW_W + 2, MAGVIEW_H + 2);
    stroke(rectR, rectG, rectB);
    line(this.nmagScale * 3.5, 0, this.nmagScale * 3.5, this.nmagScale * 2);
    rect(this.nmagScale * 3,   this.nmagScale * 2, this.nmagScale,     this.nmagScale);
    rect(this.nmagScale * 3-1, this.nmagScale * 2 - 1, this.nmagScale + 2, this.nmagScale + 2);
    pop();
  }

  //=======================================================================
  _drawCurrentMouseoverBreakupId() {
    if (this.hiliteMoXf === DUMPSTER_INVALID) return;
    if (this.pixelIndexOfMouseoverBupId >= this.nPixels) return;

    const fix = 0.5; // pixel alignment for crisp lines
    if (this.pixelIndexOfMouseoverBupId > DUMPSTER_INVALID) {
      const xi = PIXELVIEW_SCALE * ((this.pixelIndexOfMouseoverBupId + this.keyOffsetX) % PIXELVIEW_W);
      const yi = PIXELVIEW_SCALE * (Math.floor((this.pixelIndexOfMouseoverBupId + this.keyOffsetY * PIXELVIEW_W) / PIXELVIEW_W));

      const A = 0.675, B = 1.0 - A;
      this.hiliteMoXf = A * this.hiliteMoXf + B * xi;
      this.hiliteMoYf = A * this.hiliteMoYf + B * yi;
      if (Math.abs(this.hiliteMoXf - xi) < 3.0 && Math.abs(this.hiliteMoYf - yi) < 3.0) {
        this.hiliteMoXf = xi; this.hiliteMoYf = yi;
      }

      // blue cursor
      this.moAlph = 1.0;
      fill(0, 0, 255, this.moAlph * 48);
      stroke(0, 0, 255);
      rect(this.hiliteMoXf - 3 +fix, this.hiliteMoYf - 3 +fix, 10, 10);
      noFill();
      rect(this.hiliteMoXf - 4 +fix, this.hiliteMoYf - 4 +fix, 12, 12);
      stroke(0, 0, 255, this.moAlph * 50);
      rect(this.hiliteMoXf - 5 +fix, this.hiliteMoYf - 5 +fix, 14, 14);
    } else {
      this.moAlph *= HEART_BLUR_CA;
      if (this.moAlph > 0.035) {
        fill(0, 0, 255, this.moAlph * 48);
        stroke(0, 0, 255, this.moAlph * 255);
        rect(this.hiliteMoXf - 3 +fix, this.hiliteMoYf - 3 +fix, 10, 10);
        noFill();
        rect(this.hiliteMoXf - 4 +fix, this.hiliteMoYf - 4 +fix, 12, 12);
        stroke(0, 0, 255, this.moAlph * 50);
        rect(this.hiliteMoXf - 5 +fix, this.hiliteMoYf - 5 +fix, 14, 14);
      }
    }
  }

  //=======================================================================
  _drawCurrentSelectedBreakupId() {
    if (this.pixelIndexOfSelectedBupId === DUMPSTER_INVALID ||
        this.pixelIndexOfSelectedBupId < 0 ||
        this.pixelIndexOfSelectedBupId >= this.nPixels) return;

    const xi = PIXELVIEW_SCALE * (this.pixelIndexOfSelectedBupId % PIXELVIEW_W);
    const yi = PIXELVIEW_SCALE * Math.floor(this.pixelIndexOfSelectedBupId / PIXELVIEW_W);

    this.hiliteXf = 0.65 * this.hiliteXf + 0.35 * xi;
    this.hiliteYf = 0.65 * this.hiliteYf + 0.35 * yi;
    if (Math.abs(this.hiliteXf - xi) < 3 && Math.abs(this.hiliteYf - yi) < 3) {
      this.hiliteXf = xi; this.hiliteYf = yi;
    }

    noFill();
    stroke(255, 255, 0);
    const fix = 0.5; // pixel alignment for crisp lines
    rect(this.hiliteXf - 3 +fix, this.hiliteYf - 3 +fix, 10, 10);
    rect(this.hiliteXf - 4 +fix, this.hiliteYf - 4 +fix, 12, 12);
    rect(this.hiliteXf - 5 +fix, this.hiliteYf - 5 +fix, 14, 14);
    stroke(255, 100, 0);
    rect(this.hiliteXf - 6 +fix, this.hiliteYf - 6 +fix, 16, 16);
    stroke(255, 100, 0, 100);
    rect(this.hiliteXf - 7 +fix, this.hiliteYf - 7 +fix, 18, 18);
    stroke(255, 100, 0, 50);
    line(this.hiliteXf - 8 +fix,  this.hiliteYf - 6 +fix,  this.hiliteXf - 8  +fix, this.hiliteYf + 11 +fix);
    line(this.hiliteXf + 12+fix,  this.hiliteYf - 6 +fix,  this.hiliteXf + 12 +fix, this.hiliteYf + 11 +fix);
    line(this.hiliteXf - 6 +fix,  this.hiliteYf - 8 +fix,  this.hiliteXf + 11 +fix, this.hiliteYf - 8  +fix);
    line(this.hiliteXf - 6 +fix,  this.hiliteYf + 12+fix,  this.hiliteXf + 11 +fix, this.hiliteYf + 12 +fix);
  }

  //=======================================================================
  informOfMouse(mx, my, pressed) {
    const mxi = Math.floor(mx);
    const myi = Math.floor(my);

    if (!pressed) {
      if (this.myMouseX !== mx || this.myMouseY !== my) {
        this.keyOffsetX = 0;
        this.keyOffsetY = 0;
      }
    }
    this.myMouseX = mx;
    this.myMouseY = my;

    this.bMouseInView    = false;
    this.mousePixelIndex = DUMPSTER_INVALID;

    if (Math.floor(mxi / PIXELVIEW_SCALE) >= this.L &&
        Math.floor(mxi / PIXELVIEW_SCALE) < this.R &&
        Math.floor(myi / PIXELVIEW_SCALE) >= this.T &&
        Math.floor(myi / PIXELVIEW_SCALE) < this.B) {
      this.bHasMagSelection = false; // real mouse entry clears the mag-click lock
    }

    if (Math.floor(mxi / PIXELVIEW_SCALE) >= this.L &&
        Math.floor(mxi / PIXELVIEW_SCALE) < this.R &&
        Math.floor(myi / PIXELVIEW_SCALE) >= this.T &&
        Math.floor(myi / PIXELVIEW_SCALE) < this.B) {
      this.bMouseInView = true;
      this.mousePixelIndex = (Math.floor(myi / PIXELVIEW_SCALE) - PIXELVIEW_T) * PIXELVIEW_W +
                             (Math.floor(mxi / PIXELVIEW_SCALE) - PIXELVIEW_L);
      this.mousePixelIndex = min(this.nPixels - 1, max(0, this.mousePixelIndex));

      if (!pressed && this.mousePixelIndex >= 0 && this.mousePixelIndex < this.nPixels) {
        this.KOS.currentMouseoverBreakupId = this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
        const offsetPindex = min(this.nPixels - 1, max(0,
          this.mousePixelIndex + this.keyOffsetX + this.keyOffsetY * PIXELVIEW_W));
        this.KOS.currentMouseoverBreakupIdWithOffset = this.PIN.PixelIndexToBupIndex[offsetPindex];
      }
    } else {
      if (!this.bHasMagSelection && this.KOS.currentMouseoverBreakupId === DUMPSTER_INVALID) {
        this.pixelIndexOfMouseoverBupId = DUMPSTER_INVALID;
      }
    }
  }

  //=======================================================================
  sendArrowKey(k) {
    if (!this.bMouseInView) return;
    switch (k) {
      case 10: this._returnPressed(); break;
      case LEFT_ARROW:
        this.keyOffsetX = max(this.keyOffsetX - 1, -(this.pixelIndexOfMouseoverBupId % PIXELVIEW_W));
        break;
      case UP_ARROW:
        this.keyOffsetY = max(this.keyOffsetY - 1, -Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W));
        break;
      case RIGHT_ARROW:
        this.keyOffsetX = min(this.keyOffsetX + 1, PIXELVIEW_W - (this.pixelIndexOfMouseoverBupId % PIXELVIEW_W) - 1);
        break;
      case DOWN_ARROW:
        this.keyOffsetY = min(this.keyOffsetY + 1, PIXELVIEW_H - Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W) - 1);
        break;
    }
  }

  //=======================================================================
  _returnPressed() {
    this.pixelClickedBreakupId = DUMPSTER_INVALID;
    if (this.KOS.currentMouseoverBreakupIdWithOffset !== DUMPSTER_INVALID) {
      this.pixelClickedBreakupId = this.KOS.currentMouseoverBreakupIdWithOffset;
      if (this.pixelClickedBreakupId !== DUMPSTER_INVALID) {
        this._updateSelectionInfo();
        this.keyOffsetX = 0;
        this.keyOffsetY = 0;
      }
    }
  }

  //=======================================================================
  // Returns the bupId at the current mouse pixel, or DUMPSTER_INVALID.
  getMousePixelBupId() {
    if (this.mousePixelIndex === DUMPSTER_INVALID ||
        this.mousePixelIndex < 0 ||
        this.mousePixelIndex >= this.nPixels) return DUMPSTER_INVALID;
    return this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
  }

  //=======================================================================
  // Snap the yellow cursor immediately to bupId (no animation), used during drag.
  snapSelectionToBupId(bupId) {
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return;
    const pindex = this.PIN.BupIndexToPixelIndex[bupId];
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) return;
    const xi = (pindex % PIXELVIEW_W) * PIXELVIEW_SCALE;
    const yi = Math.floor(pindex / PIXELVIEW_W) * PIXELVIEW_SCALE;
    this.hiliteXf = xi;
    this.hiliteYf = yi;
    this.pixelIndexOfSelectedBupId = pindex;
    this.currentSelectedBreakupId  = bupId;
    this.KOS.currentSelectedBreakupId = bupId;
  }

  //=======================================================================
  // Snap all highlight positions to the pixel corresponding to bupId,
  // as if the user had clicked it directly in the pixel view.
  activateBupId(bupId) {
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return;
    const pindex = this.PIN.BupIndexToPixelIndex[bupId];
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) return;

    const xi = (pindex % PIXELVIEW_W) * PIXELVIEW_SCALE;
    const yi = Math.floor(pindex / PIXELVIEW_W) * PIXELVIEW_SCALE;

    this.hiliteXf   = xi;  this.hiliteYf   = yi;
    this.hiliteMoXf = xi;  this.hiliteMoYf = yi;
    this.pixelClickedBreakupId = bupId;
    this.KOS.currentSelectedBreakupId    = bupId;
    this.KOS.currentMouseoverBreakupId   = bupId;
    this.pixelIndexOfSelectedBupId  = pindex;
    this.pixelIndexOfMouseoverBupId = pindex;
    this.currentSelectedBreakupId   = bupId;
    this.currentMouseoverBreakupId  = bupId;
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;
    this.bHasMagSelection = true;
  }

  //=======================================================================
  // One-pixel step from the *selected* pixel, for arrow keys used while the
  // cursor is over the loupe. The pixel-view arrow path cannot serve here: it
  // nudges keyOffset relative to pixelIndexOfMouseoverBupId, which is
  // DUMPSTER_INVALID once the mouse leaves the grid, and -1 % PIXELVIEW_W then
  // makes the clamps nonsense. Returns the new bupId, or DUMPSTER_INVALID.
  arrowStepFromSelection(k) {
    const pindex = this.pixelIndexOfSelectedBupId;
    if (pindex === DUMPSTER_INVALID || pindex < 0 || pindex >= this.nPixels) {
      return DUMPSTER_INVALID;
    }
    let x = pindex % PIXELVIEW_W;
    let y = Math.floor(pindex / PIXELVIEW_W);
    if      (k === LEFT_ARROW)  x -= 1;
    else if (k === RIGHT_ARROW) x += 1;
    else if (k === UP_ARROW)    y -= 1;
    else if (k === DOWN_ARROW)  y += 1;
    else return DUMPSTER_INVALID;

    if (x < 0 || x >= PIXELVIEW_W || y < 0 || y >= PIXELVIEW_H) return DUMPSTER_INVALID;
    const np = y * PIXELVIEW_W + x;
    const bupId = this.PIN.PixelIndexToBupIndex[np];
    if (bupId === DUMPSTER_INVALID || bupId < 0 ||
        bupId >= N_BREAKUP_DATABASE_RECORDS) return DUMPSTER_INVALID;
    if (!this.BM.bups[bupId].VALID) return DUMPSTER_INVALID;
    return bupId;
  }

  //=======================================================================
  isInMagView(mx, my) {
    return mx >= MAGVIEW_L && mx < MAGVIEW_L + MAGVIEW_W &&
           my >= MAGVIEW_T && my < MAGVIEW_T + MAGVIEW_H;
  }

  // Begin panning. Starts from wherever the loupe is already centred, so the
  // image does not jump under the cursor on press.
  beginMagDrag(mx, my) {
    if (!this.isInMagView(mx, my)) return false;
    if (this.magXc === DUMPSTER_INVALID || this.magYc === DUMPSTER_INVALID) return false;
    this.magDragging     = true;
    this._magMovedEnough = false;
    this._magMouseX0  = mx;
    this._magMouseY0  = my;
    this.magCenterXf  = this._magCenterX0 = this.magXc;
    this.magCenterYf  = this._magCenterY0 = this.magYc;
    return true;
  }

  // Advance the pan. Returns the bupId under the loupe centre, or
  // DUMPSTER_INVALID if the drag has not yet passed the movement threshold.
  updateMagDrag(mx, my) {
    if (!this.magDragging) return DUMPSTER_INVALID;

    const dxm = mx - this._magMouseX0;
    const dym = my - this._magMouseY0;
    if (!this._magMovedEnough) {
      if (dxm * dxm + dym * dym < MAGVIEW_DRAG_THRESHOLD_PX * MAGVIEW_DRAG_THRESHOLD_PX) {
        return DUMPSTER_INVALID;
      }
      this._magMovedEnough = true;
    }

    // Direct manipulation: the image follows the cursor, so the viewport moves
    // the other way.
    let cx = this._magCenterX0 - dxm / this.nmagScale;
    let cy = this._magCenterY0 - dym / this.nmagScale;
    cx = Math.max(0, Math.min(PIXELVIEW_W - 1, cx));
    cy = Math.max(0, Math.min(PIXELVIEW_H - 1, cy));
    this.magCenterXf = cx;
    this.magCenterYf = cy;

    const pindex = Math.round(cy) * PIXELVIEW_W + Math.round(cx);
    if (pindex < 0 || pindex >= this.nPixels) return DUMPSTER_INVALID;
    const bupId = this.PIN.PixelIndexToBupIndex[pindex];
    if (bupId === DUMPSTER_INVALID || bupId < 0 ||
        bupId >= N_BREAKUP_DATABASE_RECORDS) return DUMPSTER_INVALID;
    if (!this.BM.bups[bupId].VALID) return DUMPSTER_INVALID;
    return bupId;
  }

  endMagDrag() {
    const wasPan = this.magDragging && this._magMovedEnough;
    this.magDragging     = false;
    this._magMovedEnough = false;
    return wasPan;   // false means it was a click, not a pan
  }

  // [0,1] -> [0,1], steep through the middle: the image glides between whole
  // pixels quickly and lingers on them.
  _magSnapEase(f) {
    const k = MAGVIEW_SNAP_SHARPNESS;
    if (k <= 0) return f;
    const d = Math.tanh(k * 0.5);
    return 0.5 + 0.5 * Math.tanh(k * (f - 0.5)) / d;
  }

  //=======================================================================
  // Returns the bupId of the mag cell clicked, or DUMPSTER_INVALID.
  checkMagClick(mx, my) {
    if (this.magXc === DUMPSTER_INVALID || this.magYc === DUMPSTER_INVALID) return DUMPSTER_INVALID;

    const xMagStart = MAGVIEW_L;
    const yMagStart = MAGVIEW_T;

    if (mx < xMagStart || mx >= xMagStart + this.nmagX * this.nmagScale) return DUMPSTER_INVALID;
    if (my < yMagStart || my >= yMagStart + this.nmagY * this.nmagScale) return DUMPSTER_INVALID;

    const dx = Math.floor((mx - xMagStart) / this.nmagScale);
    const dy = Math.floor((my - yMagStart) / this.nmagScale);

    const targetX = this.magXc + dx - Math.floor(this.nmagX / 2);
    const targetY = this.magYc + dy - Math.floor(this.nmagY / 2);

    if (targetX < 0 || targetX >= PIXELVIEW_W) return DUMPSTER_INVALID;
    if (targetY < 0 || targetY >= PIXELVIEW_H) return DUMPSTER_INVALID;

    const pindex = targetY * PIXELVIEW_W + targetX;
    if (pindex < 0 || pindex >= this.nPixels) return DUMPSTER_INVALID;

    const bupId = this.PIN.PixelIndexToBupIndex[pindex];
    if (bupId === DUMPSTER_INVALID || bupId < 0 || bupId >= N_BREAKUP_DATABASE_RECORDS) return DUMPSTER_INVALID;
    if (!this.BM.bups[bupId].VALID) return DUMPSTER_INVALID;

    return bupId;
  }

  //=======================================================================
  mousePressed() {
    this.pixelClickedBreakupId = DUMPSTER_INVALID;
    if (this.mousePixelIndex === DUMPSTER_INVALID) return;

    const curBupId = this.PIN.PixelIndexToBupIndex[this.mousePixelIndex];
    if (curBupId !== DUMPSTER_INVALID && curBupId < N_BREAKUP_DATABASE_RECORDS_20K) {
      if (this.BM.bups[curBupId].VALID) {
        this.KOS.currentSelectedBreakupId = curBupId;
        this.pixelClickedBreakupId = curBupId;

        const xi = (this.mousePixelIndex % PIXELVIEW_W) * PIXELVIEW_SCALE;
        const yi = Math.floor(this.mousePixelIndex / PIXELVIEW_W) * PIXELVIEW_SCALE;
        this.hiliteXf   = xi; this.hiliteYf   = yi;
        this.hiliteMoXf = xi; this.hiliteMoYf = yi;

        this._updateSelectionInfo();
      }
    }
    this.keyOffsetX = 0;
    this.keyOffsetY = 0;
  }

  //=======================================================================
  _updateSelectionInfo() {
    if (this.KOS.currentSelectedBreakupId === this.currentSelectedBreakupId) return;
    if (this.KOS.currentSelectedBreakupId < 0) return;
    if (this.KOS.currentSelectedBreakupId >= this.nPixels) return;
    if (this.KOS.currentSelectedBreakupId === DUMPSTER_INVALID) return;

    this.currentSelectedBreakupId = this.KOS.currentSelectedBreakupId;
    this.pixelIndexOfSelectedBupId = this.PIN.BupIndexToPixelIndex[this.currentSelectedBreakupId];

    if (this.hiliteXf === DUMPSTER_INVALID) {
      this.hiliteXf = this.pixelIndexOfSelectedBupId % PIXELVIEW_W;
      this.hiliteYf = Math.floor(this.pixelIndexOfSelectedBupId / PIXELVIEW_W);
      this.keyOffsetX = 0;
      this.keyOffsetY = 0;
    }
  }

  //=======================================================================
  _updateMouseoverInfo() {
    if (this.KOS.currentMouseoverBreakupId === this.currentMouseoverBreakupId) return;
    if (this.KOS.currentMouseoverBreakupId < 0) return;
    if (this.KOS.currentMouseoverBreakupId >= this.nPixels) return;
    if (this.KOS.currentMouseoverBreakupId === DUMPSTER_INVALID) return;

    this.currentMouseoverBreakupId = this.KOS.currentMouseoverBreakupId;
    this.pixelIndexOfMouseoverBupId = this.PIN.BupIndexToPixelIndex[this.currentMouseoverBreakupId];

    if (this.hiliteMoXf === DUMPSTER_INVALID) {
      this.hiliteMoXf = this.pixelIndexOfMouseoverBupId % PIXELVIEW_W;
      this.hiliteMoYf = Math.floor(this.pixelIndexOfMouseoverBupId / PIXELVIEW_W);
    }
  }
}
