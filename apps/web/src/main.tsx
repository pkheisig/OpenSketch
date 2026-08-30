import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/600-italic.css";
import "@fontsource/inter/700-italic.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-sans-3/400-italic.css";
import "@fontsource/source-sans-3/600-italic.css";
import "@fontsource/source-sans-3/700-italic.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600-italic.css";
import "@fontsource/source-serif-4/700-italic.css";
import "@fontsource/stix-two-text/400.css";
import "@fontsource/stix-two-text/600.css";
import "@fontsource/stix-two-text/700.css";
import "@fontsource/stix-two-text/400-italic.css";
import "@fontsource/stix-two-text/600-italic.css";
import "@fontsource/stix-two-text/700-italic.css";
// Use every Fontsource subset so browser shaping covers the same scripts as
// the Unicode TrueType faces embedded by PDF export.
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-sans/600-italic.css";
import "@fontsource/ibm-plex-sans/700-italic.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/600.css";
import "@fontsource/ibm-plex-serif/700.css";
import "@fontsource/ibm-plex-serif/400-italic.css";
import "@fontsource/ibm-plex-serif/600-italic.css";
import "@fontsource/ibm-plex-serif/700-italic.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/400-italic.css";
import "@fontsource/lato/700-italic.css";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/600.css";
import "@fontsource/merriweather/700.css";
import "@fontsource/merriweather/400-italic.css";
import "@fontsource/merriweather/600-italic.css";
import "@fontsource/merriweather/700-italic.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans/400-italic.css";
import "@fontsource/noto-sans/600-italic.css";
import "@fontsource/noto-sans/700-italic.css";
import "@fontsource/noto-serif/400.css";
import "@fontsource/noto-serif/600.css";
import "@fontsource/noto-serif/700.css";
import "@fontsource/noto-serif/400-italic.css";
import "@fontsource/noto-serif/600-italic.css";
import "@fontsource/noto-serif/700-italic.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/600.css";
import "@fontsource/roboto-mono/700.css";
import "@fontsource/roboto-mono/400-italic.css";
import "@fontsource/roboto-mono/600-italic.css";
import "@fontsource/roboto-mono/700-italic.css";
import "./styles/app.css";

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
