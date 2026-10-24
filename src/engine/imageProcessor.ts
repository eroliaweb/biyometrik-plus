import {
  BrushStroke,
  ColorBandKey,
  CornerPosition,
  FaceLandmarks,
  LiquifyStroke,
  PhotoAdjustments,
  PhotoSession,
  SessionSettings,
} from '../types/biometric';

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Automatic Face & Biometric Landmark Detection
 * 1. Uses the native ONNX YOLOv8-Face neural network via Electron IPC when running in Desktop mode.
 * 2. Uses Chromium FaceDetector API if available.
 * 3. Falls back to an upper-body anthropometric face-oval + eye-pair detector in browser mode.
 */
export async function detectBiometricLandmarks(
  img: HTMLImageElement,
  dataUrl?: string
): Promise<FaceLandmarks> {
  // 1. Primary: Real ONNX YOLOv8-Face Neural Network (via Electron Main Process)
  // Draw `img` onto an upright canvas first so Chromium bakes in any EXIF orientation
  // (e.g. DSLR/phone portrait JPEGs with Orientation=6/8) and keeps IPC payload fast.
  if (window.biyometrikElectron?.detectFace) {
    try {
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 640, img.naturalHeight || 640));
      const nw = Math.max(64, Math.round((img.naturalWidth || 640) * scale));
      const nh = Math.max(64, Math.round((img.naturalHeight || 640) * scale));
      const normCanvas = document.createElement('canvas');
      normCanvas.width = nw;
      normCanvas.height = nh;
      const normCtx = normCanvas.getContext('2d')!;
      normCtx.drawImage(img, 0, 0, nw, nh);
      const uprightDataUrl = normCanvas.toDataURL('image/jpeg', 0.92);

      const onnxResult = await window.biyometrikElectron.detectFace(uprightDataUrl || dataUrl || img.src);
      if (onnxResult && onnxResult.chinLineY > onnxResult.headTopY) {
        return {
          headTopY: onnxResult.headTopY,
          eyeLineY: onnxResult.eyeLineY,
          chinLineY: onnxResult.chinLineY,
          centerX: onnxResult.centerX,
          faceWidthRatio: onnxResult.faceWidthRatio,
          tiltDeg: 0,
        };
      }
    } catch (e) {
      console.warn('ONNX face detection fallback:', e);
    }
  }

  const w = 320;
  const h = Math.max(160, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  // 2. Secondary: Chromium Shape Detection API
  if ('FaceDetector' in window) {
    try {
      // @ts-expect-error Chromium FaceDetector
      const detector = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 1 });
      const faces = await detector.detect(canvas);
      if (faces && faces.length > 0) {
        const box = faces[0].boundingBox;
        const centerX = (box.x + box.width / 2) / w;
        const headTopY = Math.max(0.04, (box.y - box.height * 0.18) / h);
        const chinLineY = Math.min(0.88, (box.y + box.height * 0.96) / h);
        const eyeLineY = headTopY + (chinLineY - headTopY) * 0.44;
        return {
          headTopY,
          eyeLineY,
          chinLineY,
          centerX,
          faceWidthRatio: box.width / w,
          tiltDeg: 0,
        };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Fallback: Anthropometric Upper-Head & Eye-Row Detector (immune to brown/warm clothing)
  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample border background color from top corners and upper side margins
  const bgSamples: Array<[number, number, number]> = [];
  for (let x = 2; x < w - 2; x += 6) {
    const idxTop = (2 * w + x) * 4;
    bgSamples.push([data[idxTop], data[idxTop + 1], data[idxTop + 2]]);
  }
  const bgR = bgSamples.reduce((s, c) => s + c[0], 0) / bgSamples.length;
  const bgG = bgSamples.reduce((s, c) => s + c[1], 0) / bgSamples.length;
  const bgB = bgSamples.reduce((s, c) => s + c[2], 0) / bgSamples.length;

  // Find the topmost non-background foreground pixel (top of hair/crown) in the central horizontal band
  let crownY = Math.floor(h * 0.12);
  let foundCrown = false;
  for (let y = Math.floor(h * 0.03); y < Math.floor(h * 0.55); y++) {
    let fgRowCount = 0;
    for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x++) {
      const i = (y * w + x) * 4;
      const dist = Math.hypot(data[i] - bgR, data[i + 1] - bgG, data[i + 2] - bgB);
      if (dist > 30) fgRowCount++;
    }
    if (fgRowCount > w * 0.05) {
      crownY = y;
      foundCrown = true;
      break;
    }
  }

  // Scan rows below crownY for the face skin cluster (limiting height to realistic head proportions)
  const maxSearchY = Math.min(h - 4, crownY + Math.floor(h * 0.46));
  const rowSkinWidths = new Float32Array(h);
  const rowSkinCenterX = new Float32Array(h);

  for (let y = crownY; y < maxSearchY; y++) {
    let minX = w;
    let maxX = 0;
    let count = 0;
    let sumX = 0;
    for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);

      // Strict YCbCr chrominance skin test (excludes dark brown/saturated clothing)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isSkin =
        distBg > 24 &&
        lum > 65 &&
        cr >= 135 &&
        cr <= 175 &&
        cb >= 80 &&
        cb <= 128 &&
        r > g &&
        g > b * 0.85;

      if (isSkin) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        sumX += x;
        count++;
      }
    }
    if (count > 4) {
      rowSkinWidths[y] = maxX - minX;
      rowSkinCenterX[y] = sumX / count;
    }
  }

  // Find maximum cheek width row in upper half
  let maxCheekWidth = 0;
  let cheekY = crownY + Math.floor(h * 0.15);
  let centerXSum = 0;
  let centerXCount = 0;

  for (let y = crownY; y < maxSearchY; y++) {
    if (rowSkinWidths[y] > maxCheekWidth) {
      maxCheekWidth = rowSkinWidths[y];
      cheekY = y;
    }
    if (rowSkinWidths[y] > w * 0.05) {
      centerXSum += rowSkinCenterX[y];
      centerXCount++;
    }
  }

  if (foundCrown && maxCheekWidth > w * 0.06) {
    const centerX = centerXCount > 0 ? centerXSum / centerXCount / w : 0.5;
    // Anthropometric ratio: head height (skull crown to chin) is ~1.38x cheek width
    const estimatedHeadHeightPx = Math.max(
      h * 0.18,
      Math.min(h * 0.42, maxCheekWidth * 1.42)
    );
    const headTopY = Math.max(0.04, (crownY + estimatedHeadHeightPx * 0.08) / h);
    const chinLineY = Math.min(0.85, headTopY + estimatedHeadHeightPx / h);
    const eyeLineY = headTopY + (chinLineY - headTopY) * 0.43;

    return {
      headTopY: Number(headTopY.toFixed(4)),
      eyeLineY: Number(eyeLineY.toFixed(4)),
      chinLineY: Number(chinLineY.toFixed(4)),
      centerX: Number(centerX.toFixed(4)),
      faceWidthRatio: Number((maxCheekWidth / w).toFixed(4)),
      tiltDeg: 0,
    };
  }

  return {
    headTopY: 0.16,
    eyeLineY: 0.27,
    chinLineY: 0.42,
    centerX: 0.5,
    faceWidthRatio: 0.14,
    tiltDeg: 0,
  };
}

