const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('biyometrikElectron', {
  isElectron: true,
  detectFace: (dataUrl) => ipcRenderer.invoke('biyometrik:detect-face', dataUrl),
  saveFile: (payload) => ipcRenderer.invoke('biyometrik:save-file', payload),
  printPage: () => ipcRenderer.invoke('biyometrik:print'),
  openExternal: (url) => ipcRenderer.invoke('biyometrik:open-external', url),
});
