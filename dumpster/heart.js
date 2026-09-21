// Ported from Heart.pde

class Heart {

  constructor(h_id, BM) {
    this.BM = BM;
    this.heartId  = h_id;
    this.breakupId = Math.floor(random(N_BREAKUP_DATABASE_RECORDS_20K));

    this.xbins = 0;
    this.ybins = 0;

    this.innerColorOver     = color(255, 100, 180);
    this.innerColorSelected = color(255, 245,   0);
    this.innerColorHeart    = color(255, 180,  90);

    this.rad       = BM.bups[this.breakupId].heartRadius;
    this.rad_sq    = this.rad * this.rad;
    this.mass      = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
    this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
    this.diam      = this.rad * 2.0 - this.diamShave;

    this.rad_backup = this.rad;
    this.rad_target = this.rad;
    this.mouseState = STATE_MOUSE_IGNORE;
    this.existState = STATE_HEART_EXISTS;

    this.my_wall_L = HEART_WALL_L + this.rad;
    this.my_wall_R = HEART_WALL_R - this.rad;
    this.my_wall_T = HEART_WALL_T + this.rad;
    this.my_wall_B = HEART_WALL_B - this.rad;

    this.px = this.my_wall_L + random(1) * (this.my_wall_R - this.my_wall_L);
    this.py = this.my_wall_T + random(1) * (this.my_wall_B - this.my_wall_T);
    this.ox = this.px;
    this.oy = this.py;
    this.qx = this.px;
    this.qy = this.py;
    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;
    this.vx = 2.0 * (random(1) - 0.5);
    this.vy = 2.0 * (random(1) - 0.5);
    this.vh = 0;

    this.similarityToSelected = random(1);
    this.haloTargetR = HEART_HALO_EDGE_R;   // set each frame by HeartManager
    this.haloGrip    = 1.0;                 // 1 = held by the halo, 0 = released
    this.flockSigned = 0.0;                 // FLOCK mode: +1 attract .. -1 repel
    const simCol = Math.pow(this.similarityToSelected, 0.9);

    this.colr  = this.colrb = this.colrt = simCol * 200.0;
    this.colg  = this.colgb = this.colgt = 32;
    this.colb  = this.colbb = this.colbt = 32;

    this.bCurrentlyDraggingSelectedHeart = false;
    this.myMouseX = 0;
    this.myMouseY = 0;
    this.bWasSpecificallyClicked = false;

    this._saturateColors();
  }

  //-----------------------------
  initiate(newBreakupIndex, sim) {
    this.breakupId = newBreakupIndex;
    this.xbins = 0;
    this.ybins = 0;

    this.rad       = this.BM.bups[this.breakupId].heartRadius;
    this.rad_sq    = this.rad * this.rad;
    this.mass      = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
    this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
    this.diam      = this.rad * 2.0 - this.diamShave;

    this.rad_backup = this.rad;
    this.rad_target = this.rad;
    this.mouseState = STATE_MOUSE_IGNORE;
    this.existState = STATE_HEART_EXISTS;

    this.my_wall_L = HEART_WALL_L + this.rad;
    this.my_wall_R = HEART_WALL_R - this.rad;
    this.my_wall_T = HEART_WALL_T + this.rad;
    this.my_wall_B = HEART_WALL_B - this.rad;

    if (sim === 1.0) {
      this.px = width / 2;
      this.py = height / 2;
    } else {
      if (random(1) < 0.5) {
        const rxf = 0.50 * Math.pow(random(1), 1.50);
        this.px = this.my_wall_L + rxf * (this.my_wall_R - this.my_wall_L);
        this.py = HEART_WALL_T;
      } else {
        const ryf = random(1);
        this.px = HEART_WALL_R;
        this.py = this.my_wall_T + ryf * (this.my_wall_B - this.my_wall_T);
      }
    }

    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;
    this.vx = 0.8 * (random(1) - 0.5);
    this.vy = 2.5 + 2.0 * random(1);

    this.similarityToSelected = sim;
    const simCol = Math.pow(sim, 0.9);

    this.colr  = this.colrb = this.colrt = simCol * 200.0;
    this.colg  = this.colgb = this.colgt = 32;
    this.colb  = this.colbb = this.colbt = 32;
    this._saturateColors();
  }