/**
 * Generates an alpha mask Canvas (white = foreground person, black = background)
 * Uses Border-Seeded Flood-Fill + Multi-Cluster Background Color Distance + Soft Alpha Matting.
 * Does NOT stamp any artificial geometric circle/oval behind the head.
 */
export function generateForegroundMask(
  img: HTMLImageElement,
  landmarks: FaceLandmarks
): HTMLCanvasElement {
  const maxDim = 560;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(80, Math.round(img.naturalWidth * scale));
  const h = Math.max(80, Math.round(img.naturalHeight * scale));

  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Sample background palette along outer border (top, left, right)
  const bgSamples: Array<[number, number, number]> = [];
  const stepX = Math.max(2, Math.floor(w / 36));
  const stepY = Math.max(2, Math.floor(h / 36));

  for (let x = 2; x < w - 2; x += stepX) {
    const i = (2 * w + x) * 4;
    bgSamples.push([data[i], data[i + 1], data[i + 2]]);
  }
  // Only sample left/right borders above shoulder level (h * 0.55) so wide sleeves/arms
  // touching the lower frame edges are never sampled as background color
  for (let y = 2; y < Math.floor(h * 0.55); y += stepY) {
    const iL = (y * w + 2) * 4;
    const iR = (y * w + (w - 3)) * 4;
    bgSamples.push([data[iL], data[iL + 1], data[iL + 2]]);
    bgSamples.push([data[iR], data[iR + 1], data[iR + 2]]);
  }

  // Compute each pixel's minimum perceptual distance to the sampled background palette
  const bgDist = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      let minDist = 9999;
      for (let s = 0; s < bgSamples.length; s++) {
        const sr = bgSamples[s][0];
        const sg = bgSamples[s][1];
        const sb = bgSamples[s][2];
        const dr = r - sr;
        const dg = g - sg;
        const db = b - sb;
        // Weighted perceptual RGB + strong chrominance difference (distinguishes warm skin/beige clothing from neutral studio backdrops)
        const d =
          Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) +
          (Math.abs(dr - dg) + Math.abs(dg - db) + Math.abs(dr - db)) * 0.42;
        if (d < minDist) minDist = d;
      }
      bgDist[idx] = minDist;
    }
  }

  // 2. Flood-fill from outer border (top, left, right) to identify connected background region
  // Protect the inner face & central torso core from accidental flood-fill bleed on light clothing
  const cx = landmarks.centerX * w;
  const headTopPx = landmarks.headTopY * h;
  const chinPx = landmarks.chinLineY * h;
  const faceH = Math.max(16, chinPx - headTopPx);
  const faceW = (landmarks.faceWidthRatio || (faceH / h) * 0.65) * w;

  const isBgVisited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;

  const pushSeed = (x: number, y: number) => {
    const idx = y * w + x;
    if (!isBgVisited[idx] && bgDist[idx] < 34) {
      isBgVisited[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    pushSeed(x, 0);
    pushSeed(x, 1);
  }
  for (let y = 0; y < Math.floor(h * 0.85); y++) {
    pushSeed(0, y);
    pushSeed(1, y);
    pushSeed(w - 1, y);
    pushSeed(w - 2, y);
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cy = Math.floor(curr / w);
    const cxPix = curr - cy * w;
    const currR = data[curr * 4];
    const currG = data[curr * 4 + 1];
    const currB = data[curr * 4 + 2];

    const neighbors = [
      curr - 1,
      curr + 1,
      curr - w,
      curr + w,
    ];

    for (let k = 0; k < 4; k++) {
      const nIdx = neighbors[k];
      if (nIdx < 0 || nIdx >= w * h || isBgVisited[nIdx]) continue;
      const ny = Math.floor(nIdx / w);
      const nx = nIdx - ny * w;
      if (Math.abs(nx - cxPix) + Math.abs(ny - cy) !== 1) continue;

      // Never flood-fill inside the inner facial feature box or central chest/neck column
      const inInnerFace =
        ny > headTopPx + faceH * 0.12 &&
        ny < chinPx + faceH * 0.05 &&
        Math.abs(nx - cx) < faceW * 0.45;
      const inInnerTorso =
        ny >= chinPx + faceH * 0.05 &&
        Math.abs(nx - cx) < faceW * 0.85;
      if (inInnerFace || inInnerTorso) continue;

      const nr = data[nIdx * 4];
      const ng = data[nIdx * 4 + 1];
      const nb = data[nIdx * 4 + 2];
      const stepDiff =
        Math.abs(nr - currR) + Math.abs(ng - currG) + Math.abs(nb - currB);

      if (bgDist[nIdx] < 22 || (bgDist[nIdx] < 32 && stepDiff < 14)) {
        isBgVisited[nIdx] = 1;
        queue[qTail++] = nIdx;
      }
    }
  }

  // 3. Convert flood-fill + color distance into smooth continuous alpha [0..1]
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (isBgVisited[i]) {
      // Soft ramp near boundary for hair strands
      alpha[i] = Math.min(1, Math.max(0, (bgDist[i] - 20) / 22));
    } else {
      alpha[i] = 1.0;
    }
  }

  // 4. Smooth alpha edges (5x5 separable box filter for anti-aliased hair/shoulder transitions)
  const temp = new Float32Array(w * h);
  const smoothed = new Float32Array(w * h);
  const radius = 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let kx = -radius; kx <= radius; kx++) {
        const nx = x + kx;
        if (nx >= 0 && nx < w) {
          sum += alpha[y * w + nx];
          count++;
        }
      }
      temp[y * w + x] = sum / count;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const ny = y + ky;
        if (ny >= 0 && ny < h) {
          sum += temp[ny * w + x];
          count++;
        }
      }
      // Contrast-stretch the matte ramp slightly so edges are clean without halos
      const v = sum / count;
      smoothed[y * w + x] = Math.min(1, Math.max(0, (v - 0.12) / 0.78));
    }
  }

  const maskData = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = Math.round(smoothed[i] * 255);
    const p = i * 4;
    maskData.data[p] = 255;
    maskData.data[p + 1] = 255;
    maskData.data[p + 2] = 255;
    maskData.data[p + 3] = a;
  }
  ctx.putImageData(maskData, 0, 0);
  return work;
}

