import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React SPA lives in web/ and builds to public/app, which the Node server
// (server.js) serves at /app. base must match that mount path so emitted asset
// URLs resolve through the existing static-asset handler.
export default defineConfig({
  root: "web",
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
  },
});
