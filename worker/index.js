// Odisse · API do site (Cloudflare Worker + KV)
//
// Binding (wrangler.toml): KV Namespace `SITE`
//   indice           -> lista ordenada de resumos dos projetos (a ordem da lista é a ordem no site)
//   projeto:<id>     -> projeto completo (JSON)
//   pagina:<nome>    -> conteúdo das páginas Sobre e Contato (JSON)
//   img:<ref>        -> imagem (binário; content-type nos metadados). <ref>-m = versão média (1200 px)
//   ev:<dia>:<id>    -> uma visita (dados nos metadados da chave; expira em 400 dias)
// Secret: SITE_SENHA -> senha do painel (Authorization: Bearer <senha>)
//
// Rotas públicas
//   GET  /api/projetos               -> projetos visíveis, na ordem do site
//   GET  /api/projetos/:slug         -> projeto visível completo
//   GET  /api/paginas/:nome          -> conteúdo de Sobre ou Contato (404 = ainda não editado)
//   GET  /img/:ref                   -> imagem
//   POST /api/coleta                 -> registra uma visita (enviado pelo próprio site)
// Rotas do painel (senha)
//   GET    /api/admin/projetos       -> todos os resumos (inclusive ocultos)
//   GET    /api/admin/projetos/:id   -> projeto completo
//   PUT    /api/admin/projetos/:id   -> grava projeto
//   DELETE /api/admin/projetos/:id   -> apaga projeto e as imagens que só ele usava
//   PUT    /api/admin/ordem          -> grava a ordem (lista de ids)
//   GET    /api/admin/paginas/:nome  -> conteúdo de Sobre ou Contato
//   PUT    /api/admin/paginas/:nome  -> grava o conteúdo
//   PUT    /api/admin/imagens/:ref   -> grava imagem (corpo binário)
//   GET    /api/admin/metricas?dias= -> painel de métricas do período (e do período anterior)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
const MAX_IMG = 20 * 1024 * 1024;
const ID = /^[a-z0-9_-]{4,64}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGINAS = new Set(['sobre', 'contato']);
const MAX_PAGINA = 200 * 1024;
const TZ = 'America/Sao_Paulo';
const ORIGENS = /^https?:\/\/(www\.)?odisse\.com\.br$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ROBOS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|axios|node-fetch|monitor/i;

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

// ---------------------------------------------------------------- projetos

const lerIndice = async (kv, cacheTtl) => (await kv.get('indice', cacheTtl ? { type: 'json', cacheTtl } : 'json')) || [];

function refsDe(p) {
  const refs = new Set();
  if (p?.capa?.ref) refs.add(p.capa.ref);
  for (const s of p?.secoes || []) if (s.tipo === 'imagem' && s.ref) refs.add(s.ref);
  for (const b of p?.banco || []) if (b?.ref) refs.add(b.ref); // banco de imagens do projeto
  return refs;
}

// imagens usadas numa página (qualquer objeto { ref } em qualquer profundidade)
function refsPagina(obj, refs = new Set()) {
  if (Array.isArray(obj)) obj.forEach((x) => refsPagina(x, refs));
  else if (obj && typeof obj === 'object') {
    if (typeof obj.ref === 'string' && obj.ref) refs.add(obj.ref);
    Object.values(obj).forEach((x) => refsPagina(x, refs));
  }
  return refs;
}

function capaDe(p) {
  if (p.capa?.ref) return p.capa;
  const s = (p.secoes || []).find((x) => x.tipo === 'imagem' && x.ref);
  return s ? { ref: s.ref, w: s.w, h: s.h } : null;
}

function resumo(p) {
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.titulo || '',
    local: p.local || '',
    ano: p.ano || '',
    status: p.status || '',
    visivel: p.visivel !== false,
    capa: capaDe(p),
    nimagens: (p.secoes || []).filter((s) => s.tipo === 'imagem').length,
    ntextos: (p.secoes || []).filter((s) => s.tipo === 'texto').length,
    atualizado: p.atualizado,
  };
}

// versão pública: sem campos internos (o banco de imagens é só do painel)
const publico = ({ visivel, criado, banco, ...resto }) => ({ ...resto, capa: capaDe(resto) });

function validar(p, id) {
  if (!p || p.id !== id) return 'id não confere';
  if (!p.titulo || typeof p.titulo !== 'string') return 'falta o título';
  if (!SLUG.test(p.slug || '')) return 'endereço (slug) inválido';
  if (!Array.isArray(p.secoes)) return 'seções inválidas';
  for (const s of p.secoes) {
    if (s.tipo === 'imagem' && s.ref && !ID.test(s.ref)) return 'imagem inválida';
    if (s.tipo !== 'imagem' && s.tipo !== 'texto') return 'tipo de seção inválido';
    if (s.tipo === 'texto' && s.largura && !['p', 'm', 'g'].includes(s.largura)) return 'largura de texto inválida';
  }
  if (p.banco !== undefined) {
    if (!Array.isArray(p.banco)) return 'banco de imagens inválido';
    for (const b of p.banco) if (!b || !ID.test(b.ref || '')) return 'imagem do banco inválida';
  }
  return null;
}

