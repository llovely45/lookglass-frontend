import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare global {
  interface ImportMetaEnv {
    readonly VITE_STATUS_URL: string;
    readonly VITE_API_BASE_URL: string;
    readonly VITE_SITE_TITLE: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
