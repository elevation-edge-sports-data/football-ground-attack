import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { formationsSavePlugin } from "./scripts/formation-save.mjs";
import { poseOverridesPlugin } from "./scripts/pose-overrides-plugin.mjs";

// Dev and dist/ use this shell. Root index.html is the packed v11 page from scripts/pack-pages.mjs.
export default defineConfig({
  plugins: [react(), poseOverridesPlugin(), formationsSavePlugin()],
  input: "r3f.html",
});