/**
 * Applies interactive Edge Eraser / Restore brush strokes onto a copy of the foreground mask.
 */
export function buildEffectiveMaskCanvas(
  baseMask: HTMLCanvasElement | null,
  strokes: BrushStroke[],
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = targetWidth;
  maskCanvas.height = targetHeight;
  const ctx = maskCanvas.getContext('2d')!;

  if (baseMask) {
    ctx.drawImage(baseMask, 0, 0, targetWidth, targetHeight);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    const alpha = (stroke.opacity / 100) * (stroke.flow / 100);
    const radius = Math.max(2, (stroke.sizePx / 500) * targetWidth * 0.5);
    const innerRatio = Math.min(0.95, Math.max(0.05, stroke.hardness / 100));

    for (let i = 0; i < stroke.points.length; i++) {
      const pt = stroke.points[i];
      const px = pt.x * targetWidth;
      const py = pt.y * targetHeight;
      const grad = ctx.createRadialGradient(px, py, radius * innerRatio, px, py, radius);
      grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return maskCanvas;
}

/**
 * Applies 2D Displacement Field Liquify (Push / Reconstruct) strokes onto a canvas in place.
 */
export function applyLiquifyStrokesToCanvas(
  canvas: HTMLCanvasElement,
  strokes: LiquifyStroke[]
): void {
  if (!strokes || strokes.length === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const srcData = ctx.getImageData(0, 0, w, h);
  const dstData = ctx.createImageData(w, h);
  const src = srcData.data;
  const dst = dstData.data;

  const gw = Math.max(32, Math.floor(w / 2));
  const gh = Math.max(32, Math.floor(h / 2));
  const dispX = new Float32Array(gw * gh);
  const dispY = new Float32Array(gw * gh);

  for (const stroke of strokes) {
    const radius = Math.max(4, (stroke.sizePx / 500) * gw * 0.5);
    const r2 = radius * radius;
    const strength = (stroke.strength / 100) * 0.85;

    for (const seg of stroke.points) {
      const cx = seg.x * gw;
      const cy = seg.y * gh;
      const minX = Math.max(0, Math.floor(cx - radius));
      const maxX = Math.min(gw - 1, Math.ceil(cx + radius));
      const minY = Math.max(0, Math.floor(cy - radius));
      const maxY = Math.min(gh - 1, Math.ceil(cy + radius));

      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const dx = gx - cx;
          const dy = gy - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          const falloff = Math.pow(1 - d2 / r2, 2);
          const idx = gy * gw + gx;
          if (stroke.mode === 'push') {
            dispX[idx] -= seg.dx * gw * falloff * strength;
            dispY[idx] -= seg.dy * gh * falloff * strength;
          } else {
            dispX[idx] *= 1 - falloff * strength;
            dispY[idx] *= 1 - falloff * strength;
          }
        }
      }
    }
  }

  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor((y / h) * gh));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1, Math.floor((x / w) * gw));
      const gIdx = gy * gw + gx;
      const sx = Math.min(w - 1, Math.max(0, Math.round(x + dispX[gIdx] * 2)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y + dispY[gIdx] * 2)));
      const sOff = (sy * w + sx) * 4;
      const dOff = (y * w + x) * 4;
      dst[dOff] = src[sOff];
      dst[dOff + 1] = src[sOff + 1];
      dst[dOff + 2] = src[sOff + 2];
      dst[dOff + 3] = src[sOff + 3];
    }
  }

  ctx.putImageData(dstData, 0, 0);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function getBandForHue(hueDeg: number): ColorBandKey {
  if (hueDeg < 18 || hueDeg >= 345) return 'red';
  if (hueDeg < 42) return 'orange';
  if (hueDeg < 70) return 'yellow';
  if (hueDeg < 155) return 'green';
  if (hueDeg < 195) return 'aqua';
  if (hueDeg < 255) return 'blue';
  if (hueDeg < 295) return 'purple';
  return 'magenta';
}

