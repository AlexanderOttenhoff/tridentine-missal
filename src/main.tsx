import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { registerServiceWorker } from "./pwa.ts";
import "./styles.css";

const container = document.getElementById("app");
if (!container) throw new Error("Root element #app not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
