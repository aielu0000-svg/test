import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { FirstUseGuideController } from "./FirstUseGuide.js";
import "./styles.css";
import "./evidence-followup.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <FirstUseGuideController />
  </React.StrictMode>,
);
