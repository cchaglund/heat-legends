// D22: a new service worker waits until the user asks for it. We never reload
// on our own, since that could happen mid-move.
import { useRegisterSW } from "virtual:pwa-register/preact";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div class="update-banner" role="status">
      <span>Update available</span>
      <button class="btn small" onClick={() => setNeedRefresh(false)}>Later</button>
      <button class="btn small primary" onClick={() => updateServiceWorker(true)}>Reload</button>
    </div>
  );
}
