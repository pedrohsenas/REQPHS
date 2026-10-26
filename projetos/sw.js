/* Service worker mínimo: abre o app sem sinal (rede primeiro, cache como reserva).
   Não intercepta Supabase nem CDNs de terceiros além das bibliotecas do PDF. */
const CACHE = "pj-v1";
const BASE = ["./", "index.html", "projetos.css", "projetos.js", "rdo-pdf.js", "manifest.webmanifest",
  "../config.js", "../logo.png", "../favicon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const proprio = u.origin === location.origin;
  const lib = /cdn\.jsdelivr\.net\/npm\/(pdf-lib|@pdf-lib|@supabase)/.test(u.href) || /fonts\.(googleapis|gstatic)\.com/.test(u.host);
  if (!proprio && !lib) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
