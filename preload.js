const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewer', {
  ready: () => ipcRenderer.invoke('renderer-ready'),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  reloadContext: (filePath) => ipcRenderer.invoke('reload-context', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  saveInPlace: (payload) => ipcRenderer.invoke('save-in-place', payload),
  printFile: (fileUrl) => ipcRenderer.invoke('print-file', fileUrl),
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => callback(isFullscreen));
  },
  onOpenContext: (callback) => {
    ipcRenderer.on('open-context', (_event, context) => callback(context));
  },
});
