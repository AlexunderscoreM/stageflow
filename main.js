const { app, BrowserWindow, dialog, ipcMain, Menu, shell, protocol, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

let win = null;
let allowClose = false;
let pendingOpenPath = null;

const SRC = path.join(__dirname, 'src');
const PROJECT_FILTERS = [{ name: 'StageFlow Segment', extensions: ['stageflow', 'json'] }];
const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }];
const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'] }];

// The UI is served from app://bundle/… so fetch(), WebAssembly and ES modules behave like a normal web page.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

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
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+H', registerAccelerator: false, click: () => send('menu', 'home') },
        { type: 'separator' },
        { label: 'New Segment', accelerator: 'CmdOrCtrl+N', registerAccelerator: false, click: () => send('menu', 'new') },
        { label: 'Open Segment File…', accelerator: 'CmdOrCtrl+O', registerAccelerator: false, click: () => send('menu', 'open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => send('menu', 'save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', registerAccelerator: false, click: () => send('menu', 'saveAs') },
        { type: 'separator' },
        { label: 'Load Music…', click: () => send('menu', 'loadAudio') },
        { label: 'Import Formations from PDF…', click: () => send('menu', 'importPdf') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', registerAccelerator: false, click: () => send('menu', 'export') },
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
    minWidth: 1000,
    minHeight: 660,
    backgroundColor: '#1f1f1f',
    title: 'StageFlow',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 15 } }
      : { titleBarOverlay: { color: '#1f1f1f', symbolColor: '#c4c7c5', height: 46 } }),
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadURL('app://bundle/index.html');

  // Teach mode opens as a normal window; anything else goes to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('app://bundle/viewer/')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 420, height: 880, backgroundColor: '#1f1f1f', autoHideMenuBar: true, title: 'StageFlow — phone viewer preview' } };
    }
    if (url.startsWith('app://bundle/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280, height: 860, minWidth: 800, minHeight: 560, backgroundColor: '#ffffff', autoHideMenuBar: true,
          title: 'StageFlow — Teach mode', icon: path.join(__dirname, 'build', 'icon.png')
        }
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

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
    send('open-project-file', { filePath, text: fs.readFileSync(filePath, 'utf8') });
  } catch (err) {
    dialog.showErrorBox('Could not open segment', String(err.message || err));
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: PROJECT_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { filePath, text: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('project:save', async (_e, { filePath, text, saveAs, suggestedName }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, { defaultPath: suggestedName || 'Untitled.stageflow', filters: PROJECT_FILTERS });
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
  return { name: path.basename(filePath), data: fs.readFileSync(filePath).toString('base64') };
});

ipcMain.handle('video:open', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: VIDEO_FILTERS });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { name: path.basename(filePath), data: new Uint8Array(fs.readFileSync(filePath)) };
});

ipcMain.handle('pdfin:open', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  return { name: path.basename(filePath), data: new Uint8Array(fs.readFileSync(filePath)) };
});

ipcMain.handle('file:saveBinary', async (_e, { data, suggestedName, filters }) => {
  const res = await dialog.showSaveDialog(win, { defaultPath: suggestedName, filters });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, Buffer.from(data));
  return { filePath: res.filePath };
});

ipcMain.handle('png:capture', async (_e, { rect, suggestedName }) => {
  const image = await win.webContents.capturePage(rect);
  const res = await dialog.showSaveDialog(win, { defaultPath: suggestedName || 'formation.png', filters: [{ name: 'PNG Image', extensions: ['png'] }] });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, image.toPNG());
  return { filePath: res.filePath };
});

