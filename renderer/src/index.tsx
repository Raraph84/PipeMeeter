import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";

import "./index.scss";

const App = () => {
    const [config, setConfig] = useState({ inputs: [], outputs: [] });
    const [removing, setRemoving] = useState(false);
    const oldSizeRef = useRef({ width: 0, height: 0 });

    useEffect(() => {
        const root = document.getElementById("root")!;
        const interval = setInterval(() => {
            if (oldSizeRef.current.width !== root.clientWidth || oldSizeRef.current.height !== root.clientHeight) {
                oldSizeRef.current = { width: root.clientWidth, height: root.clientHeight };
                (window as any).api.send("resize", oldSizeRef.current);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        (window as any).api.on("updateConfig", (config: any) => setConfig(config));
        (window as any).api.send("updateConfig");
    }, []);

    return (
        <>
            <div className="row">
                <div className="nodes">
                    {config.inputs.map((input: any) => (
                        <Node key={input.id} config={config} node={input} type="input" removing={removing} />
                    ))}
                </div>
                <Menu setRemoving={setRemoving} />
            </div>
            <div className="nodes">
                {config.outputs.map((output: any) => (
                    <Node key={output.id} config={config} node={output} type="output" removing={removing} />
                ))}
            </div>
        </>
    );
};

const Menu = ({ setRemoving }: { setRemoving: (removing: (removing: boolean) => boolean) => void }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const handleQuit = () => {
        if (!confirm("Are you sure you want to quit?")) return;
        (window as any).api.send("quit");
    };

    const handleRemove = () => {
        setRemoving((removing) => !removing);
        setOpen(false);
    };

    return (
        <div className="menu" ref={menuRef}>
            <button className="menu-toggle" onClick={() => setOpen((open) => !open)}>
                Menu
            </button>
            {open && (
                <div className="menu-dropdown">
                    <button onClick={handleRemove}>Remove mode</button>
                    <button onClick={handleQuit}>Quit</button>
                </div>
            )}
        </div>
    );
};

const Node = ({
    config,
    node,
    type,
    removing
}: {
    config: any;
    node: any;
    type: "input" | "output";
    removing: boolean;
}) => {
    const handleRemove = () => {
        if (!confirm(`Are you sure you want to remove ${node.name}?`)) return;
        (window as any).api.send("removeNode", { id: node.id });
    };

    return (
        <span key={node.id} className="node">
            <span className={"name" + (!node.online ? " offline" : "")}>{node.name}</span>
            <div className="content">
                <span className="volume">
                    <div>
                        <input
                            type="range"
                            min="0"
                            max="150"
                            value={node.volume}
                            onChange={(event) =>
                                (window as any).api.send("setVolume", {
                                    id: node.id,
                                    volume: Number(event.currentTarget.value)
                                })
                            }
                            onDoubleClick={() => (window as any).api.send("setVolume", { id: node.id, volume: 100 })}
                            onWheel={(event) =>
                                (window as any).api.send("setVolume", {
                                    id: node.id,
                                    volume: Math.min(Math.max(node.volume + (event.deltaY > 0 ? -5 : 5), 0), 150)
                                })
                            }
                        />
                    </div>
                    <button
                        className={"mute" + (node.mute ? " active" : "")}
                        onClick={() => (window as any).api.send("setMute", { id: node.id, mute: !node.mute })}
                    >
                        Mute
                    </button>
                    {removing && (
                        <button className="mute active" onClick={handleRemove}>
                            Remove
                        </button>
                    )}
                </span>
                <span className="outputs">
                    {type === "output" && <div>{node.slug}</div>}
                    <div>{node.volume.toFixed(0)}%</div>
                    {type === "input" &&
                        config.outputs.map((output: any, i: number) => (
                            <button
                                key={i}
                                className={node.outputs.includes(output.id) ? "active" : ""}
                                onClick={() =>
                                    (window as any).api.send("toggleLink", { input: node.id, output: output.id })
                                }
                            >
                                {output.slug}
                            </button>
                        ))}
                </span>
            </div>
        </span>
    );
};

createRoot(document.getElementById("root")!).render(<App />);