// apaga as imagens que ninguém mais usa — nem outro projeto, nem as páginas.
// ignorar: { projeto: id } ou { pagina: nome } (quem está sendo regravado)
async function apagarOrfas(kv, refs, ignorar = {}) {
  if (!refs.size) return;
  const usadas = new Set();
  for (const r of await lerIndice(kv)) {
    if (r.id === ignorar.projeto) continue;
    for (const ref of refsDe(await kv.get(`projeto:${r.id}`, 'json'))) usadas.add(ref);
  }
  for (const nome of PAGINAS) {
    if (nome === ignorar.pagina) continue;
    refsPagina(await kv.get(`pagina:${nome}`, 'json'), usadas);
  }
  const apagar = [...refs].filter((r) => !usadas.has(r));
  await Promise.all(apagar.flatMap((r) => [kv.delete(`img:${r}`), kv.delete(`img:${r}-m`)]));
}

// ---------------------------------------------------------------- imagens

async function imagem(request, kv, ref, ctx) {
  const cache = caches.default;
  const chave = new Request(new URL(`/img/${ref}`, request.url).toString());
  let res = await cache.match(chave);
  if (res) return res;
  const { value, metadata } = await kv.getWithMetadata(`img:${ref}`, 'arrayBuffer');
  if (!value) return new Response('não encontrada', { status: 404, headers: CORS });
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
    via: d.via === 'home' ? 'home' : '',
    r: dominio(d.r),
    u: corta(d.u, 40),
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
    let cursor;
    do {
      const pg = await kv.list({ prefix: `ev:${mes}`, cursor });
      for (const k of pg.keys) {
        const dia = k.name.slice(3, 13);
        if (dia >= inicio && dia <= fim && k.metadata) out.push({ dia, ...k.metadata });
      }
      cursor = pg.list_complete ? undefined : pg.cursor;
    } while (cursor);
  }
  return out;
}

const CONTATOS = new Set(['whatsapp', 'email', 'telefone']);

function resumir(evs) {
  const pag = evs.filter((e) => e.t === 'pagina');
  const proj = evs.filter((e) => e.t === 'projeto');
  const visitantes = new Set(evs.map((e) => e.dia + e.v)).size;
  const comTempo = evs.filter((e) => e.dur > 0);
  const contatos = evs.reduce((n, e) => n + (e.o || []).filter((o) => CONTATOS.has(o)).length, 0);
  const mapa = (lista, chave) => {
    const m = new Map();
    for (const e of lista) {
      const k = chave(e);
      if (k === null || k === undefined) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ nome, n }));
  };
  const visitas = new Map();
  for (const e of pag) visitas.set(e.dia + e.v, (visitas.get(e.dia + e.v) || 0) + 1);
  return {
    visitantes,
    paginas: pag.length,
    projetos: proj.length,
    tempo: comTempo.length ? Math.round(comTempo.reduce((s, e) => s + e.dur, 0) / comTempo.length) : 0,
    contatos,
    rejeicao: visitas.size ? Math.round((100 * [...visitas.values()].filter((n) => n === 1).length) / visitas.size) : 0,
    _mapa: mapa,
  };
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

  const r = resumir(atual);
  const a = resumir(anterior);
  const mapa = r._mapa;

  // série diária
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = menos(hoje, i);
    const doDia = atual.filter((e) => e.dia === d);
    serie.push({ dia: d, visitantes: new Set(doDia.map((e) => e.v)).size, paginas: doDia.filter((e) => e.t === 'pagina').length, projetos: doDia.filter((e) => e.t === 'projeto').length });
  }

  // projetos: vistas, tempo médio e quantos chegaram ao fim da sequência
  const porProjeto = new Map();
  for (const e of atual.filter((x) => x.t === 'projeto' && x.s)) {
    const p = porProjeto.get(e.s) || { slug: e.s, vistas: 0, home: 0, tempo: 0, comTempo: 0, fim: 0, comSeq: 0 };
    p.vistas++;
    if (e.via === 'home') p.home++;
    if (e.dur > 0) { p.tempo += e.dur; p.comTempo++; }
    if (e.st > 0) { p.comSeq++; if (e.sv >= e.st) p.fim++; }
    porProjeto.set(e.s, p);
  }
  const projetos = [...porProjeto.values()]
    .map((p) => ({ slug: p.slug, vistas: p.vistas, home: p.home, tempo: p.comTempo ? Math.round(p.tempo / p.comTempo) : 0, fim: p.comSeq ? Math.round((100 * p.fim) / p.comSeq) : null }))
    .sort((x, y) => y.vistas - x.vistas);

  const horas = Array.from({ length: 24 }, (_, h) => atual.filter((e) => e.t === 'pagina' && e.h === h).length);

  return {
    periodo: { inicio, fim: hoje, dias },
    total: { visitantes: r.visitantes, paginas: r.paginas, projetos: r.projetos, tempo: r.tempo, contatos: r.contatos, rejeicao: r.rejeicao },
    anterior: { visitantes: a.visitantes, paginas: a.paginas, projetos: a.projetos, tempo: a.tempo, contatos: a.contatos, rejeicao: a.rejeicao },
    serie,
    projetos,
    paginas: mapa(atual.filter((e) => e.t === 'pagina'), (e) => e.p || '/').slice(0, 12),
    origens: mapa(atual.filter((e) => e.t === 'pagina'), (e) => (e.u ? `${e.u} (campanha)` : e.r || 'Direto')).slice(0, 12),
    dispositivos: mapa(atual.filter((e) => e.t === 'pagina'), (e) => e.d),
    lugares: mapa(atual.filter((e) => e.t === 'pagina'), (e) => (e.ci ? `${e.ci}${e.c && e.c !== 'BR' ? ', ' + e.c : ''}` : e.c || null)).slice(0, 12),
    saidas: mapa(atual.flatMap((e) => (e.o || []).map((o) => ({ o }))), (x) => x.o),
    horas,
  };
}

