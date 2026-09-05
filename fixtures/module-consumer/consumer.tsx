import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createOpenSketchModule } from "@opensketch/application-module";

// This fixture intentionally imports the packed package name rather than any
// OpenSketch workspace source. The host supplies the same service boundary as
// the standalone adapter and owns ReactDOM/page mounting.
declare global {
  interface Window {
    openSketchHostServices: Parameters<typeof createOpenSketchModule>[0];
  }
}

const container = document.getElementById("opensketch-module");
if (!container) throw new Error("Missing module mount container.");

const module = createOpenSketchModule(window.openSketchHostServices);
createRoot(container).render(
  <StrictMode>
    <div data-module-mounted="true" />
  </StrictMode>
);
module.mount(container, { routePrefix: "/consumer/opensketch/" });
