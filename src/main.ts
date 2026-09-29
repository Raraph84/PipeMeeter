import { app, BrowserWindow } from "electron";
import path from "node:path";

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600
    });

    if (process.env.NODE_ENV === "development") mainWindow.loadURL("http://localhost:5173/");
    else mainWindow.loadFile(path.join(import.meta.dirname, "..", "renderer", "dist", "index.html"));
});

app.on("window-all-closed", () => {
    app.quit();
});
