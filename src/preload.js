const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fridge', {
  getState: () => ipcRenderer.invoke('state:get'),
  patch: (patch) => ipcRenderer.invoke('state:patch', patch),
  onChange: (cb) => ipcRenderer.on('state:changed', (_e, state) => cb(state)),
  openWindow: (kind) => ipcRenderer.send('window:open', kind),
  showMenu: () => ipcRenderer.send('widget:menu'),
});
