import { render } from "preact";
import { App } from "./app/App";
import "./app/app.css";

const root = document.getElementById("app")!;
const q = new URLSearchParams(location.search);
// ?gallery / ?state=<id>: the UI gallery, loaded only when asked for.
if (q.has("gallery") || q.has("state")) {
  import("./app/gallery").then(({ Gallery, StatePreview }) =>
    render(q.has("state") ? <StatePreview id={q.get("state")!} /> : <Gallery />, root),
  );
} else {
  render(<App />, root);
}
