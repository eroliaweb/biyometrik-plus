const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let ortSessionPromise = null;

async function getOrtSession() {
  if (!ortSessionPromise) {
    ortSessionPromise = (async () => {
      const ort = require('onnxruntime-node');
      const modelCandidates = [
        path.join(process.resourcesPath || '', 'models', 'face_landmarks.onnx'),
        path.join(__dirname, '..', 'models', 'face_landmarks.onnx'),
        path.join(app.getAppPath(), 'models', 'face_landmarks.onnx'),
      ];
      const modelPath = modelCandidates.find((p) => p && fs.existsSync(p));
      if (!modelPath) {
        throw new Error('Model bulunamadı: ' + path.join(__dirname, '..', 'models', 'face_landmarks.onnx'));
      }
      return await ort.InferenceSession.create(modelPath);
    })();
  }
  return ortSessionPromise;
}

async function detectFaceWithOnnx(dataUrl) {
  const ort = require('onnxruntime-node');
  const sharp = require('sharp');
  const session = await getOrtSession();

  const base64Data = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
  const rawImgBuf = Buffer.from(base64Data, 'base64');

  // Auto-orient according to EXIF Orientation tag so DSLR/phone portrait JPEGs
  // (e.g. IMG_XXXX.JPG with Orientation=6/8) match browser <img> orientation 1:1
  const imgBuf = await sharp(rawImgBuf).rotate().toBuffer();

  const meta = await sharp(imgBuf).metadata();
  const origW = meta.width || 640;
  const origH = meta.height || 640;

  const scale = Math.min(640 / origW, 640 / origH);
  const nw = Math.round(origW * scale);
  const nh = Math.round(origH * scale);
  const padX = Math.floor((640 - nw) / 2);
  const padY = Math.floor((640 - nh) / 2);

  const raw = await sharp(imgBuf)
    .resize(nw, nh)
    .extend({
      top: padY,
      bottom: 640 - nh - padY,
      left: padX,
      right: 640 - nw - padX,
      background: { r: 114, g: 114, b: 114 },
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  const floatData = new Float32Array(3 * 640 * 640);
  for (let i = 0; i < 640 * 640; i++) {
    floatData[i] = raw[i * 3] / 255.0;
    floatData[640 * 640 + i] = raw[i * 3 + 1] / 255.0;
    floatData[2 * 640 * 640 + i] = raw[i * 3 + 2] / 255.0;
  }

  const tensor = new ort.Tensor('float32', floatData, [1, 3, 640, 640]);
  const results = await session.run({ input: tensor });
  const out = results.output.data; // [1, 20, 8400]

  let bestScore = -1;
  let bestIdx = -1;
  for (let i = 0; i < 8400; i++) {
    const score = out[4 * 8400 + i];
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore < 0.35 || bestIdx === -1) {
    return null;
  }

  const row = [];
  for (let c = 0; c < 20; c++) {
    row.push(out[c * 8400 + bestIdx]);
  }

  const toOrigX = (x) => (x - padX) / nw;
  const toOrigY = (y) => (y - padY) / nh;

  const boxCx = toOrigX(row[0]);
  const boxCy = toOrigY(row[1]);
  const boxW = row[2] / nw;
  const boxH = row[3] / nh;

  // Keypoint 0: Left Eye (image left), Keypoint 1: Right Eye (image right)
  const leftEyeX = toOrigX(row[5]);
  const leftEyeY = toOrigY(row[6]);
  const rightEyeX = toOrigX(row[8]);
  const rightEyeY = toOrigY(row[9]);

  const eyeCenterX = (leftEyeX + rightEyeX) * 0.5;
  const eyeLineY = (leftEyeY + rightEyeY) * 0.5;

  // Biometric skull crown (headTopY including hair volume) and chin tip (chinLineY)
  const headTopY = Math.max(0.02, Number((boxCy - boxH * 0.64).toFixed(4)));
  const chinLineY = Math.min(0.96, Number((boxCy + boxH * 0.51).toFixed(4)));

  return {
    headTopY,
    eyeLineY: Number(eyeLineY.toFixed(4)),
    chinLineY,
    centerX: Number(((boxCx + eyeCenterX) * 0.5).toFixed(4)),
    faceWidthRatio: Number(boxW.toFixed(4)),
    tiltDeg: 0,
    confidence: Number(bestScore.toFixed(4)),
  };
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f8fafc',
    title: 'BiyometrikPlus — Profesyonel Biyometrik & Vesikalık Stüdyosu',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const devUrl = 'http://localhost:5173';
  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');

  if (!app.isPackaged && process.env.ELECTRON_START_URL !== 'file') {
    mainWindow.loadURL(devUrl).catch(() => {
      if (fs.existsSync(indexHtml)) {
        mainWindow.loadFile(indexHtml);
      }
    });
  } else if (fs.existsSync(indexHtml)) {
    mainWindow.loadFile(indexHtml);
  } else {
    mainWindow.loadURL(devUrl);
  }
}

let phpServerProcess = null;

function startLocalPhpBackendServer() {
  try {
    const { spawn } = require('child_process');
    const phpCandidates = [
      'C:\\wamp64\\bin\\php\\php8.3.28\\php.exe',
      'C:\\wamp64\\bin\\php\\php8.2.29\\php.exe',
      'C:\\wamp64\\bin\\php\\php8.4.15\\php.exe',
    ];
    const phpExe = phpCandidates.find((p) => fs.existsSync(p));
    const projectRoot = path.join(__dirname, '..');
    if (phpExe && fs.existsSync(path.join(projectRoot, 'backend', 'api', 'deals.php'))) {
      phpServerProcess = spawn(phpExe, ['-S', '127.0.0.1:8787', '-t', projectRoot], {
        cwd: projectRoot,
        stdio: 'ignore',
        windowsHide: true,
      });
      phpServerProcess.on('error', () => {});
    }
  } catch {
    // Ignore if PHP server is already running or unavailable
  }
}

app.whenReady().then(() => {
  startLocalPhpBackendServer();
  createWindow();

  ipcMain.handle('biyometrik:detect-face', async (_event, dataUrl) => {
    try {
      return await detectFaceWithOnnx(dataUrl);
    } catch (err) {
      console.error('ONNX face detection error:', err);
      return null;
    }
  });

  ipcMain.handle('biyometrik:save-file', async (_event, { defaultName, dataUrl }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: 'Görüntü Dosyası', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      ],
    });
    if (canceled || !filePath) return { saved: false };
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return { saved: true, filePath };
  });

  ipcMain.handle('biyometrik:print', async () => {
    if (!mainWindow) return { printed: false };
    mainWindow.webContents.print({ silent: false, printBackground: true });
    return { printed: true };
  });

  ipcMain.handle('biyometrik:open-external', async (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return { opened: true };
    }
    return { opened: false };
  });
});

app.on('window-all-closed', () => {
  if (phpServerProcess) {
    try {
      phpServerProcess.kill();
    } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});
