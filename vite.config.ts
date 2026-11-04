import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  // not a git checkout
}

// GitHub Pages serves the app under /heat-legends/.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/heat-legends/" : "/",
  define: {
    __APP_VERSION__: JSON.stringify(commit ? `${pkg.version} (${commit})` : pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    basicSsl(),
    // D22: installable and offline, but a new version waits for the user's "Reload".
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png", "tracks/*.jpg"],
      manifest: {
        name: "Heat Legends",
        short_name: "Legends",
        description: "Runs the Legends (AI drivers) in Heat: Pedal to the Metal.",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,wasm,woff2}"],
        // OpenCV.js is large; it must still be precached to work offline.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
});
