import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { sync } from "./sync";
import "./styles.css";

sync.start();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
