/**
 * Thin wrapper around the exact MediaPipe Tasks Vision JS hand detector.
 *
 * Keep this module small: its job is only to load the configured CDN package,
 * run detection on the video element, and convert normalized landmarks into the
 * same pixel coordinate system used by the canvas and PDM runtime.
 */

const TASKS_VERSION = "0.10.22-rc.20250304";
const TASKS_VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/**
 * Adapter for the JS MediaPipe hand detector used by the eventual browser app.
 */
export class MediaPipeHandAdapter {
  /**
   * @param {object} [options] - Detector options.
   * @param {"GPU"|"CPU"} [options.delegate="GPU"] - MediaPipe execution delegate.
   * @param {number} [options.maxHands=1] - Maximum hands to return per frame.
   */
  constructor(options = {}) {
    this.delegate = options.delegate ?? "GPU";
    this.maxHands = options.maxHands ?? 1;
    this.lastVideoTime = -1;
    this.lastResult = null;
  }

  /**
   * Load the MediaPipe Tasks Vision package, WASM files, and hand model.
   *
   * @returns {Promise<void>}
   */
  async init() {
    const mp = await import(TASKS_VISION_URL);
    const { HandLandmarker, FilesetResolver } = mp;
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      numHands: this.maxHands,
      runningMode: "VIDEO",
      baseOptions: {
        delegate: this.delegate,
        modelAssetPath: HAND_MODEL_URL,
      },
    });
  }

  /**
   * Run detection and convert landmarks to canvas-pixel coordinates.
   *
   * `canvasRect` maps normalized MediaPipe coordinates into the drawn video
   * rectangle. In the current full-frame camera mode this is simply the canvas
   * bounds, but the adapter keeps the mapping explicit.
   *
   * @param {HTMLVideoElement} video - Live webcam video.
   * @param {{x:number,y:number,width:number,height:number}} canvasRect - Drawn video rectangle.
   * @param {boolean} mirrorVideo - Whether the display is mirrored horizontally.
   * @returns {{hands:Array<object>, mediaPipeMs:number}|null} Detection result.
   */
  detect(video, canvasRect, mirrorVideo) {
    if (!this.handLandmarker || video.readyState < 2) return null;
    if (video.currentTime === this.lastVideoTime) return this.lastResult;
    const start = performance.now();
    const results = this.handLandmarker.detectForVideo(video, start);
    this.lastVideoTime = video.currentTime;
    const landmarks = results.landmarks ?? [];
    if (!landmarks.length) {
      this.lastResult = { hands: [], mediaPipeMs: performance.now() - start };
      return this.lastResult;
    }
    const hands = landmarks.map((hand, index) => {
      const handedness = results.handednesses?.[index]?.[0];
      const points = hand.map((lm) => {
        const nx = mirrorVideo ? 1 - lm.x : lm.x;
        return {
          x: canvasRect.x + nx * canvasRect.width,
          y: canvasRect.y + lm.y * canvasRect.height,
          z: Number.isFinite(lm.z) ? lm.z : 0,
          visibility: Number.isFinite(lm.visibility) && lm.visibility > 0 ? lm.visibility : 1,
        };
      });
      return {
        landmarks: points,
        handedness: handedness?.categoryName ?? "Unknown",
        score: Number.isFinite(handedness?.score) ? handedness.score : 1,
      };
    });
    hands.sort((a, b) => b.score - a.score);
    this.lastResult = { hands, mediaPipeMs: performance.now() - start };
    return this.lastResult;
  }
}
