import { render } from "preact";
import { App } from "./app/App";
import "./app/app.css";
import { applyTheme, chooseTheme } from "./app/themes";

const root = document.getElementById("app")!;
const q = new URLSearchParams(location.search);
const galleryMode = q.has("gallery") || q.has("state");
// The gallery page itself stays in the current look; its frames get ?theme.
if (!q.has("gallery")) applyTheme(chooseTheme(q, !galleryMode));
// ?gallery / ?state=<id>: the UI gallery, loaded only when asked for.
if (galleryMode) {
  import("./app/gallery").then(({ Gallery, StatePreview }) =>
    render(q.has("state") ? <StatePreview id={q.get("state")!} /> : <Gallery theme={q.get("theme") ?? "default"} compare={q.has("compare")} />, root),
  );
} else {
  render(<App />, root);
}
