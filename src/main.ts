import { app, BrowserWindow, ipcMain } from "electron";
import { Pipewire, PipewireNode, PipewirePort, spa_prop, spa_type } from "pipewire";
import path from "node:path";
import fs from "node:fs";

type NodeConfig = { id: string; name: string; mute?: boolean; volume?: number };
type NodeInput = NodeConfig & { outputs: string[] };

const configPath = path.join(app.getPath("userData"), "config.json");
const config: {
    physicalInputs: NodeInput[];
    physicalOutputs: NodeConfig[];
    virtualInputs: NodeInput[];
    virtualOutputs: NodeConfig[];
} = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : { physicalInputs: [], physicalOutputs: [], virtualInputs: [], virtualOutputs: [] };

const getConfigNode = (id: string) =>
    [...config.physicalInputs, ...config.physicalOutputs, ...config.virtualInputs, ...config.virtualOutputs].find(
        (node) => node.id === id
    );

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

    const updateRenderer = () => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        mainWindow.webContents.send("updateConfig", {
            inputs: config.physicalInputs
                .map((physicalInput) => ({
                    id: physicalInput.id,
                    name: physicalInput.name,
                    online: !!nodes.find((obj) => obj.nodeName === physicalInput.id),
                    volume: physicalInput.volume ?? 100,
                    mute: physicalInput.mute ?? false,
                    outputs: physicalInput.outputs
                }))
                .concat(
                    config.virtualInputs.map((virtualInput) => ({
                        id: virtualInput.id,
                        name: virtualInput.name,
                        online: !!nodes.find((obj) => obj.nodeName === virtualInput.id),
                        volume: virtualInput.volume ?? 100,
                        mute: virtualInput.mute ?? false,
                        outputs: virtualInput.outputs
                    }))
                ),
            outputs: config.physicalOutputs
                .map((physicalOutput) => ({
                    id: physicalOutput.id,
                    name: physicalOutput.name,
                    online: !!nodes.find((obj) => obj.nodeName === physicalOutput.id),
                    volume: physicalOutput.volume ?? 100,
                    mute: physicalOutput.mute ?? false
                }))
                .concat(
                    config.virtualOutputs.map((virtualOutput) => ({
                        id: virtualOutput.id,
                        name: virtualOutput.name,
                        online: !!nodes.find((obj) => obj.nodeName === virtualOutput.id),
                        volume: virtualOutput.volume ?? 100,
                        mute: virtualOutput.mute ?? false
                    }))
                )
        });
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
                const node = getConfigNode(obj.nodeName);
                if (!node) return;
                if (param.value.contents![spa_prop.SPA_PROP_mute])
                    node.mute = param.value.contents![spa_prop.SPA_PROP_mute]!.value as boolean;
                if (param.value.contents![spa_prop.SPA_PROP_volume])
                    node.volume = (param.value.contents![spa_prop.SPA_PROP_volume]!.value as number) * 100;
                if (param.value.contents![spa_prop.SPA_PROP_mute] && param.value.contents![spa_prop.SPA_PROP_volume])
                    updateRenderer();
            });

            setImmediate(() => {
                obj.attachListener();
                obj.subscribeParams(Object.values(PipewireNode.spa_param_type).filter((v) => typeof v === "number"));
            });
        }
    });

    pipewire.on("objectRemoved", (obj) => {
        if (obj instanceof PipewireNode) setImmediate(() => updateRenderer());
    });

    pipewire.startLoop();

    const createLinks = () => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const ports = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewirePort);

        for (const input of config.physicalInputs.concat(config.virtualInputs)) {
            const inputNode = nodes.find((obj) => obj.nodeName === input.id);
            if (!inputNode) continue;
            for (const output of input.outputs) {
                const outputNode = nodes.find((obj) => obj.nodeName === output);
                if (!outputNode) continue;
                const leftInputPort = ports.find(
                    (p) => p.nodeId === inputNode.id && p.portDirection === "out" && p.props["audio.channel"] === "FL"
                );
                const rightInputPort = ports.find(
                    (p) => p.nodeId === inputNode.id && p.portDirection === "out" && p.props["audio.channel"] === "FR"
                );
                const leftOutputPort = ports.find(
                    (p) => p.nodeId === outputNode.id && p.portDirection === "in" && p.props["audio.channel"] === "FL"
                );
                const rightOutputPort = ports.find(
                    (p) => p.nodeId === outputNode.id && p.portDirection === "in" && p.props["audio.channel"] === "FR"
                );
                if (!leftInputPort || !rightInputPort || !leftOutputPort || !rightOutputPort) {
                    console.warn(`Could not find ports for linking ${inputNode.nodeName} to ${outputNode.nodeName}`);
                    continue;
                }
                pipewire.createLink(leftOutputPort.id, leftInputPort.id);
                pipewire.createLink(rightOutputPort.id, rightInputPort.id);
                console.log(`Linked ${inputNode.nodeName} to ${outputNode.nodeName}`);
            }
        }
    };

    setTimeout(createLinks, 1000);

    ipcMain.on("updateConfig", () => updateRenderer());

    ipcMain.on("setMute", (_, data) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const node = nodes.find((obj) => obj.nodeName === data.id);
        if (node) {
            node.setParam(PipewireNode.spa_param_type.SPA_PARAM_Props, {
                type: spa_type.SPA_TYPE_Object,
                objectType: 0,
                contents: { [spa_prop.SPA_PROP_mute]: { type: spa_type.SPA_TYPE_Bool, value: data.mute } }
            });
        } else {
            getConfigNode(data.id)!.mute = data.mute;
            updateRenderer();
        }
    });

    ipcMain.on("setVolume", (_, data) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        const node = nodes.find((obj) => obj.nodeName === data.id);
        if (node) {
            node.setParam(PipewireNode.spa_param_type.SPA_PARAM_Props, {
                type: spa_type.SPA_TYPE_Object,
                objectType: 0,
                contents: { [spa_prop.SPA_PROP_volume]: { type: spa_type.SPA_TYPE_Float, value: data.volume / 100 } }
            });
        } else {
            getConfigNode(data.id)!.volume = data.volume;
            updateRenderer();
        }
    });

    ipcMain.on("toggleLink", (_, data) => {
        const input = config.physicalInputs.concat(config.virtualInputs).find((input) => input.id === data.input)!;
        if (input.outputs.includes(data.output)) input.outputs.splice(input.outputs.indexOf(data.output), 1);
        else input.outputs.push(data.output);
        updateRenderer();
    });
});

app.on("window-all-closed", () => {
    app.quit();
});

process.on("uncaughtException", console.error);
