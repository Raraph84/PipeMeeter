import { app, BrowserWindow, ipcMain } from "electron";
import { Pipewire, PipewireNode, spa_prop, spa_type } from "pipewire";
import path from "node:path";
import fs from "node:fs";

type NodeConfig = { id: string; name: string; mute?: boolean; volume?: number };

const configPath = path.join(app.getPath("userData"), "config.json");
const config: {
    physicalInputs: NodeConfig[];
    physicalOutputs: NodeConfig[];
    virtualInputs: NodeConfig[];
    virtualOutputs: NodeConfig[];
} = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : { physicalInputs: [], physicalOutputs: [], virtualInputs: [], virtualOutputs: [] };

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
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
        const inputs = [];
        const outputs = [];
        for (const physicalInput of config.physicalInputs) {
            const node = nodes.find((obj) => obj.nodeName === physicalInput.id);
            inputs.push({
                id: physicalInput.id,
                name: physicalInput.name,
                online: !!node,
                volume: (node as any)?.volume ?? physicalInput.volume ?? 100,
                mute: (node as any)?.mute ?? physicalInput.mute ?? false
            });
        }
        for (const physicalOutput of config.physicalOutputs) {
            const node = nodes.find((obj) => obj.nodeName === physicalOutput.id);
            outputs.push({
                id: physicalOutput.id,
                name: physicalOutput.name,
                online: !!node,
                volume: (node as any)?.volume ?? physicalOutput.volume ?? 100,
                mute: (node as any)?.mute ?? physicalOutput.mute ?? false
            });
        }
        for (const virtualInput of config.virtualInputs) {
            const node = nodes.find((obj) => obj.nodeName === virtualInput.id);
            inputs.push({
                id: virtualInput.id,
                name: virtualInput.name,
                online: !!node,
                volume: (node as any)?.volume ?? virtualInput.volume ?? 100,
                mute: (node as any)?.mute ?? virtualInput.mute ?? false
            });
        }
        for (const virtualOutput of config.virtualOutputs) {
            const node = nodes.find((obj) => obj.nodeName === virtualOutput.id);
            outputs.push({
                id: virtualOutput.id,
                name: virtualOutput.name,
                online: !!node,
                volume: (node as any)?.volume ?? virtualOutput.volume ?? 100,
                mute: (node as any)?.mute ?? virtualOutput.mute ?? false
            });
        }

        mainWindow.webContents.send("updateConfig", { inputs, outputs });
    };

    for (const virtualInput of config.virtualInputs)
        pipewire.createNode({
            "factory.name": "support.null-audio-sink",
            "node.name": virtualInput.id,
            "node.description": virtualInput.name,
            "media.class": "Audio/Sink"
        });

    for (const virtualOutput of config.virtualOutputs)
        pipewire.createNode({
            "factory.name": "support.null-audio-sink",
            "node.name": virtualOutput.id,
            "node.description": virtualOutput.name,
            "media.class": "Audio/Source/Virtual"
        });

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

    pipewire.on("objectRemoved", (obj) => {
        if (obj instanceof PipewireNode) setImmediate(() => updateConfig());
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
