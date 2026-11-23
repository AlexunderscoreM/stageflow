const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stageflowNative', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (opts) => ipcRenderer.invoke('project:save', opts),
  openAudio: () => ipcRenderer.invoke('audio:open'),
  platform: process.platform,
  captureStage: (opts) => ipcRenderer.invoke('png:capture', opts),
  popupMenu: (pos) => ipcRenderer.send('menu:popup', pos),
  confirmUnsaved: () => ipcRenderer.invoke('confirm:unsaved'),
  setTitle: (t) => ipcRenderer.send('window:set-title', t),
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  onOpenFile: (cb) => ipcRenderer.on('open-project-file', (_e, payload) => cb(payload)),
  onCloseRequested: (cb) => ipcRenderer.on('app-close-requested', () => cb())
});
