/* ═══════════════════════════════════════════════════════════════
   ZEN5 Service Worker — Estratégia Offline-First
   
   ESTRATÉGIA POR TIPO DE RECURSO:
   ─ Shell (HTML, manifest)     → Cache First + Network Update
   ─ Áudios MP3                 → Cache First (pesados — nunca revalidar)
   ─ Requests de API externos   → Network Only (não cacheamos dados externos)
   
   IMPORTANTE: Incremente CACHE_VERSION a cada deploy para invalidar cache.
═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'zen5-v1';
const CACHE_SHELL   = `${CACHE_VERSION}-shell`;
const CACHE_AUDIOS  = `${CACHE_VERSION}-audios`;

/* Recursos do shell — cacheados na instalação */
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
];

/* Nomes dos áudios — cacheados quando o usuário os ouve pela primeira vez */
const AUDIO_FILES = [
  'zen5_01_respira-e-para.mp3',
  'zen5_02_aterra-agora.mp3',
  'zen5_03_desliga-o-dia.mp3',
  'zen5_04_antes-de-dormir.mp3',
  'zen5_05_foco-limpo.mp3',
  'zen5_06_reset-do-meio-dia.mp3',
  'zen5_07_modo-calmo-ativado.mp3',
  'zen5_08_sos.mp3',
];

/* ── INSTALL: pré-cache do shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove caches antigas ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_AUDIOS)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: roteamento inteligente ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Áudios MP3 — Cache First (se não tiver, busca e armazena) */
  if(AUDIO_FILES.some(f => url.pathname.endsWith(f))){
    event.respondWith(cacheFirstAudio(event.request));
    return;
  }

  /* Shell assets — Cache First com fallback para rede */
  if(url.pathname.endsWith('.html') || url.pathname.endsWith('manifest.json') || url.pathname === url.origin + '/'){
    event.respondWith(cacheFirstShell(event.request));
    return;
  }

  /* Tudo mais — Network First (fonts externas removidas — não vai cair aqui) */
  event.respondWith(networkFirst(event.request));
});

/* ── ESTRATÉGIAS ── */

async function cacheFirstAudio(request){
  const cached = await caches.match(request);
  if(cached) return cached;
  try {
    const response = await fetch(request);
    if(response.ok){
      const cache = await caches.open(CACHE_AUDIOS);
      cache.put(request, response.clone()); /* Armazena para próximo uso offline */
    }
    return response;
  } catch {
    /* Offline e não cacheado ainda — retorna 503 gracioso */
    return new Response(
      JSON.stringify({ error: 'Áudio não disponível offline. Ouça uma vez com internet para cachear.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirstShell(request){
  const cached = await caches.match(request);
  if(cached){
    /* Atualiza cache em background sem bloquear resposta */
    fetch(request).then(r => {
      if(r.ok) caches.open(CACHE_SHELL).then(c => c.put(request, r));
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if(response.ok){
      const cache = await caches.open(CACHE_SHELL);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('./index.html'); /* Fallback para shell */
  }
}

async function networkFirst(request){
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
