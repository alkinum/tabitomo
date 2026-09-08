import { installDesignTheme } from './designTheme';
import './index.css';
import { createRoot } from "react-dom/client";
import { App } from "./App";

installDesignTheme();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}