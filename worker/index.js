// Odisse · API do site (Cloudflare Worker + KV)
//
// Binding (wrangler.toml): KV Namespace `SITE`
//   indice                 -> lista ordenada de resumos dos projetos
//   projeto:<id>           -> projeto completo (JSON)
//   pagina:<nome>          -> Sobre, Contato, Privacidade, Busca e Notícias (JSON)
//   img:<ref>              -> imagem (binário; content-type nos metadados). <ref>-m = média (1200 px), <ref>-s = pequena (960 px)
//   ev:<dia>:<id>          -> uma visita (dados nos metadados da chave; expira em 400 dias)
//   ver:<tipo>:<id>:<iso>  -> versão anterior de um projeto ou página (as 10 últimas de cada um)
//   backup:<motivo>:<iso>  -> cópia de tudo (mensal: 12 últimas; manual: 5 últimas)
//   rss:cache              -> textos da Elaia (Substack), guardados por 1 hora
//   gerar:pedido           -> quando a geração das páginas estáticas foi pedida pela última vez (e a resposta do GitHub)
// Secrets: SITE_SENHA -> senha do painel (Authorization: Bearer <senha>)
//          GH_TOKEN   -> token do GitHub (fine-grained, só este repositório, Actions: read and write) para
//                        disparar o workflow "Páginas estáticas" — sem ele, nada é disparado (o agendamento
//                        diário do próprio workflow continua valendo)
//
// Rotas públicas
//   GET  /api/projetos                    -> projetos visíveis, na ordem do site
//   GET  /api/projetos/:slug[?previa=tok] -> projeto visível completo (ou oculto, com o link de prévia)
//   GET  /api/paginas/:nome               -> Sobre, Contato, Privacidade ou Busca (404 = ainda não editada)
//   GET  /api/noticias?de=0&n=5           -> notícias (próprias, links e Elaia), da mais nova para a mais antiga
//   GET  /img/:ref                        -> imagem
//   POST /api/coleta                      -> registra uma visita (enviado pelo próprio site)
// Rotas do painel (senha)
//   GET    /api/admin/projetos            -> todos os resumos (inclusive ocultos)
//   GET    /api/admin/projetos/:id        -> projeto completo
//   PUT    /api/admin/projetos/:id        -> grava projeto (guarda a versão anterior)
//   DELETE /api/admin/projetos/:id        -> apaga projeto (a última versão fica no histórico)
//   PUT    /api/admin/ordem               -> grava a ordem (lista de ids)
//   GET    /api/admin/paginas/:nome       -> conteúdo de uma página
//   PUT    /api/admin/paginas/:nome       -> grava o conteúdo (guarda a versão anterior)
//   PUT    /api/admin/imagens/:ref        -> grava imagem (corpo binário)
//   GET    /api/admin/versoes[/:tipo/:id] -> versões guardadas (todas, ou de um projeto/página)
//   GET    /api/admin/versao?chave=       -> conteúdo de uma versão
//   GET    /api/admin/backups             -> backups guardados
//   POST   /api/admin/backups             -> faz um backup agora
//   GET    /api/admin/backups/:chave      -> conteúdo de um backup
//   POST   /api/admin/link                -> lê título/descrição/imagem de um endereço (notícias)
//   GET    /api/admin/rss                 -> textos da Elaia, lidos agora
//   GET    /api/admin/metricas?dias=      -> painel de métricas do período (e do período anterior)
//   GET    /api/admin/gerar               -> estado do último pedido de geração das páginas estáticas
//   POST   /api/admin/gerar               -> pede a geração agora
// Depois de cada gravação (projeto, ordem, exclusão, página), o Worker pede ao GitHub a geração das
// páginas estáticas (Google, previews e a versão em inglês) — elas ficam prontas em ~2 minutos.
// Agendado (wrangler.toml → crons): todo dia, pede a geração (notícias da Elaia entram nas páginas);
// no dia 1 de cada mês, também o backup mensal.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Motivo',
  'Access-Control-Max-Age': '86400',
};
const MAX_IMG = 20 * 1024 * 1024;
const ID = /^[a-z0-9_-]{4,64}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// relevância na Home: sorteio a cada visita, em camadas (alta → média → baixa)
const RELEVANCIAS = ['alta', 'media', 'baixa'];
// busca = ficha do estúdio, títulos/descrições das páginas e imagem de compartilhamento
const PAGINAS = new Set(['sobre', 'contato', 'privacidade', 'busca', 'noticias']);
// workflow que regrava as páginas estáticas (disparado pelo Worker depois de cada gravação)
const REPO = 'cidclementino/portfolio-odisse';
const WORKFLOW = 'estaticas.yml';
const MAX_PAGINA = 400 * 1024;
const TZ = 'America/Sao_Paulo';
const ORIGENS = /^https?:\/\/(www\.)?odisse\.com\.br$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ROBOS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|axios|node-fetch|monitor/i;
// histórico: 10 versões por projeto/página; salvamentos em sequência (menos de 10 min
// depois da última versão guardada) contam como a mesma sessão de edição
const MAX_VERSOES = 10;
const SESSAO_MS = 10 * 60 * 1000;
const MAX_BACKUPS = { mensal: 12, manual: 5 };
const RSS_PADRAO = 'https://odisse.substack.com/feed';
const RSS_MS = 60 * 60 * 1000;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
const erro = (msg, status) => json({ error: msg }, status);

function autorizado(request, env) {
  const senha = env.SITE_SENHA;
  if (!senha) return false;
  const auth = request.headers.get('Authorization') || '';
  const dada = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (dada.length !== senha.length) return false;
  let dif = 0;
  for (let i = 0; i < senha.length; i++) dif |= dada.charCodeAt(i) ^ senha.charCodeAt(i);
  return dif === 0;
}

// lista todas as chaves de um prefixo (em ordem alfabética = cronológica nas nossas chaves)
async function chaves(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const pg = await kv.list({ prefix, cursor });
    out.push(...pg.keys);
    cursor = pg.list_complete ? undefined : pg.cursor;
  } while (cursor);
  return out;
}

