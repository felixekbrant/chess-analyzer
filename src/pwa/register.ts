import { toast } from '../lib/toast';
import { justUpdatedFrom } from './build';
import { CHANGELOG } from './changelog';

/**
 * Registers the service worker (production builds only). When a new version has been deployed,
 * shows a notice with a Reload button instead of switching versions under the user's feet.
 */
/** Whether the deployed version's worker lists this page's own script, i.e. this page is the latest. */
async function pageIsLatest(): Promise<boolean> {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!script) return false;
  try {
    const sw = await fetch('./sw.js', { cache: 'no-store' }).then((r) => r.text());
    return sw.includes(new URL(script).pathname.split('/').pop()!);
  } catch {
    return false;
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // Just updated: say so, with the latest change (the full list is under Settings > What's new).
  // Kept short (the changes themselves are under What's new).
  if (justUpdatedFrom() && CHANGELOG.length) {
    toast('Chess Analyzer was updated.', 'success', { label: "What's new", run: () => (location.hash = '#/settings?whatsnew=1') });
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

  // Pages load from the network first, so after a deploy the page often already runs the new
  // version while the new worker is still installing. Then it just takes over quietly, with no
  // "new version" notice and no reload.
  const handle = async (worker: ServiceWorker) => {
    if (await pageIsLatest()) worker.postMessage('skip-waiting');
    else offerUpdate(worker);
  };
  if (reg.waiting && navigator.serviceWorker.controller) void handle(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) void handle(worker);
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
