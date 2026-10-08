import { app, BrowserWindow, ipcMain, Menu, Tray } from "electron";
import { Pipewire, PipewireLink, PipewireNode, PipewirePort, spa_prop, spa_type } from "pipewire";
import path from "node:path";
import fs from "node:fs";

type NodeConfig = { id: string; name: string; mute?: boolean; volume?: number };
type NodeInput = NodeConfig & { outputs: string[] };
type NodeOutput = NodeConfig & { slug: string };

const configPath = path.join(app.getPath("userData"), "config.json");
const config: {
    physicalInputs: NodeInput[];
    physicalOutputs: NodeOutput[];
    virtualInputs: NodeInput[];
    virtualOutputs: NodeOutput[];
} = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : { physicalInputs: [], physicalOutputs: [], virtualInputs: [], virtualOutputs: [] };

const saveConfig = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf-8");

const getConfigNode = (id: string) =>
    [...config.physicalInputs, ...config.physicalOutputs, ...config.virtualInputs, ...config.virtualOutputs].find(
        (node) => node.id === id
    );

app.whenReady().then(() => {
    let window: BrowserWindow | null = null;

    const createWindow = () => {
        if (window) {
            if (!window.isFocused()) window.hide();
            window.show();
            return;
        }

        window = new BrowserWindow({
            width: 1200,
            height: 700,
            title: "PipeMeeter",
            icon: path.join(import.meta.dirname, "assets", "icon.png"),
            autoHideMenuBar: true,
            webPreferences: {
                preload: path.join(import.meta.dirname, "preload.cjs")
            }
        });

        if (process.env.NODE_ENV === "development") window.loadURL("http://localhost:5173/");
        else window.loadFile(path.join(import.meta.dirname, "..", "renderer", "dist", "index.html"));
    };

    if (!process.argv.includes("--hidden")) createWindow();

    const tray = new Tray(path.join(import.meta.dirname, "assets", "icon.png"));
    tray.setContextMenu(Menu.buildFromTemplate([{ label: "Quit", click: () => app.quit() }]));
    tray.on("click", () => createWindow());

    const pipewire = new Pipewire();

    const updateRenderer = () => {
        if (!window) return;
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);
        window.webContents.send("updateConfig", {
            inputs: config.physicalInputs.concat(config.virtualInputs).map((physicalInput) => ({
                id: physicalInput.id,
                name: physicalInput.name,
                online: !!nodes.find((obj) => obj.nodeName === physicalInput.id),
                volume: physicalInput.volume ?? 100,
                mute: physicalInput.mute ?? false,
                outputs: physicalInput.outputs
            })),
            outputs: config.physicalOutputs.concat(config.virtualOutputs).map((physicalOutput) => ({
                id: physicalOutput.id,
                name: physicalOutput.name,
                slug: physicalOutput.slug,
                online: !!nodes.find((obj) => obj.nodeName === physicalOutput.id),
                volume: physicalOutput.volume ?? 100,
                mute: physicalOutput.mute ?? false
            }))
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
                if (!param.value.contents![spa_prop.SPA_PROP_mute] || !param.value.contents![spa_prop.SPA_PROP_volume])
                    return;
                const node = getConfigNode(obj.nodeName);
                if (!node) return;
                if (param.value.contents![spa_prop.SPA_PROP_mute])
                    node.mute = param.value.contents![spa_prop.SPA_PROP_mute]!.value as boolean;
                if (param.value.contents![spa_prop.SPA_PROP_volume])
                    node.volume = (param.value.contents![spa_prop.SPA_PROP_volume]!.value as number) * 100;
                saveConfig();
                updateRenderer();
            });

            setImmediate(() => {
                obj.attachListener();
                obj.subscribeParams(Object.values(PipewireNode.spa_param_type).filter((v) => typeof v === "number"));
            });
        } else if (obj instanceof PipewirePort) setImmediate(() => createLinks());
    });

    pipewire.on("objectRemoved", (obj) => {
        if (obj instanceof PipewireNode) setImmediate(() => updateRenderer());
    });

    pipewire.startLoop();

    app.on("window-all-closed", () => (window = null));
    app.on("will-quit", () => pipewire.deinit());

    const createLink = (input: string, output: string) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);

        const inputNode = nodes.find((n) => n.nodeName === input);
        const outputNode = nodes.find((n) => n.nodeName === output);
        if (!inputNode || !outputNode) return;

        const links = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireLink);
        const existing = links.filter((link) => link.outputNode === inputNode.id && link.inputNode === outputNode.id);
        if (existing.length === 2) return;

        const ports = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewirePort);
        const leftInputPort = ports.find(
            (p) =>
                p.nodeId === inputNode.id &&
                p.portDirection === "out" &&
                (p.props["audio.channel"] === "FL" || p.props["audio.channel"] === "MONO")
        );
        const rightInputPort = ports.find(
            (p) =>
                p.nodeId === inputNode.id &&
                p.portDirection === "out" &&
                (p.props["audio.channel"] === "FR" || p.props["audio.channel"] === "MONO")
        );
        const leftOutputPort = ports.find(
            (p) =>
                p.nodeId === outputNode.id &&
                p.portDirection === "in" &&
                (p.props["audio.channel"] === "FL" || p.props["audio.channel"] === "MONO")
        );
        const rightOutputPort = ports.find(
            (p) =>
                p.nodeId === outputNode.id &&
                p.portDirection === "in" &&
                (p.props["audio.channel"] === "FR" || p.props["audio.channel"] === "MONO")
        );
        if (!leftInputPort || !rightInputPort || !leftOutputPort || !rightOutputPort) return;

        pipewire.createLink(leftOutputPort.id, leftInputPort.id);
        pipewire.createLink(rightOutputPort.id, rightInputPort.id);
        console.log(`Linked ${inputNode.nodeName} to ${outputNode.nodeName}`);
    };

    const destroyLink = (input: string, output: string) => {
        const nodes = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireNode);

        const inputNode = nodes.find((n) => n.nodeName === input);
        const outputNode = nodes.find((n) => n.nodeName === output);
        if (!inputNode || !outputNode) return;

        const links = Object.values(pipewire.objects).filter((obj) => obj instanceof PipewireLink);

        for (const link of links)
            if (link.outputNode === inputNode.id && link.inputNode === outputNode.id) link.destroy();

        console.log(`Unlinked ${inputNode.nodeName} from ${outputNode.nodeName}`);
    };

    let creatingLinks = false;
    const createLinks = () => {
        if (creatingLinks) return;
        creatingLinks = true;
        setImmediate(() => (creatingLinks = false));
        for (const input of config.physicalInputs.concat(config.virtualInputs))
            for (const output of input.outputs) createLink(input.id, output);
    };

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
            saveConfig();
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
            saveConfig();
            updateRenderer();
        }
    });

    ipcMain.on("toggleLink", (_, data) => {
        const input = config.physicalInputs.concat(config.virtualInputs).find((input) => input.id === data.input)!;
        if (input.outputs.includes(data.output)) {
            destroyLink(data.input, data.output);
            input.outputs.splice(input.outputs.indexOf(data.output), 1);
        } else {
            createLink(data.input, data.output);
            input.outputs.push(data.output);
        }
        saveConfig();
        updateRenderer();
    });
});

process.on("uncaughtException", console.error);
