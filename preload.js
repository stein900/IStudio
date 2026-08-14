const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewer', {
  ready: () => ipcRenderer.invoke('renderer-ready'),
  openNewWindow: (filePath) => ipcRenderer.invoke('open-new-window', filePath),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  reloadContext: (filePath) => ipcRenderer.invoke('reload-context', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),
  fileThumbnail: (filePath) => ipcRenderer.invoke('file-thumbnail', filePath),
  fileThumbnailCached: (filePath) => ipcRenderer.invoke('file-thumbnail-cached', filePath),
  storeThumbnail: (payload) => ipcRenderer.invoke('store-thumbnail', payload),
  readFileHead: (filePath, bytes) => ipcRenderer.invoke('read-file-head', { filePath, bytes }),
  statSizes: (paths) => ipcRenderer.invoke('stat-sizes', paths),
  statMany: (paths) => ipcRenderer.invoke('stat-many', paths),
  readFolderMeta: (filePath) => ipcRenderer.invoke('read-folder-meta', filePath),
  writeFolderMeta: (payload) => ipcRenderer.invoke('write-folder-meta', payload),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  saveInPlace: (payload) => ipcRenderer.invoke('save-in-place', payload),
  askSaveMode: (fileName) => ipcRenderer.invoke('ask-save-mode', fileName),
  saveCopy: (payload) => ipcRenderer.invoke('save-copy', payload),
  exportImage: (payload) => ipcRenderer.invoke('export-image', payload),
  saveProject: (payload) => ipcRenderer.invoke('save-project', payload),
  openProject: () => ipcRenderer.invoke('open-project'),
  printFile: (fileUrl) => ipcRenderer.invoke('print-file', fileUrl),
  openInVStudio: (payload) => ipcRenderer.invoke('open-in-vstudio', payload), // passerelle éditeur vidéo

  ocrRun: (data) => ipcRenderer.invoke('ocr-run', data),
  upscaleModels: () => ipcRenderer.invoke('upscale-models'),
  upscaleRun: (payload) => ipcRenderer.invoke('upscale-run', payload),
  upscaleCancel: () => ipcRenderer.invoke('upscale-cancel'),
  onUpscaleProgress: (callback) => {
    ipcRenderer.on('upscale-progress', (_event, pct) => callback(pct));
  },
  exportSvg: (payload) => ipcRenderer.invoke('export-svg', payload), // Module Export SVG
  setLocale: (code) => ipcRenderer.invoke('set-locale', code), // i18n : dialogues natifs
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => callback(isFullscreen));
  },
  onOpenContext: (callback) => {
    ipcRenderer.on('open-context', (_event, context) => callback(context));
  },
});
