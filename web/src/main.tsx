import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadCdnResources } from "./lib/cdn-loader";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Defer CDN resource loading until after first paint
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => loadCdnResources());
} else {
  setTimeout(() => loadCdnResources(), 200);
}