// ---------------------------------------------------------------- roteador

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const partes = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
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
      if (!partes[2]) return json(indice.filter((r) => r.visivel).map(({ visivel, ...r }) => r), 200, cache);
      const r = indice.find((x) => x.slug === partes[2] && x.visivel);
      if (!r) return erro('não encontrado', 404);
      const p = await kv.get(`projeto:${r.id}`, { type: 'json', cacheTtl: 60 });
      return p ? json(publico(p), 200, cache) : erro('não encontrado', 404);
    }

    if (partes[1] === 'paginas' && PAGINAS.has(partes[2]) && request.method === 'GET') {
      const pg = await kv.get(`pagina:${partes[2]}`, { type: 'json', cacheTtl: 60 });
      return pg ? json(pg, 200, { 'Cache-Control': 'public, max-age=60' }) : erro('ainda não editada', 404);
    }

    // ---- painel
    if (partes[1] !== 'admin') return erro('rota não encontrada', 404);
    if (!autorizado(request, env)) return erro('não autorizado', 401);
    const [, , recurso, id] = partes;

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
        const novas = refsPagina(pg);
        if ([...novas].some((r) => !ID.test(r))) return erro('imagem inválida', 400);
        const antiga = await kv.get(`pagina:${id}`, 'json');
        pg.atualizado = new Date().toISOString();
        await kv.put(`pagina:${id}`, JSON.stringify(pg));
        const removidas = new Set([...refsPagina(antiga)].filter((r) => !novas.has(r)));
        ctx.waitUntil(apagarOrfas(kv, removidas, { pagina: id }));
        return json({ ok: true, atualizado: pg.atualizado });
      }
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
        const indice = await lerIndice(kv);
        if (indice.some((r) => r.slug === p.slug && r.id !== id)) return erro('já existe um projeto com este endereço', 409);
        const antigo = await kv.get(`projeto:${id}`, 'json');
        p.criado = antigo?.criado || p.criado || new Date().toISOString();
        p.atualizado = new Date().toISOString();
        await kv.put(`projeto:${id}`, JSON.stringify(p));
        const i = indice.findIndex((r) => r.id === id);
        if (i >= 0) indice[i] = resumo(p);
        else indice.unshift(resumo(p)); // projeto novo entra no topo
        await kv.put('indice', JSON.stringify(indice));
        if (antigo) {
          const novas = refsDe(p);
          const removidas = new Set([...refsDe(antigo)].filter((r) => !novas.has(r)));
          ctx.waitUntil(apagarOrfas(kv, removidas, { projeto: id }));
        }
        return json({ ok: true, atualizado: p.atualizado, resumo: resumo(p) });
      }
      if (id && request.method === 'DELETE') {
        const p = await kv.get(`projeto:${id}`, 'json');
        await kv.delete(`projeto:${id}`);
        await kv.put('indice', JSON.stringify((await lerIndice(kv)).filter((r) => r.id !== id)));
        ctx.waitUntil(apagarOrfas(kv, refsDe(p), { projeto: id }));
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
  },
};
