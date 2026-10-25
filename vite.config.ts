import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React SPA lives in web/ and builds to public/app, which the Node server
// (server.js) serves at /app. base must match that mount path so emitted asset
// URLs resolve through the existing static-asset handler.
export default defineConfig({
  root: "web",
  base: "/app/",
  plugins: [react()],
  // The Content Security Policy on /app allows only code and styles that carry
  // the nonce the server made for that one response. Vite puts this placeholder
  // on every script and style tag it emits, plus a <meta property="csp-nonce">,
  // and server.js swaps it for the real value as it serves index.html. The
  // placeholder never reaches a browser.
  html: {
    cspNonce: "__CSP_NONCE__",
  },
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
  },
});
