const { contextBridge, ipcRenderer } = require('electron')
if (location.protocol === 'file:') contextBridge.exposeInMainWorld('kotobaSetup', { connect: value => ipcRenderer.invoke('kotoba:connect', value) })
else contextBridge.exposeInMainWorld('kotobaDesktop', { login: () => ipcRenderer.invoke('kotoba:login'), changeConnection: () => ipcRenderer.invoke('kotoba:change') })
