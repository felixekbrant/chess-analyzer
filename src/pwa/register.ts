import { toast } from '../lib/toast';

/**
 * Registers the service worker (production builds only). When a new version has been deployed,
 * shows a notice with a Reload button instead of switching versions under the user's feet.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const reg = await navigator.serviceWorker.register('./sw.js');

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

  // Look for a new deploy when the app comes back to the foreground (installed apps stay open for days).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reg.update().catch(() => {});
  });
}
