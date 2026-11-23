const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld('stageflowNative', {
  platform: process.platform,
  // segments
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: inv('project:save'),
  openAudio: () => ipcRenderer.invoke('audio:open'),
  openVideo: () => ipcRenderer.invoke('video:open'),
  openPdf: () => ipcRenderer.invoke('pdfin:open'),
  // exports
  captureStage: inv('png:capture'),
  saveBinary: inv('file:saveBinary'),
  printPdf: inv('pdf:print'),
  reveal: inv('shell:reveal'),
  // library / dashboard
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    createSet: inv('library:createSet'),
    updateSet: inv('library:updateSet'),
    deleteSet: inv('library:deleteSet'),
    createSegment: inv('library:createSegment'),
    importSegments: inv('library:importSegments'),
    duplicateSegment: inv('library:duplicateSegment'),
    renameSegment: inv('library:renameSegment'),
    deleteSegment: inv('library:deleteSegment'),
    moveSegment: inv('library:moveSegment'),
    read: inv('library:read'),
    writeSegment: inv('library:writeSegment'),
    loadRosters: () => ipcRenderer.invoke('roster:load'),
    saveRosters: inv('roster:save'),
    chooseRoot: () => ipcRenderer.invoke('library:chooseRoot')
  },
  // window
  confirmUnsaved: () => ipcRenderer.invoke('confirm:unsaved'),
  setTitle: (t) => ipcRenderer.send('window:set-title', t),
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),
  popupMenu: (pos) => ipcRenderer.send('menu:popup', pos),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
  onOpenFile: (cb) => ipcRenderer.on('open-project-file', (_e, payload) => cb(payload)),
  onCloseRequested: (cb) => ipcRenderer.on('app-close-requested', () => cb())
});
