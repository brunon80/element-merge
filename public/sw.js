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
/**
 * O nome do cache carrega o DIRETÓRIO onde o SW foi instalado: a produção
 * (ebma-element-merge-v5) e o preview da dev (ebma-dev-v5) convivem no MESMO
 * domínio github.io. ARMADILHA (descoberta 05/nov ao instalar o preview em
 * subpasta): caches são compartilhados por ORIGEM, então o activate de um SW
 * que apaga "tudo que não é ele" destrói o cache offline do OUTRO mundo. A
 * purga é limitada à família do próprio diretório (+ os nomes legados sem
 * diretório, ebma-v2/v3). (Lição do botão sumido: shell velho no cache.)
 */
const SITE_DIR =
  new URL('./', self.location).pathname
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .pop() || 'root';
// 06/nov (4º bump): a raiz do Pages publicou um build de dias atrás por ~14h
// (o 2º checkout do deploy trocou o dist-main/ recém-construído pelo commitado
// no git). Os aparelhos guardaram essa casca velha — sem bump, o cache teimoso
// do iPhone continuaria servindo o shell sem o modo de desempenho mesmo depois
// do deploy corrigido.
const CACHE = `ebma-${SITE_DIR}-v6`; // purga por diretório, não por origem

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // purga SÓ a família deste diretório de instalação (+ legados ebma-vN
      // sem diretório); o cache do outro mundo (produção ↔ preview /dev/) é
      // intocável — same-origin não é same-site
      const mine = (k) => k.startsWith(`ebma-${SITE_DIR}-`) || /^ebma-v\d+$/.test(k);
      await Promise.all(keys.filter((k) => mine(k) && k !== CACHE).map((k) => caches.delete(k)));
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
