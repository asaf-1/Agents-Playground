import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./queryClient";
// Self-hosted variable fonts: bundled at build time, so the browser never calls
// a font CDN. Each file covers every weight; only the Latin subset downloads.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./app.css";

// The server puts a one-time nonce into the page's Content Security Policy and
// into the <meta property="csp-nonce"> tag Vite emits (html.cspNonce). Radix's
// dialogs and menus inject a <style> element at runtime through
// react-remove-scroll, which reads __webpack_nonce__ for exactly this; without
// it the policy would refuse that style. Read before anything renders.
const cspNonce = document.querySelector<HTMLMetaElement>(
  'meta[property="csp-nonce"]',
)?.nonce;
if (cspNonce) {
  (window as Window & { __webpack_nonce__?: string }).__webpack_nonce__ =
    cspNonce;
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found in the document.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/app">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