// Render an HTML document (one formation per page) to PDF.
ipcMain.handle('pdf:print', async (_e, { html, suggestedName, landscape = true }) => {
  const tmp = path.join(os.tmpdir(), `stageflow-print-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ landscape, printBackground: true, pageSize: 'Letter', margins: { marginType: 'none' } });
    const res = await dialog.showSaveDialog(win, { defaultPath: suggestedName || 'formations.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, pdf);
    return { filePath: res.filePath };
  } finally {
    pw.destroy();
    fs.rmSync(tmp, { force: true });
  }
});

ipcMain.handle('shell:reveal', (_e, p) => { shell.showItemInFolder(p); });

// ---------------------------------------------------------------------------
// Library: <root>/<Set folder>/set.json + *.stageflow segments
// ---------------------------------------------------------------------------
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; } }
function writeConfig(c) { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(c, null, 2)); }
function libraryRoot() {
  const root = process.env.STAGEFLOW_LIBRARY || readConfig().libraryRoot || path.join(app.getPath('documents'), 'StageFlow');
  fs.mkdirSync(root, { recursive: true });
  return root;
}
function safeName(name) { return String(name || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim().slice(0, 80) || 'Untitled'; }
function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext), n = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} ${n++}${ext}`);
  return p;
}
function readSet(dir) {
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'set.json'), 'utf8')); } catch { /* new / hand-made folder */ }
  // keep every field (e.g. the cloud sync state) so rewriting set.json never drops anything
  return { ...meta, name: meta.name || path.basename(dir), order: Array.isArray(meta.order) ? meta.order : [], notes: meta.notes || '', created: meta.created || null, roster: meta.roster || null };
}
function writeSet(dir, meta) { fs.writeFileSync(path.join(dir, 'set.json'), JSON.stringify(meta, null, 2)); }

function segmentSummary(file) {
  const stat = fs.statSync(file);
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fsx = Array.isArray(p.formations) ? p.formations : [];
    const end = fsx.reduce((m, f) => Math.max(m, Number(f.end) || 0), 0);
    return {
      name: p.name || path.basename(file, path.extname(file)),
      stage: p.stage, dancers: p.dancers || [],
      formations: fsx.map((f) => ({ name: f.name, start: f.start, end: f.end, positions: f.positions })),
      duration: end, audioName: p.audio ? p.audio.name : null, modified: stat.mtimeMs, ok: true
    };
  } catch (err) {
    return { name: path.basename(file), ok: false, error: String(err.message || err), modified: stat.mtimeMs };
  }
}

function listLibrary() {
  const root = libraryRoot();
  const sets = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const dir = path.join(root, ent.name);
    const meta = readSet(dir);
    const files = fs.readdirSync(dir).filter((f) => /\.stageflow$/i.test(f));
    const ordered = [...meta.order.filter((f) => files.includes(f)), ...files.filter((f) => !meta.order.includes(f)).sort()];
    sets.push({
      dir, name: meta.name, notes: meta.notes, created: meta.created, roster: meta.roster,
      cloud: meta.cloud && meta.cloud.id ? { id: meta.cloud.id, syncedAt: meta.cloud.syncedAt || null } : null,
      modified: fs.statSync(dir).mtimeMs,
      segments: ordered.map((f) => ({ file: f, path: path.join(dir, f), ...segmentSummary(path.join(dir, f)) }))
    });
  }
  sets.sort((a, b) => Math.max(b.modified, ...b.segments.map((s) => s.modified)) - Math.max(a.modified, ...a.segments.map((s) => s.modified)));
  return { root, sets };
}
function insideRoot(p) { const r = path.resolve(libraryRoot()); return path.resolve(p).startsWith(r + path.sep); }

