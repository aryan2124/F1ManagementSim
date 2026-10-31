import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/vt323/400.css";
import "./styles.css";
import "./ui/pixel/themes.css";
import "./ui/skin/skin.css";
import "./ui/skin/angle.css";
import "./ui/skin/fit.css";
import App from "./App";
import { ArtPreview } from "./render/ArtPreview";
import { DonutPreview, PodiumPreview } from "./render/PodiumPreview";

const qs = new URLSearchParams(window.location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{qs.get("art") ? <ArtPreview params={qs} /> : qs.get("demo") === "podium" ? <PodiumPreview /> : qs.get("demo") === "donut" ? <DonutPreview /> : <App />}</StrictMode>,
);