// ---------------------------------------------------------------- projetos

const curto = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

function capaDe(p) {
  if (p.capa?.ref) return p.capa;
  const s = (p.secoes || []).find((x) => x.tipo === 'imagem' && x.ref);
  return s ? { ref: s.ref, w: s.w, h: s.h } : null;
}

const VERSAO_INDICE = 2; // sobe quando o resumo ganha campos novos (o índice é refeito sozinho)

function resumo(p) {
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.titulo || '',
    local: p.local || '',
    ano: p.ano || '',
    status: p.status || '',
    tipologia: p.tipologia || '',
    escala: p.escala || '',
    cliente: p.cliente || '',
    descricao: curto(p.descricao, 240),
    titulo_en: p.titulo_en || '',
    local_en: p.local_en || '',
    descricao_en: curto(p.descricao_en, 240),
    visivel: p.visivel !== false,
    relevancia: RELEVANCIAS.includes(p.relevancia) ? p.relevancia : 'media',
    antigos: p.enderecos_antigos || [],
    capa: capaDe(p),
    nimagens: (p.secoes || []).filter((s) => s.tipo === 'imagem').length,
    ntextos: (p.secoes || []).filter((s) => s.tipo === 'texto').length,
    atualizado: p.atualizado,
    v: VERSAO_INDICE,
  };
}

// o índice guardado antes de o resumo ganhar campos novos é refeito na primeira leitura
async function lerIndice(kv, cacheTtl) {
  const indice = (await kv.get('indice', cacheTtl ? { type: 'json', cacheTtl } : 'json')) || [];
  if (!indice.length || indice.every((r) => r.v === VERSAO_INDICE)) return indice;
  const novo = [];
  for (const r of indice) {
    const p = await kv.get(`projeto:${r.id}`, 'json');
    novo.push(p ? resumo(p) : r);
  }
  await kv.put('indice', JSON.stringify(novo));
  return novo;
}

// versão pública: sem campos internos (banco de imagens, redação e link de prévia são só do painel)
const publico = ({ visivel, criado, banco, redacao, previa, ...resto }) => ({
  ...resto,
  secoes: (resto.secoes || []).map(({ id, ...s }) => s),
  capa: capaDe(resto),
});

function validar(p, id) {
  if (!p || p.id !== id) return 'id não confere';
  if (!p.titulo || typeof p.titulo !== 'string') return 'falta o título';
  if (!SLUG.test(p.slug || '')) return 'endereço (slug) inválido';
  if (!Array.isArray(p.secoes)) return 'seções inválidas';
  if (p.relevancia !== undefined && !RELEVANCIAS.includes(p.relevancia)) return 'relevância inválida';
  if (p.previa !== undefined && p.previa !== '' && !ID.test(p.previa)) return 'link de prévia inválido';
  for (const s of p.secoes) {
    if (s.tipo === 'imagem' && s.ref && !ID.test(s.ref)) return 'imagem inválida';
    if (s.tipo !== 'imagem' && s.tipo !== 'texto') return 'tipo de seção inválido';
    if (s.tipo === 'texto' && s.largura && !['p', 'm', 'g'].includes(s.largura)) return 'largura de texto inválida';
  }
  if (p.banco !== undefined) {
    if (!Array.isArray(p.banco)) return 'banco de imagens inválido';
    for (const b of p.banco) if (!b || !ID.test(b.ref || '')) return 'imagem do banco inválida';
  }
  if (p.redacao !== undefined) {
    if (!Array.isArray(p.redacao)) return 'redação inválida';
    for (const r of p.redacao) if (typeof r !== 'string' && !(r && ID.test(r.id || ''))) return 'trecho da redação inválido';
  }
  return null;
}

// imagens usadas em qualquer objeto ({ ref } em qualquer profundidade)
function refsDe(obj, refs = new Set()) {
  if (Array.isArray(obj)) obj.forEach((x) => refsDe(x, refs));
  else if (obj && typeof obj === 'object') {
    if (typeof obj.ref === 'string' && obj.ref) refs.add(obj.ref);
    Object.values(obj).forEach((x) => refsDe(x, refs));
  }
  return refs;
}

// apaga as imagens candidatas que ninguém mais usa — nem projeto, nem página, nem
// versão guardada, nem backup. `protegidas`: usadas por algo recém-gravado (a listagem
// de chaves do KV pode demorar alguns segundos para mostrar o que acabou de entrar)
async function apagarOrfas(kv, candidatas, protegidas = new Set()) {
  const lista = [...candidatas].filter((r) => !protegidas.has(r));
  if (!lista.length) return;
  const usadas = new Set();
  for (const r of await lerIndice(kv)) refsDe(await kv.get(`projeto:${r.id}`, 'json'), usadas);
  for (const nome of PAGINAS) refsDe(await kv.get(`pagina:${nome}`, 'json'), usadas);
  for (const prefixo of ['ver:', 'backup:']) {
    for (const k of await chaves(kv, prefixo)) refsDe(await kv.get(k.name, 'json'), usadas);
  }
  const apagar = lista.filter((r) => !usadas.has(r));
  await Promise.all(apagar.flatMap((r) => [kv.delete(`img:${r}`), kv.delete(`img:${r}-m`), kv.delete(`img:${r}-p`), kv.delete(`img:${r}-s`)]));
}

// ---------------------------------------------------------------- histórico (versões)

