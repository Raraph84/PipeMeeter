import { createRoot } from "react-dom/client";

import "./index.scss";

const App = () => {
    return <h1>PipeMeeter</h1>;
};

createRoot(document.getElementById("root")!).render(<App />);
