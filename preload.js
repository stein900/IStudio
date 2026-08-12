const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewer', {
  ready: () => ipcRenderer.invoke('renderer-ready'),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  reloadContext: (filePath) => ipcRenderer.invoke('reload-context', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),
  fileThumbnail: (filePath) => ipcRenderer.invoke('file-thumbnail', filePath),
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
  onFullscreenChanged: (callback) => {
    ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => callback(isFullscreen));
  },
  onOpenContext: (callback) => {
    ipcRenderer.on('open-context', (_event, context) => callback(context));
  },
});
