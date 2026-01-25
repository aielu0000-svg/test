import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  main: {
    entry: "src/main/index.ts",
    build: {
      rollupOptions: {
        external: ["better-sqlite3"]
      }
    }
  },
  preload: {
    input: {
      index: path.join(__dirname, "src/preload/index.ts")
    },
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    root: path.join(__dirname, "src/renderer"),
    resolve: {
      alias: {
        "@renderer": path.join(__dirname, "src/renderer/src")
      }
    },
    plugins: [react()]
  }
});
