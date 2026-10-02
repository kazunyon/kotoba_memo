const { contextBridge, ipcRenderer } = require('electron')
if (location.protocol === 'file:' && location.pathname.endsWith('/setup-manual.html')) contextBridge.exposeInMainWorld('kotobaManual', { print: () => ipcRenderer.invoke('kotoba:print') })
else if (location.protocol === 'file:') contextBridge.exposeInMainWorld('kotobaSetup', {
  importResult: value => ipcRenderer.invoke('kotoba:result-import', value),
  pendingResult: () => ipcRenderer.invoke('kotoba:result-pending'),
  connect: value => ipcRenderer.invoke('kotoba:connect', value),
  loadProgress: () => ipcRenderer.invoke('kotoba:progress-load'),
  saveProgress: value => ipcRenderer.invoke('kotoba:progress-save', value),
  copy: text => ipcRenderer.invoke('kotoba:copy', text),
  openPage: url => ipcRenderer.invoke('kotoba:open-page', url),
  manual: value => ipcRenderer.invoke('kotoba:manual', value)
})
else contextBridge.exposeInMainWorld('kotobaDesktop', { login: () => ipcRenderer.invoke('kotoba:login'), changeConnection: () => ipcRenderer.invoke('kotoba:change') })
