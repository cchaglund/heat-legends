import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// GitHub Pages serves the app under /heat-legends/.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/heat-legends/" : "/",
  plugins: [preact(), basicSsl()],
});