  //-----------------------------
  setSimilarityToSelected(sim) {
    if (this.existState !== STATE_HEART_GONE) {
      this.similarityToSelected = sim;
      const simCol = Math.pow(sim, 0.9);
      this.colrb = simCol * 200.0;
      this.colgb = 32;
      this.colbb = 32;
      this._saturateColors();
    }
  }

  //-----------------------------
  _saturateColors() {
    const lumr = this.colrb * LUMINANCES_R;
    const lumg = this.colgb * LUMINANCES_G;
    const lumb = this.colbb * LUMINANCES_B;
    this.colrt = this.colrb = max(0, min(255, HEART_SATURATE_B * lumr + HEART_SATURATE_A * this.colrb));
    this.colgt = this.colgb = max(0, min(255, HEART_SATURATE_B * lumg + HEART_SATURATE_A * this.colgb));
    this.colbt = this.colbb = max(0, min(255, HEART_SATURATE_B * lumb + HEART_SATURATE_A * this.colbb));
  }

  //-----------------------------
  accumulateForce(fx, fy) {
    this.vx += fx / this.mass;
    this.vy += fy / this.mass;
  }

  accumulateGravityForce(scale) {
    this.vy += HEART_GRAVITY * (scale === undefined ? 1.0 : scale);
  }

  accumulateAttractionForceToSelected(spx, spy, spr) {
    if (this.existState === STATE_HEART_GONE) return;
    if (this.similarityToSelected < 0.33) return;
    const dx = spx - this.px;
    const dy = spy - this.py;
    const dSq = dx * dx + dy * dy;
    if (dSq <= spr * spr) return;
    const dh = Math.sqrt(dSq) - spr;
    const f = 0.15 * (this.similarityToSelected - 0.33) / (dh + 1);
    this.vx += f * dx;
    this.vy += f * dy;
  }

