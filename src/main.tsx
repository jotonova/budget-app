import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isWeb } from "./lib/platform";
import "./styles.css";

// Register the PWA service worker ONLY on web + production builds. The desktop
// (Tauri) app never registers it, so its behavior is unchanged.
if (isWeb && import.meta.env.PROD) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => { /* SW unsupported — app still works online */ });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
