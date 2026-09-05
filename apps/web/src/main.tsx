import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { createOpenSketchModule } from "./application";
import { createStandaloneOpenSketchHostServices } from "./application/standaloneHost";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/600-italic.css";
import "@fontsource/inter/700-italic.css";
import "./styles/app.css";
import "./styles/standalone.css";

document.title = "OpenSketch";

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

const rootContainer = document.getElementById("root");
if (!rootContainer) throw new Error("OpenSketch standalone host requires a #root element.");

const reactRoot = createRoot(rootContainer);
const host = createStandaloneOpenSketchHostServices({
  updateServiceWorker,
  render: (_container, node) => {
    reactRoot.render(<StrictMode>{node}</StrictMode>);
    return { unmount: () => reactRoot.unmount() };
  }
});
const application = createOpenSketchModule(host);
application.mount(rootContainer);
