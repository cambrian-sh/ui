/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const useMock = process.env.VITE_USE_MOCK_IPC === "1";
// @ts-expect-error process is a nodejs global
const isTest = !!process.env.VITEST;

/* === Mode alias (per spec §6.2) === */
const aliases = [
  { find: "@", replacement: path.resolve(__dirname, "./src") },
];
if (useMock) {
  aliases.unshift(
    {
      find: /^@\/ipc$/,
      replacement: path.resolve(__dirname, "./src/ipc/mock.ts"),
    },
    {
      find: /^@\/ipc\/events$/,
      replacement: path.resolve(__dirname, "./src/ipc/mock-events.ts"),
    },
  );
}

/* === Dev bridge (dev server only) ===
 * In a plain browser tab there is no Tauri, so our own imports of the Tauri
 * API resolve to src/ipc/bridge/*, which talk to the running Studio's Rust core
 * over a localhost WebSocket (src-tauri/src/dev_bridge). Inside the native
 * window those modules delegate to the real API. Only imports from our source
 * are redirected — the bridge itself and node_modules see the real packages —
 * and production builds are untouched. */
const bridgeDir = path.resolve(__dirname, "./src/ipc/bridge");
const bridged: Record<string, string> = {
  "@tauri-apps/api/core": path.join(bridgeDir, "core.ts"),
  "@tauri-apps/api/event": path.join(bridgeDir, "event.ts"),
  "@tauri-apps/plugin-dialog": path.join(bridgeDir, "dialog.ts"),
};
const devBridge: Plugin = {
  name: "cambrian-dev-bridge",
  apply: (_config, env) => env.command === "serve" && !useMock && !isTest,
  enforce: "pre",
  resolveId(source, importer) {
    const target = bridged[source];
    if (!target || !importer) return null;
    const file = importer.split("?")[0];
    if (file.startsWith(bridgeDir) || file.includes("/node_modules/")) return null;
    return target;
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devBridge,
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: aliases,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
