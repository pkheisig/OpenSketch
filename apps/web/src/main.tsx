import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/stix-two-text/400.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-serif/latin-400.css";
import "@fontsource/ibm-plex-serif/latin-600.css";
import "@fontsource/ibm-plex-serif/latin-700.css";
import "@fontsource/lato/latin-400.css";
import "@fontsource/lato/latin-700.css";
import "@fontsource/merriweather/latin-400.css";
import "@fontsource/merriweather/latin-600.css";
import "@fontsource/merriweather/latin-700.css";
import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-600.css";
import "@fontsource/noto-sans/latin-700.css";
import "@fontsource/noto-serif/latin-400.css";
import "@fontsource/noto-serif/latin-600.css";
import "@fontsource/noto-serif/latin-700.css";
import "@fontsource/roboto-mono/latin-400.css";
import "@fontsource/roboto-mono/latin-600.css";
import "@fontsource/roboto-mono/latin-700.css";
import "./styles/global.css";
import "./styles/opengate-theme.css";

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    document.documentElement.dataset.updateReady = "true";
    window.dispatchEvent(new Event("opensketch:update-ready"));
  },
  onOfflineReady() {
    document.documentElement.dataset.offlineReady = "true";
    window.dispatchEvent(new Event("opensketch:offline-ready"));
  }
});

window.addEventListener("opensketch:apply-update", () => {
  void updateServiceWorker(true);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
