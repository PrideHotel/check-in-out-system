import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

/** How often an open tab checks for a newer deployment. */
const CHECK_EVERY_MS = 15 * 60 * 1000;

// Every production build gives the app's script a new, content-hashed name
// (`/assets/index-<hash>.js`), so comparing the one this tab is running with
// the one the server lists right now tells us whether a newer version is live.
const ENTRY_SCRIPT = /\/assets\/index-[\w-]+\.js/;

function runningEntryScript() {
  const script = [...document.querySelectorAll('script[type="module"][src]')].find((el) =>
    ENTRY_SCRIPT.test(el.getAttribute('src') ?? '')
  );
  return script?.getAttribute('src')?.match(ENTRY_SCRIPT)?.[0] ?? null;
}

async function deployedEntryScript() {
  const response = await fetch(`/?version-check=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  // Read the module <script> tag itself, not just the first matching name:
  // the page may also preload other chunks, which are not the app's entry.
  const html = await response.text();
  const tag = [...html.matchAll(/<script\b[^>]*>/g)]
    .map((match) => match[0])
    .find((t) => /type=["']module["']/.test(t) && ENTRY_SCRIPT.test(t));
  return tag?.match(ENTRY_SCRIPT)?.[0] ?? null;
}

/**
 * Tells someone whose tab has been open since before a deployment that a new
 * version is available. Without this, a long-lived tab (or a phone that keeps
 * the page in memory) keeps running the old app indefinitely — showing, for
 * example, a button that has since been changed.
 */
const UpdateBanner = () => {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const running = runningEntryScript();
    // Development server, or an unusual host: nothing to compare against.
    if (!running) return undefined;

    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const deployed = await deployedEntryScript();
        if (!stopped && deployed && deployed !== running) setUpdateReady(true);
      } catch {
        // Offline or a blip: try again at the next check.
      }
    };

    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm text-sky-900">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          A new version of the app is available.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh now
        </button>
      </div>
    </div>
  );
};

export default UpdateBanner;
