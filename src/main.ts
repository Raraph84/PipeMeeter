import { app, BrowserWindow, ipcMain } from "electron";
import { Pipewire, PipewireNode, spa_prop, spa_type } from "pipewire";
import path from "node:path";

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 680,
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
                name: node.props["node.description"],
                volume: (node as any).volume ?? 100,
                mute: (node as any).mute ?? false
            })),
            outputs: outputs.map((node) => ({
                id: node.nodeName,
                name: node.props["node.description"],
                volume: (node as any).volume ?? 100,
                mute: (node as any).mute ?? false
            }))
        });
    };

    pipewire.on("objectAdded", (obj) => {
        if (obj instanceof PipewireNode) {
            obj.on("nodeParam", (param) => {
                if (param.type !== PipewireNode.spa_param_type.SPA_PARAM_Props) return;
                if (param.value.contents![spa_prop.SPA_PROP_mute])
                    (obj as any).mute = param.value.contents![spa_prop.SPA_PROP_mute]!.value;
                if (param.value.contents![spa_prop.SPA_PROP_volume])
                    (obj as any).volume = (param.value.contents![spa_prop.SPA_PROP_volume]!.value as number) * 100;
                if (param.value.contents![spa_prop.SPA_PROP_mute] && param.value.contents![spa_prop.SPA_PROP_volume])
                    updateConfig();
            });

            setImmediate(() => {
                obj.attachListener();
                obj.subscribeParams(Object.values(PipewireNode.spa_param_type).filter((v) => typeof v === "number"));
            });
        }
    });

    pipewire.startLoop();

    ipcMain.on("updateConfig", () => updateConfig());

    ipcMain.on("setMute", (event, data) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const node = nodes.find((obj) => obj.nodeName === data.id)!;
        node.setParam(PipewireNode.spa_param_type.SPA_PARAM_Props, {
            type: spa_type.SPA_TYPE_Object,
            objectType: 0,
            contents: { [spa_prop.SPA_PROP_mute]: { type: spa_type.SPA_TYPE_Bool, value: data.mute } }
        });
    });

    ipcMain.on("setVolume", (event, data) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const node = nodes.find((obj) => obj.nodeName === data.id)!;
        node.setParam(PipewireNode.spa_param_type.SPA_PARAM_Props, {
            type: spa_type.SPA_TYPE_Object,
            objectType: 0,
            contents: { [spa_prop.SPA_PROP_volume]: { type: spa_type.SPA_TYPE_Float, value: data.volume / 100 } }
        });
    });
});

app.on("window-all-closed", () => {
    app.quit();
});
