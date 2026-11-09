import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * One classic-script bundle for GitHub Pages.
 * scripts/pack-pages.mjs inlines it into docs/r3f.html, docs/pose-editor.html,
 * docs/formation-library.html, and docs/replay-viewer.html.
 * An ES module would need a base path and fails on file://; this IIFE does not.
 */
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 10_000_000,
    modulePreload: false,
    minify: true,
    target: "es2020",
    rolldownOptions: {
      input: "src/main.tsx",
      output: {
        format: "iife",
        name: "FootballGroundAttack",
        codeSplitting: false,
        entryFileNames: "r3f.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