/**
 * Applies Skin Retouching + Light/Tone/Color Adjustments + 8-Band HSL Mixer + Sharpness
 */
export function applyRetouchAndAdjustments(
  canvas: HTMLCanvasElement,
  retouchEnabled: boolean,
  retouchStrength: number,
  adjustmentsEnabled: boolean,
  adj: PhotoAdjustments
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Skin Retouching (edge-preserving bilateral skin smoothing)
  if (retouchEnabled && retouchStrength > 0) {
    const copy = new Uint8ClampedArray(data);
    const blend = (retouchStrength / 100) * 0.72;
    const step = Math.max(1, Math.round(w / 320));
    for (let y = step * 2; y < h - step * 2; y++) {
      for (let x = step * 2; x < w - step * 2; x++) {
        const i = (y * w + x) * 4;
        if (copy[i + 3] < 32) continue;
        const r = copy[i];
        const g = copy[i + 1];
        const b = copy[i + 2];

        if (r > 80 && g > 45 && b > 30 && r > g && r > b && r - Math.min(g, b) > 12) {
          let sumR = r * 2;
          let sumG = g * 2;
          let sumB = b * 2;
          let weightSum = 2;

          const offsets = [
            [-step, 0],
            [step, 0],
            [0, -step],
            [0, step],
            [-step * 2, 0],
            [step * 2, 0],
            [0, -step * 2],
            [0, step * 2],
          ];
          for (let k = 0; k < offsets.length; k++) {
            const ni = ((y + offsets[k][1]) * w + (x + offsets[k][0])) * 4;
            const nr = copy[ni];
            const ng = copy[ni + 1];
            const nb = copy[ni + 2];
            const diff = Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b);
            if (diff < 45) {
              const wgt = 1 - diff / 45;
              sumR += nr * wgt;
              sumG += ng * wgt;
              sumB += nb * wgt;
              weightSum += wgt;
            }
          }
          data[i] = Math.round(r * (1 - blend) + (sumR / weightSum) * blend);
          data[i + 1] = Math.round(g * (1 - blend) + (sumG / weightSum) * blend);
          data[i + 2] = Math.round(b * (1 - blend) + (sumB / weightSum) * blend);
        }
      }
    }
  }

  // 2. Tone & Color Adjustments
  if (adjustmentsEnabled) {
    const expGain = Math.pow(2, adj.exposure / 65);
    const contrastFactor = Math.pow((adj.contrast + 100) / 100, 2);
    const tempShift = adj.temperature * 0.55;
    const tintShift = adj.tint * 0.45;
    const satShift = adj.saturation / 100;
    const vibShift = adj.vibrance / 100;
    const shadowShift = adj.shadows / 100;
    const highlightShift = adj.highlights / 100;
    const whiteShift = adj.whites / 100;
    const blackShift = adj.blacks / 100;

    const hasHsl = Object.values(adj.hslBands).some(
      (b) => b.hue !== 0 || b.saturation !== 0 || b.luminance !== 0
    );

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      let r = data[i] * expGain + tempShift;
      let g = data[i + 1] * expGain - tintShift;
      let b = data[i + 2] * expGain - tempShift;

      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      const shadowMask = Math.pow(1 - Math.min(1, Math.max(0, lum)), 2);
      const highlightMask = Math.pow(Math.min(1, Math.max(0, lum)), 2);
      const toneDelta =
        shadowShift * shadowMask * 48 +
        highlightShift * highlightMask * 48 +
        whiteShift * Math.pow(lum, 3) * 38 +
        blackShift * Math.pow(1 - lum, 3) * 38;

      r += toneDelta;
      g += toneDelta;
      b += toneDelta;

      r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
      g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
      b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));

      if (satShift !== 0 || vibShift !== 0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const curSat = (maxC - minC) / 255;
        const vibBoost = vibShift * (1 - curSat * 0.85);
        const mult = Math.max(0, 1 + satShift + vibBoost);
        r = gray + (r - gray) * mult;
        g = gray + (g - gray) * mult;
        b = gray + (b - gray) * mult;
      }

      if (hasHsl) {
        let [hue, sat, lig] = rgbToHsl(
          Math.min(255, Math.max(0, r)),
          Math.min(255, Math.max(0, g)),
          Math.min(255, Math.max(0, b))
        );
        const band = adj.hslBands[getBandForHue(hue)];
        if (band.hue !== 0 || band.saturation !== 0 || band.luminance !== 0) {
          hue += band.hue * 0.35;
          sat = Math.min(1, Math.max(0, sat * (1 + band.saturation / 100)));
          lig = Math.min(1, Math.max(0, lig + (band.luminance / 100) * 0.25));
          [r, g, b] = hslToRgb(hue, sat, lig);
        }
      }

      data[i] = Math.min(255, Math.max(0, Math.round(r)));
      data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
      data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }

    if (adj.sharpness > 0) {
      const amount = (adj.sharpness / 100) * 0.65;
      const orig = new Uint8ClampedArray(data);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          if (orig[i + 3] < 32) continue;
          for (let c = 0; c < 3; c++) {
            const center = orig[i + c];
            const blur =
              (orig[((y - 1) * w + x) * 4 + c] +
                orig[((y + 1) * w + x) * 4 + c] +
                orig[(y * w + (x - 1)) * 4 + c] +
                orig[(y * w + (x + 1)) * 4 + c]) *
              0.25;
            const sharpened = center + amount * (center - blur) * 1.8;
            data[i + c] = Math.min(255, Math.max(0, Math.round(sharpened)));
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Renders a single biometric photo according to exact millimeter & DPI specifications.
 * Automatically zooms and aligns the detected face so that:
 * - Skull crown to chin tip = settings.faceSizeMm (e.g. 34 mm on a 50x60 mm photo)
 * - Eye line = settings.eyeFromBottomMm from the bottom edge
 * - Horizontal center = landmarks.centerX
 */
export function renderSingleBiometricPhoto(
  session: PhotoSession,
  img: HTMLImageElement,
  watermarkImg: HTMLImageElement | null,
  options?: { renderBefore?: boolean; previewScale?: number }
): HTMLCanvasElement {
  const s = session.settings;
  const dpi = s.dpi || 300;
  const scaleFactor = options?.previewScale ?? 1;
  const targetW = Math.max(120, Math.round((s.widthMm / 25.4) * dpi * scaleFactor));
  const targetH = Math.max(120, Math.round((s.heightMm / 25.4) * dpi * scaleFactor));

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d')!;

  const lm = session.landmarks;
  const srcFaceHeightPx = Math.max(12, (lm.chinLineY - lm.headTopY) * img.naturalHeight);
  const dstFaceHeightPx = (s.faceSizeMm / s.heightMm) * targetH;
  const zoom = dstFaceHeightPx / srcFaceHeightPx;

  const srcEyeX = lm.centerX * img.naturalWidth;
  const srcEyeY = lm.eyeLineY * img.naturalHeight;

  const dstEyeX = targetW * 0.5 + (s.hOffsetMm / s.widthMm) * targetW;
  const dstEyeY = targetH * (1 - (s.eyeFromBottomMm + s.vOffsetMm) / s.heightMm);

  const totalAngleRad = ((-lm.tiltDeg + s.rotationDeg) * Math.PI) / 180;

  if (options?.renderBefore) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.save();
    ctx.translate(dstEyeX, dstEyeY);
    ctx.rotate(totalAngleRad);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -srcEyeX, -srcEyeY);
    ctx.restore();
    return out;
  }

  const subjectCanvas = document.createElement('canvas');
  subjectCanvas.width = targetW;
  subjectCanvas.height = targetH;
  const sCtx = subjectCanvas.getContext('2d')!;

  sCtx.save();
  sCtx.translate(dstEyeX, dstEyeY);
  sCtx.rotate(totalAngleRad);
  sCtx.scale(zoom, zoom);
  sCtx.drawImage(img, -srcEyeX, -srcEyeY);
  sCtx.restore();

  if (s.removeBg) {
    const maskAligned = document.createElement('canvas');
    maskAligned.width = targetW;
    maskAligned.height = targetH;
    const mCtx = maskAligned.getContext('2d')!;

    if (session.fgMaskCanvas) {
      mCtx.save();
      mCtx.translate(dstEyeX, dstEyeY);
      mCtx.rotate(totalAngleRad);
      mCtx.scale(zoom, zoom);
      mCtx.drawImage(
        session.fgMaskCanvas,
        0,
        0,
        session.fgMaskCanvas.width,
        session.fgMaskCanvas.height,
        -srcEyeX,
        -srcEyeY,
        img.naturalWidth,
        img.naturalHeight
      );
      mCtx.restore();
    } else {
      mCtx.fillStyle = '#FFFFFF';
      mCtx.fillRect(0, 0, targetW, targetH);
    }

    const effectiveMask = buildEffectiveMaskCanvas(
      maskAligned,
      session.brushStrokes,
      targetW,
      targetH
    );

    sCtx.save();
    sCtx.globalCompositeOperation = 'destination-in';
    sCtx.drawImage(effectiveMask, 0, 0);
    sCtx.restore();
  }

  applyRetouchAndAdjustments(
    subjectCanvas,
    s.retouchEnabled,
    s.retouchStrength,
    s.adjustmentsEnabled,
    s.adjustments
  );

  applyLiquifyStrokesToCanvas(subjectCanvas, session.liquifyStrokes);

  ctx.fillStyle = s.removeBg ? s.bgColor : '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(subjectCanvas, 0, 0);

  if (s.watermarkEnabled && watermarkImg && s.watermarkPosition === 'inside') {
    drawCornerWatermark(
      ctx,
      watermarkImg,
      0,
      0,
      targetW,
      targetH,
      s.widthMm,
      s.watermarkCorner,
      s.watermarkSizeMm,
      s.watermarkGapMm
    );
  }

  if (s.archiveEnabled && (s.archiveNumber.trim() || s.archiveIncludeDate)) {
    drawArchiveStamp(ctx, targetW, targetH, s);
  }

  return out;
}