  // FLOCK mode. Signed influence in [-1,+1] from similarity, against fixed clip
  // points. Cached so the manager can reuse it for the gravity scale.
  flockSignedInfluence() {
    const lo = FLOCK.simLo, hi = FLOCK.simHi;
    let t = (hi > lo) ? (this.similarityToSelected - lo) / (hi - lo) : 0.5;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    let s = 2.0 * t - 1.0;
    if (FLOCK.gamma !== 1.0) {
      s = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), FLOCK.gamma);
    }
    this.flockSigned = s;
    return s;
  }

  // FLOCK mode. Attraction toward the selection for similar hearts, unbounded
  // repulsion away from it for dissimilar ones, plus a mid-range vortex.
  accumulateFlockingForce(spx, spy, spr) {
    if (this.existState === STATE_HEART_GONE) return;
    const s = this.flockSigned;

    let dx = this.px - spx;
    let dy = this.py - spy;
    let d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) {
      const a = random(TWO_PI);
      dx = Math.cos(a); dy = Math.sin(a); d = 1.0;
    }
    const ux = dx / d, uy = dy / d;

    if (s >= 0) {
      // Taper the pull to zero inside the core so the centre cannot jam.
      let taper = (d - spr - FLOCK.coreR) / Math.max(1, FLOCK.taper);
      if (taper < 0) taper = 0; else if (taper > 1) taper = 1;
      const f = FLOCK.attractK * s * taper;
      this.vx -= f * ux;
      this.vy -= f * uy;
    } else {
      const f = FLOCK.repelK * (-s);          // no falloff: keep going
      this.vx += f * ux;
      this.vy += f * uy;
    }

    // Vortex, peaking at mid similarity where the jamming happens.
    // Tangent is (uy, -ux); negate FLOCK.swirl to spin the other way.
    const w = FLOCK.swirl * (1.0 - Math.abs(s));
    this.vx +=  uy * w;
    this.vy += -ux * w;
  }

  // HALO mode. Preferred distance from the selected
  // heart, set by similarity, enforced by a two-sided spring: negative when the
  // heart is too far (pull in), positive when too close (push out). That second
  // half is what makes dissimilar hearts actually vacate the core.
  accumulateRadialSimilarityForce(spx, spy, spr) {
    if (this.existState === STATE_HEART_GONE) return;

    const grip = this.haloGrip;
    if (grip <= 0) return;              // released: gravity and the heap own it
    const rTarget = this.haloTargetR;

    let dx = this.px - spx;
    let dy = this.py - spy;
    let d  = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) {                    // exactly coincident: pick any direction
      const a = random(TWO_PI);
      dx = Math.cos(a); dy = Math.sin(a); d = 1.0;
    }
    const ux = dx / d, uy = dy / d;

    let acc = HALO_K_LIVE * grip * (rTarget - d);
    if (acc >  HEART_HALO_MAX_ACC) acc =  HEART_HALO_MAX_ACC;
    if (acc < -HEART_HALO_MAX_ACC) acc = -HEART_HALO_MAX_ACC;
    this.vx += acc * ux;
    this.vy += acc * uy;

    // Slow tangential drift, so hearts spread around the ring rather than
    // stacking along whichever ray they happened to arrive on.
    this.vx +=  uy * HEART_HALO_SWIRL * grip;
    this.vy += -ux * HEART_HALO_SWIRL * grip;
  }

  // Hold the selected heart near a fixed point so the halo is not squashed into
  // a corner. Skipped while the viewer is dragging it.
  accumulateAnchorForce(ax, ay, k) {
    if (this.existState === STATE_HEART_GONE) return;
    if (this.bCurrentlyDraggingSelectedHeart &&
        (this.mouseState === STATE_MOUSE_DRAG || this.mouseState === STATE_MOUSE_SELECT)) return;
    this.vx += (ax - this.px) * k;
    this.vy += (ay - this.py) * k;
  }

  accumulateCentralizingForce(scale) {
    const k = HEART_HEAPING_K * (scale === undefined ? 1.0 : scale);
    if (k === 0) return;
    if (this.existState !== STATE_HEART_GONE) {
      const dx = HEART_HEAP_CENTERX - this.px;
      const dy = HEART_HEAP_CENTERY - this.py;
      const dh = dx * dx + dy * dy;
      if (dh > HEART_NEIGHBORHOOD_SQ) {
        const dhInv = k / Math.sqrt(dh);
        this.vx += dx * dhInv;
        this.vy += dy * dhInv / this.mass;
      }
    }
  }

  setMouseInformation(bdrag, mx, my) {
    this.bCurrentlyDraggingSelectedHeart = bdrag;
    this.myMouseX = mx;
    this.myMouseY = my;
  }

  //-----------------------------
  update() {
    if (this.existState === STATE_HEART_GONE) return;

    // Interpolate color toward target
    const dcolr = Math.abs(this.colrt - this.colr);
    const dcolg = Math.abs(this.colgt - this.colg);
    const dcolb = Math.abs(this.colbt - this.colb);
    if ((dcolr + dcolg + dcolb) > 0.50) {
      this.colr = HEART_BLUR_CA * this.colr + HEART_BLUR_CB * this.colrt;
      this.colg = HEART_BLUR_CA * this.colg + HEART_BLUR_CB * this.colgt;
      this.colb = HEART_BLUR_CA * this.colb + HEART_BLUR_CB * this.colbt;
    }

    // Interpolate radius toward target
    if (Math.abs(this.rad - this.rad_target) > 0.25) {
      this.rad    = HEART_BLUR_RA * this.rad + HEART_BLUR_RB * this.rad_target;
      this.rad_sq = this.rad * this.rad;
      this.mass   = (1 + this.rad_sq) * HEART_MASS_CONSTANT;
      this.diamShave = (this.rad > HEART_MIN_RADp1) ? HEART_DIAM_SHAVE : 0;
      this.diam   = this.rad * 2.0 - this.diamShave;
      this.my_wall_L = HEART_WALL_L + this.rad;
      this.my_wall_T = HEART_WALL_T + this.rad;
      this.my_wall_R = HEART_WALL_R - this.rad;
      this.my_wall_B = HEART_WALL_B - this.rad;

      if (Math.abs(this.rad - this.rad_target) < 0.25) {
        this.rad = this.rad_target;
        if (this.existState === STATE_HEART_FADING && this.rad === 0) {
          this.existState = STATE_HEART_GONE;
        }
      }
    }

    this.ox = this.px;
    this.oy = this.py;
    this.vx *= HEART_DAMPING;
    this.vy *= HEART_DAMPING;

    if (this.bCurrentlyDraggingSelectedHeart &&
        (this.mouseState === STATE_MOUSE_DRAG || this.mouseState === STATE_MOUSE_SELECT)) {
      this.qx = 0.20 * this.px + 0.80 * this.myMouseX;
      this.qy = 0.20 * this.py + 0.80 * this.myMouseY;
      this.vx = this.qx - this.px;
      this.vy = this.qy - this.py;
    } else {
      this.qx = this.ox + this.vx;
      this.qy = this.oy + this.vy;

      if (this.xbins === 3) {
        if (this.ox >= this.my_wall_L && this.qx < this.my_wall_L) {
          this.qx = this.my_wall_L + (this.my_wall_L - this.qx);
          this.vx = -this.vx;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      } else if (this.xbins === 192) {
        if (this.ox < this.my_wall_R && this.qx >= this.my_wall_R) {
          this.qx = this.my_wall_R - (this.qx - this.my_wall_R);
          this.vx = -this.vx;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      }
      if (this.ybins === 192) {
        if (this.oy < this.my_wall_B && this.qy >= this.my_wall_B) {
          this.qy = this.my_wall_B - (this.qy - this.my_wall_B);
          this.vy = -this.vy;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      } else if (this.ybins === 3) {
        if (this.oy >= this.my_wall_T && this.qy < this.my_wall_T) {
          this.qy = this.my_wall_T + (this.my_wall_T - this.qy);
          this.vy = -this.vy;
          this.vx *= HEART_COLLISION_DAMPING;
          this.vy *= HEART_COLLISION_DAMPING;
        }
      }
    }

    this.px = min(this.my_wall_R, max(this.my_wall_L, this.qx));
    this.py = min(this.my_wall_B, max(this.my_wall_T, this.qy));
    this.xMin = this.px - this.rad;
    this.xMax = this.px + this.rad;
    this.yMin = this.py - this.rad;
    this.yMax = this.py + this.rad;

    if (Math.abs(this.vx) > HEART_MAX_VELd2 || Math.abs(this.vy) > HEART_MAX_VELd2) {
      this.vh = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (this.vh > HEART_MAX_VEL) {
        const frac = HEART_MAX_VEL / this.vh;
        this.vh = HEART_MAX_VEL;
        this.vx *= frac;
        this.vy *= frac;
      }
    }

    this.xbins = bindices[Math.floor(opt_8dHA_W * (this.px - HEART_WALL_L))];
    this.ybins = bindices[Math.floor(opt_8dHA_H * (this.py - HEART_WALL_T))];
  }

  //-----------------------------
  initiateDisappearance() {
    if (this.mouseState === STATE_MOUSE_IGNORE) {
      this.existState = STATE_HEART_FADING;
      this.rad_target = 0;
    }
  }

  setMouseState(mState) {
    this.mouseState = mState;
    if (this.existState === STATE_HEART_GONE) return;
    switch (this.mouseState) {
      case STATE_MOUSE_DRAG:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_DRAG_RADIUS;
        this.colr = this.colrt = 255;
        this.colg = this.colgt = 128;
        this.colb = this.colbt = 0;
        break;
      case STATE_MOUSE_SELECT:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_SELECT_RADIUS;
        this.colr = this.colrt = 255;
        this.colg = this.colgt = 100;
        this.colb = this.colbt = 0;
        break;
      case STATE_MOUSE_OVER:
        this.existState = STATE_HEART_EXISTS;
        this.rad_target = HEART_OVER_RADIUS;
        this.colr = this.colrt = 0;
        this.colg = this.colgt = 0;
        this.colb = this.colbt = 255;
        break;
      case STATE_MOUSE_IGNORE:
        this.rad_target = (this.existState === STATE_HEART_EXISTS) ? this.rad_backup : 0;
        this.colrt = this.colrb;
        this.colgt = this.colgb;
        this.colbt = this.colbb;
        break;
    }
  }

  render() {
    if (this.existState !== STATE_HEART_GONE) {
      fill(this.colr, this.colg, this.colb);
      ellipse(this.px, this.py, this.diam, this.diam);
    }
  }

  renderMouseOver() {
    noStroke();
    fill(this.colr, this.colg, this.colb);
    ellipse(this.px, this.py, this.diam, this.diam);
    fill(this.innerColorOver);
    ellipse(this.px, this.py, this.diam - 12, this.diam - 12);
  }

  renderMouseSelected() {
    stroke(0, 0, 0);
    fill(this.colr, this.colg, this.colb);
    ellipse(this.px, this.py, this.diam, this.diam);
    noStroke();
    fill(this.innerColorSelected);
    ellipse(this.px, this.py, this.diam - 12, this.diam - 12);
  }
}
