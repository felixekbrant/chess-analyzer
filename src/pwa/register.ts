import { toast } from '../lib/toast';
import { BUILD, justUpdatedFrom } from './build';

/**
 * Registers the service worker (production builds only). When a new version has been deployed,
 * shows a notice with a Reload button instead of switching versions under the user's feet.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // Just updated: say so, with the latest change (the full list is under Settings > What's new).
  if (justUpdatedFrom() && BUILD.changes[0]) {
    toast(`Updated: ${BUILD.changes[0]}`, 'success', { label: "What's new", run: () => (location.hash = '#/settings?whatsnew=1') });
  }
  // Registration can fail or be blocked (some private modes, test browsers); the app works without it.
  const reg = await navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  if (!reg) return;

  // Only reload when the user asked for the update. (The very first install also takes control of
  // the page, and that must not trigger a reload.)
  let updateRequested = false;
  const offerUpdate = (worker: ServiceWorker) =>
    toast('A new version of Chess Analyzer is available.', 'info', {
      label: 'Reload',
      run: () => {
        updateRequested = true;
        worker.postMessage('skip-waiting');
      },
    });

  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });

  // Look for a new deploy when the app comes back to the foreground (installed apps stay open for
  // days), and every 15 minutes while it's in use.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reg.update().catch(() => {});
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void reg.update().catch(() => {});
  }, 15 * 60_000);
}
