/* Controle de Embalagem — service worker (app instalado no tablet).
   Só cuida de duas coisas:
   1) a página do app (o escopo é o próprio Index.html): busca SEMPRE na rede primeiro — é assim que a versão nova do
      GitHub chega — e guarda uma cópia. Sem internet, abre a cópia guardada (antes, sem internet o app nem abria).
   2) as bibliotecas do cdnjs/jsdelivr/Google Fonts: o endereço já tem a versão, então a cópia vale para sempre.
   Supabase (banco) e todo o resto passam direto, sem cópia nenhuma. */
var CACHE = 'emb-app-v1';
var LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js'
];
var EXTERNO = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

function chave(url) { var u = new URL(url); return u.origin + u.pathname; }   // ?v=… não cria outra cópia
// só guarda página inteira do app (arquivo pela metade ou de outro sistema nunca vira a cópia offline)
function completo(t) { return typeof t === 'string' && t.length > 200000 && /<!--APP-FIM-->\s*<\/html>\s*$/.test(t); }

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var c = await caches.open(CACHE);
    await Promise.all(LIBS.map(async function (u) {
      try { if (await c.match(u)) return; var r = await fetch(u, { mode: 'no-cors' }); await c.put(u, r); } catch (err) { }
    }));
    try {
      var r = await fetch(self.registration.scope, { cache: 'no-cache', credentials: 'same-origin' });
      if (r.ok) { var t = await r.clone().text(); if (completo(t)) await c.put(chave(self.registration.scope), r); }
    } catch (err) { }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var ks = await caches.keys();
    await Promise.all(ks.filter(function (k) { return k.indexOf('emb-app-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    if (chave(req.url) !== chave(self.registration.scope)) return;   // outra página do mesmo site: não é comigo
    e.respondWith(pagina(req));
    return;
  }
  if (EXTERNO.test(req.url)) e.respondWith(biblioteca(req));
});

async function pagina(req) {
  var c = await caches.open(CACHE), k = chave(req.url);
  try {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 7000);   // rede lenta: abre a cópia
    var r = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      var txt = await r.clone().text();
      if (completo(txt)) await c.put(k, r.clone());
      return r;
    }
    return (await c.match(k)) || r;
  } catch (err) {
    var copia = await c.match(k);
    if (copia) return copia;
    return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui,sans-serif;background:#121212;color:#eee;padding:28px;line-height:1.5">' +
      '<h2 style="margin:0 0 8px">Sem internet</h2><p>O app ainda não tinha sido guardado neste tablet. Conecte à internet e abra de novo.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function biblioteca(req) {
  var c = await caches.open(CACHE);
  var h = await c.match(req);
  if (h) return h;
  try {
    var r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(function () { });
    return r;
  } catch (err) { return Response.error(); }
}
