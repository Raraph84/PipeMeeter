import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

import "./index.scss";

const App = () => {
    const [state, setState] = useState({
        inputs: [],
        outputs: []
    });

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
            <div className="index">
                {type === "input" ? "I" : "O"}
                {i + 1}
            </div>
            <div className="content">
                <span className="name">{node.name}</span>
                <span>
                    <div></div>
                    <button className={node.mute ? "mute" : ""}>Mute</button>
                </span>
                {type === "input" && (
                    <span className="outputs">
                        {state.outputs.map((_: any, i: number) => (
                            <button key={i}>O{i + 1}</button>
                        ))}
                    </span>
                )}
            </div>
        </span>
    );
};

createRoot(document.getElementById("root")!).render(<App />);
