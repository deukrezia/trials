const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('trialsWindow', {
  minimize: () => ipcRenderer.send('trials:window-action', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('trials:window-action', 'maximize'),
  close: () => ipcRenderer.send('trials:window-action', 'close'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('trials:window-state', listener);
    ipcRenderer.send('trials:window-action', 'state');
    return () => ipcRenderer.removeListener('trials:window-state', listener);
  },
});
