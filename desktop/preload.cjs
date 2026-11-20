const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'desktop',
  Object.freeze({
    open: () => ipcRenderer.invoke('document:open'),
    save: (source, saveAs) => ipcRenderer.invoke('document:save', { source, saveAs: !!saveAs }),
    export: (source, kind) => ipcRenderer.invoke('document:export', { source, kind }),
    confirmDiscard: () => ipcRenderer.invoke('document:discard'),
    changed: (dirty) => ipcRenderer.send('document:changed', !!dirty),
    newPath: () => ipcRenderer.send('document:new-path'),
    close: () => ipcRenderer.send('document:close'),
    onCommand: (callback) => ipcRenderer.on('command', (_event, command) => callback(command)),
  }),
);
