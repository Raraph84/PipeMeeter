import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import "./index.scss";

const App = () => {
    const [state, setState] = useState({ inputs: [], outputs: [] });

    useEffect(() => {
        (window as any).api.on("updateConfig", (config: any) => setState(config));
        (window as any).api.send("updateConfig");
    }, []);

    return (
        <>
            <div className="nodes">
                {state.inputs.map((input: any, i: number) => (
                    <Node key={input.id} i={i} state={state} node={input} type="input" />
                ))}
            </div>
            <div className="nodes">
                {state.outputs.map((output: any, i: number) => (
                    <Node key={output.id} i={i} state={state} node={output} type="output" />
                ))}
            </div>
        </>
    );
};

const Node = ({ i, state, node, type }: { i: number; state: any; node: any; type: "input" | "output" }) => {
    return (
        <span key={node.id} className="node">
            <span className="name">{node.name.slice(0, 10)}</span>
            <div className="content">
                <span className="volume">
                    <div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={node.volume}
                            onChange={(event) =>
                                (window as any).api.send("setVolume", {
                                    id: node.id,
                                    volume: event.currentTarget.value
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
                    {type === "output" && <div>O{i + 1}</div>}
                    <div>0dB</div>
                    {type === "input" && state.outputs.map((_: any, i: number) => <button key={i}>O{i + 1}</button>)}
                </span>
            </div>
        </span>
    );
};

createRoot(document.getElementById("root")!).render(<App />);
