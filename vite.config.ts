import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { formationsSavePlugin } from "./scripts/formation-save.mjs";
import { poseOverridesPlugin } from "./scripts/pose-overrides-plugin.mjs";

// The static canvas game remains index.html. This shell is a separate entry.
export default defineConfig({
  plugins: [react(), poseOverridesPlugin(), formationsSavePlugin()],
  input: "r3f.html",
});
