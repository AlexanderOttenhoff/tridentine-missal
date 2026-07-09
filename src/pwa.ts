// Registers the service worker (see public/sw.js) for offline use. Only in
// production builds — a service worker in dev would cache Vite's module graph and
// fight HMR. Registered on window `load` so it never contends with the initial
// render for bandwidth. BASE_URL carries the GitHub Pages sub-path in production.

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {});
  });
}
