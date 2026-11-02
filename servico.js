const versao = 'ja_era_uma_vez_v257';
const arquivos = [
  './scripts/orientacoes_poderes.js',
  './scripts/avisos_personagens.js',
  './scripts/vozes_personagens.js',
  './audio/personagens/manifesto.json',
  './audio/personagens/01_rapunzel.wav',
  './audio/personagens/02_rei.wav',
  './audio/personagens/03_cacador.wav',
  './audio/personagens/04_golem.wav',
  './audio/personagens/05_joao_maria.wav',
  './audio/personagens/06_frankenstein.wav',
  './audio/personagens/07_lobo_mau.wav',
  './audio/personagens/08_espelho_magico.wav',
  './audio/personagens/09_patinho_feio.wav',
  './audio/personagens/10_coelho.wav',
  './audio/personagens/11_grilo_falante.wav',
  './audio/personagens/12_sereia.wav',
  './audio/personagens/13_flautista.wav',
  './audio/personagens/14_chapeleiro.wav',
  './audio/personagens/15_dom_quixote.wav',
  './audio/personagens/16_robin_hood.wav',
  './audio/personagens/17_pinoquio.wav',
  './audio/personagens/18_sombra_peter_pan.wav',
  './audio/personagens/19_porquinho.wav',
  './audio/personagens/20_genio.wav',
  './audio/personagens/21_rumpelstiltskin.wav',
  './audio/personagens/22_curupira.wav',
  './scripts/audio.js',
  './scripts/timbres.js',
  './audio/tema_principal.wav',
  './',
  './index.html',
  './estilos/estilo.css',
  './estilos/padroes.css',
  './scripts/cartas.js',
  './scripts/icones.js',
  './scripts/sprites.js',
  './Personagens/Personagens.png',
  './scripts/regras.js',
  './scripts/ia.js',
  './scripts/solo.js',
  './scripts/ia_worker.js',
  './scripts/interface.js',
  './scripts/armazenamento.js',
  './scripts/principal.js',
  './scripts/fluxo_jogadores.js',
  './scripts/iniciar.js',
  './scripts/consulta_poderes.js',
  './scripts/manual.js',
  './scripts/marcador_sumario.js',
  './scripts/inspecao.js',
  './scripts/animacoes.js',
  './scripts/movimento.js',
  './scripts/construcao.js',
  './manifesto.webmanifest',
  './Fonte/Comfortaa-VariableFont_wght.ttf',
  './Fonte/OFL.txt',
  './imagens/icones/Icone.png',
  './imagens/icones/icone_32.png',
  './imagens/icones/apple_touch_180.png',
  './imagens/icones/icone_maskable_512.png',
  './imagens/icones/icone_192.png',
  './imagens/icones/icone_512.png',
];
const prefixo =
  'ja_era_uma_vez:' + encodeURIComponent(new URL(self.registration.scope).pathname) + ':';
const nomeCache = prefixo + versao;
const escopo = new URL(self.registration.scope);
const recursos = new Set(arquivos.map((a) => new URL(a, escopo).pathname));
function canonica(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(nomeCache);
      await cache.addAll(arquivos.map((a) => new Request(new URL(a, escopo), { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const chave of await caches.keys())
        if (chave.startsWith(prefixo) && chave !== nomeCache) await caches.delete(chave);
      await self.clients.claim();
      for (const cliente of await self.clients.matchAll()) cliente.postMessage('offline_pronto');
    })(),
  );
});
self.addEventListener('message', (evento) => {
  if (evento.data === 'verificar_offline')
    evento.waitUntil(
      (async () => {
        const cache = await caches.open(nomeCache);
        const presentes = await Promise.all(arquivos.map((a) => cache.match(new URL(a, escopo))));
        if (presentes.every(Boolean)) evento.source?.postMessage('offline_pronto');
      })(),
    );
});
self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (
    evento.request.method !== 'GET' ||
    url.origin !== escopo.origin ||
    !recursos.has(url.pathname)
  )
    return;
  evento.respondWith(
    (async () => {
      const cache = await caches.open(nomeCache),
        chave = canonica(url);
      const midia = /\.(?:wav|png|ttf|woff2?)$/i.test(url.pathname);
      if (midia) {
        const salva = await cache.match(chave);
        if (salva) return salva;
      }
      try {
        const resposta = await fetch(evento.request, { cache: 'no-cache' });
        if (resposta.ok) {
          const copia = resposta.clone();
          evento.waitUntil(cache.put(chave, copia).catch(() => {}));
        }
        return resposta;
      } catch (erro) {
        const salva = await cache.match(chave);
        if (salva) return salva;
        throw erro;
      }
    })(),
  );
});