ipcMain.handle('library:list', () => listLibrary());
ipcMain.handle('library:createSet', (_e, name) => {
  const dir = uniquePath(libraryRoot(), safeName(name), '');
  fs.mkdirSync(dir);
  writeSet(dir, { name: name || path.basename(dir), order: [], created: Date.now() });
  return { dir };
});
ipcMain.handle('library:updateSet', (_e, { dir, name, notes, roster }) => {
  if (!insideRoot(dir)) throw new Error('Outside library');
  const meta = readSet(dir);
  if (name != null) meta.name = name;
  if (notes != null) meta.notes = notes;
  if (roster !== undefined) meta.roster = roster;
  writeSet(dir, meta);
  return true;
});
ipcMain.handle('library:deleteSet', async (_e, dir) => { if (!insideRoot(dir)) throw new Error('Outside library'); await shell.trashItem(dir); return true; });
ipcMain.handle('library:createSegment', (_e, { dir, name, text }) => {
  if (!insideRoot(dir)) throw new Error('Outside library');
  const file = uniquePath(dir, safeName(name), '.stageflow');
  fs.writeFileSync(file, text, 'utf8');
  const meta = readSet(dir); meta.order.push(path.basename(file)); writeSet(dir, meta);
  return { filePath: file };
});
ipcMain.handle('library:importSegments', async (_e, dir) => {
  if (!insideRoot(dir)) throw new Error('Outside library');
  const res = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: PROJECT_FILTERS });
  if (res.canceled) return [];
  const meta = readSet(dir);
  const out = [];
  for (const src of res.filePaths) {
    const file = uniquePath(dir, safeName(path.basename(src, path.extname(src))), '.stageflow');
    fs.copyFileSync(src, file);
    meta.order.push(path.basename(file)); out.push(file);
  }
  writeSet(dir, meta);
  return out;
});
ipcMain.handle('library:duplicateSegment', (_e, file) => {
  if (!insideRoot(file)) throw new Error('Outside library');
  const dir = path.dirname(file);
  const copy = uniquePath(dir, path.basename(file, '.stageflow') + ' copy', '.stageflow');
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  p.name = `${p.name || path.basename(file, '.stageflow')} (copy)`;
  fs.writeFileSync(copy, JSON.stringify(p));
  const meta = readSet(dir);
  const i = meta.order.indexOf(path.basename(file));
  meta.order.splice(i < 0 ? meta.order.length : i + 1, 0, path.basename(copy));
  writeSet(dir, meta);
  return { filePath: copy };
});
ipcMain.handle('library:renameSegment', (_e, { file, name }) => {
  if (!insideRoot(file)) throw new Error('Outside library');
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  p.name = name;
  fs.writeFileSync(file, JSON.stringify(p));
  return true;
});
ipcMain.handle('library:deleteSegment', async (_e, file) => {
  if (!insideRoot(file)) throw new Error('Outside library');
  const dir = path.dirname(file);
  await shell.trashItem(file);
  const meta = readSet(dir); meta.order = meta.order.filter((f) => f !== path.basename(file)); writeSet(dir, meta);
  return true;
});
ipcMain.handle('library:moveSegment', (_e, { file, toDir, index }) => {
  if (!insideRoot(file) || !insideRoot(toDir)) throw new Error('Outside library');
  const fromDir = path.dirname(file);
  let target = file;
  if (path.resolve(fromDir) !== path.resolve(toDir)) {
    target = uniquePath(toDir, path.basename(file, '.stageflow'), '.stageflow');
    fs.renameSync(file, target);
    const fm = readSet(fromDir); fm.order = fm.order.filter((f) => f !== path.basename(file)); writeSet(fromDir, fm);
  }
  const tm = readSet(toDir);
  const files = fs.readdirSync(toDir).filter((f) => /\.stageflow$/i.test(f));
  const order = [...tm.order.filter((f) => files.includes(f)), ...files.filter((f) => !tm.order.includes(f)).sort()].filter((f) => f !== path.basename(target));
  order.splice(Math.max(0, Math.min(index ?? order.length, order.length)), 0, path.basename(target));
  tm.order = order; writeSet(toDir, tm);
  return { filePath: target };
});
ipcMain.handle('library:read', (_e, file) => ({ filePath: file, text: fs.readFileSync(file, 'utf8') }));
ipcMain.handle('library:writeSegment', (_e, { file, text }) => {
  if (!insideRoot(file)) throw new Error('Outside library');
  fs.writeFileSync(file, text, 'utf8');
  return true;
});

