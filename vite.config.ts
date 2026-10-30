import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The static canvas game remains index.html. This shell is a separate entry.
export default defineConfig({
  plugins: [react()],
  input: "r3f.html",
});
