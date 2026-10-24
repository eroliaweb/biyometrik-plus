import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  Download,
  Printer,
  Sparkles,
  Sliders,
  Scissors,
  Layers,
  Grid,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Undo2,
  Redo2,
  Eye,
  Ruler,
  CheckCircle2,
  AlertTriangle,
  Star,
  Plus,
  Save,
  FolderUp,
  FolderDown,
  Eraser,
  Wand2,
  Move,
  MousePointer,
  Link2,
  Unlink2,
  Stamp,
  Hash,
  HelpCircle,
  Check,
  X,
} from 'lucide-react';
import {
  ActiveTool,
  BrushStroke,
  ColorBandKey,
  CuttingLineStyle,
  FaceLandmarks,
  LiquifyStroke,
  PaperPreset,
  PhotoPreset,
  PhotoSession,
  RulerUnit,
  SessionSettings,
  UserPreset,
  ViewMode,
} from './types/biometric';
import {
  BUILTIN_PAPER_PRESETS,
  BUILTIN_PHOTO_PRESETS,
  BUILTIN_USER_PRESETS,
  COLOR_BANDS,
  STUDIO_BG_COLORS,
  createDefaultAdjustments,
  createDefaultSessionSettings,
} from './data/presets';
import {
  detectBiometricLandmarks,
  generateForegroundMask,
  loadImageElement,
  renderPrintSheet,
  renderSingleBiometricPhoto,
  renderStraightenedOriginal,
} from './engine/imageProcessor';
import { DealsFeedResponse } from './types/deals';
import {
  FALLBACK_DEALS_DATA,
  fetchStudioDeals,
  filterDealsForPlacement,
  sendClientHeartbeat,
} from './engine/dealsService';
import { WelcomeScreen } from './components/WelcomeScreen';
import { StudioDealCard } from './components/StudioDealCard';

declare global {
  interface Window {
    biyometrikElectron?: {
      isElectron: boolean;
      detectFace?: (dataUrl: string) => Promise<FaceLandmarks | null>;
      saveFile: (payload: { defaultName: string; dataUrl: string }) => Promise<{ saved: boolean; filePath?: string }>;
      printPage: () => Promise<{ printed: boolean }>;
      openExternal?: (url: string) => Promise<{ opened: boolean }>;
    };
  }
}