const watermarkBoundsCache = new WeakMap<
  HTMLImageElement,
  { sx: number; sy: number; sw: number; sh: number }
>();

function getTightWatermarkBounds(img: HTMLImageElement) {
  const cached = watermarkBoundsCache.get(img);
  if (cached) return cached;

  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX >= minX && maxY >= minY) {
      const bounds = {
        sx: minX,
        sy: minY,
        sw: Math.max(1, maxX - minX + 1),
        sh: Math.max(1, maxY - minY + 1),
      };
      watermarkBoundsCache.set(img, bounds);
      return bounds;
    }
  } catch {
    // Fallback to full image dimensions
  }

  const fallback = { sx: 0, sy: 0, sw: w, sh: h };
  watermarkBoundsCache.set(img, fallback);
  return fallback;
}

function getWatermarkDimensionsPx(
  watermarkImg: HTMLImageElement,
  sizeMm: number,
  pxPerMm: number
) {
  const bounds = getTightWatermarkBounds(watermarkImg);
  const aspect = bounds.sh / Math.max(1, bounds.sw);
  // Treat sizeMm as the maximum bounding dimension so circular/tall logos never blow up
  const maxPx = Math.max(12, sizeMm * pxPerMm);
  let wmW = maxPx;
  let wmH = maxPx * aspect;
  if (wmH > maxPx) {
    wmH = maxPx;
    wmW = maxPx / Math.max(0.1, aspect);
  }
  return { bounds, wmW, wmH };
}

