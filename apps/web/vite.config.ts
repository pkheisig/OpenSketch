import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    outDir: "../../inst/app",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          fabric: ["fabric"],
          storage: ["dexie"],
          react: ["react", "react-dom"]
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
