export type ColorBandKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta';

export interface HSLBandAdjustment {
  hue: number;        // -100 .. 100
  saturation: number; // -100 .. 100
  luminance: number;  // -100 .. 100
}

export interface PhotoAdjustments {
  exposure: number;    // -100 .. 100
  contrast: number;    // -100 .. 100
  shadows: number;     // -100 .. 100
  highlights: number;  // -100 .. 100
  whites: number;      // -100 .. 100
  blacks: number;      // -100 .. 100
  temperature: number; // -100 .. 100
  tint: number;        // -100 .. 100
  vibrance: number;    // -100 .. 100
  saturation: number;  // -100 .. 100
  sharpness: number;   // 0 .. 100
  hslBands: Record<ColorBandKey, HSLBandAdjustment>;
}

export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CuttingLineStyle = 'solid' | 'dashed' | 'corners' | 'none';
export type OrientationMode = 'portrait' | 'landscape';
export type ActiveTool = 'select' | 'pan' | 'eraser' | 'liquify';
export type ViewMode = 'photo' | 'sheet';
export type RulerUnit = 'mm' | 'in';

export interface PhotoPreset {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  variant:
    | 'biometric'
    | 'vesikalik'
    | 'miniVesikalik'
    | 'passport'
    | 'visa'
    | 'id'
    | 'military'
    | 'custom';
  widthMm: number;
  heightMm: number;
  faceSizeMm: number;
  faceMinMm: number;
  faceMaxMm: number;
  eyeFromBottomMm: number;
  defaultBgColor: string;
  dpi: number;
  builtin?: boolean;
  favorite?: boolean;
}

export interface PaperPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  builtin?: boolean;
}

export interface BrushStroke {
  id: string;
  mode: 'erase' | 'restore';
  sizePx: number;
  hardness: number; // 0..100
  opacity: number;  // 0..100
  flow: number;     // 0..100
  points: Array<{ x: number; y: number }>; // normalized 0..1 in photo space
}

export interface LiquifyStroke {
  id: string;
  mode: 'push' | 'reconstruct';
  sizePx: number;
  strength: number; // 0..100
  points: Array<{ x: number; y: number; dx: number; dy: number }>; // normalized 0..1
}

export interface FaceLandmarks {
  headTopY: number;  // normalized 0..1 of original image height
  eyeLineY: number;  // normalized 0..1 of original image height
  chinLineY: number; // normalized 0..1 of original image height
  centerX: number;   // normalized 0..1 of original image width
  faceWidthRatio?: number; // normalized 0..1 of original image width
  tiltDeg: number;   // eye-to-eye tilt angle in degrees
  manualOverride?: boolean;
}

export interface SessionSettings {
  photoPresetId: string;
  widthMm: number;
  heightMm: number;
  faceSizeMm: number;
  faceMinMm: number;
  faceMaxMm: number;
  eyeFromBottomMm: number;
  vOffsetMm: number;
  hOffsetMm: number;
  rotationDeg: number;
  dpi: number;

  // Background
  removeBg: boolean;
  bgColor: string;

  // Retouch
  retouchEnabled: boolean;
  retouchStrength: number; // 0..100

  // Adjustments
  adjustmentsEnabled: boolean;
  adjustments: PhotoAdjustments;

  // Watermark (Studio Logo)
  watermarkEnabled: boolean;
  watermarkDataUrl: string | null;
  watermarkPosition: 'inside' | 'outside';
  watermarkCorner: CornerPosition;
  watermarkSizeMm: number;
  watermarkGapMm: number;

  // Archive Number & Date
  archiveEnabled: boolean;
  archiveNumber: string;
  archiveIncludeDate: boolean;
  archiveCorner: CornerPosition;
  archiveSizePt: number;
  archiveColor: string;

  // Paper & Layout
  paperPresetId: string;
  paperWidthMm: number;
  paperHeightMm: number;
  orientation: OrientationMode;
  pageBackground: string;
  photoCountMode: 'auto' | number;
  gapHorizontalMm: number;
  gapVerticalMm: number;
  gapLinked: boolean;

  // Cutting Lines
  cuttingLinesEnabled: boolean;
  cuttingStyle: CuttingLineStyle;
  cuttingThicknessPx: number;
  cuttingGapMm: number;
  cuttingColor: string;
}

export interface UserPreset {
  id: string;
  name: string;
  builtin?: boolean;
  settings: Partial<SessionSettings>;
}

export interface PhotoSession {
  id: string;
  name: string;
  originalDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  status: 'detecting' | 'bg-removing' | 'retouching' | 'ready' | 'error';
  landmarks: FaceLandmarks;
  fgMaskCanvas: HTMLCanvasElement | null;
  settings: SessionSettings;
  brushStrokes: BrushStroke[];
  brushRedoStack: BrushStroke[];
  liquifyStrokes: LiquifyStroke[];
  liquifyRedoStack: LiquifyStroke[];
}
