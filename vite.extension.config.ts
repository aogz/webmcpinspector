import { defineConfig } from "vite";

// Builds the Webfuse extension's content script as one classic script next to its manifest.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/extension",
    emptyOutDir: false,
    target: "es2020",
    minify: false,
    lib: {
      entry: "src/extension/content.ts",
      formats: ["iife"],
      name: "WebMCPInspectorContent",
      fileName: () => "content.js",
    },
  },
});
