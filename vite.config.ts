import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { poseOverridesPlugin } from "./scripts/pose-overrides-plugin.mjs";

// The static canvas game remains index.html. This shell is a separate entry.
export default defineConfig({
  plugins: [react(), poseOverridesPlugin()],
  input: "r3f.html",
});
