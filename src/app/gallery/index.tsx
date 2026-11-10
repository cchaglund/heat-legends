// UI gallery (?gallery): every screen state in a phone-sized frame, for
// screenshots and design review. Each frame loads ?state=<id>, which renders
// that one state full-page, so fixed-position screens lay out as on a phone.
import { STATES } from "./states";
import "./gallery.css";

export function StatePreview({ id }: { id: string }) {
  const s = STATES.find((x) => x.id === id);
  return <>{s ? s.render() : <p class="screen">Unknown state "{id}".</p>}</>;
}

export function Gallery() {
  const groups = [...new Set(STATES.map((s) => s.group))];
  let n = 0;
  return (
    <main class="gallery">
      <h1>Heat Legends: UI states</h1>
      <p class="muted">
        Real screens with made-up data, at 390 × 844 (iPhone; 844 × 390 held sideways). Camera screens use the printed board as the picture. Open a frame alone to
        see it on the phone.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <div class="gallery-grid">
            {STATES.filter((s) => s.group === g).map((s) => {
              n++;
              return (
                <figure key={s.id} class={s.landscape ? "landscape" : ""}>
                  <figcaption>
                    <b>#{n} {s.title}</b>
                    <a href={`?state=${s.id}`} target="_blank" rel="noopener">{s.id} ↗</a>
                    {s.note && <small class="muted">{s.note}</small>}
                  </figcaption>
                  <iframe src={`?state=${s.id}`} width={s.landscape ? 844 : 390} height={s.landscape ? 390 : 844} loading="lazy" title={s.title} />
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