function drawCornerWatermark(
  ctx: CanvasRenderingContext2D,
  watermarkImg: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  refWidthMm: number,
  corner: CornerPosition,
  sizeMm: number,
  gapMm: number
) {
  const pxPerMm = boxW / refWidthMm;
  const { bounds, wmW, wmH } = getWatermarkDimensionsPx(watermarkImg, sizeMm, pxPerMm);
  const gapPx = gapMm * pxPerMm;

  let x = boxX + gapPx;
  let y = boxY + gapPx;
  if (corner.includes('right')) x = boxX + boxW - wmW - gapPx;
  if (corner.includes('bottom')) y = boxY + boxH - wmH - gapPx;

  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.drawImage(
    watermarkImg,
    bounds.sx,
    bounds.sy,
    bounds.sw,
    bounds.sh,
    x,
    y,
    wmW,
    wmH
  );
  ctx.restore();
}

/**
 * Draws the watermark strictly OUTSIDE the photo boundary (below bottom edge or above top edge)
 */
function drawOutsideWatermark(
  ctx: CanvasRenderingContext2D,
  watermarkImg: HTMLImageElement,
  photoX: number,
  photoY: number,
  photoW: number,
  photoH: number,
  refWidthMm: number,
  corner: CornerPosition,
  sizeMm: number,
  gapMm: number
) {
  const pxPerMm = photoW / refWidthMm;
  const { bounds, wmW, wmH } = getWatermarkDimensionsPx(watermarkImg, sizeMm, pxPerMm);
  const gapPx = Math.max(2, gapMm * pxPerMm);
  const sideInsetPx = Math.max(2, 1.5 * pxPerMm);

  const x = corner.includes('right')
    ? photoX + photoW - wmW - sideInsetPx
    : photoX + sideInsetPx;

  // Place completely outside the photo: below bottom edge or above top edge
  const y = corner.includes('top')
    ? photoY - wmH - gapPx
    : photoY + photoH + gapPx;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(
    watermarkImg,
    bounds.sx,
    bounds.sy,
    bounds.sw,
    bounds.sh,
    x,
    y,
    wmW,
    wmH
  );
  ctx.restore();
}

function drawArchiveStamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: SessionSettings
) {
  const parts: string[] = [];
  if (s.archiveNumber.trim()) parts.push(`#${s.archiveNumber.trim()}`);
  if (s.archiveIncludeDate) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    parts.push(`${dd}.${mm}.${yyyy}`);
  }
  const text = parts.join(' · ');
  if (!text) return;

  const pxPerMm = w / s.widthMm;
  const fontSizePx = Math.max(9, Math.round(s.archiveSizePt * 0.3527 * pxPerMm));
  const padPx = Math.max(4, Math.round(1.6 * pxPerMm));

  ctx.save();
  ctx.font = `600 ${fontSizePx}px "JetBrains Mono", monospace`;
  ctx.fillStyle = s.archiveColor || '#334155';
  ctx.textBaseline = s.archiveCorner.includes('top') ? 'top' : 'bottom';
  ctx.textAlign = s.archiveCorner.includes('left') ? 'left' : 'right';

  const x = s.archiveCorner.includes('left') ? padPx : w - padPx;
  const y = s.archiveCorner.includes('top') ? padPx : h - padPx;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface SheetLayoutSummary {
  canvas: HTMLCanvasElement;
  paperWmm: number;
  paperHmm: number;
  cols: number;
  rows: number;
  maxCapacity: number;
  renderedCount: number;
  fitsOnPaper: boolean;
}

/**
 * Helper to compute how many photos fit on (paperWmm x paperHmm) for a given cell size (cellW x cellH)
 * Automatically clamps gap if `cols * cellW <= paperWmm` so e.g. two 50mm photos always fit on 100mm paper!
 */
function computeGridForCell(
  paperWmm: number,
  paperHmm: number,
  cellWmm: number,
  cellHmm: number,
  requestedGapX: number,
  requestedGapY: number
) {
  // Pure geometric count without gap
  const maxRawCols = Math.floor((paperWmm + 0.01) / cellWmm);
  const maxRawRows = Math.floor((paperHmm + 0.01) / cellHmm);

  if (maxRawCols <= 0 || maxRawRows <= 0) {
    return { cols: 0, rows: 0, effGapX: 0, effGapY: 0, capacity: 0 };
  }

  // Clamp gap so user-selected gap never drops a column/row that physically fits on the sheet
  const availExtraW = Math.max(0, paperWmm - maxRawCols * cellWmm);
  const availExtraH = Math.max(0, paperHmm - maxRawRows * cellHmm);

  const effGapX =
    maxRawCols > 1 ? Math.min(requestedGapX, availExtraW / (maxRawCols - 1)) : 0;
  const effGapY =
    maxRawRows > 1 ? Math.min(requestedGapY, availExtraH / (maxRawRows - 1)) : 0;

  return {
    cols: maxRawCols,
    rows: maxRawRows,
    effGapX,
    effGapY,
    capacity: maxRawCols * maxRawRows,
  };
}

/**
 * Renders the Print Sheet with multiple biometric photos, cutting lines, and studio watermark.
 * Evaluates both upright and 90°-rotated photo placement so 10x15 cm (100x150 / 150x100 mm)
 * ALWAYS fits 4 photos of 50x60 mm (2x2)!
 */
