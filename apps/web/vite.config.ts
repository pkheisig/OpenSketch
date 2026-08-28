import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/OpenSketch/",
  plugins: [
    react(),
    VitePWA({
      // Never reload an active editing session to activate a new build. The
      // waiting worker is applied once the user is safely back in the library.
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "OpenSketch — Scientific Figure Studio",
        short_name: "OpenSketch",
        description:
          "A private, offline-capable scientific figure editor with openly licensed scientific art.",
        theme_color: "#152324",
        background_color: "#f2efe7",
        display: "standalone",
        orientation: "any",
        scope: "/OpenSketch/",
        start_url: "/OpenSketch/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: "/OpenSketch/index.html",
        globPatterns: ["**/*.{html,js,css,svg,png,webp,woff,woff2,ttf,txt}"],
        globIgnores: [
          "assets/nih-bioart/**",
          "assets/nih-bioart-thumbnails/**",
          "assets/scidraw/**",
          "assets/scidraw-thumbnails/**",
          "assets/organism-library/**",
          "assets/organism-library-thumbnails/**",
          "assets/bioicons/**",
          "assets/bioicons-thumbnails/**"
        ],
        // The complete asset pack is primed explicitly from the Assets panel.
        // Do not evict entries: a ready pack must contain every required source
        // and preview, and the pack manager clears these caches on version change.
        runtimeCaching: [
          {
            urlPattern:
              /\/OpenSketch\/assets\/(?:nih-bioart|scidraw|organism-library|bioicons)-thumbnails\//,
            handler: "CacheFirst",
            options: {
              cacheName: "opensketch-asset-previews",
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/OpenSketch\/assets\/(?:nih-bioart|scidraw|organism-library|bioicons)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "opensketch-asset-sources",
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    outDir: "../../dist",
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
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
