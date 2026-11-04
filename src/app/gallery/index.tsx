// UI gallery (?gallery): every screen state in a phone-sized frame, for
// screenshots and design review. Each frame loads ?state=<id>, which renders
// that one state full-page, so fixed-position screens lay out as on a phone.
// ?gallery&theme=<id> shows every state in one theme; ?gallery&compare puts
// the key states of every theme side by side.
import { STATES } from "./states";
import { THEMES } from "../themes";
import "./gallery.css";

/** The states that show most of a theme, for the side-by-side comparison. */
const KEY_STATES = ["start", "roles-set", "race-mid", "race-about", "move-live", "scan-enough", "tap-placing"];

export function StatePreview({ id }: { id: string }) {
  const s = STATES.find((x) => x.id === id);
  return <>{s ? s.render() : <p class="screen">Unknown state "{id}".</p>}</>;
}

function ThemeBar({ theme, compare }: { theme: string; compare: boolean }) {
  return (
    <nav class="theme-bar">
      <a href="?gallery&compare" class={compare ? "on" : ""}>Compare all</a>
      {THEMES.map((t) => (
        <a key={t.id} href={`?gallery&theme=${t.id}`} class={!compare && t.id === theme ? "on" : ""}>{t.name}</a>
      ))}
    </nav>
  );
}

function Frame({ id, theme, title }: { id: string; theme: string; title: string }) {
  return <iframe src={`?state=${id}&theme=${theme}`} width={390} height={844} loading="lazy" title={title} />;
}

export function Gallery({ theme, compare }: { theme: string; compare: boolean }) {
  if (compare) return <Compare />;
  const groups = [...new Set(STATES.map((s) => s.group))];
  const t = THEMES.find((x) => x.id === theme) ?? THEMES[0];
  let n = 0;
  return (
    <main class="gallery">
      <h1>Heat Legends: UI states</h1>
      <ThemeBar theme={t.id} compare={false} />
      <p class="muted">
        <b>{t.name}:</b> {t.blurb}
      </p>
      <p class="muted">
        Real screens with made-up data, at 390 × 844 (iPhone). Camera screens use the printed board as the picture. Open a frame alone to
        see it on the phone.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <div class="gallery-grid">
            {STATES.filter((s) => s.group === g).map((s) => {
              n++;
              return (
                <figure key={s.id}>
                  <figcaption>
                    <b>#{n} {s.title}</b>
                    <a href={`?state=${s.id}&theme=${t.id}`} target="_blank" rel="noopener">{s.id} ↗</a>
                    {s.note && <small class="muted">{s.note}</small>}
                  </figcaption>
                  <Frame id={s.id} theme={t.id} title={s.title} />
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

function Compare() {
  return (
    <main class="gallery">
      <h1>Heat Legends: design proposals</h1>
      <ThemeBar theme="" compare />
      <p class="muted">
        Five directions over the same screens, with the current look first. Each row scrolls sideways. To try one in a real race on the
        phone, open the app with <code>?theme=&lt;id&gt;</code> (it is remembered; <code>?theme=default</code> goes back).
      </p>
      {THEMES.map((t) => (
        <section key={t.id} class="compare-row">
          <h2>
            {t.name} <code>?theme={t.id}</code>
          </h2>
          <p class="muted">{t.blurb}</p>
          <div class="compare-strip">
            {KEY_STATES.map((id) => (
              <Frame key={id} id={id} theme={t.id} title={`${t.name}: ${id}`} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