export function renderPrintSheet(
  session: PhotoSession,
  singlePhotoCanvas: HTMLImageElement | HTMLCanvasElement,
  watermarkImg: HTMLImageElement | null,
  options?: { previewScale?: number }
): SheetLayoutSummary {
  const s = session.settings;
  const dpi = s.dpi || 300;
  const scaleFactor = options?.previewScale ?? 1;

  const rawW = s.paperWidthMm;
  const rawH = s.paperHeightMm;
  const paperWmm =
    s.orientation === 'landscape' ? Math.max(rawW, rawH) : Math.min(rawW, rawH);
  const paperHmm =
    s.orientation === 'landscape' ? Math.min(rawW, rawH) : Math.max(rawW, rawH);

  const pxPerMm = (dpi / 25.4) * scaleFactor;
  const sheetW = Math.max(200, Math.round(paperWmm * pxPerMm));
  const sheetH = Math.max(200, Math.round(paperHmm * pxPerMm));

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = s.pageBackground || '#FFFFFF';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const hasOutsideWm =
    Boolean(s.watermarkEnabled && watermarkImg && s.watermarkPosition === 'outside');

  // When watermark is placed outside the photo, ensure enough vertical gap between rows
  // so Row 1's outside logo sits cleanly in the white space between Row 1 and Row 2
  let minOutsideGapY = 0;
  if (hasOutsideWm && watermarkImg) {
    const { wmH } = getWatermarkDimensionsPx(watermarkImg, s.watermarkSizeMm, pxPerMm);
    const wmHmm = wmH / pxPerMm;
    minOutsideGapY = wmHmm + s.watermarkGapMm * 2 + 1.2;
  }

  const gapXReq = s.gapHorizontalMm;
  const baseGapYReq = s.gapLinked ? s.gapHorizontalMm : s.gapVerticalMm;
  const gapYReq = Math.max(baseGapYReq, minOutsideGapY);

  // Test upright vs 90°-rotated cell placement on the chosen paper orientation
  const uprightGrid = computeGridForCell(
    paperWmm,
    paperHmm,
    s.widthMm,
    s.heightMm,
    gapXReq,
    gapYReq
  );
  const rotatedGrid = computeGridForCell(
    paperWmm,
    paperHmm,
    s.heightMm,
    s.widthMm,
    gapXReq,
    gapYReq
  );

  const rotateCell = rotatedGrid.capacity > uprightGrid.capacity;
  const chosenGrid = rotateCell ? rotatedGrid : uprightGrid;

  const cellWmm = rotateCell ? s.heightMm : s.widthMm;
  const cellHmm = rotateCell ? s.widthMm : s.heightMm;
  const { cols, rows, effGapX, effGapY, capacity: maxCapacity } = chosenGrid;

  if (maxCapacity === 0) {
    return {
      canvas,
      paperWmm,
      paperHmm,
      cols: 0,
      rows: 0,
      maxCapacity: 0,
      renderedCount: 0,
      fitsOnPaper: false,
    };
  }

  const requestedCount =
    s.photoCountMode === 'auto'
      ? maxCapacity
      : Math.min(maxCapacity, Math.max(1, s.photoCountMode));

  const activeCols = Math.min(cols, requestedCount);
  const activeRows = Math.ceil(requestedCount / activeCols);

  const gridWmm = activeCols * cellWmm + (activeCols - 1) * effGapX;
  const gridHmm = activeRows * cellHmm + (activeRows - 1) * effGapY;

  const startXmm = (paperWmm - gridWmm) / 2;
  // Shift grid slightly upward/downward if outside watermark is on bottom/top so outer margin fits it nicely
  let startYmm = (paperHmm - gridHmm) / 2;
  if (hasOutsideWm && minOutsideGapY > 0) {
    const spareY = Math.max(0, paperHmm - gridHmm);
    if (s.watermarkCorner.includes('bottom')) {
      startYmm = Math.max(2, Math.min(startYmm, spareY - minOutsideGapY));
    } else {
      startYmm = Math.min(spareY - 2, Math.max(startYmm, minOutsideGapY));
    }
  }

  const cellWpx = Math.round(cellWmm * pxPerMm);
  const cellHpx = Math.round(cellHmm * pxPerMm);

  const cellsToDraw: Array<{ xPx: number; yPx: number }> = [];
  let drawn = 0;
  for (let r = 0; r < activeRows; r++) {
    for (let c = 0; c < activeCols; c++) {
      if (drawn >= requestedCount) break;
      const xMm = startXmm + c * (cellWmm + effGapX);
      const yMm = startYmm + r * (cellHmm + effGapY);
      const xPx = Math.round(xMm * pxPerMm);
      const yPx = Math.round(yMm * pxPerMm);
      cellsToDraw.push({ xPx, yPx });
      drawn++;
    }
  }

  // Pass 1: Draw photos and cutting lines
  for (const { xPx, yPx } of cellsToDraw) {
    if (rotateCell) {
      ctx.save();
      ctx.translate(xPx + cellWpx / 2, yPx + cellHpx / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(singlePhotoCanvas, -cellHpx / 2, -cellWpx / 2, cellHpx, cellWpx);
      ctx.restore();
    } else {
      ctx.drawImage(singlePhotoCanvas, xPx, yPx, cellWpx, cellHpx);
    }

    if (s.cuttingLinesEnabled && s.cuttingStyle !== 'none') {
      drawCuttingGuides(
        ctx,
        xPx,
        yPx,
        cellWpx,
        cellHpx,
        s.cuttingStyle,
        s.cuttingThicknessPx,
        Math.round(s.cuttingGapMm * pxPerMm),
        s.cuttingColor
      );
    }
  }

  // Pass 2: Draw outside watermarks on top of paper margins so adjacent cells never clip them
  if (hasOutsideWm && watermarkImg) {
    for (const { xPx, yPx } of cellsToDraw) {
      drawOutsideWatermark(
        ctx,
        watermarkImg,
        xPx,
        yPx,
        cellWpx,
        cellHpx,
        cellWmm,
        s.watermarkCorner,
        s.watermarkSizeMm,
        s.watermarkGapMm
      );
    }
  }

  return {
    canvas,
    paperWmm,
    paperHmm,
    cols,
    rows,
    maxCapacity,
    renderedCount: drawn,
    fitsOnPaper: true,
  };
}

function drawCuttingGuides(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: 'solid' | 'dashed' | 'corners',
  thickness: number,
  gapPx: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color || '#94a3b8';
  ctx.lineWidth = Math.max(1, thickness);

  const rx = x - gapPx;
  const ry = y - gapPx;
  const rw = w + gapPx * 2;
  const rh = h + gapPx * 2;

  if (style === 'solid') {
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
  } else if (style === 'dashed') {
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
  } else if (style === 'corners') {
    const len = Math.max(8, Math.round(Math.min(rw, rh) * 0.08));
    ctx.beginPath();
    ctx.moveTo(rx, ry + len);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + len, ry);
    ctx.moveTo(rx + rw - len, ry);
    ctx.lineTo(rx + rw, ry);
    ctx.lineTo(rx + rw, ry + len);
    ctx.moveTo(rx + rw, ry + rh - len);
    ctx.lineTo(rx + rw, ry + rh);
    ctx.lineTo(rx + rw - len, ry + rh);
    ctx.moveTo(rx + len, ry + rh);
    ctx.lineTo(rx, ry + rh);
    ctx.lineTo(rx, ry + rh - len);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders the Straightened Original ("Original (Ausrichtung korrigiert)")
 */
export function renderStraightenedOriginal(
  session: PhotoSession,
  img: HTMLImageElement
): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const angleRad =
    ((-session.landmarks.tiltDeg + session.settings.rotationDeg) * Math.PI) / 180;
  const absSin = Math.abs(Math.sin(angleRad));
  const autoScale = 1 + absSin * Math.max(w / h, h / w) * 0.45;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angleRad);
  ctx.scale(autoScale, autoScale);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();

  return canvas;
}