// Rosters live next to the sets: <library>/rosters.json
const rosterFile = () => path.join(libraryRoot(), 'rosters.json');
ipcMain.handle('roster:load', () => {
  try { return JSON.parse(fs.readFileSync(rosterFile(), 'utf8')); } catch { return { rosters: [] }; }
});
ipcMain.handle('roster:save', (_e, data) => {
  const tmp = rosterFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, rosterFile());
  return true;
});
ipcMain.handle('library:chooseRoot', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  const c = readConfig(); c.libraryRoot = res.filePaths[0]; writeConfig(c);
  return res.filePaths[0];
});

// ---------------------------------------------------------------------------
// StageFlow Cloud (accounts + sync) — see cloud.js
// ---------------------------------------------------------------------------
const { createCloud } = require('./cloud');
const cloud = createCloud({
  app, safeStorage, shell, libraryRoot, readSet, writeSet: (dir, meta) => writeSet(dir, meta), safeName, uniquePath,
  emit: (ch, payload) => send(ch, payload)
});
const cloudCall = (fn) => async (_e, ...args) => {
  try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err) }; }
};
ipcMain.handle('cloud:getConfig', cloudCall(() => cloud.getConfig()));
ipcMain.handle('cloud:setConfig', cloudCall((cfg) => cloud.setConfig(cfg || {})));
ipcMain.handle('cloud:status', cloudCall(() => cloud.status()));
ipcMain.handle('cloud:sendCode', cloudCall((email) => cloud.sendCode(email)));
ipcMain.handle('cloud:verifyCode', cloudCall(({ email, code }) => cloud.verifyCode(email, code)));
ipcMain.handle('cloud:signOut', cloudCall(() => cloud.signOut()));
ipcMain.handle('cloud:listSets', cloudCall(() => cloud.listCloudSets()));
ipcMain.handle('cloud:uploadSet', cloudCall((dir) => { if (!insideRoot(dir)) throw new Error('Outside library'); return cloud.uploadSet(dir); }));
ipcMain.handle('cloud:downloadSet', cloudCall((id) => cloud.downloadSet(id)));
ipcMain.handle('cloud:unlinkSet', cloudCall((dir) => { if (!insideRoot(dir)) throw new Error('Outside library'); return cloud.unlinkSet(dir); }));
ipcMain.handle('cloud:deleteSet', cloudCall((id) => cloud.deleteCloudSet(id)));
ipcMain.handle('cloud:members', cloudCall((id) => cloud.members(id)));
ipcMain.handle('cloud:addMember', cloudCall(({ id, email }) => cloud.addMember(id, email)));
ipcMain.handle('cloud:removeMember', cloudCall(({ id, email }) => cloud.removeMember(id, email)));
ipcMain.handle('cloud:syncAll', cloudCall((opts) => cloud.syncAll(opts || {})));

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
ipcMain.on('menu:popup', (_e, { x, y }) => {
  const menu = Menu.getApplicationMenu();
  if (menu && win) menu.popup({ window: win, x, y });
});
ipcMain.handle('confirm:unsaved', async () => {
  const res = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2,
    message: 'You have unsaved changes.', detail: 'Do you want to save this segment before continuing?'
  });
  return ['save', 'discard', 'cancel'][res.response];
});
ipcMain.on('window:set-title', (_e, title) => { if (win) win.setTitle(title); });
ipcMain.on('app:close-confirmed', () => { allowClose = true; if (win) win.close(); });

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
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
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      const file = path.normalize(path.join(SRC, decodeURIComponent(u.pathname)));
      if (u.host !== 'bundle' || !file.startsWith(SRC)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    pendingOpenPath = pendingOpenPath || findProjectArg(process.argv);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { allowClose = false; createWindow(); } });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