// guarda `dados` (o estado que está sendo substituído) como versão de tipo/id.
// Devolve { guardada, podadas } — podadas = versões antigas que saíram (para limpar imagens)
async function guardarVersao(kv, tipo, id, dados, motivo = 'edicao') {
  if (!dados) return { guardada: false, podadas: [] };
  const prefixo = `ver:${tipo}:${id}:`;
  const lista = await chaves(kv, prefixo);
  const ultima = lista.at(-1);
  if (motivo === 'edicao' && ultima && Date.now() - Date.parse(ultima.name.slice(prefixo.length)) < SESSAO_MS) {
    return { guardada: false, podadas: [] };
  }
  const quando = new Date().toISOString();
  const meta = {
    quando,
    motivo,
    titulo: curto(tipo === 'projeto' ? dados.titulo : id, 80),
    atualizado: dados.atualizado || '',
    ...(tipo === 'projeto' ? {
      slug: dados.slug || '',
      ni: (dados.secoes || []).filter((s) => s.tipo === 'imagem').length,
      nt: (dados.secoes || []).filter((s) => s.tipo === 'texto').length,
      visivel: dados.visivel !== false,
    } : {}),
  };
  await kv.put(prefixo + quando, JSON.stringify(dados), { metadata: meta });
  const podadas = [];
  for (const k of lista.slice(0, Math.max(0, lista.length + 1 - MAX_VERSOES))) {
    podadas.push(await kv.get(k.name, 'json'));
    await kv.delete(k.name);
  }
  return { guardada: true, podadas };
}

async function listarVersoes(kv, prefixo) {
  const lista = await chaves(kv, prefixo);
  return lista.map((k) => {
    const [, tipo, id] = k.name.split(':');
    return { chave: k.name, tipo, id, ...(k.metadata || {}) };
  }).reverse(); // mais nova primeiro
}

// ---------------------------------------------------------------- backups

async function fazerBackup(kv, motivo) {
  const indice = await lerIndice(kv);
  const projetos = {};
  for (const r of indice) {
    const p = await kv.get(`projeto:${r.id}`, 'json');
    if (p) projetos[r.id] = p;
  }
  const paginas = {};
  for (const nome of PAGINAS) {
    const d = await kv.get(`pagina:${nome}`, 'json');
    if (d) paginas[nome] = d;
  }
  const criado = new Date().toISOString();
  const corpo = JSON.stringify({ criado, motivo, indice, projetos, paginas });
  const meta = { criado, motivo, nprojetos: Object.keys(projetos).length, npaginas: Object.keys(paginas).length, kb: Math.round(corpo.length / 1024) };
  await kv.put(`backup:${motivo}:${criado}`, corpo, { metadata: meta });
  // poda os mais antigos da mesma categoria
  const lista = await chaves(kv, `backup:${motivo}:`);
  const sobra = lista.slice(0, Math.max(0, lista.length - MAX_BACKUPS[motivo]));
  const candidatas = new Set();
  for (const k of sobra) {
    refsDe(await kv.get(k.name, 'json'), candidatas);
    await kv.delete(k.name);
  }
  return { meta, candidatas, protegidas: refsDe({ projetos, paginas }) };
}

// ---------------------------------------------------------------- notícias

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decodificar(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const semTags = (s) => decodificar(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function resumirTxt(t, max = 280) {
  t = String(t || '').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  return c.slice(0, c.lastIndexOf(' ') > max * 0.6 ? c.lastIndexOf(' ') : c.length).replace(/[,;:—–-]$/, '') + '…';
}
const httpOk = (u) => /^https:\/\/[^\s"'<>]+$/i.test(u || '');

function lerRss(xml) {
  const tag = (bloco, nome) => {
    const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
    return m ? m[1] : '';
  };
  const itens = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    const url = semTags(tag(b, 'link')) || semTags(tag(b, 'guid'));
    const conteudo = tag(b, 'content:encoded');
    const enc = b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i) || b.match(/<enclosure[^>]+type="image[^"]*"[^>]*url="([^"]+)"/i);
    const imgTxt = decodificar(conteudo).match(/<img[^>]+src="([^"]+)"/i);
    const data = new Date(semTags(tag(b, 'pubDate')) || semTags(tag(b, 'dc:date')));
    const img = decodificar(enc?.[1] || imgTxt?.[1] || '');
    itens.push({
      tipo: 'elaia',
      id: 'rss-' + url.replace(/[^a-z0-9]+/gi, '-').slice(-60),
      titulo: semTags(tag(b, 'title')),
      texto: resumirTxt(semTags(tag(b, 'description')) || semTags(conteudo)),
      url: httpOk(url) ? url : '',
      fonte: 'Elaia',
      data: Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10),
      imagem_url: httpOk(img) ? img : '',
    });
  }
  return itens.filter((x) => x.titulo && x.url);
}

async function buscarTexto(url, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OdisseSite/1.0; +https://www.odisse.com.br)', Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.text()).slice(0, 1_500_000);
  } finally {
    clearTimeout(t);
  }
}

// textos da Elaia: guardados por 1 hora; se o Substack não responder, fica a cópia anterior
async function rss(kv, url, forcar = false, ctx = null) {
  const cache = await kv.get('rss:cache', 'json');
  const fresco = cache && cache.url === url && Date.now() - cache.t < RSS_MS;
  if (fresco && !forcar) return cache.itens;
  const atualizar = async () => {
    try {
      const itens = lerRss(await buscarTexto(url));
      await kv.put('rss:cache', JSON.stringify({ t: Date.now(), url, itens }));
      return itens;
    } catch (e) {
      return cache && cache.url === url ? cache.itens : [];
    }
  };
  // com cópia (mesmo velha), responde na hora e atualiza por trás
  if (cache && cache.url === url && !forcar && ctx) {
    ctx.waitUntil(atualizar());
    return cache.itens;
  }
  return atualizar();
}

