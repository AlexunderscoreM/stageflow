const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let allowClose = false;
let pendingOpenPath = null;

const PROJECT_FILTERS = [{ name: 'StageFlow Project', extensions: ['stageflow', 'json'] }];
const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }];

function findProjectArg(argv) {
  return argv.slice(1).find((a) => /\.(stageflow|json)$/i.test(a) && fs.existsSync(a)) || null;
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', registerAccelerator: false, click: () => send('menu', 'new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', registerAccelerator: false, click: () => send('menu', 'open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => send('menu', 'save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', registerAccelerator: false, click: () => send('menu', 'saveAs') },
        { type: 'separator' },
        { label: 'Load Music…', click: () => send('menu', 'loadAudio') },
        { label: 'Export Stage Image (PNG)…', accelerator: 'CmdOrCtrl+E', registerAccelerator: false, click: () => send('menu', 'exportPng') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: () => send('menu', 'undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', registerAccelerator: false, click: () => send('menu', 'redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('menu', 'help') },
        { label: 'Project on GitHub', click: () => shell.openExternal('https://github.com/AlexunderscoreM/stageflow') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#1f1f1f',
    title: 'StageFlow',
    // Chrome-style: our own toolbar lives in the title bar, native window buttons stay
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 15 } }
      : { titleBarOverlay: { color: '#1f1f1f', symbolColor: '#c4c7c5', height: 46 } }),
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    send('app-close-requested');
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) { openProjectPath(pendingOpenPath); pendingOpenPath = null; }
  });
}

function openProjectPath(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    send('open-project-file', { filePath, text });
  } catch (err) {
    dialog.showErrorBox('Could not open project', String(err.message || err));
  }
}

// ---------- IPC ----------
ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { filePath, text: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('project:save', async (_e, { filePath, text, saveAs, suggestedName }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || 'Untitled.stageflow',
      filters: PROJECT_FILTERS
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  fs.writeFileSync(target, text, 'utf8');
  return { filePath: target };
});

ipcMain.handle('audio:open', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: AUDIO_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const buf = fs.readFileSync(filePath);
  return { name: path.basename(filePath), data: buf.toString('base64') };
});

ipcMain.handle('png:capture', async (_e, { rect, suggestedName }) => {
  const image = await win.webContents.capturePage(rect);
  const res = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName || 'formation.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, image.toPNG());
  return { filePath: res.filePath };
});

ipcMain.on('menu:popup', (_e, { x, y }) => {
  const menu = Menu.getApplicationMenu();
  if (menu && win) menu.popup({ window: win, x, y });
});

ipcMain.handle('confirm:unsaved', async () => {
  const res = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: 'You have unsaved changes.',
    detail: 'Do you want to save your project before continuing?'
  });
  return ['save', 'discard', 'cancel'][res.response];
});

ipcMain.on('window:set-title', (_e, title) => { if (win) win.setTitle(title); });
ipcMain.on('app:close-confirmed', () => { allowClose = true; if (win) win.close(); });

// ---------- App lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = findProjectArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (p) openProjectPath(p);
    }
  });
  app.on('open-file', (e, p) => {
    e.preventDefault();
    if (win && !win.webContents.isLoading()) openProjectPath(p); else pendingOpenPath = p;
  });
  app.whenReady().then(() => {
    pendingOpenPath = pendingOpenPath || findProjectArg(process.argv);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { allowClose = false; createWindow(); } });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
