const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    once: (channel: string, callable: (...args: any[]) => void) =>
        ipcRenderer.once(channel, (event: Electron.IpcRendererEvent, ...args: any[]) => callable(...args)),
    on: (channel: string, callable: (...args: any[]) => void) =>
        ipcRenderer.on(channel, (event: Electron.IpcRendererEvent, ...args: any[]) => callable(...args))
});
