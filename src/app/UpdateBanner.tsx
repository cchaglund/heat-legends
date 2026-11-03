// D22: a new service worker waits until the user asks for it. We never reload
// on our own, since that could happen mid-move.
import { useRegisterSW } from "virtual:pwa-register/preact";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return <UpdateBannerView onLater={() => setNeedRefresh(false)} onReload={() => updateServiceWorker(true)} />;
}

export function UpdateBannerView({ onLater, onReload }: { onLater: () => void; onReload: () => void }) {
  return (
    <div class="update-banner" role="status">
      <span>Update available</span>
      <button class="btn small" onClick={onLater}>Later</button>
      <button class="btn small primary" onClick={onReload}>Reload</button>
    </div>
  );
}
