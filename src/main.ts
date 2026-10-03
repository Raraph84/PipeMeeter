import { app, BrowserWindow, ipcMain } from "electron";
import { Pipewire, PipewireNode } from "pipewire";
import path from "node:path";

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 600,
        title: "PipeMeeter",
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(import.meta.dirname, "preload.cjs")
        }
    });

    if (process.env.NODE_ENV === "development") mainWindow.loadURL("http://localhost:5173/");
    else mainWindow.loadFile(path.join(import.meta.dirname, "..", "renderer", "dist", "index.html"));

    const pipewire = new Pipewire();

    const updateConfig = () => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const inputs = nodes.filter(
            (node) => node.props["media.class"] === "Audio/Source" && node.props["node.description"]
        );
        const outputs = nodes.filter(
            (node) => node.props["media.class"] === "Audio/Sink" && node.props["node.description"]
        );

        mainWindow.webContents.send("updateConfig", {
            inputs: inputs.map((node) => ({
                id: node.nodeName,
                name: node.props["node.description"]
            })),
            outputs: outputs.map((node) => ({
                id: node.nodeName,
                name: node.props["node.description"]
            }))
        });
    };

    pipewire.on("objectAdded", (obj) => {
        if (obj instanceof PipewireNode) {
            setImmediate(() => {
                obj.attachListener();
                obj.subscribeParams(Object.values(PipewireNode.spa_param_type).filter((v) => typeof v === "number"));
            });
        }
    });

    pipewire.startLoop();

    ipcMain.on("updateConfig", () => updateConfig());
});

app.on("window-all-closed", () => {
    app.quit();
});