/**
 * Generates a realistic synthetic studio portrait DataURL for instant 1-click testing.
 */
export function createSampleStudioPortrait(variant: 1 | 2 = 1): string {
  const w = 900;
  const h = 1150;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, variant === 1 ? '#cbd5e1' : '#bfdbfe');
  bgGrad.addColorStop(1, variant === 1 ? '#94a3b8' : '#93c5fd');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = variant === 1 ? '#1e293b' : '#0f172a';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.96, w * 0.38, h * 0.25, 0, Math.PI, 0, false);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(w * 0.41, h * 0.72);
  ctx.lineTo(w * 0.5, h * 0.92);
  ctx.lineTo(w * 0.59, h * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = variant === 1 ? '#0284c7' : '#be123c';
  ctx.beginPath();
  ctx.moveTo(w * 0.485, h * 0.77);
  ctx.lineTo(w * 0.515, h * 0.77);
  ctx.lineTo(w * 0.525, h * 0.93);
  ctx.lineTo(w * 0.475, h * 0.93);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e8b496';
  ctx.fillRect(w * 0.425, h * 0.61, w * 0.15, h * 0.15);

  ctx.fillStyle = 'rgba(140, 85, 60, 0.22)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.65, w * 0.08, h * 0.04, 0, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = variant === 1 ? '#1c1917' : '#3f271d';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.37, w * 0.21, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e5af90';
  ctx.beginPath();
  ctx.ellipse(w * 0.31, h * 0.44, w * 0.026, h * 0.048, -0.1, 0, Math.PI * 2);
  ctx.ellipse(w * 0.69, h * 0.44, w * 0.026, h * 0.048, 0.1, 0, Math.PI * 2);
  ctx.fill();

  const faceGrad = ctx.createRadialGradient(w * 0.48, h * 0.4, 20, w * 0.5, h * 0.43, w * 0.24);
  faceGrad.addColorStop(0, '#f7ccb2');
  faceGrad.addColorStop(0.75, '#ecc0a4');
  faceGrad.addColorStop(1, '#dcab8b');
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.43, w * 0.185, h * 0.235, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = variant === 1 ? '#1c1917' : '#3f271d';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.22, w * 0.19, h * 0.085, 0, Math.PI, 0, false);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.26, w * 0.188, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();

  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.375, h * 0.375);
  ctx.quadraticCurveTo(w * 0.42, h * 0.36, w * 0.46, h * 0.375);
  ctx.moveTo(w * 0.54, h * 0.375);
  ctx.quadraticCurveTo(w * 0.58, h * 0.36, w * 0.625, h * 0.375);
  ctx.stroke();

  const eyeY = h * 0.415;
  for (const ex of [w * 0.42, w * 0.58]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, w * 0.032, h * 0.014, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = variant === 1 ? '#3b281e' : '#1e3a8a';
    ctx.beginPath();
    ctx.arc(ex, eyeY, w * 0.014, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(ex, eyeY, w * 0.006, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 4, eyeY - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(155, 95, 68, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.49, h * 0.505);
  ctx.quadraticCurveTo(w * 0.5, h * 0.518, w * 0.518, h * 0.505);
  ctx.stroke();

  ctx.fillStyle = '#c97b70';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.568, w * 0.052, h * 0.015, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9e544a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.448, h * 0.568);
  ctx.quadraticCurveTo(w * 0.5, h * 0.573, w * 0.552, h * 0.568);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.95);
}
