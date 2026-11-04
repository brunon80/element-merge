/* Service Worker — Elemental Battle: Merge Arena
 *
 * Sem Workbox e sem lista de hashes: o build do Vite gera assets com hash no
 * nome, e runtime cache resolve isso sozinho.
 *
 * Estratégias:
 *  - navegação: network-first (deploy novo entra na hora quando há rede);
 *    offline cai no shell ('./') salvo no último acesso online;
 *  - GET same-origin: stale-while-revalidate — o jogo inteiro (JS/CSS/ícones)
 *    entra no cache na primeira partida online e roda offline depois disso.
 *
 * Em DEV este SW NEM É REGISTRADO (ver main.tsx): SW servindo módulos em dev
 * é a velha armadilha do transform obsoleto — o QA roda contra o dev server.
 * Ao mexer neste arquivo, suba o CACHE (ex.: ebma-v2) para purgar versões
 * antigas no activate.
 */
const CACHE = 'ebma-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      const cache = await caches.open(CACHE);
      if (!(await cache.match('./'))) {
        try {
          await cache.add('./');
        } catch {
          /* sem rede no primeiro activate: a navegação preenche depois */
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // flutuante de propósito: esperar aqui invalidaria o waitUntil do fetch
          caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./')),
        ),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => null);
      if (hit) {
        refresh.catch(() => {}); // revalida em segundo plano
        return hit;
      }
      const res = await refresh;
      return res || hit || new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })(),
  );
});