async function noticias(kv, ctx) {
  const d = (await kv.get('pagina:noticias', { type: 'json', cacheTtl: 60 })) || {};
  const proprias = (d.itens || []).filter((x) => x && x.titulo && x.oculta !== true).map((x) => ({
    tipo: x.tipo === 'link' ? 'link' : 'propria',
    id: x.id || '',
    titulo: x.titulo,
    titulo_en: x.titulo_en || '',
    texto: x.texto || '',
    texto_en: x.texto_en || '',
    url: x.url || '',
    fonte: x.fonte || '',
    data: x.data || '',
    imagem: x.imagem?.ref ? { ref: x.imagem.ref, w: x.imagem.w, h: x.imagem.h } : null,
    imagem_url: httpOk(x.imagem_url) ? x.imagem_url : '',
  }));
  let elaia = [];
  if (d.mostrar_rss !== false) {
    const ocultos = new Set(d.rss_ocultos || []);
    elaia = (await rss(kv, httpOk(d.rss) ? d.rss : RSS_PADRAO, false, ctx)).filter((x) => !ocultos.has(x.url));
  }
  return [...proprias, ...elaia].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}

// título, descrição, imagem e data de uma página externa (para pré-preencher um link nas notícias)
async function lerLink(url) {
  const html = await buscarTexto(url);
  const meta = (nome) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*>`, 'i');
    const m = html.match(re);
    if (!m) return '';
    const c = m[0].match(/content=["']([^"']*)["']/i);
    return c ? decodificar(c[1]).trim() : '';
  };
  const titulo = meta('og:title') || meta('twitter:title') || semTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  let img = meta('og:image') || meta('twitter:image');
  if (img && img.startsWith('/')) img = new URL(img, url).toString();
  const data = meta('article:published_time') || meta('og:published_time') || meta('date') || meta('pubdate');
  const dt = data ? new Date(data) : null;
  let fonte = meta('og:site_name');
  if (!fonte) { try { fonte = new URL(url).hostname.replace(/^www\./, ''); } catch { fonte = ''; } }
  return {
    titulo: curto(titulo, 200),
    texto: resumirTxt(meta('og:description') || meta('description') || meta('twitter:description')),
    fonte: curto(fonte, 80),
    imagem_url: httpOk(img) ? img : '',
    data: dt && !Number.isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : '',
  };
}

// ---------------------------------------------------------------- imagens

async function imagem(request, kv, ref, ctx) {
  const cache = caches.default;
  const chave = new Request(new URL(`/img/${ref}`, request.url).toString());
  let res = await cache.match(chave);
  if (res) return res;
  const { value, metadata } = await kv.getWithMetadata(`img:${ref}`, 'arrayBuffer');
  if (!value) {
    // imagem antiga sem a versão pequena: entrega a média, sem guardar em cache
    if (ref.endsWith('-s') || ref.endsWith('-p')) {
      const media = await kv.getWithMetadata(`img:${ref.slice(0, -2)}-m`, 'arrayBuffer');
      if (media.value) {
        return new Response(media.value, {
          headers: { 'Content-Type': media.metadata?.tipo || 'image/webp', 'Cache-Control': 'public, max-age=300', ...CORS },
        });
      }
    }
    return new Response('não encontrada', { status: 404, headers: CORS });
  }
  res = new Response(value, {
    headers: { 'Content-Type': metadata?.tipo || 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', ...CORS },
  });
  ctx.waitUntil(cache.put(chave, res.clone()));
  return res;
}

// ---------------------------------------------------------------- métricas

const diaDe = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

function dispositivo(ua) {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android|Opera Mini|IEMobile/i.test(ua)) return 'celular';
  return 'computador';
}

function dominio(ref) {
  if (!ref) return '';
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    if (/(^|\.)odisse\.com\.br$/.test(h) && !/^(projetos|marketing)\./.test(h)) return '';
    if (/^(l\.|lm\.|m\.)?instagram\.com$/.test(h)) return 'instagram.com';
    if (/^(l\.|lm\.|m\.)?facebook\.com$/.test(h)) return 'facebook.com';
    if (/^google\./.test(h)) return 'google';
    return h;
  } catch {
    return '';
  }
}

// canal de chegada de uma visita: campanha (utm), Google Ads (gclid), site de origem ou direto
function canal(e) {
  if (e.gc) return 'Google Ads';
  const u = String(e.ue !== undefined ? e.ue : e.u || '').toLowerCase();
  if (u) {
    if (/insta|^ig/.test(u)) return 'Instagram';
    if (/face|^fb|meta/.test(u)) return 'Facebook';
    if (/substack|elaia|newsletter/.test(u)) return 'Elaia (Substack)';
    if (/google|adwords|gads/.test(u)) return 'Google Ads';
    if (/whats/.test(u)) return 'WhatsApp';
    if (/linkedin/.test(u)) return 'LinkedIn';
    return `Campanha: ${u}`;
  }
  const r = e.oe !== undefined ? e.oe : e.r;
  if (!r) return 'Direto';
  if (r === 'instagram.com') return 'Instagram';
  if (r === 'facebook.com') return 'Facebook';
  if (r === 'google') return 'Google (busca)';
  if (/(^|\.)substack\.com$/.test(r)) return 'Elaia (Substack)';
  if (/linkedin\.com$|^lnkd\.in$/.test(r)) return 'LinkedIn';
  if (/whatsapp/.test(r)) return 'WhatsApp';
  if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com)$/.test(r)) return 'Outras buscas';
  if (/^(t\.co|x\.com|twitter\.com)$/.test(r)) return 'X (Twitter)';
  if (/tiktok\.com$/.test(r)) return 'TikTok';
  if (/youtube\.com$/.test(r)) return 'YouTube';
  if (r === 'projetos.odisse.com.br') return 'Odisse Serviços';
  if (/pinterest\./.test(r)) return 'Pinterest';
  return r;
}

async function hash(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const corta = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
const num = (v, max) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.round(+v))) : 0);

async function coletar(request, env) {
  const origem = request.headers.get('Origin') || '';
  if (origem && !ORIGENS.test(origem)) return new Response(null, { status: 204, headers: CORS });
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || ROBOS.test(ua)) return new Response(null, { status: 204, headers: CORS });
  let d;
  try {
    const txt = await request.text();
    if (txt.length > 4000) return new Response(null, { status: 413, headers: CORS });
    d = JSON.parse(txt);
  } catch {
    return new Response(null, { status: 400, headers: CORS });
  }
  const agora = new Date();
  const dia = diaDe(agora);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const cf = request.cf || {};
  const meta = {
    t: d.t === 'projeto' ? 'projeto' : 'pagina',
    p: corta(d.p, 120),
    s: corta(d.s, 80),
    via: ['home', 'relacionados', 'busca'].includes(d.via) ? d.via : '',
    r: dominio(d.r),
    u: corta(d.u, 40),
    // origem da ENTRADA no site (a mesma em todas as páginas da visita)
    oe: dominio(d.oe),
    ue: corta(d.ue, 40),
    gc: d.gc ? 1 : 0,
    l: d.l === 'en' ? 'en' : '',
    b: Array.isArray(d.b) ? [...new Set(d.b.map((x) => corta(String(x).toLowerCase().trim(), 40)).filter(Boolean))].slice(0, 4) : [],
    d: dispositivo(ua),
    c: corta(cf.country || '', 4),
    ci: corta(cf.city || '', 40),
    v: await hash(`${ip}|${ua}|${dia}|${env.SITE_SENHA || 'odisse'}`),
    dur: num(d.dur, 3600),
    sc: num(d.sc, 100),
    sv: num(d.sv, 200),
    st: num(d.st, 200),
    o: Array.isArray(d.o) ? [...new Set(d.o.map((x) => corta(x, 20)))].slice(0, 8) : [],
    h: Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(agora)),
  };
  // metadados do KV: até 1024 bytes
  for (const k of ['s', 'via', 'u', 'oe', 'ue', 'gc', 'l', 'b', 'sv', 'st']) {
    if (meta[k] === '' || meta[k] === 0 || (Array.isArray(meta[k]) && !meta[k].length)) delete meta[k];
  }
  const id = agora.getTime().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await env.SITE.put(`ev:${dia}:${id}`, '', { metadata: meta, expirationTtl: 400 * 86400 });
  } catch {
    /* limite de escrita do plano — a visita é perdida, o site segue */
  }
  return new Response(null, { status: 204, headers: CORS });
}

async function eventos(kv, inicio, fim) {
  // as chaves começam por ev:AAAA-MM-DD; lista mês a mês e filtra pelo dia
  const meses = new Set();
  for (let t = new Date(inicio + 'T12:00:00Z'); diaDe(t) <= fim; t = new Date(t.getTime() + 86400000)) meses.add(diaDe(t).slice(0, 7));
  const out = [];
  for (const mes of meses) {
    for (const k of await chaves(kv, `ev:${mes}`)) {
      const dia = k.name.slice(3, 13);
      if (dia >= inicio && dia <= fim && k.metadata) out.push({ dia, ...k.metadata });
    }
  }
  return out;
}

const CONTATOS = new Set(['whatsapp', 'email', 'telefone']);
const temContato = (e) => (e.o || []).some((o) => CONTATOS.has(o));

// agrupa os eventos por visita (mesma pessoa no mesmo dia), na ordem em que aconteceram
function visitas(evs) {
  const m = new Map();
  for (const e of evs) {
    const k = e.dia + e.v;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return [...m.values()].map((lista) => {
    const entrada = lista.find((e) => e.oe !== undefined || e.ue !== undefined || e.gc) || lista.find((e) => e.t === 'pagina') || lista[0];
    return {
      lista,
      canal: canal(entrada),
      contato: lista.some(temContato),
      whatsapp: lista.reduce((n, e) => n + ((e.o || []).includes('whatsapp') ? 1 : 0), 0),
      paginas: lista.filter((e) => e.t === 'pagina').length,
      projetos: new Set(lista.filter((e) => e.t === 'projeto' && e.s).map((e) => e.s)),
    };
  });
}

function resumir(evs) {
  const pag = evs.filter((e) => e.t === 'pagina');
  const proj = evs.filter((e) => e.t === 'projeto');
  const vs = visitas(evs);
  const comTempo = evs.filter((e) => e.dur > 0);
  const contatos = evs.reduce((n, e) => n + (e.o || []).filter((o) => CONTATOS.has(o)).length, 0);
  const comPagina = vs.filter((v) => v.paginas > 0);
  return {
    visitantes: vs.length,
    paginas: pag.length,
    projetos: proj.length,
    tempo: comTempo.length ? Math.round(comTempo.reduce((s, e) => s + e.dur, 0) / comTempo.length) : 0,
    contatos,
    taxa: vs.length ? Math.round((1000 * vs.filter((v) => v.contato).length) / vs.length) / 10 : 0,
    rejeicao: comPagina.length ? Math.round((100 * comPagina.filter((v) => v.paginas === 1).length) / comPagina.length) : 0,
  };
}

function mapa(lista, chave) {
  const m = new Map();
  for (const e of lista) {
    const k = chave(e);
    if (k === null || k === undefined || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
}

async function metricas(kv, dias) {
  const hoje = diaDe(new Date());
  const menos = (d, n) => diaDe(new Date(new Date(d + 'T12:00:00Z').getTime() - n * 86400000));
  const inicio = menos(hoje, dias - 1);
  const antFim = menos(inicio, 1);
  const antInicio = menos(antFim, dias - 1);
  const todos = await eventos(kv, antInicio, hoje);
  const atual = todos.filter((e) => e.dia >= inicio);
  const anterior = todos.filter((e) => e.dia <= antFim);
  const vs = visitas(atual);

  // série diária
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = menos(hoje, i);
    const doDia = atual.filter((e) => e.dia === d);
    serie.push({
      dia: d,
      visitantes: new Set(doDia.map((e) => e.v)).size,
      paginas: doDia.filter((e) => e.t === 'pagina').length,
      projetos: doDia.filter((e) => e.t === 'projeto').length,
      contatos: doDia.reduce((n, e) => n + (e.o || []).filter((o) => CONTATOS.has(o)).length, 0),
    });
  }

  // projetos: aberturas, por onde, tempo, até o fim e quantas visitas terminaram em contato
  const porProjeto = new Map();
  for (const e of atual.filter((x) => x.t === 'projeto' && x.s)) {
    const p = porProjeto.get(e.s) || { slug: e.s, vistas: 0, home: 0, relacionados: 0, busca: 0, tempo: 0, comTempo: 0, fim: 0, comSeq: 0 };
    p.vistas++;
    if (e.via === 'home') p.home++;
    if (e.via === 'relacionados') p.relacionados++;
    if (e.via === 'busca') p.busca++;
    if (e.dur > 0) { p.tempo += e.dur; p.comTempo++; }
    if (e.st > 0) { p.comSeq++; if (e.sv >= e.st) p.fim++; }
    porProjeto.set(e.s, p);
  }
  const projetos = [...porProjeto.values()].map((p) => {
    const comEle = vs.filter((v) => v.projetos.has(p.slug));
    return {
      slug: p.slug, vistas: p.vistas, visitas: comEle.length, home: p.home, relacionados: p.relacionados, busca: p.busca,
      tempo: p.comTempo ? Math.round(p.tempo / p.comTempo) : 0,
      fim: p.comSeq ? Math.round((100 * p.fim) / p.comSeq) : null,
      contato: comEle.filter((v) => v.contato).length,
    };
  }).sort((x, y) => y.vistas - x.vistas);

  // canais de chegada: visitas, projetos vistos, WhatsApp e quantas visitas viraram contato
  const porCanal = new Map();
  for (const v of vs) {
    const c = porCanal.get(v.canal) || { nome: v.canal, visitas: 0, paginas: 0, projetos: 0, whatsapp: 0, contato: 0 };
    c.visitas++;
    c.paginas += v.paginas;
    c.projetos += v.projetos.size;
    c.whatsapp += v.whatsapp;
    if (v.contato) c.contato++;
    porCanal.set(v.canal, c);
  }
  const canaisAnt = new Map();
  for (const v of visitas(anterior)) canaisAnt.set(v.canal, (canaisAnt.get(v.canal) || 0) + 1);
  const canais = [...porCanal.values()]
    .map((c) => ({ ...c, taxa: Math.round((1000 * c.contato) / c.visitas) / 10, antes: canaisAnt.get(c.nome) || 0 }))
    .sort((a, b) => b.visitas - a.visitas);

  // WhatsApp: de qual página saiu o clique
  const whatsPagina = mapa(atual.filter((e) => (e.o || []).includes('whatsapp')), (e) => (e.t === 'projeto' ? `/projeto/${e.s}` : e.p || '/'));

  const pag = atual.filter((e) => e.t === 'pagina');
  const horas = Array.from({ length: 24 }, (_, h) => pag.filter((e) => e.h === h).length);

  return {
    periodo: { inicio, fim: hoje, dias },
    total: resumir(atual),
    anterior: resumir(anterior),
    serie,
    projetos,
    canais,
    whatsapp: { total: atual.reduce((n, e) => n + ((e.o || []).includes('whatsapp') ? 1 : 0), 0), paginas: whatsPagina.slice(0, 10) },
    buscas: mapa(atual.flatMap((e) => (e.b || []).map((b) => ({ b }))), (x) => x.b).slice(0, 15),
    idiomas: mapa(pag, (e) => (e.l === 'en' ? 'Inglês' : 'Português')),
    paginas: mapa(pag, (e) => e.p || '/').slice(0, 12),
    origens: mapa(pag, (e) => (e.u ? `${e.u} (campanha)` : e.r || 'Direto')).slice(0, 12),
    dispositivos: mapa(pag, (e) => e.d),
    lugares: mapa(pag, (e) => (e.ci ? `${e.ci}${e.c && e.c !== 'BR' ? ', ' + e.c : ''}` : e.c || null)).slice(0, 12),
    saidas: mapa(atual.flatMap((e) => (e.o || []).map((o) => ({ o }))), (x) => x.o),
    horas,
  };
}

// ---------------------------------------------------------------- gravações (com histórico)

async function gravarProjeto(kv, ctx, p, motivo) {
  const indice = await lerIndice(kv);
  if (indice.some((r) => r.slug === p.slug && r.id !== p.id)) return { erro: ['já existe um projeto com este endereço', 409] };
  const antigo = await kv.get(`projeto:${p.id}`, 'json');
  // endereços antigos: guardados pelo servidor a cada troca, para redirecionar ao atual
  const antigos = new Set([...(antigo?.enderecos_antigos || []), ...(p.enderecos_antigos || [])]);
  if (antigo?.slug && antigo.slug !== p.slug) antigos.add(antigo.slug);
  antigos.delete(p.slug); // voltou a um endereço antigo: ele deixa de ser antigo
  p.enderecos_antigos = [...antigos];
  p.criado = antigo?.criado || p.criado || new Date().toISOString();
  p.atualizado = new Date().toISOString();
  const versao = await guardarVersao(kv, 'projeto', p.id, antigo, motivo);
  await kv.put(`projeto:${p.id}`, JSON.stringify(p));
  const i = indice.findIndex((r) => r.id === p.id);
  if (i >= 0) indice[i] = resumo(p);
  else indice.unshift(resumo(p)); // projeto novo (ou restaurado) entra no topo
  await kv.put('indice', JSON.stringify(indice));
  const novas = refsDe(p);
  const candidatas = new Set([...refsDe(antigo)].filter((r) => !novas.has(r)));
  refsDe(versao.podadas, candidatas);
  const protegidas = new Set([...novas, ...(versao.guardada ? refsDe(antigo) : [])]);
  ctx.waitUntil(apagarOrfas(kv, candidatas, protegidas));
  return { p };
}

async function gravarPagina(kv, ctx, nome, pg, motivo) {
  const antiga = await kv.get(`pagina:${nome}`, 'json');
  pg.atualizado = new Date().toISOString();
  const versao = await guardarVersao(kv, 'pagina', nome, antiga, motivo);
  await kv.put(`pagina:${nome}`, JSON.stringify(pg));
  const novas = refsDe(pg);
  const candidatas = new Set([...refsDe(antiga)].filter((r) => !novas.has(r)));
  refsDe(versao.podadas, candidatas);
  const protegidas = new Set([...novas, ...(versao.guardada ? refsDe(antiga) : [])]);
  ctx.waitUntil(apagarOrfas(kv, candidatas, protegidas));
  return pg;
}

// ---------------------------------------------------------------- páginas estáticas (GitHub Actions)

// Pede ao GitHub uma execução do workflow "Páginas estáticas". O próprio workflow tem
// concurrency: várias gravações seguidas viram, no máximo, uma execução em andamento e
// uma na fila (que já lê o estado mais novo da nuvem).
async function pedirGeracao(env, motivo) {
  if (!env.GH_TOKEN) return { ok: false, erro: 'sem GH_TOKEN' };
  let r, txt = '';
  try {
    r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'odisse-site-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!r.ok) txt = (await r.text()).slice(0, 200);
  } catch (e) {
    txt = e.message;
  }
  const estado = { quando: new Date().toISOString(), motivo, ok: !!r?.ok, status: r?.status || 0, ...(txt ? { erro: txt } : {}) };
  try { await env.SITE.put('gerar:pedido', JSON.stringify(estado)); } catch { /* limite de escrita: segue */ }
  return estado;
}

// ---------------------------------------------------------------- roteador

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const partes = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).map((x) => decodeURIComponent(x));
    const kv = env.SITE;

    // imagens públicas
    if (partes[0] === 'img' && partes[1] && (request.method === 'GET' || request.method === 'HEAD')) {
      if (!ID.test(partes[1])) return erro('ref inválida', 400);
      return imagem(request, kv, partes[1], ctx);
    }
    if (partes[0] !== 'api') return erro('rota não encontrada', 404);

    // ---- público
    if (partes[1] === 'coleta' && request.method === 'POST') return coletar(request, env);

    if (partes[1] === 'projetos' && request.method === 'GET') {
      const indice = await lerIndice(kv, 60);
      const cache = { 'Cache-Control': 'public, max-age=60' };
      if (!partes[2]) return json(indice.filter((r) => r.visivel).map(({ visivel, antigos, v, ...r }) => r), 200, cache);
      // link de prévia: projeto oculto, aberto só com o código certo (sem cache)
      const previa = url.searchParams.get('previa') || '';
      if (previa) {
        const r = indice.find((x) => x.slug === partes[2]);
        const p = r && (await kv.get(`projeto:${r.id}`, 'json'));
        if (!p || !p.previa || p.previa !== previa) return json({ error: 'não encontrado' }, 404, { 'Cache-Control': 'no-store' });
        return json({ ...publico(p), previa: true }, 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      }
      const r = indice.find((x) => x.slug === partes[2] && x.visivel);
      if (!r) {
        // endereço antigo de um projeto que mudou de endereço: manda para o atual
        const movido = indice.find((x) => x.visivel && (x.antigos || []).includes(partes[2]));
        if (movido) {
          return new Response(null, { status: 302, headers: { Location: `/api/projetos/${encodeURIComponent(movido.slug)}`, ...CORS, ...cache } });
        }
        return erro('não encontrado', 404);
      }
      const p = await kv.get(`projeto:${r.id}`, { type: 'json', cacheTtl: 60 });
      return p ? json(publico(p), 200, cache) : erro('não encontrado', 404);
    }

    if (partes[1] === 'noticias' && request.method === 'GET') {
      const todas = await noticias(kv, ctx);
      const de = Math.max(0, Math.min(10000, +url.searchParams.get('de') || 0));
      const n = Math.max(1, Math.min(20, +url.searchParams.get('n') || 5));
      return json({ total: todas.length, de, itens: todas.slice(de, de + n) }, 200, { 'Cache-Control': 'public, max-age=120' });
    }

    if (partes[1] === 'paginas' && PAGINAS.has(partes[2]) && partes[2] !== 'noticias' && request.method === 'GET') {
      const pg = await kv.get(`pagina:${partes[2]}`, { type: 'json', cacheTtl: 60 });
      return pg ? json(pg, 200, { 'Cache-Control': 'public, max-age=60' }) : erro('ainda não editada', 404);
    }

    // ---- painel
    if (partes[1] !== 'admin') return erro('rota não encontrada', 404);
    if (!autorizado(request, env)) return erro('não autorizado', 401);
    const [, , recurso, id, id2] = partes;

    if (recurso === 'gerar') {
      if (request.method === 'POST') return json(await pedirGeracao(env, 'manual'));
      if (request.method === 'GET') return json((await kv.get('gerar:pedido', 'json')) || {});
    }
    // o que muda o site (projetos, ordem, páginas) pede a geração das páginas estáticas
    // (a busca/compartilhamento e as notícias também: estão nas páginas geradas)
    const resposta = await rotaAdmin(request, env, ctx, kv, url, recurso, id, id2);
    if (resposta.ok && ['PUT', 'DELETE'].includes(request.method) && ['projetos', 'ordem', 'paginas'].includes(recurso)) {
      ctx.waitUntil(pedirGeracao(env, `${recurso}${id ? ':' + id : ''}`));
    }
    return resposta;
  },

  // todo dia: pede a geração (notícias novas da Elaia entram nas páginas); dia 1: backup mensal
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pedirGeracao(env, 'diario'));
    if (new Date(event.scheduledTime).getUTCDate() !== 1) return;
    const b = await fazerBackup(env.SITE, 'mensal');
    ctx.waitUntil(apagarOrfas(env.SITE, b.candidatas, b.protegidas));
  },
};

// ---------------------------------------------------------------- rotas do painel (senha já conferida)
async function rotaAdmin(request, env, ctx, kv, url, recurso, id, id2) {
  {
    const motivo = request.headers.get('X-Motivo') === 'restauracao' ? 'restauracao' : 'edicao';

    if (recurso === 'paginas') {
      if (!PAGINAS.has(id)) return erro('página inválida', 404);
      if (request.method === 'GET') {
        const pg = await kv.get(`pagina:${id}`, 'json');
        return pg ? json(pg) : erro('ainda não editada', 404);
      }
      if (request.method === 'PUT') {
        const txt = await request.text();
        if (txt.length > MAX_PAGINA) return erro('conteúdo grande demais', 413);
        let pg;
        try { pg = JSON.parse(txt); } catch { return erro('JSON inválido', 400); }
        if (!pg || typeof pg !== 'object' || Array.isArray(pg)) return erro('conteúdo inválido', 400);
        if ([...refsDe(pg)].some((r) => !ID.test(r))) return erro('imagem inválida', 400);
        await gravarPagina(kv, ctx, id, pg, motivo);
        return json({ ok: true, atualizado: pg.atualizado });
      }
    }

    if (recurso === 'versoes' && request.method === 'GET') {
      if (id && id2) {
        if (!['projeto', 'pagina'].includes(id)) return erro('tipo inválido', 400);
        return json(await listarVersoes(kv, `ver:${id}:${id2}:`));
      }
      return json(await listarVersoes(kv, 'ver:'));
    }
    if (recurso === 'versao' && request.method === 'GET') {
      const chave = url.searchParams.get('chave') || '';
      if (!/^ver:(projeto|pagina):[a-z0-9_-]+:[0-9TZ:.-]+$/i.test(chave)) return erro('chave inválida', 400);
      const v = await kv.get(chave, 'json');
      return v ? json(v) : erro('versão não encontrada', 404);
    }

    if (recurso === 'backups') {
      if (request.method === 'POST' && !id) {
        const b = await fazerBackup(kv, 'manual');
        ctx.waitUntil(apagarOrfas(kv, b.candidatas, b.protegidas));
        return json({ ok: true, ...b.meta });
      }
      if (request.method === 'GET' && !id) {
        const lista = await chaves(kv, 'backup:');
        return json(lista.map((k) => ({ chave: k.name, ...(k.metadata || {}) })).sort((a, b) => (b.criado || '').localeCompare(a.criado || '')));
      }
      if (request.method === 'GET' && id) {
        if (!/^backup:(mensal|manual):[0-9TZ:.-]+$/.test(id)) return erro('chave inválida', 400);
        const b = await kv.get(id, 'json');
        return b ? json(b) : erro('backup não encontrado', 404);
      }
    }

    if (recurso === 'link' && request.method === 'POST') {
      let d;
      try { d = await request.json(); } catch { return erro('JSON inválido', 400); }
      if (!/^https?:\/\//i.test(d?.url || '')) return erro('endereço inválido', 400);
      try { return json(await lerLink(d.url)); } catch (e) { return erro(`não consegui ler a página (${e.message})`, 502); }
    }
    if (recurso === 'rss' && request.method === 'GET') {
      const d = (await kv.get('pagina:noticias', 'json')) || {};
      const fonte = url.searchParams.get('url') || (httpOk(d.rss) ? d.rss : RSS_PADRAO);
      if (!httpOk(fonte)) return erro('endereço inválido', 400);
      return json({ url: fonte, itens: await rss(kv, fonte, true) });
    }

    if (id && !ID.test(id)) return erro('id inválido', 400);

    if (recurso === 'projetos') {
      if (!id && request.method === 'GET') return json(await lerIndice(kv));
      if (id && request.method === 'GET') {
        const p = await kv.get(`projeto:${id}`, 'json');
        return p ? json(p) : erro('não encontrado', 404);
      }
      if (id && request.method === 'PUT') {
        let p;
        try { p = await request.json(); } catch { return erro('JSON inválido', 400); }
        const problema = validar(p, id);
        if (problema) return erro(problema, 400);
        const r = await gravarProjeto(kv, ctx, p, motivo);
        if (r.erro) return erro(...r.erro);
        return json({ ok: true, atualizado: p.atualizado, resumo: resumo(p) });
      }
      if (id && request.method === 'DELETE') {
        const p = await kv.get(`projeto:${id}`, 'json');
        // o projeto excluído fica no histórico (pode ser restaurado pelo painel)
        const versao = await guardarVersao(kv, 'projeto', id, p, 'exclusao');
        await kv.delete(`projeto:${id}`);
        await kv.put('indice', JSON.stringify((await lerIndice(kv)).filter((r) => r.id !== id)));
        ctx.waitUntil(apagarOrfas(kv, refsDe(versao.podadas), refsDe(p)));
        return json({ ok: true });
      }
    }

    if (recurso === 'ordem' && request.method === 'PUT') {
      let ids;
      try { ids = await request.json(); } catch { return erro('JSON inválido', 400); }
      if (!Array.isArray(ids)) return erro('lista inválida', 400);
      const indice = await lerIndice(kv);
      const pos = new Map(ids.map((x, i) => [x, i]));
      indice.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
      await kv.put('indice', JSON.stringify(indice));
      return json({ ok: true });
    }

    if (recurso === 'imagens' && id && request.method === 'PUT') {
      const tipo = request.headers.get('Content-Type') || 'image/webp';
      if (!tipo.startsWith('image/')) return erro('só imagens', 415);
      const corpo = await request.arrayBuffer();
      if (corpo.byteLength > MAX_IMG) return erro('imagem grande demais', 413);
      await kv.put(`img:${id}`, corpo, { metadata: { tipo } });
      return json({ ok: true });
    }

    if (recurso === 'metricas' && request.method === 'GET') {
      const dias = [7, 30, 90].includes(+url.searchParams.get('dias')) ? +url.searchParams.get('dias') : 30;
      return json(await metricas(kv, dias));
    }

    return erro('rota não encontrada', 404);
  }
}