export default function App() {
  const [photoPresets, setPhotoPresets] = useState<PhotoPreset[]>(() => {
    try {
      const saved = localStorage.getItem('bp_photo_presets_v2');
      if (saved) {
        const parsed: PhotoPreset[] = JSON.parse(saved);
        const customOnly = parsed.filter((p) => !p.builtin);
        return [...BUILTIN_PHOTO_PRESETS, ...customOnly];
      }
    } catch {}
    return BUILTIN_PHOTO_PRESETS;
  });

  const [paperPresets, setPaperPresets] = useState<PaperPreset[]>(() => {
    try {
      const saved = localStorage.getItem('bp_paper_presets_v2');
      if (saved) {
        const parsed: PaperPreset[] = JSON.parse(saved);
        const customOnly = parsed.filter((p) => !p.builtin);
        return [...BUILTIN_PAPER_PRESETS, ...customOnly];
      }
    } catch {}
    return BUILTIN_PAPER_PRESETS;
  });

  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    try {
      const saved = localStorage.getItem('bp_user_presets_v2');
      if (saved) {
        const parsed: UserPreset[] = JSON.parse(saved);
        const customOnly = parsed.filter((p) => !p.builtin);
        return [...BUILTIN_USER_PRESETS, ...customOnly];
      }
    } catch {}
    return BUILTIN_USER_PRESETS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('bp_photo_presets_v2', JSON.stringify(photoPresets));
    } catch {}
  }, [photoPresets]);

  useEffect(() => {
    try {
      localStorage.setItem('bp_paper_presets_v2', JSON.stringify(paperPresets));
    } catch {}
  }, [paperPresets]);

  useEffect(() => {
    try {
      localStorage.setItem('bp_user_presets_v2', JSON.stringify(userPresets));
    } catch {}
  }, [userPresets]);

  const [sessions, setSessions] = useState<PhotoSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('photo');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [showBefore, setShowBefore] = useState<boolean>(false);
  const [rulerUnit, setRulerUnit] = useState<RulerUnit>('mm');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'biometric' | 'retouch' | 'layout' | 'presets'>('biometric');
  const [adjSubTab, setAdjSubTab] = useState<'basic' | 'hsl'>('basic');
  const [activeHslBand, setActiveHslBand] = useState<ColorBandKey>('red');
  const [presetSearch, setPresetSearch] = useState<string>('');

  const [brushMode, setBrushMode] = useState<'erase' | 'restore'>('erase');
  const [brushSize, setBrushSize] = useState<number>(42);
  const [brushHardness, setBrushHardness] = useState<number>(45);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [brushFlow, setBrushFlow] = useState<number>(85);

  const [liquifyMode, setLiquifyMode] = useState<'push' | 'reconstruct'>('push');
  const [liquifySize, setLiquifySize] = useState<number>(56);
  const [liquifyStrength, setLiquifyStrength] = useState<number>(55);

  const [showWelcomeScreen, setShowWelcomeScreen] = useState<boolean>(true);
  const [dealsFeed, setDealsFeed] = useState<DealsFeedResponse>(FALLBACK_DEALS_DATA);
  const [isRefreshingDeals, setIsRefreshingDeals] = useState<boolean>(false);

  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [exportQuality, setExportQuality] = useState<number>(95);
  const [exportOutSheet, setExportOutSheet] = useState<boolean>(true);
  const [exportOutSingle, setExportOutSingle] = useState<boolean>(true);
  const [exportOutOriginal, setExportOutOriginal] = useState<boolean>(false);
  const [autoCloseAfterExport, setAutoCloseAfterExport] = useState<boolean>(false);
  const [newUserPresetName, setNewUserPresetName] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshDealsFeed = useCallback(async () => {
    setIsRefreshingDeals(true);
    try {
      const feed = await fetchStudioDeals();
      setDealsFeed(feed);
    } finally {
      setIsRefreshingDeals(false);
    }
  }, []);

  useEffect(() => {
    refreshDealsFeed();
  }, [refreshDealsFeed]);

  // Canlı Kullanıcı & Açık Uygulama Takibi (Heartbeat / Presence)
  useEffect(() => {
    const computeActiveScreen = () => {
      if (showWelcomeScreen) return 'welcome' as const;
      if (showExportModal) return 'export_modal' as const;
      if (activeTab === 'layout') return 'paper_tab' as const;
      if (viewMode === 'sheet') return 'studio_sheet' as const;
      return 'studio_single' as const;
    };

    const sendPing = (status: 'online' | 'offline' = 'online') => {
      sendClientHeartbeat({
        activeScreen: computeActiveScreen(),
        photosCount: sessions.length,
        status,
      });
    };

    sendPing('online');
    const timer = window.setInterval(() => sendPing('online'), 10000);

    const handleFocus = () => sendPing('online');
    const handleUnload = () => sendPing('offline');

    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [showWelcomeScreen, showExportModal, activeTab, viewMode, sessions.length]);

  const [draggingGuide, setDraggingGuide] = useState<'headTop' | 'eyeLine' | 'chinLine' | null>(null);
  const isDrawingBrushRef = useRef<boolean>(false);
  const currentBrushPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const currentLiquifyPointsRef = useRef<Array<{ x: number; y: number; dx: number; dy: number }>>([]);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printCanvasDataUrlRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const watermarkInputRef = useRef<HTMLInputElement | null>(null);
  const presetImportInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  const importPhotosFromSources = useCallback(
    async (items: Array<{ name: string; dataUrl: string }>) => {
      const createdSessions: PhotoSession[] = [];

      for (const item of items) {
        try {
          const img = await loadImageElement(item.dataUrl);
          const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          imageCacheRef.current.set(id, img);

          const landmarks = await detectBiometricLandmarks(img, item.dataUrl);
          const fgMaskCanvas = generateForegroundMask(img, landmarks);
          const settings = createDefaultSessionSettings();

          const session: PhotoSession = {
            id,
            name: item.name,
            originalDataUrl: item.dataUrl,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            status: 'ready',
            landmarks,
            fgMaskCanvas,
            settings,
            brushStrokes: [],
            brushRedoStack: [],
            liquifyStrokes: [],
            liquifyRedoStack: [],
          };
          createdSessions.push(session);
        } catch (err) {
          console.error('Fotoğraf yüklenemedi:', err);
        }
      }

      if (createdSessions.length > 0) {
        setSessions((prev) => [...prev, ...createdSessions]);
        const firstId = createdSessions[0].id;
        setActiveSessionId(firstId);
        setSelectedSessionIds([firstId]);
        setShowWelcomeScreen(false);
        showToast(
          `${createdSessions.length} fotoğraf AI yüz tespiti ile biyometrik ölçeğe yakınlaştırıldı.`
        );
      }
    },
    [showToast]
  );

  const updateActiveSession = useCallback(
    (updater: (session: PhotoSession) => PhotoSession) => {
      if (!activeSessionId) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? updater(s) : s))
      );
    },
    [activeSessionId]
  );

  const updateSettings = useCallback(
    (partial: Partial<SessionSettings>, applyToAllSelected = false) => {
      if (!activeSessionId) return;
      const targetIds =
        applyToAllSelected && selectedSessionIds.length > 1
          ? selectedSessionIds
          : [activeSessionId];

      setSessions((prev) =>
        prev.map((s) =>
          targetIds.includes(s.id)
            ? { ...s, settings: { ...s.settings, ...partial } }
            : s
        )
      );
    },
    [activeSessionId, selectedSessionIds]
  );

  const renderedSummary = useMemo(() => {
    if (!activeSession) return null;
    const img = imageCacheRef.current.get(activeSession.id);
    if (!img) return null;

    const singleCanvas = renderSingleBiometricPhoto(
      activeSession,
      img,
      watermarkImgRef.current,
      {
        renderBefore: showBefore,
        previewScale: 0.75,
      }
    );

    const sheetSummary = renderPrintSheet(
      activeSession,
      singleCanvas,
      watermarkImgRef.current,
      {
        previewScale: 0.55,
      }
    );

    return {
      singleCanvas,
      sheetSummary,
    };
  }, [activeSession, showBefore]);

  useEffect(() => {
    const dest = displayCanvasRef.current;
    if (!dest || !renderedSummary) return;

    const src =
      viewMode === 'photo'
        ? renderedSummary.singleCanvas
        : renderedSummary.sheetSummary.canvas;

    dest.width = src.width;
    dest.height = src.height;
    const ctx = dest.getContext('2d')!;
    ctx.clearRect(0, 0, dest.width, dest.height);
    ctx.drawImage(src, 0, 0);

    printCanvasDataUrlRef.current = renderedSummary.sheetSummary.canvas.toDataURL('image/png');
  }, [renderedSummary, viewMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (e.key === 'o' || e.key === 'O') {
        setViewMode('photo');
      } else if (e.key === 'p' || e.key === 'P') {
        setViewMode('sheet');
      } else if (e.key === 'e' || e.key === 'E') {
        setViewMode('photo');
        setActiveTool((prev) => (prev === 'eraser' ? 'select' : 'eraser'));
      } else if (e.key === 'w' || e.key === 'W') {
        setViewMode('photo');
        setActiveTool((prev) => (prev === 'liquify' ? 'select' : 'liquify'));
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'x' || e.key === 'X') {
        if (activeTool === 'eraser') {
          setBrushMode((m) => (m === 'erase' ? 'restore' : 'erase'));
        } else if (activeTool === 'liquify') {
          setLiquifyMode((m) => (m === 'push' ? 'reconstruct' : 'push'));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (activeTool === 'liquify') {
          handleLiquifyUndo();
        } else {
          handleBrushUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (activeTool === 'liquify') {
          handleLiquifyRedo();
        } else {
          handleBrushRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleBrushUndo = () => {
    updateActiveSession((s) => {
      if (s.brushStrokes.length === 0) return s;
      const last = s.brushStrokes[s.brushStrokes.length - 1];
      return {
        ...s,
        brushStrokes: s.brushStrokes.slice(0, -1),
        brushRedoStack: [...s.brushRedoStack, last],
      };
    });
  };

  const handleBrushRedo = () => {
    updateActiveSession((s) => {
      if (s.brushRedoStack.length === 0) return s;
      const next = s.brushRedoStack[s.brushRedoStack.length - 1];
      return {
        ...s,
        brushStrokes: [...s.brushStrokes, next],
        brushRedoStack: s.brushRedoStack.slice(0, -1),
      };
    });
  };

  const handleBrushReset = () => {
    updateActiveSession((s) => ({
      ...s,
      brushStrokes: [],
      brushRedoStack: [],
    }));
    showToast('Kenar maskesi yapay zeka varsayılanına sıfırlandı.');
  };

  const handleLiquifyUndo = () => {
    updateActiveSession((s) => {
      if (s.liquifyStrokes.length === 0) return s;
      const last = s.liquifyStrokes[s.liquifyStrokes.length - 1];
      return {
        ...s,
        liquifyStrokes: s.liquifyStrokes.slice(0, -1),
        liquifyRedoStack: [...s.liquifyRedoStack, last],
      };
    });
  };

  const handleLiquifyRedo = () => {
    updateActiveSession((s) => {
      if (s.liquifyRedoStack.length === 0) return s;
      const next = s.liquifyRedoStack[s.liquifyRedoStack.length - 1];
      return {
        ...s,
        liquifyStrokes: [...s.liquifyStrokes, next],
        liquifyRedoStack: s.liquifyRedoStack.slice(0, -1),
      };
    });
  };

  const handleLiquifyReset = () => {
    updateActiveSession((s) => ({
      ...s,
      liquifyStrokes: [],
      liquifyRedoStack: [],
    }));
    showToast('Sıvılaştırma değişiklikleri sıfırlandı.');
  };

  const getNormalizedCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pan' || e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    if (viewMode !== 'photo') return;

    const pt = getNormalizedCanvasPoint(e);
    if (activeTool === 'eraser') {
      isDrawingBrushRef.current = true;
      currentBrushPointsRef.current = [pt];
    } else if (activeTool === 'liquify') {
      isDrawingBrushRef.current = true;
      currentLiquifyPointsRef.current = [];
      lastPointerPosRef.current = pt;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawingBrushRef.current || viewMode !== 'photo') return;
    const pt = getNormalizedCanvasPoint(e);

    if (activeTool === 'eraser') {
      currentBrushPointsRef.current.push(pt);
    } else if (activeTool === 'liquify' && lastPointerPosRef.current) {
      const dx = pt.x - lastPointerPosRef.current.x;
      const dy = pt.y - lastPointerPosRef.current.y;
      if (Math.hypot(dx, dy) > 0.002) {
        currentLiquifyPointsRef.current.push({
          x: lastPointerPosRef.current.x,
          y: lastPointerPosRef.current.y,
          dx,
          dy,
        });
        lastPointerPosRef.current = pt;
      }
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (!isDrawingBrushRef.current) return;
    isDrawingBrushRef.current = false;

    if (activeTool === 'eraser' && currentBrushPointsRef.current.length > 0) {
      const newStroke: BrushStroke = {
        id: `b-${Date.now()}`,
        mode: brushMode,
        sizePx: brushSize,
        hardness: brushHardness,
        opacity: brushOpacity,
        flow: brushFlow,
        points: [...currentBrushPointsRef.current],
      };
      currentBrushPointsRef.current = [];
      updateActiveSession((s) => ({
        ...s,
        brushStrokes: [...s.brushStrokes, newStroke],
        brushRedoStack: [],
      }));
    } else if (activeTool === 'liquify' && currentLiquifyPointsRef.current.length > 0) {
      const newStroke: LiquifyStroke = {
        id: `l-${Date.now()}`,
        mode: liquifyMode,
        sizePx: liquifySize,
        strength: liquifyStrength,
        points: [...currentLiquifyPointsRef.current],
      };
      currentLiquifyPointsRef.current = [];
      updateActiveSession((s) => ({
        ...s,
        liquifyStrokes: [...s.liquifyStrokes, newStroke],
        liquifyRedoStack: [],
      }));
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingGuide || !activeSession || !displayCanvasRef.current) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const relY = Math.min(0.95, Math.max(0.04, (e.clientY - rect.top) / rect.height));
    const s = activeSession.settings;

    if (draggingGuide === 'eyeLine') {
      const newEyeFromBottomMm = Number(((1 - relY) * s.heightMm - s.vOffsetMm).toFixed(1));
      updateSettings({
        eyeFromBottomMm: Math.max(8, Math.min(s.heightMm - 6, newEyeFromBottomMm)),
      });
    } else if (draggingGuide === 'headTop') {
      const eyeYRatio = 1 - (s.eyeFromBottomMm + s.vOffsetMm) / s.heightMm;
      const chinYRatio =
        eyeYRatio +
        ((s.faceSizeMm / s.heightMm) *
          (activeSession.landmarks.chinLineY - activeSession.landmarks.eyeLineY)) /
          Math.max(0.05, activeSession.landmarks.chinLineY - activeSession.landmarks.headTopY);
      const newFaceSizeMm = Number(
        (Math.max(0.15, chinYRatio - relY) * s.heightMm).toFixed(1)
      );
      updateSettings({ faceSizeMm: Math.max(8, Math.min(s.heightMm - 4, newFaceSizeMm)) });
    } else if (draggingGuide === 'chinLine') {
      const eyeYRatio = 1 - (s.eyeFromBottomMm + s.vOffsetMm) / s.heightMm;
      const headTopRatio =
        eyeYRatio -
        ((s.faceSizeMm / s.heightMm) *
          (activeSession.landmarks.eyeLineY - activeSession.landmarks.headTopY)) /
          Math.max(0.05, activeSession.landmarks.chinLineY - activeSession.landmarks.headTopY);
      const newFaceSizeMm = Number(
        (Math.max(0.15, relY - headTopRatio) * s.heightMm).toFixed(1)
      );
      updateSettings({ faceSizeMm: Math.max(8, Math.min(s.heightMm - 4, newFaceSizeMm)) });
    }
  };

  const handleSelectPhotoPreset = (preset: PhotoPreset) => {
    updateSettings(
      {
        photoPresetId: preset.id,
        widthMm: preset.widthMm,
        heightMm: preset.heightMm,
        faceSizeMm: preset.faceSizeMm,
        faceMinMm: preset.faceMinMm,
        faceMaxMm: preset.faceMaxMm,
        eyeFromBottomMm: preset.eyeFromBottomMm,
        bgColor: preset.defaultBgColor,
        dpi: preset.dpi,
        vOffsetMm: 0,
        hOffsetMm: 0,
      },
      true
    );
    showToast(`"${preset.name}" ölçüsü uygulandı.`);
  };

  const handleSelectPaperPreset = (paper: PaperPreset) => {
    updateSettings(
      {
        paperPresetId: paper.id,
        paperWidthMm: paper.widthMm,
        paperHeightMm: paper.heightMm,
      },
      true
    );
    showToast(`"${paper.name}" kağıt şablonu seçildi.`);
  };

  const handleApplyUserPreset = (up: UserPreset) => {
    updateSettings(up.settings, true);
    showToast(`"${up.name}" stüdyo şablonu tüm ayarlarıyla uygulandı.`);
  };

  const handleSaveUserPreset = () => {
    if (!activeSession || !newUserPresetName.trim()) return;
    const newPreset: UserPreset = {
      id: `up-${Date.now()}`,
      name: newUserPresetName.trim(),
      builtin: false,
      settings: { ...activeSession.settings },
    };
    setUserPresets((prev) => [...prev, newPreset]);
    setNewUserPresetName('');
    showToast(`"${newPreset.name}" şablonlara kaydedildi.`);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const readers: Array<Promise<{ name: string; dataUrl: string }>> = [];
    Array.from(files).forEach((file) => {
      readers.push(
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
      );
    });
    Promise.all(readers).then((items) => importPhotosFromSources(items));
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const img = await loadImageElement(dataUrl);
      watermarkImgRef.current = img;
      const curSize = activeSession?.settings.watermarkSizeMm ?? 6;
      updateSettings(
        {
          watermarkEnabled: true,
          watermarkDataUrl: dataUrl,
          watermarkSizeMm: curSize >= 10 ? 6 : curSize,
        },
        true
      );
      showToast('Stüdyo filigran logosu yüklendi.');
    };
    reader.readAsDataURL(file);
  };

  const triggerDownload = async (filename: string, dataUrl: string) => {
    if (window.biyometrikElectron?.isElectron) {
      await window.biyometrikElectron.saveFile({ defaultName: filename, dataUrl });
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRunExport = async (alsoPrint = false) => {
    const targets =
      selectedSessionIds.length > 1
        ? sessions.filter((s) => selectedSessionIds.includes(s.id))
        : activeSession
        ? [activeSession]
        : [];

    if (targets.length === 0) return;

    const mime =
      exportFormat === 'png'
        ? 'image/png'
        : exportFormat === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
    const quality = exportQuality / 100;

    for (const sess of targets) {
      const img = imageCacheRef.current.get(sess.id);
      if (!img) continue;
      const baseName = sess.name.replace(/\.[^.]+$/, '');

      const fullSingle = renderSingleBiometricPhoto(
        sess,
        img,
        watermarkImgRef.current,
        { previewScale: 1 }
      );

      if (exportOutSingle) {
        await triggerDownload(
          `${baseName}_Tekli_${sess.settings.widthMm}x${sess.settings.heightMm}mm.${ext}`,
          fullSingle.toDataURL(mime, quality)
        );
      }

      if (exportOutSheet) {
        const fullSheet = renderPrintSheet(sess, fullSingle, watermarkImgRef.current, {
          previewScale: 1,
        });
        await triggerDownload(
          `${baseName}_Baski_${fullSheet.paperWmm}x${fullSheet.paperHmm}mm.${ext}`,
          fullSheet.canvas.toDataURL(mime, quality)
        );
      }

      if (exportOutOriginal) {
        const origStraight = renderStraightenedOriginal(sess, img);
        await triggerDownload(
          `${baseName}_Orijinal_Hizali.${ext}`,
          origStraight.toDataURL(mime, quality)
        );
      }
    }

    if (alsoPrint) {
      if (window.biyometrikElectron?.isElectron) {
        await window.biyometrikElectron.printPage();
      } else {
        window.print();
      }
    }

    if (autoCloseAfterExport && targets.length > 0) {
      const closedIds = targets.map((t) => t.id);
      setSessions((prev) => {
        const remaining = prev.filter((p) => !closedIds.includes(p.id));
        setActiveSessionId(remaining[0]?.id ?? null);
        return remaining;
      });
    }

    setShowExportModal(false);
    showToast(`${targets.length} fotoğraf başarıyla dışa aktarıldı.`);
  };

  const guidePositions = useMemo(() => {
    if (!activeSession) return null;
    const s = activeSession.settings;
    const lm = activeSession.landmarks;
    const eyeYRatio = 1 - (s.eyeFromBottomMm + s.vOffsetMm) / s.heightMm;
    const srcSpan = Math.max(0.05, lm.chinLineY - lm.headTopY);
    const topShare = (lm.eyeLineY - lm.headTopY) / srcSpan;
    const bottomShare = (lm.chinLineY - lm.eyeLineY) / srcSpan;
    const faceRatio = s.faceSizeMm / s.heightMm;

    const headTopPct = Math.max(2, Math.min(95, (eyeYRatio - faceRatio * topShare) * 100));
    const eyeLinePct = Math.max(5, Math.min(95, eyeYRatio * 100));
    const chinLinePct = Math.max(10, Math.min(98, (eyeYRatio + faceRatio * bottomShare) * 100));
    const inRange = s.faceSizeMm >= s.faceMinMm && s.faceSizeMm <= s.faceMaxMm;

    return {
      headTopPct,
      eyeLinePct,
      chinLinePct,
      inRange,
    };
  }, [activeSession]);

  const filteredPhotoPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    if (!q) return photoPresets;
    return photoPresets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        `${p.widthMm}x${p.heightMm}`.includes(q)
    );
  }, [photoPresets, presetSearch]);

  const formatRulerValue = (mm: number) => {
    if (rulerUnit === 'in') {
      return `${(mm / 25.4).toFixed(2)} in`;
    }
    return `${mm} mm`;
  };

  return (
    <div
      className="flex flex-col h-screen w-screen bg-slate-100 text-slate-900 select-none overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFilesSelected(e.dataTransfer.files);
      }}
    >
      {/* Hidden Print Target */}
      <div id="biyometrik-print-target" className="hidden">
        {printCanvasDataUrlRef.current && (
          <img
            src={printCanvasDataUrlRef.current}
            alt="BiyometrikPlus Baskı Sayfası"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        )}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/tiff"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={watermarkInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={handleWatermarkUpload}
      />
      <input
        ref={presetImportInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const imported = JSON.parse(String(reader.result));
              if (Array.isArray(imported)) {
                setUserPresets((prev) => [...prev, ...imported]);
                showToast(`${imported.length} şablon başarıyla içe aktarıldı.`);
              }
            } catch {
              showToast('Geçersiz şablon dosyası.');
            }
          };
          reader.readAsText(file);
        }}
      />

      {showWelcomeScreen ? (
        <WelcomeScreen
          settings={dealsFeed.settings}
          deals={filterDealsForPlacement(dealsFeed.deals, 'welcome')}
          onStartStudio={() => setShowWelcomeScreen(false)}
          onSelectFiles={() => fileInputRef.current?.click()}
          onFilesDropped={(files) => handleFilesSelected(files)}
          onRefreshDeals={refreshDealsFeed}
        />
      ) : (
        <>
      {/* TOP STUDIO HEADER BAR (LIGHT MODE) */}
      <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between gap-4 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowWelcomeScreen(true)}
            title="Açılış Ekranı"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 hover:scale-105 transition"
          >
            <Camera className="w-5 h-5 text-white stroke-[2.2]" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-base text-slate-900">
                Biyometrik<span className="text-emerald-600">Plus</span>
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                STÜDYO PRO · LİSANSSIZ TAM SÜRÜM
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              AI Biyometrik Hizalama, Arka Plan Silme, Rötuş ve Çoklu Baskı Dizilimi
            </p>
          </div>
        </div>

        {/* Center View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('photo')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              viewMode === 'photo'
                ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Fotoğraf Önizleme</span>
            <kbd className="text-[10px] opacity-80 font-mono px-1 rounded bg-black/15">O</kbd>
          </button>
          <button
            onClick={() => setViewMode('sheet')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
              viewMode === 'sheet'
                ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Baskı Düzeni</span>
            <kbd className="text-[10px] opacity-80 font-mono px-1 rounded bg-black/15">P</kbd>
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuides((g) => !g)}
            title="Biyometrik Kılavuz Çizgilerini Göster/Gizle"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition font-medium ${
              showGuides
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Kılavuzlar</span>
          </button>

          <button
            onMouseDown={() => setShowBefore(true)}
            onMouseUp={() => setShowBefore(false)}
            onMouseLeave={() => setShowBefore(false)}
            onClick={() => setShowBefore((b) => !b)}
            title="Önce / Sonra Karşılaştır"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition font-medium ${
              showBefore
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showBefore ? 'ÖNCE (Orijinal)' : 'Önce / Sonra'}</span>
          </button>

          <button
            onClick={() => setShowShortcutsModal(true)}
            title="Klavye Kısayolları & Rehber"
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            disabled={!activeSession}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition disabled:opacity-40"
          >
            <Download className="w-4 h-4 stroke-[2.2]" />
            <span>
              {selectedSessionIds.length > 1
                ? `${selectedSessionIds.length} Fotoğrafı Kaydet / Yazdır`
                : 'Kaydet / Yazdır'}
            </span>
          </button>
        </div>
      </header>

      {/* MAIN STUDIO WORKSPACE */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT SIDEBAR (LIGHT MODE) */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-200">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition"
            >
              <Upload className="w-4 h-4" />
              <span>Fotoğraf Aç / Sürükle</span>
            </button>
          </div>

          {/* Studio Tools */}
          <div className="p-3 border-b border-slate-200">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
              <span>Stüdyo Araçları</span>
              <span className="font-mono text-[10px] text-slate-400">V · H · E · W</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setActiveTool('select')}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border transition ${
                  activeTool === 'select'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Seçim / Hizala</span>
              </button>

              <button
                onClick={() => setActiveTool('pan')}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border transition ${
                  activeTool === 'pan'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Kaydır (Pan)</span>
              </button>

              <button
                onClick={() => {
                  setViewMode('photo');
                  setActiveTool('eraser');
                }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border transition ${
                  activeTool === 'eraser'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Kenar Fırçası</span>
              </button>

              <button
                onClick={() => {
                  setViewMode('photo');
                  setActiveTool('liquify');
                }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border transition ${
                  activeTool === 'liquify'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Sıvılaştır</span>
              </button>
            </div>
          </div>

          {/* Sessions List */}
          <div className="px-3 pt-2.5 pb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-semibold uppercase tracking-wider">
              Açık Fotoğraflar ({sessions.length})
            </span>
            {sessions.length > 1 && (
              <button
                onClick={() => setSelectedSessionIds(sessions.map((s) => s.id))}
                className="text-emerald-600 hover:underline text-[10px] font-medium"
              >
                Tümünü Seç
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {sessions.map((s) => {
              const isSelected = selectedSessionIds.includes(s.id);
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={(e) => {
                    setActiveSessionId(s.id);
                    if (e.ctrlKey || e.metaKey) {
                      setSelectedSessionIds((prev) =>
                        prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                      );
                    } else if (e.shiftKey && activeSessionId) {
                      setSelectedSessionIds(sessions.map((item) => item.id));
                    } else {
                      setSelectedSessionIds([s.id]);
                    }
                  }}
                  className={`group flex items-center gap-2.5 p-2 rounded-xl border cursor-pointer transition ${
                    isActive
                      ? 'bg-emerald-50/90 border-emerald-400 text-slate-900 shadow-sm'
                      : isSelected
                      ? 'bg-slate-100 border-slate-300 text-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={s.originalDataUrl}
                    alt={s.name}
                    className="w-11 h-14 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-100"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{s.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {s.settings.widthMm}×{s.settings.heightMm} mm · {s.settings.dpi} DPI
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-700 font-medium">Hazır</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessions((prev) => {
                        const next = prev.filter((item) => item.id !== s.id);
                        if (activeSessionId === s.id) {
                          setActiveSessionId(next[0]?.id ?? null);
                        }
                        return next;
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition"
                    title="Oturumu Kapat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Native Contextual Studio Deal in Left Sidebar (Data Backup / Storage) */}
          {filterDealsForPlacement(dealsFeed.deals, 'sidebar')[0] && (
            <div className="p-2.5 border-t border-slate-200 bg-slate-50/70">
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Stüdyo Veri Yedekleme Fırsatı
                </span>
              </div>
              <StudioDealCard
                deal={filterDealsForPlacement(dealsFeed.deals, 'sidebar')[0]}
                storeId={dealsFeed.settings.store_id}
                placement="sidebar"
                compact
              />
            </div>
          )}
        </aside>

        {/* CENTER INTERACTIVE STUDIO CANVAS (LIGHT MODE) */}
        <main className="flex-1 relative flex flex-col bg-slate-100/90 overflow-hidden">
          {viewMode === 'photo' && activeTool === 'eraser' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/95 border border-slate-300 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => setBrushMode('erase')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    brushMode === 'erase'
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kenar Sil
                </button>
                <button
                  onClick={() => setBrushMode('restore')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    brushMode === 'restore'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Geri Yükle (X)
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Boyut:</span>
                <input
                  type="range"
                  min={5}
                  max={140}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20"
                />
                <span className="font-mono text-[11px] w-7 text-slate-700">{brushSize}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Sertlik:</span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={brushHardness}
                  onChange={(e) => setBrushHardness(Number(e.target.value))}
                  className="w-20"
                />
                <span className="font-mono text-[11px] w-8 text-slate-700">{brushHardness}%</span>
              </div>

              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <button
                  onClick={handleBrushUndo}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Geri Al (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleBrushRedo}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="İleri Al (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleBrushReset}
                  className="px-2 py-1 rounded-lg hover:bg-amber-50 text-[11px] font-medium text-amber-700"
                >
                  Maskeyi Sıfırla
                </button>
              </div>
            </div>
          )}

          {viewMode === 'photo' && activeTool === 'liquify' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/95 border border-slate-300 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  onClick={() => setLiquifyMode('push')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    liquifyMode === 'push'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sıvılaştır (İt)
                </button>
                <button
                  onClick={() => setLiquifyMode('reconstruct')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    liquifyMode === 'reconstruct'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Onar (X)
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Fırça:</span>
                <input
                  type="range"
                  min={15}
                  max={160}
                  value={liquifySize}
                  onChange={(e) => setLiquifySize(Number(e.target.value))}
                  className="w-20"
                />
                <span className="font-mono text-[11px] w-7 text-slate-700">{liquifySize}</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Güç:</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={liquifyStrength}
                  onChange={(e) => setLiquifyStrength(Number(e.target.value))}
                  className="w-20"
                />
                <span className="font-mono text-[11px] w-8 text-slate-700">{liquifyStrength}%</span>
              </div>

              <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                <button
                  onClick={handleLiquifyUndo}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="Geri Al (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLiquifyRedo}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
                  title="İleri Al (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLiquifyReset}
                  className="px-2 py-1 rounded-lg hover:bg-amber-50 text-[11px] font-medium text-amber-700"
                >
                  Sıfırla
                </button>
              </div>
            </div>
          )}

          {/* Canvas Viewport */}
          <div
            className="flex-1 flex items-center justify-center relative overflow-hidden p-8"
            onMouseMove={handleOverlayMouseMove}
            onMouseUp={() => {
              setDraggingGuide(null);
              handleCanvasMouseUp();
            }}
            onWheel={(e) => {
              const delta = e.deltaY < 0 ? 0.1 : -0.1;
              setZoomLevel((z) => Math.min(3, Math.max(0.4, Number((z + delta).toFixed(2)))));
            }}
          >
            {activeSession && renderedSummary ? (
              <div
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                  transformOrigin: 'center center',
                }}
                className="relative shadow-xl transition-transform duration-75"
              >
                {/* Top Horizontal Ruler */}
                {showGuides && (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setRulerUnit((u) => (u === 'mm' ? 'in' : 'mm'));
                    }}
                    title="Birimi değiştirmek için sağ tıklayın (mm / in)"
                    className="absolute -top-7 left-0 right-0 h-6 bg-white border border-slate-300 rounded-t-lg flex items-center justify-between px-2 text-[10px] font-mono text-slate-600 cursor-pointer shadow-sm"
                  >
                    <span>0</span>
                    <span className="text-emerald-700 font-bold">
                      {viewMode === 'photo'
                        ? formatRulerValue(activeSession.settings.widthMm)
                        : formatRulerValue(renderedSummary.sheetSummary.paperWmm)}
                    </span>
                    <span>{rulerUnit}</span>
                  </div>
                )}

                {/* Left Vertical Ruler */}
                {showGuides && (
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setRulerUnit((u) => (u === 'mm' ? 'in' : 'mm'));
                    }}
                    className="absolute top-0 bottom-0 -left-8 w-7 bg-white border border-slate-300 rounded-l-lg flex flex-col items-center justify-between py-2 text-[10px] font-mono text-slate-600 cursor-pointer shadow-sm"
                  >
                    <span>0</span>
                    <span className="text-emerald-700 font-bold -rotate-90 whitespace-nowrap">
                      {viewMode === 'photo'
                        ? formatRulerValue(activeSession.settings.heightMm)
                        : formatRulerValue(renderedSummary.sheetSummary.paperHmm)}
                    </span>
                    <span>{rulerUnit}</span>
                  </div>
                )}

                {/* Main Rendered Canvas */}
                <canvas
                  ref={displayCanvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  className={`block rounded-sm ring-1 ring-slate-300 shadow-lg bg-white ${
                    activeTool === 'pan'
                      ? 'cursor-grab active:cursor-grabbing'
                      : activeTool === 'eraser' || activeTool === 'liquify'
                      ? 'cursor-crosshair'
                      : 'cursor-default'
                  }`}
                  style={{
                    maxHeight: '72vh',
                    maxWidth: '62vw',
                    width: 'auto',
                    height: 'auto',
                  }}
                />

                {/* Outside Watermark Live Preview Strip in Single Photo Mode */}
                {viewMode === 'photo' &&
                  activeSession.settings.watermarkEnabled &&
                  activeSession.settings.watermarkDataUrl &&
                  activeSession.settings.watermarkPosition === 'outside' && (
                    <div
                      className={`absolute left-0 right-0 flex items-center px-2 pointer-events-none ${
                        activeSession.settings.watermarkCorner.includes('right')
                          ? 'justify-end'
                          : 'justify-start'
                      } ${
                        activeSession.settings.watermarkCorner.includes('top')
                          ? 'bottom-full mb-1.5'
                          : 'top-full mt-1.5'
                      }`}
                    >
                      <img
                        src={activeSession.settings.watermarkDataUrl}
                        alt="Stüdyo Logosu (Fotoğraf Dışında)"
                        style={{
                          height: `${Math.max(
                            18,
                            Math.round(activeSession.settings.watermarkSizeMm * 4.2)
                          )}px`,
                          width: 'auto',
                          objectFit: 'contain',
                        }}
                        className="opacity-90 drop-shadow-sm"
                      />
                    </div>
                  )}

                {/* Before / After Badge */}
                <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-md bg-white/90 border border-slate-300 text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-700 shadow-sm pointer-events-none">
                  {showBefore ? 'ÖNCE (ORİJİNAL)' : 'SONRA (BİYOMETRİK)'}
                </div>

                {/* Draggable Biometric Guides */}
                {viewMode === 'photo' && showGuides && guidePositions && activeTool === 'select' && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l border-dashed border-emerald-600/50" />

                    {/* Head Top Line (Green) */}
                    <div
                      style={{ top: `${guidePositions.headTopPct}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingGuide('headTop');
                      }}
                      className="absolute left-0 right-0 -translate-y-1/2 h-3 flex items-center cursor-ns-resize pointer-events-auto group"
                    >
                      <div className="w-full border-t-2 border-emerald-500 shadow-sm group-hover:border-emerald-600" />
                      <span className="absolute left-2 -top-4 px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[10px] shadow">
                        Tepe Çizgisi
                      </span>
                    </div>

                    {/* Eye Line (Blue) */}
                    <div
                      style={{ top: `${guidePositions.eyeLinePct}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingGuide('eyeLine');
                      }}
                      className="absolute left-0 right-0 -translate-y-1/2 h-3 flex items-center cursor-ns-resize pointer-events-auto group"
                    >
                      <div className="w-full border-t-2 border-sky-500 shadow-sm group-hover:border-sky-600" />
                      <span className="absolute left-2 -top-4 px-1.5 py-0.5 rounded bg-sky-600 text-white font-semibold text-[10px] shadow">
                        Göz Hizası ({activeSession.settings.eyeFromBottomMm} mm)
                      </span>
                    </div>

                    {/* Chin Line (Green) */}
                    <div
                      style={{ top: `${guidePositions.chinLinePct}%` }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingGuide('chinLine');
                      }}
                      className="absolute left-0 right-0 -translate-y-1/2 h-3 flex items-center cursor-ns-resize pointer-events-auto group"
                    >
                      <div className="w-full border-t-2 border-emerald-500 shadow-sm group-hover:border-emerald-600" />
                      <span className="absolute left-2 top-1.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[10px] shadow">
                        Çene Çizgisi (Yüz: {activeSession.settings.faceSizeMm} mm)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 max-w-2xl w-full">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white rounded-3xl p-10 text-center cursor-pointer transition w-full max-w-md shadow-sm"
                >
                  <Upload className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                  <div className="text-base font-bold text-slate-900">
                    Fotoğrafları Buraya Bırakın veya Tıklayın
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    JPG · PNG · WEBP · TIFF desteklenir
                  </p>
                </div>

                {dealsFeed.deals.length > 0 && (
                  <div className="w-full bg-white/90 border border-slate-200 rounded-2xl p-3.5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-700">
                        Bu Ayın İndirimli Fotoğraf Kağıtları & Stüdyo Yedekleme Fırsatları
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {dealsFeed.deals.slice(0, 2).map((deal) => (
                        <StudioDealCard
                          key={deal.id}
                          deal={deal}
                          storeId={dealsFeed.settings.store_id}
                          placement="welcome"
                          compact
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Canvas Status & Compliance Bar (LIGHT MODE) */}
          {activeSession && renderedSummary && (
            <div className="h-11 border-t border-slate-200 bg-white px-4 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-3">
                {guidePositions?.inRange ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      Ülke Standartlarına Uygun ({activeSession.settings.faceSizeMm} mm / Hedef:{' '}
                      {activeSession.settings.faceMinMm}–{activeSession.settings.faceMaxMm} mm)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      Standart Aralığı Dışında ({activeSession.settings.faceSizeMm} mm / Önerilen:{' '}
                      {activeSession.settings.faceMinMm}–{activeSession.settings.faceMaxMm} mm)
                    </span>
                  </div>
                )}

                {viewMode === 'sheet' && (
                  <span className="text-slate-600 font-mono text-[11px] font-medium">
                    Kağıt: {renderedSummary.sheetSummary.paperWmm}×
                    {renderedSummary.sheetSummary.paperHmm} mm · Dizilim:{' '}
                    {renderedSummary.sheetSummary.renderedCount} Adet (Maks:{' '}
                    {renderedSummary.sheetSummary.maxCapacity})
                  </span>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                  title="Uzaklaştır"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-12 text-center text-slate-700 font-semibold">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.15).toFixed(2))))}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                  title="Yakınlaştır"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium flex items-center gap-1"
                  title="Ekrana Sığdır"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Sığdır</span>
                </button>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT INSPECTOR SIDEBAR (LIGHT MODE) */}
        {activeSession && (
          <aside className="w-96 border-l border-slate-200 bg-white flex flex-col shrink-0">
            <div className="grid grid-cols-4 p-1.5 gap-1 bg-slate-50 border-b border-slate-200">
              <button
                onClick={() => setActiveTab('biometric')}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition ${
                  activeTab === 'biometric'
                    ? 'bg-white text-emerald-700 border border-emerald-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Scissors className="w-4 h-4" />
                <span>Ölçü & Yüz</span>
              </button>

              <button
                onClick={() => setActiveTab('retouch')}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition ${
                  activeTab === 'retouch'
                    ? 'bg-white text-emerald-700 border border-emerald-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Fon & Rötuş</span>
              </button>

              <button
                onClick={() => setActiveTab('layout')}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition ${
                  activeTab === 'layout'
                    ? 'bg-white text-emerald-700 border border-emerald-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Kağıt & Baskı</span>
              </button>

              <button
                onClick={() => setActiveTab('presets')}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-semibold transition ${
                  activeTab === 'presets'
                    ? 'bg-white text-emerald-700 border border-emerald-300 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Şablonlar</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* TAB 1: BIOMETRIC PHOTO SIZE & FACE ALIGNMENT */}
              {activeTab === 'biometric' && (
                <>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Ülke & Belge Şablonu
                      </label>
                      <span className="text-[11px] font-mono font-bold text-emerald-700">
                        {activeSession.settings.widthMm}×{activeSession.settings.heightMm} mm
                      </span>
                    </div>

                    <input
                      type="text"
                      value={presetSearch}
                      onChange={(e) => setPresetSearch(e.target.value)}
                      placeholder="Ülke veya ölçü ara (örn. Türkiye, 50x60, Vize)..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                    />

                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {filteredPhotoPresets.map((p) => {
                        const selected = activeSession.settings.photoPresetId === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleSelectPhotoPreset(p)}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                              selected
                                ? 'bg-emerald-50 border-emerald-400 text-slate-900 font-semibold shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="truncate">{p.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Yüz: {p.faceMinMm}–{p.faceMaxMm} mm · Göz: {p.eyeFromBottomMm} mm
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotoPresets((prev) =>
                                  prev.map((item) =>
                                    item.id === p.id
                                      ? { ...item, favorite: !item.favorite }
                                      : item
                                  )
                                );
                              }}
                              className={`p-1 rounded ${
                                p.favorite ? 'text-amber-500' : 'text-slate-300 hover:text-slate-400'
                              }`}
                            >
                              <Star className="w-3.5 h-3.5 fill-current" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Photo Dimensions & DPI */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="text-xs font-bold text-slate-800">
                      Fotoğraf Boyutu & Çözünürlük
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-1">
                          Genişlik (mm)
                        </label>
                        <input
                          type="number"
                          min={20}
                          max={120}
                          value={activeSession.settings.widthMm}
                          onChange={(e) =>
                            updateSettings({ widthMm: Math.max(20, Number(e.target.value)) })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-1">
                          Yükseklik (mm)
                        </label>
                        <input
                          type="number"
                          min={20}
                          max={150}
                          value={activeSession.settings.heightMm}
                          onChange={(e) =>
                            updateSettings({ heightMm: Math.max(20, Number(e.target.value)) })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-medium block mb-1">
                          Baskı DPI
                        </label>
                        <select
                          value={activeSession.settings.dpi}
                          onChange={(e) => updateSettings({ dpi: Number(e.target.value) })}
                          className="w-full px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                        >
                          <option value={300}>300 DPI</option>
                          <option value={600}>600 DPI</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Biometric Face Proportions Sliders */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        Biyometrik Yüz & Göz Hizalama
                      </span>
                      <button
                        onClick={async () => {
                          const img = imageCacheRef.current.get(activeSession.id);
                          if (img) {
                            const lm = await detectBiometricLandmarks(
                              img,
                              activeSession.originalDataUrl
                            );
                            const fgMaskCanvas = generateForegroundMask(img, lm);
                            updateActiveSession((s) => ({
                              ...s,
                              landmarks: lm,
                              fgMaskCanvas,
                            }));
                          }
                          const preset =
                            photoPresets.find(
                              (p) => p.id === activeSession.settings.photoPresetId
                            ) || BUILTIN_PHOTO_PRESETS[0];
                          handleSelectPhotoPreset(preset);
                        }}
                        className="text-[11px] text-emerald-700 font-medium hover:underline flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>AI Hizalamayı Sıfırla</span>
                      </button>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium">
                          Yüz Büyüklüğü (Çene–Tepe)
                        </span>
                        <span className="font-mono font-bold text-emerald-700">
                          {activeSession.settings.faceSizeMm} mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={48}
                        step={0.5}
                        value={activeSession.settings.faceSizeMm}
                        onChange={(e) => updateSettings({ faceSizeMm: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium">Alttan Göz Yüksekliği</span>
                        <span className="font-mono font-bold text-sky-700">
                          {activeSession.settings.eyeFromBottomMm} mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={55}
                        step={0.5}
                        value={activeSession.settings.eyeFromBottomMm}
                        onChange={(e) =>
                          updateSettings({ eyeFromBottomMm: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium">
                          Yatay Kaydırma (H-Pozisyon)
                        </span>
                        <span className="font-mono text-slate-700">
                          {activeSession.settings.hOffsetMm} mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        step={0.5}
                        value={activeSession.settings.hOffsetMm}
                        onChange={(e) => updateSettings({ hOffsetMm: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium">Baş Eğimi / Döndürme</span>
                        <span className="font-mono text-slate-700">
                          {activeSession.settings.rotationDeg}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        step={0.5}
                        value={activeSession.settings.rotationDeg}
                        onChange={(e) => updateSettings({ rotationDeg: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: AI BACKGROUND REMOVAL, RETOUCH & ADJUSTMENTS */}
              {activeTab === 'retouch' && (
                <>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          AI Arka Plan Silme & Fon Rengi
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Arka planı otomatik temizler ve stüdyo fonu uygular
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={activeSession.settings.removeBg}
                        onChange={(e) => updateSettings({ removeBg: e.target.checked }, true)}
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>

                    {activeSession.settings.removeBg && (
                      <>
                        <div className="grid grid-cols-5 gap-2 pt-1">
                          {STUDIO_BG_COLORS.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => updateSettings({ bgColor: c.hex }, true)}
                              title={c.label}
                              className={`h-8 rounded-lg border transition flex items-center justify-center ${
                                activeSession.settings.bgColor.toLowerCase() ===
                                c.hex.toLowerCase()
                                  ? 'ring-2 ring-emerald-500 border-emerald-600 scale-105'
                                  : 'border-slate-300 hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            >
                              {activeSession.settings.bgColor.toLowerCase() ===
                                c.hex.toLowerCase() && (
                                <Check
                                  className={`w-3.5 h-3.5 ${
                                    c.id === 'black' || c.id === 'blue' || c.id === 'red'
                                      ? 'text-white'
                                      : 'text-slate-950'
                                  }`}
                                />
                              )}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-700 font-medium">
                            Özel Fon Rengi Seç:
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={activeSession.settings.bgColor}
                              onChange={(e) => updateSettings({ bgColor: e.target.value }, true)}
                              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                            />
                            <span className="font-mono text-xs text-slate-700 uppercase">
                              {activeSession.settings.bgColor}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Skin Retouching */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Akıllı Cilt Rötuşu (Retouch)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Cilt dokusunu koruyarak pürüzleri doğal biçimde yumuşatır
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={activeSession.settings.retouchEnabled}
                        onChange={(e) =>
                          updateSettings({ retouchEnabled: e.target.checked }, true)
                        }
                        className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                    </div>

                    {activeSession.settings.retouchEnabled && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-700 font-medium">Rötuş Gücü</span>
                          <span className="font-mono font-bold text-emerald-700">
                            %{activeSession.settings.retouchStrength}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={activeSession.settings.retouchStrength}
                          onChange={(e) =>
                            updateSettings({ retouchStrength: Number(e.target.value) }, true)
                          }
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>

                  {/* Tone, Light & 8-Band HSL Color Adjustments */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        Işık, Renk & HSL Ayarları
                      </span>
                      <button
                        onClick={() =>
                          updateSettings({ adjustments: createDefaultAdjustments() }, true)
                        }
                        className="text-[11px] text-emerald-700 font-medium hover:underline"
                      >
                        Tümünü Sıfırla
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setAdjSubTab('basic')}
                        className={`py-1 rounded-lg text-xs font-semibold transition ${
                          adjSubTab === 'basic'
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Temel (Işık & Renk)
                      </button>
                      <button
                        onClick={() => setAdjSubTab('hsl')}
                        className={`py-1 rounded-lg text-xs font-semibold transition ${
                          adjSubTab === 'hsl'
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        8-Bant HSL Mikser
                      </button>
                    </div>

                    {adjSubTab === 'basic' ? (
                      <div className="space-y-2.5 pt-1">
                        {(
                          [
                            ['exposure', 'Pozlama (Exposure)', -100, 100],
                            ['contrast', 'Kontrast', -100, 100],
                            ['shadows', 'Gölgeler (Shadows)', -100, 100],
                            ['highlights', 'Parlaklıklar (Highlights)', -100, 100],
                            ['whites', 'Beyazlar', -100, 100],
                            ['blacks', 'Siyahlar', -100, 100],
                            ['temperature', 'Sıcaklık (Temp)', -100, 100],
                            ['tint', 'Ton (Tint)', -100, 100],
                            ['vibrance', 'Canlılık (Vibrance)', -100, 100],
                            ['saturation', 'Doygunluk (Saturation)', -100, 100],
                            ['sharpness', 'Keskinlik (Sharpness)', 0, 100],
                          ] as const
                        ).map(([key, label, min, max]) => (
                          <div key={key}>
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className="text-slate-700 font-medium">{label}</span>
                              <span className="font-mono text-slate-600">
                                {activeSession.settings.adjustments[key]}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              value={activeSession.settings.adjustments[key]}
                              onChange={(e) =>
                                updateSettings({
                                  adjustments: {
                                    ...activeSession.settings.adjustments,
                                    [key]: Number(e.target.value),
                                  },
                                })
                              }
                              className="w-full"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-8 gap-1">
                          {COLOR_BANDS.map((b) => (
                            <button
                              key={b.key}
                              onClick={() => setActiveHslBand(b.key)}
                              title={b.label}
                              className={`h-7 rounded-lg border flex items-center justify-center transition ${
                                activeHslBand === b.key
                                  ? 'ring-2 ring-slate-900 border-white scale-105'
                                  : 'border-slate-300 opacity-75 hover:opacity-100'
                              }`}
                              style={{ backgroundColor: b.color }}
                            />
                          ))}
                        </div>

                        <div className="text-xs font-semibold text-emerald-700">
                          Seçili Kanal:{' '}
                          {COLOR_BANDS.find((c) => c.key === activeHslBand)?.label}
                        </div>

                        {(['hue', 'saturation', 'luminance'] as const).map((prop) => {
                          const labels = {
                            hue: 'Renk Tonu (Hue)',
                            saturation: 'Doygunluk (Saturation)',
                            luminance: 'Parlaklık (Luminance)',
                          };
                          const currentBand =
                            activeSession.settings.adjustments.hslBands[activeHslBand];
                          return (
                            <div key={prop}>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="text-slate-700 font-medium">{labels[prop]}</span>
                                <span className="font-mono text-slate-600">
                                  {currentBand[prop]}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={-100}
                                max={100}
                                value={currentBand[prop]}
                                onChange={(e) =>
                                  updateSettings({
                                    adjustments: {
                                      ...activeSession.settings.adjustments,
                                      hslBands: {
                                        ...activeSession.settings.adjustments.hslBands,
                                        [activeHslBand]: {
                                          ...currentBand,
                                          [prop]: Number(e.target.value),
                                        },
                                      },
                                    },
                                  })
                                }
                                className="w-full"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 3: PAPER SETTINGS, PRINT LAYOUT, CUTTING LINES, WATERMARK & ARCHIVE */}
              {activeTab === 'layout' && (
                <>
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="text-xs font-bold text-slate-900">
                      Kağıt Boyutu & Yönlendirme
                    </div>
                    <select
                      value={activeSession.settings.paperPresetId}
                      onChange={(e) => {
                        const found = paperPresets.find((p) => p.id === e.target.value);
                        if (found) handleSelectPaperPreset(found);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900"
                    >
                      {paperPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateSettings({ orientation: 'portrait' }, true)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition ${
                          activeSession.settings.orientation === 'portrait'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                            : 'bg-white border-slate-300 text-slate-600'
                        }`}
                      >
                        Dikey (Portrait)
                      </button>
                      <button
                        onClick={() => updateSettings({ orientation: 'landscape' }, true)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition ${
                          activeSession.settings.orientation === 'landscape'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                            : 'bg-white border-slate-300 text-slate-600'
                        }`}
                      >
                        Yatay (Landscape)
                      </button>
                    </div>

                    {/* Photo Count on Sheet */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-medium">
                          Sayfadaki Fotoğraf Sayısı
                        </span>
                        <span className="font-mono font-bold text-emerald-700">
                          {activeSession.settings.photoCountMode === 'auto'
                            ? `Otomatik (${renderedSummary?.sheetSummary.maxCapacity ?? 0} Adet)`
                            : `${activeSession.settings.photoCountMode} Adet (Maks: ${
                                renderedSummary?.sheetSummary.maxCapacity ?? 0
                              })`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => updateSettings({ photoCountMode: 'auto' }, true)}
                          className={`px-3 py-1.5 rounded-lg text-xs border font-semibold ${
                            activeSession.settings.photoCountMode === 'auto'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          Otomatik ({renderedSummary?.sheetSummary.maxCapacity ?? 4})
                        </button>
                        {[2, 4, 6, 8, 12].map((n) => (
                          <button
                            key={n}
                            onClick={() => updateSettings({ photoCountMode: n }, true)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
                              activeSession.settings.photoCountMode === n
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Gaps between photos */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">
                          Fotoğraf Aralığı ({activeSession.settings.gapHorizontalMm} mm)
                        </span>
                        <button
                          onClick={() =>
                            updateSettings({ gapLinked: !activeSession.settings.gapLinked })
                          }
                          className="text-emerald-700 font-medium flex items-center gap-1 text-[11px]"
                        >
                          {activeSession.settings.gapLinked ? (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Bağlı</span>
                            </>
                          ) : (
                            <>
                              <Unlink2 className="w-3.5 h-3.5" />
                              <span>Ayrı</span>
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={activeSession.settings.gapHorizontalMm}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateSettings(
                            activeSession.settings.gapLinked
                              ? { gapHorizontalMm: v, gapVerticalMm: v }
                              : { gapHorizontalMm: v }
                          );
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Native Contextual Studio Deal in Paper & Print Tab (Right below 10x15 paper settings) */}
                  {filterDealsForPlacement(dealsFeed.deals, 'paper_tab').length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          Bu Ayın İndirimli Fotoğraf Kağıtları
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          10×15 & Sarf
                        </span>
                      </div>
                      <div className="space-y-2">
                        {filterDealsForPlacement(dealsFeed.deals, 'paper_tab')
                          .slice(0, 2)
                          .map((deal) => (
                            <StudioDealCard
                              key={deal.id}
                              deal={deal}
                              storeId={dealsFeed.settings.store_id}
                              placement="paper_tab"
                              compact
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Cutting Lines */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        Kesim Çizgileri (Kros)
                      </span>
                      <input
                        type="checkbox"
                        checked={activeSession.settings.cuttingLinesEnabled}
                        onChange={(e) =>
                          updateSettings({ cuttingLinesEnabled: e.target.checked }, true)
                        }
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                    </div>

                    {activeSession.settings.cuttingLinesEnabled && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ['solid', 'Düz Çizgi'],
                            ['dashed', 'Kesikli'],
                            ['corners', 'Köşeler'],
                          ] as const
                        ).map(([style, label]) => (
                          <button
                            key={style}
                            onClick={() =>
                              updateSettings(
                                { cuttingStyle: style as CuttingLineStyle },
                                true
                              )
                            }
                            className={`py-1.5 rounded-lg text-xs border transition font-semibold ${
                              activeSession.settings.cuttingStyle === style
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                : 'bg-white border-slate-300 text-slate-600'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Studio Watermark (Logo) */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Stamp className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-900">
                          Stüdyo Filigranı (Logo)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={activeSession.settings.watermarkEnabled}
                        onChange={(e) =>
                          updateSettings({ watermarkEnabled: e.target.checked }, true)
                        }
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                    </div>

                    <button
                      onClick={() => watermarkInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-emerald-700 transition"
                    >
                      {activeSession.settings.watermarkDataUrl
                        ? 'Stüdyo Logosunu Değiştir (PNG)'
                        : 'Stüdyo Logosu Yükle (PNG)'}
                    </button>

                    {activeSession.settings.watermarkEnabled && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => updateSettings({ watermarkPosition: 'inside' }, true)}
                            className={`py-1.5 rounded-lg text-xs border font-semibold ${
                              activeSession.settings.watermarkPosition === 'inside'
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                : 'bg-white border-slate-300 text-slate-600'
                            }`}
                          >
                            Fotoğraf İçinde
                          </button>
                          <button
                            onClick={() => updateSettings({ watermarkPosition: 'outside' }, true)}
                            className={`py-1.5 rounded-lg text-xs border font-semibold ${
                              activeSession.settings.watermarkPosition === 'outside'
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                : 'bg-white border-slate-300 text-slate-600'
                            }`}
                          >
                            Fotoğraf Dışında
                          </button>
                        </div>

                        {/* Corner Selector */}
                        <div>
                          <label className="text-[11px] text-slate-600 font-medium block mb-1.5">
                            Logo Köşesi
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(
                              [
                                ['bottom-right', 'Sağ Alt'],
                                ['bottom-left', 'Sol Alt'],
                                ['top-right', 'Sağ Üst'],
                                ['top-left', 'Sol Üst'],
                              ] as const
                            ).map(([corner, label]) => (
                              <button
                                key={corner}
                                onClick={() =>
                                  updateSettings({ watermarkCorner: corner }, true)
                                }
                                className={`py-1 rounded-lg text-[11px] border font-semibold transition ${
                                  activeSession.settings.watermarkCorner === corner
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Logo Size Slider */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-700 font-medium">Logo Boyutu</span>
                            <span className="font-mono font-bold text-emerald-700">
                              {activeSession.settings.watermarkSizeMm} mm
                            </span>
                          </div>
                          <input
                            type="range"
                            min={2}
                            max={15}
                            step={0.5}
                            value={activeSession.settings.watermarkSizeMm}
                            onChange={(e) =>
                              updateSettings(
                                { watermarkSizeMm: Number(e.target.value) },
                                true
                              )
                            }
                            className="w-full"
                          />
                        </div>

                        {/* Logo Edge Gap Slider */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-700 font-medium">
                              Kenar Mesafesi (Boşluk)
                            </span>
                            <span className="font-mono font-bold text-slate-700">
                              {activeSession.settings.watermarkGapMm} mm
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={5}
                            step={0.2}
                            value={activeSession.settings.watermarkGapMm}
                            onChange={(e) =>
                              updateSettings(
                                { watermarkGapMm: Number(e.target.value) },
                                true
                              )
                            }
                            className="w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Archive Number & Date Stamp */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-900">
                          Arşiv Numarası & Tarih
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={activeSession.settings.archiveEnabled}
                        onChange={(e) =>
                          updateSettings({ archiveEnabled: e.target.checked }, true)
                        }
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                    </div>

                    {activeSession.settings.archiveEnabled && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={activeSession.settings.archiveNumber}
                          onChange={(e) => updateSettings({ archiveNumber: e.target.value })}
                          placeholder="Arşiv No (örn. 2026-1048)"
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                        />
                        <label className="flex items-center justify-between text-xs text-slate-700 font-medium">
                          <span>Günün Tarihini Ekle</span>
                          <input
                            type="checkbox"
                            checked={activeSession.settings.archiveIncludeDate}
                            onChange={(e) =>
                              updateSettings({ archiveIncludeDate: e.target.checked })
                            }
                            className="w-3.5 h-3.5 accent-emerald-600 rounded"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 4: USER PRESETS */}
              {activeTab === 'presets' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="text-xs font-bold text-slate-900">
                      Mevcut Ayarları Şablon Olarak Kaydet
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Fotoğraf ölçüsü, kağıt dizilimi, arka plan rengi ve rötuş ayarlarını tek tıkla
                      çağırmak için kaydedin.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newUserPresetName}
                        onChange={(e) => setNewUserPresetName(e.target.value)}
                        placeholder="Şablon adı (örn. Schengen 8'li Özel)..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900"
                      />
                      <button
                        onClick={handleSaveUserPreset}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Kaydet</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Kayıtlı Stüdyo Şablonları
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => presetImportInputRef.current?.click()}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium flex items-center gap-1"
                        >
                          <FolderUp className="w-3.5 h-3.5" />
                          <span>İçe Aktar</span>
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(userPresets, null, 2)], {
                              type: 'application/json',
                            });
                            const url = URL.createObjectURL(blob);
                            triggerDownload('BiyometrikPlus_Sablonlar.json', url);
                          }}
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium flex items-center gap-1"
                        >
                          <FolderDown className="w-3.5 h-3.5" />
                          <span>Dışa Aktar</span>
                        </button>
                      </div>
                    </div>

                    {userPresets.map((up) => (
                      <div
                        key={up.id}
                        onClick={() => handleApplyUserPreset(up)}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200 cursor-pointer transition"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{up.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {up.settings.widthMm}×{up.settings.heightMm} mm · Kağıt:{' '}
                            {up.settings.paperWidthMm}×{up.settings.paperHeightMm} mm
                          </div>
                        </div>
                        {!up.builtin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserPresets((prev) => prev.filter((item) => item.id !== up.id));
                            }}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
        </>
      )}

      {/* EXPORT / PRINT MODAL (LIGHT MODE) */}
      {showExportModal && activeSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Dışa Aktar & Yazdır (BiyometrikPlus)
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSessionIds.length > 1
                    ? `${selectedSessionIds.length} seçili fotoğraf toplu olarak işlenecek`
                    : `${activeSession.name} (${activeSession.settings.widthMm}×${activeSession.settings.heightMm} mm · ${activeSession.settings.dpi} DPI)`}
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Çıktı Türleri
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Baskı Sayfasını Kaydet (Print Sheet)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Kağıt üzerine dizilmiş çoklu biyometrik baskı sayfası (
                      {renderedSummary?.sheetSummary.paperWmm}×
                      {renderedSummary?.sheetSummary.paperHmm} mm ·{' '}
                      {renderedSummary?.sheetSummary.renderedCount} Adet)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={exportOutSheet}
                    onChange={(e) => setExportOutSheet(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Tekli Biyometrik Fotoğrafı Kaydet
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Dijital başvuru (e-Devlet / Vize) için tekli fotoğraf (
                      {activeSession.settings.widthMm}×{activeSession.settings.heightMm} mm)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={exportOutSingle}
                    onChange={(e) => setExportOutSingle(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Hizalanmış Orijinali Kaydet
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Göz hizası düzeltilmiş, fon ve rötuş uygulanmamış ham arşiv kopyası
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={exportOutOriginal}
                    onChange={(e) => setExportOutOriginal(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Dosya Formatı
                  </label>
                  <select
                    value={exportFormat}
                    onChange={(e) =>
                      setExportFormat(e.target.value as 'jpeg' | 'png' | 'webp')
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                  >
                    <option value="jpeg">JPG (Standart Stüdyo)</option>
                    <option value="png">PNG (Kayıpsız)</option>
                    <option value="webp">WEBP</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Kalite (%{exportQuality})
                  </label>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={exportQuality}
                    onChange={(e) => setExportQuality(Number(e.target.value))}
                    className="w-full mt-2"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCloseAfterExport}
                  onChange={(e) => setAutoCloseAfterExport(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-600 rounded"
                />
                <span>Kaydettikten sonra fotoğrafı oturum listesinden otomatik kapat</span>
              </label>

              {/* Native Contextual Studio Deal inside Export/Print Modal */}
              {filterDealsForPlacement(dealsFeed.deals, 'export_modal')[0] && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Baskı & Arşivleme İçin Bu Ayın Stüdyo Fırsatı
                  </div>
                  <StudioDealCard
                    deal={filterDealsForPlacement(dealsFeed.deals, 'export_modal')[0]}
                    storeId={dealsFeed.settings.store_id}
                    placement="export_modal"
                    compact
                  />
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                onClick={() => handleRunExport(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-semibold transition"
              >
                <Printer className="w-4 h-4 text-emerald-600" />
                <span>Kaydet ve Yazdır</span>
              </button>
              <button
                onClick={() => handleRunExport(false)}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Dosyaları Kaydet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHORTCUTS MODAL (LIGHT MODE) */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                BiyometrikPlus — Stüdyo Kısayolları
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-2.5 text-xs">
              {[
                ['O', 'Fotoğraf Önizleme Modu'],
                ['P', 'Baskı Düzeni (Çoklu Kağıt) Modu'],
                ['V', 'Seçim & Kılavuz Çizgisi Hizalama Aracı'],
                ['E', 'Kenar Temizleme / Geri Yükleme Fırçası'],
                ['W', 'Sıvılaştırma (Liquify) Fırçası'],
                ['X', 'Fırça Modunu Değiştir (Sil ↔ Geri Yükle / İt ↔ Onar)'],
                ['Ctrl + Z / Y', 'Son Fırça Darbesini Geri Al / İleri Al'],
                ['Fare Tekerleği', 'Yakınlaştır / Uzaklaştır'],
                ['Cetvele Sağ Tık', 'Milimetre (mm) ↔ İnç (in) Birim Değiştir'],
              ].map(([k, desc]) => (
                <div
                  key={k}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100"
                >
                  <span className="text-slate-700 font-medium">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[11px] font-semibold text-emerald-700">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-white border border-emerald-300 text-xs font-semibold text-slate-800 shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
