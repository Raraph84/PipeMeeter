import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import "./index.scss";

const App = () => {
    const [config, setConfig] = useState({ inputs: [], outputs: [] });

    useEffect(() => {
        (window as any).api.on("updateConfig", (config: any) => setConfig(config));
        (window as any).api.send("updateConfig");
    }, []);

    return (
        <>
            <div className="nodes">
                {config.inputs.map((input: any, i: number) => (
                    <Node key={input.id} i={i} state={config} node={input} type="input" />
                ))}
            </div>
            <div className="nodes">
                {config.outputs.map((output: any, i: number) => (
                    <Node key={output.id} i={i} state={config} node={output} type="output" />
                ))}
            </div>
        </>
    );
};

const Node = ({ i, state, node, type }: { i: number; state: any; node: any; type: "input" | "output" }) => {
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
                </span>
                <span className="outputs">
                    {type === "output" && <div>{node.slug}</div>}
                    <div>{node.volume.toFixed(0)}%</div>
                    <div>0dB</div>
                    {type === "input" &&
                        state.outputs.map((output: any, i: number) => (
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
