// Odisse · Painel do site — projetos e métricas, guardados na nuvem
// (Cloudflare Worker "site-odisse" + KV — ver worker/).

import { mark } from '../assets/js/marks.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ nuvem
const CHAVE = 'odisse-site-painel';
const API = (() => {
  try { return (localStorage.getItem('odisse-api') || window.Odisse.API).replace(/\/$/, ''); } catch { return window.Odisse.API; }
})();
const senha = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null')?.senha || ''; } catch { return ''; } };
function guardarSenha(s) {
  try {
    if (s) { localStorage.setItem(CHAVE, JSON.stringify({ senha: s })); localStorage.setItem('odisse-admin', '1'); }
    else { localStorage.removeItem(CHAVE); localStorage.removeItem('odisse-admin'); }
  } catch { /* sem armazenamento */ }
}

async function req(caminho, opc = {}, s = senha()) {
  const res = await fetch(API + caminho, { ...opc, headers: { Authorization: `Bearer ${s}`, ...(opc.headers || {}) } });
  if (res.status === 401) { sair(); throw new Error('Senha incorreta.'); }
  if (!res.ok) {
    let msg = `O servidor respondeu ${res.status}.`;
    try { msg = (await res.json()).error || msg; } catch { /* corpo vazio */ }
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return res.json();
}
const nuvem = {
  lista: () => req('/api/admin/projetos'),
  ler: (id) => req(`/api/admin/projetos/${id}`),
  gravar: (p) => req(`/api/admin/projetos/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }),
  apagar: (id) => req(`/api/admin/projetos/${id}`, { method: 'DELETE' }),
  ordem: (ids) => req('/api/admin/ordem', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) }),
  imagem: (ref, blob) => req(`/api/admin/imagens/${ref}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }),
  metricas: (dias) => req(`/api/admin/metricas?dias=${dias}`),
  pagina: (nome) => req(`/api/admin/paginas/${nome}`),
  gravarPagina: (nome, d) => req(`/api/admin/paginas/${nome}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
};
const imgUrl = (ref, m = true) => `${API}/img/${ref}${m ? '-m' : ''}`;
const novoId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

// ------------------------------------------------------------------ avisos
let tAviso;
function aviso(txt, erro = false) {
  const a = $('#aviso');
  a.textContent = txt;
  a.classList.toggle('erro', erro);
  a.classList.add('on');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => a.classList.remove('on'), erro ? 5000 : 2600);
}

// ------------------------------------------------------------------ imagens
// Converte para WebP (ou JPEG, onde o navegador não gera WebP): 2400, 1200 e 640 px no lado maior
// (a de 640 px é a das capas na Home).
async function reduzir(bmp, max) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
  return { blob, w, h };
}
async function enviarImagem(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const grande = await reduzir(bmp, 2400);
  const media = await reduzir(bmp, 1200);
  const pequena = await reduzir(bmp, 640);
  bmp.close?.();
  const ref = novoId();
  await nuvem.imagem(ref, grande.blob);
  await nuvem.imagem(`${ref}-m`, media.blob);
  await nuvem.imagem(`${ref}-p`, pequena.blob);
  return { ref, w: grande.w, h: grande.h };
}

// ------------------------------------------------------------------ vistas
let vista = '';
function mostrar(v, menu = v === 'editor' ? 'projetos' : v) {
  vista = v;
  document.body.className = `vista-${v}`;
  if (v !== 'editor') fecharSeletor();
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.menu === menu));
}

function rota() {
  if (!senha()) return mostrar('login');
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, id] = h.split('/');
  if (nome === 'metricas') { mostrar('metricas'); return carregarMetricas(); }
  if (nome === 'sobre' || nome === 'contato') { mostrar('pagina', nome); return abrirPagina(nome); }
  if (nome === 'novo') { mostrar('editor'); return abrirEditor(null); }
  if (nome === 'projeto' && id) { mostrar('editor'); return abrirEditor(id); }
  mostrar('projetos');
  carregarLista();
}

window.addEventListener('hashchange', () => {
  if (vista === 'editor' && ed.sujo && !location.hash.startsWith(`#/projeto/${ed.p?.id}`)) {
    if (!confirm('Há alterações não salvas neste projeto. Sair mesmo assim?')) {
      history.replaceState(null, '', ed.novo ? '#/novo' : `#/projeto/${ed.p.id}`);
      return;
    }
    ed.sujo = false;
  }
  if (vista === 'pagina' && pg.sujo && location.hash !== `#/${pg.nome}`) {
    if (!confirm(`Há alterações não salvas na página ${PAG_NOME[pg.nome]}. Sair mesmo assim?`)) {
      history.replaceState(null, '', `#/${pg.nome}`);
      return;
    }
    pg.sujo = false;
  }
  rota();
});
window.addEventListener('beforeunload', (e) => {
  if ((vista === 'editor' && (ed.sujo || ed.enviando)) || (vista === 'pagina' && (pg.sujo || pg.enviando))) { e.preventDefault(); e.returnValue = ''; }
});

// ------------------------------------------------------------------ entrada
$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const s = $('#loginSenha').value;
  $('#btEntrar').disabled = true;
  $('#loginErro').textContent = '';
  try {
    const res = await fetch(API + '/api/admin/projetos', { headers: { Authorization: `Bearer ${s}` } });
    if (res.status === 401) throw new Error('Senha incorreta.');
    if (!res.ok) throw new Error(`O servidor respondeu ${res.status}.`);
    guardarSenha(s);
    $('#loginSenha').value = '';
    rota();
  } catch (err) {
    $('#loginErro').textContent = err.message === 'Failed to fetch' ? 'Não consegui falar com a nuvem. Verifique a conexão.' : err.message;
  } finally {
    $('#btEntrar').disabled = false;
  }
});
function sair() {
  guardarSenha(null);
  mostrar('login');
}
$('#btSair').addEventListener('click', () => { sair(); location.hash = ''; });

// ------------------------------------------------------------------ lista de projetos
let indice = [];

async function carregarLista() {
  const lista = $('#lista');
  if (!indice.length) lista.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    indice = await nuvem.lista();
  } catch (err) {
    lista.innerHTML = `<p class="vazio">Não foi possível carregar os projetos: ${esc(err.message)}</p>`;
    return;
  }
  desenharLista();
}

function desenharLista() {
  const vis = indice.filter((r) => r.visivel).length;
  $('#projInfo').textContent = indice.length
    ? `${indice.length} ${indice.length === 1 ? 'projeto' : 'projetos'} · ${vis} no site. A ordem da lista é a ordem da Home — arraste para mudar.`
    : 'Nenhum projeto na nuvem ainda.';
  $('#avisoImportar').hidden = indice.length > 0;
  const lista = $('#lista');
  if (!indice.length) { lista.innerHTML = ''; return; }
  lista.innerHTML = indice.map((r, i) => `
    <div class="proj${r.visivel ? '' : ' oculto'}" data-id="${r.id}" draggable="true">
      <span class="alca" title="Arraste para reordenar">⋮⋮</span>
      <span class="proj-n">${i + 1}</span>
      <a class="proj-capa" href="#/projeto/${r.id}">${r.capa?.ref ? `<img src="${imgUrl(r.capa.ref)}" alt="" loading="lazy">` : ''}</a>
      <div class="proj-info">
        <a class="proj-nome" href="#/projeto/${r.id}">${esc(r.titulo) || 'Sem título'}</a>
        <div class="proj-meta">
          ${[r.local, r.ano].filter(Boolean).map(esc).join(' · ')}
          ${r.status ? `<span class="chip">${esc(r.status)}</span>` : ''}
          <span>${r.nimagens} ${r.nimagens === 1 ? 'imagem' : 'imagens'} · ${r.ntextos} ${r.ntextos === 1 ? 'texto' : 'textos'}</span>
        </div>
      </div>
      <label class="chave" title="Mostrar ou esconder do site"><input type="checkbox" data-acao="visivel" ${r.visivel ? 'checked' : ''}><b>${r.visivel ? 'No site' : 'Oculto'}</b></label>
      <div class="proj-acoes">
        <button class="bt ico" data-acao="subir" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="bt ico" data-acao="descer" title="Descer" ${i === indice.length - 1 ? 'disabled' : ''}>↓</button>
        <a class="bt" href="#/projeto/${r.id}">Editar</a>
        <button class="bt perigo" data-acao="apagar">Excluir</button>
      </div>
    </div>`).join('');
}

async function salvarOrdem() {
  desenharLista();
  try {
    await nuvem.ordem(indice.map((r) => r.id));
    aviso('Ordem salva.');
  } catch (err) {
    aviso(`Não foi possível salvar a ordem: ${err.message}`, true);
  }
}

$('#lista').addEventListener('click', async (e) => {
  const bt = e.target.closest('[data-acao]');
  if (!bt || bt.dataset.acao === 'visivel') return;
  const id = bt.closest('.proj').dataset.id;
  const i = indice.findIndex((r) => r.id === id);
  if (bt.dataset.acao === 'subir' && i > 0) { [indice[i - 1], indice[i]] = [indice[i], indice[i - 1]]; salvarOrdem(); }
  if (bt.dataset.acao === 'descer' && i < indice.length - 1) { [indice[i + 1], indice[i]] = [indice[i], indice[i + 1]]; salvarOrdem(); }
  if (bt.dataset.acao === 'apagar') {
    if (!confirm(`Excluir “${indice[i].titulo}”? O projeto e as imagens dele saem da nuvem e do site.`)) return;
    try {
      await nuvem.apagar(id);
      indice.splice(i, 1);
      desenharLista();
      aviso('Projeto excluído.');
    } catch (err) { aviso(`Não foi possível excluir: ${err.message}`, true); }
  }
});

$('#lista').addEventListener('change', async (e) => {
  if (e.target.dataset.acao !== 'visivel') return;
  const linha = e.target.closest('.proj');
  const id = linha.dataset.id;
  const visivel = e.target.checked;
  e.target.disabled = true;
  try {
    const p = await nuvem.ler(id);
    p.visivel = visivel;
    const res = await nuvem.gravar(p);
    indice[indice.findIndex((r) => r.id === id)] = res.resumo;
    desenharLista();
    aviso(visivel ? 'Projeto visível no site.' : 'Projeto escondido do site.');
  } catch (err) {
    e.target.checked = !visivel;
    e.target.disabled = false;
    aviso(`Não foi possível alterar: ${err.message}`, true);
  }
});

// arrastar para reordenar
let arrastado = null;
$('#lista').addEventListener('dragstart', (e) => {
  const linha = e.target.closest?.('.proj');
  if (!linha) return;
  arrastado = linha;
  linha.classList.add('arrastando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', linha.dataset.id);
});
$('#lista').addEventListener('dragover', (e) => {
  if (!arrastado) return;
  const alvo = e.target.closest('.proj');
  if (!alvo || alvo === arrastado) return;
  e.preventDefault();
  const r = alvo.getBoundingClientRect();
  const antes = e.clientY < r.top + r.height / 2;
  $$('.proj').forEach((p) => p.classList.remove('alvo-antes', 'alvo-depois'));
  alvo.classList.add(antes ? 'alvo-antes' : 'alvo-depois');
});
$('#lista').addEventListener('drop', (e) => {
  if (!arrastado) return;
  e.preventDefault();
  const alvo = e.target.closest('.proj');
  if (!alvo || alvo === arrastado) return;
  const antes = alvo.classList.contains('alvo-antes');
  const de = indice.findIndex((r) => r.id === arrastado.dataset.id);
  const [item] = indice.splice(de, 1);
  let para = indice.findIndex((r) => r.id === alvo.dataset.id);
  if (!antes) para++;
  indice.splice(para, 0, item);
  salvarOrdem();
});
$('#lista').addEventListener('dragend', () => {
  arrastado = null;
  $$('.proj').forEach((p) => p.classList.remove('arrastando', 'alvo-antes', 'alvo-depois'));
});

$('#btNovo').addEventListener('click', () => { location.hash = '#/novo'; });

// importar os projetos que estavam no site (Jekyll) para a nuvem
$('#btImportar').addEventListener('click', async () => {
  const bt = $('#btImportar');
  bt.disabled = true;
  try {
    const semente = await (await fetch('semente.json', { cache: 'no-store' })).json();
    for (const [n, s] of semente.entries()) {
      bt.textContent = `Importando ${n + 1} de ${semente.length}…`;
      const secoes = [];
      for (const sec of s.secoes) {
        if (sec.tipo === 'imagem') {
          const blob = await (await fetch(sec.arquivo)).blob();
          secoes.push({ tipo: 'imagem', alt: sec.alt || '', ...(await enviarImagem(blob)) });
        } else secoes.push({ tipo: 'texto', texto: sec.texto });
      }
      const { secoes: _, ...info } = s;
      await nuvem.gravar({ ...info, id: novoId(), visivel: true, capa: null, secoes });
    }
    // a ordem antiga do site: YVC, DCMCC, Altavista (cada novo entra no topo, então inverte)
    indice = await nuvem.lista();
    const ordem = semente.map((s) => indice.find((r) => r.slug === s.slug)?.id).filter(Boolean);
    await nuvem.ordem(ordem);
    aviso('Projetos importados.');
    carregarLista();
  } catch (err) {
    aviso(`A importação parou: ${err.message}`, true);
  } finally {
    bt.disabled = false;
    bt.textContent = 'Importar projetos atuais';
  }
});

// ------------------------------------------------------------------ editor
// O projeto tem duas listas de imagens:
//   banco  -> todas as imagens enviadas para o projeto (coluna da direita)
//   secoes -> a sequência publicada: imagens (tiradas do banco) e textos
// Tirar uma imagem da sequência não a apaga: ela continua no banco.
const ed = { p: null, novo: false, sujo: false, enviando: 0, slugManual: false, filtro: 'todas' };
const CAMPOS = { fTitulo: 'titulo', fSlug: 'slug', fLocal: 'local', fAno: 'ano', fArea: 'area', fCliente: 'cliente', fTipologia: 'tipologia', fStatus: 'status' };
const LARGURAS = { p: 'P', m: 'M', g: 'G' };
const LARG_TIT = { p: 'Estreito — uma coluna esguia', m: 'Médio — uma coluna larga', g: 'Largo — duas colunas, para textos longos' };

function slugDe(txt) {
  return String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// banco = o que já estava no banco + toda imagem da sequência + a capa
// (projetos criados antes do banco existir ganham o banco aqui)
function montarBanco(p) {
  const vistos = new Set();
  const out = [];
  const add = (x) => { if (x?.ref && !vistos.has(x.ref)) { vistos.add(x.ref); out.push({ ref: x.ref, w: x.w, h: x.h }); } };
  (p.banco || []).forEach(add);
  p.secoes.filter((s) => s.tipo === 'imagem').forEach(add);
  add(p.capa);
  return out;
}

async function abrirEditor(id) {
  ed.sujo = false;
  ed.enviando = 0;
  ed.novo = !id;
  fecharSeletor();
  if (id) {
    $('#esteira').innerHTML = '<p class="esteira-vazia">Carregando…</p>';
    $('#banco').innerHTML = '';
    try {
      ed.p = await nuvem.ler(id);
    } catch (err) {
      aviso(`Não foi possível abrir o projeto: ${err.message}`, true);
      location.hash = '#/projetos';
      return;
    }
  } else {
    ed.p = { id: novoId(), titulo: '', slug: '', local: 'João Pessoa, Brasil', ano: String(new Date().getFullYear()), cliente: '', tipologia: '', area: '', status: '', visivel: false, capa: null, banco: [], secoes: [] };
  }
  ed.p.banco = montarBanco(ed.p);
  ed.slugManual = !!id;
  for (const [campo, chave] of Object.entries(CAMPOS)) $('#' + campo).value = ed.p[chave] ?? '';
  $('#fVisivel').checked = ed.p.visivel !== false;
  desenharEditor();
  estado(ed.novo ? 'pendente' : 'pronto', ed.novo ? 'Projeto novo, ainda não salvo' : '');
  if (ed.novo) setTimeout(() => $('#fTitulo').focus(), 50);
}

function estado(e, txt) {
  $('#sinc').dataset.estado = e;
  $('#sincTxt').textContent = txt || '';
  $('#btSalvar').disabled = ed.enviando > 0 || e === 'salvando';
}
function mudou() {
  ed.sujo = true;
  estado(ed.enviando ? 'enviando' : 'pendente', ed.enviando ? `Enviando ${ed.enviando}…` : 'Alterações não salvas');
  desenharTopoEditor();
}

function desenharTopoEditor() {
  $('#edTitulo').textContent = ed.p.titulo || 'Projeto sem título';
  const ver = $('#btVer');
  ver.href = ed.p.slug ? `/projeto/?p=${encodeURIComponent(ed.p.slug)}` : '#';
  ver.hidden = ed.novo || ed.p.visivel === false;
}

function desenharEditor() {
  desenharTopoEditor();
  desenharCapa();
  desenharEsteira();
  desenharBanco();
}

const srcDe = (x) => x._preview || (x.ref ? imgUrl(x.ref) : '');

function desenharCapa() {
  const imgs = ed.p.banco.filter((b) => b.ref);
  const atual = ed.p.capa?.ref || '';
  $('#capaEscolha').innerHTML =
    `<button class="${atual ? '' : 'ativo'}" data-ref="" title="Usar a primeira imagem da sequência"><span class="auto">Primeira imagem</span></button>` +
    imgs.map((b) => `<button class="${atual === b.ref ? 'ativo' : ''}" data-ref="${b.ref}"><img src="${srcDe(b)}" alt="" loading="lazy"></button>`).join('');
}
$('#capaEscolha').addEventListener('click', (e) => {
  const bt = e.target.closest('button');
  if (!bt) return;
  const b = ed.p.banco.find((x) => x.ref && x.ref === bt.dataset.ref);
  ed.p.capa = b ? { ref: b.ref, w: b.w, h: b.h } : null;
  desenharCapa();
  mudou();
});

// ---- banco de imagens (coluna da direita)
const posicoesDe = (ref) => ed.p.secoes.reduce((a, s, i) => (s.tipo === 'imagem' && ref && s.ref === ref ? [...a, i + 1] : a), []);

function desenharBanco() {
  const banco = ed.p.banco;
  const livres = banco.filter((b) => b.ref && !posicoesDe(b.ref).length).length;
  $('#bancoInfo').textContent = banco.length
    ? `${banco.length} ${banco.length === 1 ? 'imagem' : 'imagens'} · ${livres} fora da sequência`
    : 'Nenhuma imagem ainda';
  $$('#bancoFiltro button').forEach((b) => b.classList.toggle('ativo', b.dataset.f === ed.filtro));
  const el = $('#banco');
  if (!banco.length) {
    el.innerHTML = '<div class="banco-vazio"><span>Envie aqui todas as imagens do projeto.</span><button class="bt" data-acao="b-enviar">Escolher arquivos</button><span>ou solte os arquivos nesta coluna</span></div>';
    return;
  }
  const itens = banco.map((b, k) => ({ b, k, pos: posicoesDe(b.ref) }))
    .filter(({ b, pos }) => ed.filtro === 'todas' || !b.ref || !pos.length);
  if (!itens.length) { el.innerHTML = '<p class="banco-nada">Todas as imagens do banco já estão na sequência.</p>'; return; }
  el.innerHTML = '<div class="banco-grade">' + itens.map(({ b, k, pos }) => `
    <div class="bimg${pos.length ? ' em-uso' : ''}${b._enviando ? ' subindo' : ''}" data-k="${k}" draggable="${b.ref ? 'true' : 'false'}"
      title="${pos.length ? `Na sequência: posição ${pos.join(', ')}` : 'Fora da sequência'} — arraste para a sequência">
      <img src="${srcDe(b)}" alt="" loading="lazy" draggable="false">
      ${pos.length ? `<span class="uso">${pos.join(' · ')}</span>` : ''}
      ${ed.p.capa?.ref && ed.p.capa.ref === b.ref ? '<span class="capa-tag">Capa</span>' : ''}
      ${b._enviando ? '<span class="enviando">Enviando…</span>' : `<span class="bimg-acoes">
        <button data-acao="b-usar" title="Pôr no fim da sequência">+</button>
        <button data-acao="b-apagar" class="perigo" title="Excluir do banco">✕</button></span>`}
    </div>`).join('') + '</div>';
}

$('#bancoFiltro').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  ed.filtro = b.dataset.f;
  desenharBanco();
});
$('#btBancoEnviar').addEventListener('click', () => { alvoArquivo = { pos: null }; $('#arquivo').click(); });

function secaoDoBanco(b, alt = '') { return { tipo: 'imagem', ref: b.ref, w: b.w, h: b.h, alt }; }

function inserirDoBanco(b, pos) {
  ed.p.secoes.splice(pos, 0, secaoDoBanco(b));
  desenharEditor();
  mudou();
  $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function trocarPeloBanco(b, i) {
  const antiga = ed.p.secoes[i];
  ed.p.secoes[i] = secaoDoBanco(b, antiga.alt || '');
  desenharEditor();
  mudou();
}

$('#banco').addEventListener('click', (e) => {
  const bt = e.target.closest('[data-acao]');
  if (!bt) return;
  if (bt.dataset.acao === 'b-enviar') { alvoArquivo = { pos: null }; return $('#arquivo').click(); }
  const k = +bt.closest('.bimg').dataset.k;
  const b = ed.p.banco[k];
  if (!b?.ref) return;
  if (bt.dataset.acao === 'b-usar') return inserirDoBanco(b, ed.p.secoes.length);
  if (bt.dataset.acao === 'b-apagar') {
    const pos = posicoesDe(b.ref);
    const msg = pos.length
      ? `Esta imagem está na sequência (posição ${pos.join(', ')}). Excluir do banco também a tira da sequência. Continuar?`
      : 'Excluir esta imagem do banco do projeto?';
    if (!confirm(msg)) return;
    ed.p.banco.splice(k, 1);
    ed.p.secoes = ed.p.secoes.filter((s) => !(s.tipo === 'imagem' && s.ref === b.ref));
    if (ed.p.capa?.ref === b.ref) ed.p.capa = null;
    desenharEditor();
    mudou();
  }
});
$('#banco').addEventListener('dblclick', (e) => {
  const item = e.target.closest('.bimg');
  if (!item || e.target.closest('button')) return;
  const b = ed.p.banco[+item.dataset.k];
  if (b?.ref) inserirDoBanco(b, ed.p.secoes.length);
});

// ---- esteira (a sequência)
function entre(i) {
  return `<div class="entre" data-pos="${i}"><button title="Inserir aqui" data-acao="inserir">+</button></div>`;
}

function desenharEsteira() {
  const est = $('#esteira');
  requestAnimationFrame(medirEsteira);
  const sec = ed.p.secoes;
  if (!sec.length) {
    est.innerHTML = `<div class="esteira-vazia"><span>A sequência está vazia.</span><span>Arraste imagens do banco para cá, ou use + Imagem e + Texto.</span></div>`;
    return;
  }
  est.innerHTML = sec.map((s, i) => {
    const larg = s.tipo === 'texto' ? (LARGURAS[s.largura] ? s.largura : 'p') : '';
    const barra = `<div class="caixa-barra">
        <span class="n">${i + 1}</span>
        <span class="tipo" draggable="true" title="Arraste para reordenar">${s.tipo === 'imagem' ? 'Imagem' : 'Texto'} ⠿</span>
        ${s.tipo === 'texto' ? `<span class="larg" role="group" aria-label="Largura do texto">${Object.entries(LARGURAS).map(([k, r]) =>
          `<button data-acao="larg" data-l="${k}" class="${larg === k ? 'ativo' : ''}" title="${LARG_TIT[k]}">${r}</button>`).join('')}</span>` : ''}
        <button data-acao="esq" title="Mover para a esquerda" ${i === 0 ? 'disabled' : ''}>←</button>
        <button data-acao="dir" title="Mover para a direita" ${i === sec.length - 1 ? 'disabled' : ''}>→</button>
        ${s.tipo === 'imagem' ? '<button data-acao="trocar" title="Trocar imagem">Trocar</button>' : ''}
        <button data-acao="excluir" class="perigo" title="${s.tipo === 'imagem' ? 'Tirar da sequência (continua no banco)' : 'Excluir texto'}">✕</button>
      </div>`;
    if (s.tipo === 'texto') {
      return entre(i) + `<div class="caixa caixa--texto larg-${larg}" data-i="${i}">${barra}
        <div class="caixa-corpo"><textarea data-campo="texto" placeholder="Escreva o texto. Cada Enter abre um novo parágrafo.">${esc(s.texto)}</textarea></div>
        <small>Cada Enter vira um parágrafo no site.${larg === 'g' ? ' No site, este texto corre em duas colunas.' : ''}</small></div>`;
    }
    const src = srcDe(s);
    return entre(i) + `<div class="caixa caixa--imagem" data-i="${i}"${s.w ? ` style="--r:${(s.w / s.h).toFixed(4)}"` : ''}>${barra}
      <div class="caixa-corpo">${src ? `<img src="${src}" alt="" draggable="false">` : '<button class="sem-img" data-acao="trocar">Escolher imagem</button>'}
      ${s._enviando ? '<div class="enviando">Enviando…</div>' : ''}</div>
      <input class="alt" data-campo="alt" placeholder="Descrição da imagem (acessibilidade)" value="${esc(s.alt)}"></div>`;
  }).join('') + entre(sec.length);
}

// altura útil das imagens na esteira (as caixas de imagem ganham largura pela proporção)
function medirEsteira() {
  const e = $('#esteira');
  if (!e.clientHeight) return;
  e.style.setProperty('--h-img', `${Math.min(440, Math.max(200, e.clientHeight - 50 - 30 - 36 - 16))}px`);
}
window.addEventListener('resize', medirEsteira);
$('#esteira').addEventListener('load', (e) => {
  const img = e.target;
  const caixa = img.closest?.('.caixa--imagem');
  if (caixa && !caixa.style.getPropertyValue('--r') && img.naturalWidth) caixa.style.setProperty('--r', (img.naturalWidth / img.naturalHeight).toFixed(4));
}, true);

// ações nas caixas
let alvoArquivo = null; // { pos: número | null (só banco), substituir }
$('#esteira').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao;
  if (acao === 'inserir') return abrirSeletor(b, { pos: +b.closest('.entre').dataset.pos });
  const caixa = b.closest('.caixa');
  if (!caixa) return;
  const i = +caixa.dataset.i;
  const sec = ed.p.secoes;
  if (acao === 'esq' && i > 0) [sec[i - 1], sec[i]] = [sec[i], sec[i - 1]];
  else if (acao === 'dir' && i < sec.length - 1) [sec[i + 1], sec[i]] = [sec[i], sec[i + 1]];
  else if (acao === 'larg') { if (sec[i].largura === b.dataset.l || (!sec[i].largura && b.dataset.l === 'p')) return; sec[i].largura = b.dataset.l; }
  else if (acao === 'excluir') {
    const s = sec[i];
    if (s.tipo === 'texto' && s.texto?.trim() && !confirm('Excluir este texto?')) return;
    sec.splice(i, 1); // imagem: sai só da sequência, continua no banco
  } else if (acao === 'trocar') return abrirSeletor(b, { trocar: i });
  else return;
  desenharEditor();
  mudou();
});

function inserirTexto(pos) {
  ed.p.secoes.splice(pos, 0, { tipo: 'texto', texto: '', largura: 'p' });
  desenharEditor();
  mudou();
  $(`.caixa[data-i="${pos}"] textarea`)?.focus();
  $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
$('#btAddTxt').addEventListener('click', () => inserirTexto(ed.p.secoes.length));
$('#btAddImg').addEventListener('click', (e) => abrirSeletor(e.currentTarget, { pos: ed.p.secoes.length }));

// ---- seletor do "+": imagem do banco, do computador, ou texto
let seletorModo = null; // { pos } inserir | { trocar: i }
function abrirSeletor(ancora, modo) {
  seletorModo = modo;
  const sel = $('#seletor');
  const imgs = ed.p.banco.filter((b) => b.ref);
  const trocar = modo.trocar !== undefined;
  sel.innerHTML = `
    <div class="seletor-cab">${trocar ? 'Trocar por uma imagem do banco' : 'Imagem do banco'}</div>
    ${imgs.length ? `<div class="seletor-grade">${imgs.map((b) => {
      const pos = posicoesDe(b.ref);
      return `<button data-ref="${b.ref}" class="${pos.length ? 'em-uso' : ''}" title="${pos.length ? 'Já na sequência: ' + pos.join(', ') : 'Fora da sequência'}"><img src="${srcDe(b)}" alt="" loading="lazy">${pos.length ? `<span>${pos.join('·')}</span>` : ''}</button>`;
    }).join('')}</div>` : '<p class="seletor-vazio">O banco está vazio — envie imagens pela coluna da direita ou do computador.</p>'}
    <div class="seletor-acoes">
      <button data-sel="pc">Do computador…</button>
      ${trocar ? '' : '<button data-sel="txt">+ Texto</button>'}
    </div>`;
  sel.hidden = false;
  const r = ancora.getBoundingClientRect();
  const w = sel.offsetWidth, h = sel.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = r.bottom + 8;
  if (y + h > innerHeight - 12) y = Math.max(12, r.top - h - 8);
  x = Math.max(12, Math.min(innerWidth - w - 12, x));
  sel.style.left = `${x}px`;
  sel.style.top = `${y}px`;
}
function fecharSeletor() {
  const sel = $('#seletor');
  if (sel) sel.hidden = true;
  seletorModo = null;
}
$('#seletor').addEventListener('click', (e) => {
  const modo = seletorModo;
  if (!modo) return;
  const img = e.target.closest('[data-ref]');
  const op = e.target.closest('[data-sel]')?.dataset.sel;
  if (img) {
    const b = ed.p.banco.find((x) => x.ref === img.dataset.ref);
    fecharSeletor();
    if (!b) return;
    return modo.trocar !== undefined ? trocarPeloBanco(b, modo.trocar) : inserirDoBanco(b, modo.pos);
  }
  if (op === 'pc') {
    fecharSeletor();
    alvoArquivo = modo.trocar !== undefined ? { pos: modo.trocar, substituir: true } : { pos: modo.pos };
    return $('#arquivo').click();
  }
  if (op === 'txt') { fecharSeletor(); inserirTexto(modo.pos); }
});
document.addEventListener('mousedown', (e) => {
  if (seletorModo && !e.target.closest('#seletor') && !e.target.closest('[data-acao="inserir"], [data-acao="trocar"], #btAddImg')) fecharSeletor();
});
$('#esteira').addEventListener('scroll', fecharSeletor, { passive: true });
window.addEventListener('resize', fecharSeletor);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharSeletor();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    if (vista === 'editor') { e.preventDefault(); salvar(); }
    if (vista === 'pagina') { e.preventDefault(); salvarPagina(); }
  }
});

$('#esteira').addEventListener('input', (e) => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const i = +e.target.closest('.caixa').dataset.i;
  ed.p.secoes[i][campo] = e.target.value;
  mudou();
});

$('#arquivo').addEventListener('change', (e) => {
  const arquivos = [...e.target.files].filter((f) => f.type.startsWith('image/'));
  e.target.value = '';
  if (!arquivos.length || !alvoArquivo) return;
  adicionarImagens(arquivos, alvoArquivo.pos, alvoArquivo.substituir);
  alvoArquivo = null;
});

// Envia arquivos: todos entram no banco; com `pos`, entram também na sequência
// (com `substituir`, o primeiro troca a imagem daquela posição).
async function adicionarImagens(arquivos, pos = null, substituir = false) {
  const lote = arquivos.map((f) => ({ ref: '', _preview: URL.createObjectURL(f), _enviando: true, _arq: f }));
  ed.p.banco.push(...lote);
  let secs = [];
  if (pos !== null && pos !== undefined) {
    secs = lote.map((b) => ({ tipo: 'imagem', ref: '', alt: '', _preview: b._preview, _enviando: true, _banco: b }));
    if (substituir) {
      const antiga = ed.p.secoes[pos];
      secs = secs.slice(0, 1);
      secs[0].alt = antiga?.alt || '';
      ed.p.secoes.splice(pos, 1, secs[0]);
    } else {
      ed.p.secoes.splice(pos, 0, ...secs);
    }
  }
  desenharEditor();
  mudou();
  if (secs.length) $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  else $('#banco .bimg:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  ed.enviando += lote.length;
  estado('enviando', `Enviando ${ed.enviando} ${ed.enviando === 1 ? 'imagem' : 'imagens'}…`);
  for (const b of lote) {
    const ligadas = secs.filter((s) => s._banco === b);
    try {
      const r = await enviarImagem(b._arq);
      Object.assign(b, r);
      ligadas.forEach((s) => Object.assign(s, r));
    } catch (err) {
      aviso(`Uma imagem não foi enviada: ${err.message}`, true);
      ed.p.banco.splice(ed.p.banco.indexOf(b), 1);
      ligadas.forEach((s) => { const i = ed.p.secoes.indexOf(s); if (i >= 0) ed.p.secoes.splice(i, 1); });
    }
    delete b._enviando; delete b._arq;
    ligadas.forEach((s) => { delete s._enviando; delete s._banco; });
    ed.enviando--;
    desenharEditor();
    estado(ed.enviando ? 'enviando' : 'pendente', ed.enviando ? `Enviando ${ed.enviando}…` : 'Alterações não salvas');
  }
}

// ---- arrastar e soltar
// três tipos de arraste: arquivos do computador, imagem do banco, caixa da sequência
const est = $('#esteira');
const banco = $('#bancoLado');
let secArrastada = null;   // índice da caixa da sequência sendo arrastada
let bancoArrastado = null; // índice da imagem do banco sendo arrastada
const temArquivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

function posicaoSoltar(e) {
  // a fresta mais próxima do cursor
  let melhor = ed.p.secoes.length, dist = Infinity;
  for (const x of $$('.entre', est)) {
    const r = x.getBoundingClientRect();
    const d = Math.abs(e.clientX - (r.left + r.width / 2));
    if (d < dist) { dist = d; melhor = +x.dataset.pos; }
  }
  return melhor;
}
function limparAlvos() {
  est.classList.remove('solta');
  banco.classList.remove('solta', 'tirar');
  $$('.entre', est).forEach((x) => x.classList.remove('alvo'));
}

banco.addEventListener('dragstart', (e) => {
  const item = e.target.closest?.('.bimg');
  if (!item || item.getAttribute('draggable') !== 'true') return;
  bancoArrastado = +item.dataset.k;
  item.classList.add('arrastando');
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', 'banco');
  const img = item.querySelector('img');
  if (img) e.dataTransfer.setDragImage(img, 30, 30);
});
est.addEventListener('dragstart', (e) => {
  const rot = e.target.closest?.('.tipo');
  if (!rot) return;
  const caixa = rot.closest('.caixa');
  secArrastada = +caixa.dataset.i;
  caixa.classList.add('arrastando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'secao');
  e.dataTransfer.setDragImage(caixa, 20, 20);
});
document.addEventListener('dragend', () => {
  secArrastada = null;
  bancoArrastado = null;
  $$('.caixa, .bimg').forEach((x) => x.classList.remove('arrastando'));
  limparAlvos();
});

est.addEventListener('dragover', (e) => {
  const arquivos = temArquivos(e);
  if (secArrastada === null && bancoArrastado === null && !arquivos) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = secArrastada !== null ? 'move' : 'copy';
  const alvo = posicaoSoltar(e);
  est.classList.toggle('solta', arquivos || bancoArrastado !== null);
  $$('.entre', est).forEach((x) => x.classList.toggle('alvo', +x.dataset.pos === alvo));
});
est.addEventListener('dragleave', (e) => { if (!est.contains(e.relatedTarget)) limparAlvos(); });
est.addEventListener('drop', (e) => {
  const arquivos = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (secArrastada === null && bancoArrastado === null && !arquivos.length) return;
  e.preventDefault();
  let para = posicaoSoltar(e);
  if (secArrastada !== null) {
    const [s] = ed.p.secoes.splice(secArrastada, 1);
    if (para > secArrastada) para--;
    ed.p.secoes.splice(para, 0, s);
    secArrastada = null;
    limparAlvos();
    desenharEditor();
    mudou();
  } else if (bancoArrastado !== null) {
    const b = ed.p.banco[bancoArrastado];
    bancoArrastado = null;
    limparAlvos();
    if (b?.ref) inserirDoBanco(b, para);
  } else {
    limparAlvos();
    adicionarImagens(arquivos, para);
  }
});

// soltar no banco: arquivos entram no banco; uma imagem da sequência sai da sequência
banco.addEventListener('dragover', (e) => {
  const caixaImg = secArrastada !== null && ed.p.secoes[secArrastada]?.tipo === 'imagem';
  if (!temArquivos(e) && !caixaImg) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = caixaImg ? 'move' : 'copy';
  banco.classList.add(caixaImg ? 'tirar' : 'solta');
});
banco.addEventListener('dragleave', (e) => { if (!banco.contains(e.relatedTarget)) banco.classList.remove('solta', 'tirar'); });
banco.addEventListener('drop', (e) => {
  const caixaImg = secArrastada !== null && ed.p.secoes[secArrastada]?.tipo === 'imagem';
  const arquivos = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!caixaImg && !arquivos.length) return;
  e.preventDefault();
  limparAlvos();
  if (caixaImg) {
    ed.p.secoes.splice(secArrastada, 1);
    secArrastada = null;
    desenharEditor();
    mudou();
    aviso('Imagem tirada da sequência — continua no banco.');
  } else adicionarImagens(arquivos, null);
});

// campos de informação
for (const [campo, chave] of Object.entries(CAMPOS)) {
  $('#' + campo).addEventListener('input', (e) => {
    let v = e.target.value;
    if (chave === 'slug') { ed.slugManual = true; }
    if (chave === 'titulo' && !ed.slugManual) {
      ed.p.slug = slugDe(v);
      $('#fSlug').value = ed.p.slug;
    }
    ed.p[chave] = v;
    mudou();
  });
}
$('#fSlug').addEventListener('change', (e) => { ed.p.slug = slugDe(e.target.value); e.target.value = ed.p.slug; });
$('#fVisivel').addEventListener('change', (e) => { ed.p.visivel = e.target.checked; mudou(); });

async function salvar() {
  if (vista !== 'editor' || ed.enviando) return;
  const p = ed.p;
  p.titulo = p.titulo.trim();
  p.slug = slugDe(p.slug || p.titulo);
  $('#fSlug').value = p.slug;
  if (!p.titulo) { aviso('Dê um título ao projeto antes de salvar.', true); $('#fTitulo').focus(); return; }
  if (!p.slug) { aviso('O endereço do projeto está vazio.', true); return; }
  const limpo = {
    ...p,
    banco: p.banco.filter((b) => b.ref).map((b) => ({ ref: b.ref, w: b.w, h: b.h })),
    secoes: p.secoes
      .filter((s) => (s.tipo === 'imagem' ? s.ref : (s.texto || '').trim()))
      .map((s) => (s.tipo === 'imagem'
        ? { tipo: 'imagem', ref: s.ref, w: s.w, h: s.h, alt: (s.alt || '').trim() }
        : { tipo: 'texto', texto: s.texto.trim(), ...(s.largura === 'm' || s.largura === 'g' ? { largura: s.largura } : {}) })),
  };
  for (const k of Object.values(CAMPOS)) if (typeof limpo[k] === 'string') limpo[k] = limpo[k].trim();
  estado('salvando', 'Salvando…');
  try {
    const res = await nuvem.gravar(limpo);
    p.atualizado = res.atualizado;
    ed.sujo = false;
    const i = indice.findIndex((r) => r.id === p.id);
    if (i >= 0) indice[i] = res.resumo; else indice.unshift(res.resumo);
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    estado('salvo', `Salvo às ${hora}`);
    if (ed.novo) { ed.novo = false; history.replaceState(null, '', `#/projeto/${p.id}`); }
    desenharTopoEditor();
    aviso(p.visivel === false ? 'Salvo. O projeto está oculto do site.' : 'Salvo. O site atualiza em até 1 minuto.');
  } catch (err) {
    estado('erro', 'Não salvo');
    aviso(`Não foi possível salvar: ${err.message}`, true);
  }
}
$('#btSalvar').addEventListener('click', salvar);

// ------------------------------------------------------------------ páginas (Sobre e Contato)
// O conteúdo fica na nuvem (pagina:sobre, pagina:contato). Enquanto uma página
// nunca foi salva pelo painel, o formulário abre com o conteúdo que está hoje
// no site (paginas-semente.json, gerado de _data/paginas.json).
const pg = { nome: '', d: null, sujo: false, enviando: 0, alvoImg: null };
const PAG_NOME = { sobre: 'Sobre', contato: 'Contato' };

const pegarCaminho = (obj, cam) => cam.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function porCaminho(obj, cam, v) {
  const ks = cam.split('.');
  const ult = ks.pop();
  const alvo = ks.reduce((o, k) => (o[k] ??= /^\d+$/.test(k) ? [] : {}), obj);
  alvo[ult] = v;
}

async function abrirPagina(nome) {
  pg.nome = nome;
  pg.sujo = false;
  pg.enviando = 0;
  $('#pagTitulo').textContent = PAG_NOME[nome];
  $('#pagVer').href = `/${nome}/`;
  $('#pagInfo').textContent = '';
  $('#pagForm').innerHTML = '<p class="vazio">Carregando…</p>';
  estadoPag('pronto');
  let semente = false;
  try {
    pg.d = await nuvem.pagina(nome);
  } catch (err) {
    if (err.status !== 404) {
      $('#pagForm').innerHTML = `<p class="vazio">Não foi possível carregar a página: ${esc(err.message)}</p>`;
      return;
    }
    try {
      pg.d = (await (await fetch('paginas-semente.json', { cache: 'no-store' })).json())[nome];
      semente = true;
    } catch {
      $('#pagForm').innerHTML = '<p class="vazio">Não encontrei o conteúdo atual da página.</p>';
      return;
    }
  }
  if (pg.nome !== nome) return;
  desenharPagina();
  $('#pagInfo').textContent = semente
    ? 'Este é o conteúdo que está hoje no site. Ao salvar, a página passa a ser editada só por aqui.'
    : pg.d.atualizado ? `Última alteração em ${new Date(pg.d.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : '';
  if (semente) estadoPag('pendente', 'Ainda não salva na nuvem');
}

function estadoPag(e, txt) {
  $('#pagSinc').dataset.estado = e;
  $('#pagSincTxt').textContent = txt || '';
  $('#pagSalvar').disabled = pg.enviando > 0 || e === 'salvando';
}
function pagMudou() {
  pg.sujo = true;
  estadoPag(pg.enviando ? 'enviando' : 'pendente', pg.enviando ? 'Enviando imagem…' : 'Alterações não salvas');
}

// ---- peças do formulário
const fLinha = (cam, rot, opc = {}) => `<label class="campo"><span>${rot}</span>
  <input type="text" data-cam="${cam}" value="${esc(pegarCaminho(pg.d, cam))}"${opc.ph ? ` placeholder="${esc(opc.ph)}"` : ''}>${opc.dica ? `<small>${opc.dica}</small>` : ''}</label>`;
const fArea = (cam, rot, opc = {}) => `<label class="campo"><span>${rot}</span>
  <textarea data-cam="${cam}" rows="${opc.linhas || 4}"${opc.ph ? ` placeholder="${esc(opc.ph)}"` : ''}>${esc(pegarCaminho(pg.d, cam))}</textarea>${opc.dica ? `<small>${opc.dica}</small>` : ''}</label>`;
function fImagem(cam, rot, opc = {}) {
  const v = pegarCaminho(pg.d, cam) || {};
  const src = v._preview || (v.ref ? imgUrl(v.ref) : v.src || '');
  return `<div class="campo campo-img${opc.quadrada ? ' quadrada' : ''}"><span>${rot}</span>
    <div class="img-campo">
      <div class="img-previa">${src ? `<img src="${esc(src)}" alt="">` : '<em>Sem imagem</em>'}${v._enviando ? '<b>Enviando…</b>' : ''}</div>
      <button class="bt" data-acao="img" data-cam="${cam}">${src ? 'Trocar imagem' : 'Escolher imagem'}</button>
    </div></div>`;
}
const fTitulo = (chave, padrao) => `<label class="campo campo-rotulo"><span>Título da seção no site</span>
  <input type="text" data-cam="titulos.${chave}" value="${esc(pegarCaminho(pg.d, 'titulos.' + chave) ?? padrao)}"></label>`;

function fLista(cam, rotItem, corpo, opc = {}) {
  const itens = pegarCaminho(pg.d, cam) || [];
  return `<div class="lista-ed${opc.compacta ? ' compacta' : ''}">` + itens.map((it, i) => `
    <div class="item-ed">
      <div class="item-cab"><b>${esc(opc.nome?.(it) || `${rotItem} ${i + 1}`)}</b>
        <button class="bt ico" data-acao="item-subir" data-lista="${cam}" data-i="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="bt ico" data-acao="item-descer" data-lista="${cam}" data-i="${i}" title="Descer" ${i === itens.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="bt ico perigo" data-acao="item-apagar" data-lista="${cam}" data-i="${i}" title="Excluir">✕</button>
      </div>
      <div class="item-corpo">${corpo(`${cam}.${i}`, it, i)}</div>
    </div>`).join('') +
    `<button class="bt add-item" data-acao="item-novo" data-lista="${cam}">+ ${opc.add || rotItem}</button></div>`;
}

const NOVOS = {
  nucleos: () => ({ nome: '', link_texto: '', link_url: '', descricao: '' }),
  premiacoes: () => ({ ano: String(new Date().getFullYear()), descricao: '' }),
  publicacoes: () => ({ ano: String(new Date().getFullYear()), descricao: '' }),
  equipe: () => ({ nome: '', cargo: '', foto: null, bio: '' }),
  secoes: () => ({ titulo: '', texto: '' }),
};

function formSobre() {
  const anoDesc = (c) => `<div class="ano-desc">${fLinha(c + '.ano', 'Ano')}${fLinha(c + '.descricao', 'Descrição')}</div>`;
  return `
  <section class="bloco-ed"><h2>Abertura</h2>
    ${fTitulo('sobre', 'Sobre')}
    ${fImagem('foto', 'Foto do estúdio')}
    ${fArea('descricao', 'Texto de apresentação', { linhas: 14, dica: 'Uma linha em branco separa os parágrafos.' })}
  </section>
  <section class="bloco-ed"><h2>Núcleos</h2>
    ${fTitulo('nucleos', 'Núcleos')}
    ${fLista('nucleos', 'Núcleo', (c) => `
      ${fLinha(c + '.nome', 'Nome')}
      <div class="duas">${fLinha(c + '.link_texto', 'Texto do link', { ph: 'Visite nossa loja' })}${fLinha(c + '.link_url', 'Endereço do link', { ph: 'https://…' })}</div>
      ${fArea(c + '.descricao', 'Descrição', { linhas: 3 })}`, { nome: (it) => it.nome })}
  </section>
  <section class="bloco-ed"><h2>Premiações</h2>
    ${fTitulo('premiacoes', 'Premiações')}
    ${fLista('premiacoes', 'Prêmio', anoDesc, { compacta: true, nome: (it) => [it.ano, it.descricao].filter(Boolean).join(' — ') })}
  </section>
  <section class="bloco-ed"><h2>Publicações</h2>
    ${fTitulo('publicacoes', 'Publicações')}
    <p class="nota-ed">Sem nenhum item, a seção não aparece no site.</p>
    ${fLista('publicacoes', 'Publicação', anoDesc, { compacta: true, nome: (it) => [it.ano, it.descricao].filter(Boolean).join(' — ') })}
  </section>
  <section class="bloco-ed"><h2>Equipe</h2>
    ${fTitulo('equipe', 'Equipe')}
    ${fLista('equipe', 'Pessoa', (c) => `
      <div class="pessoa-ed">${fImagem(c + '.foto', 'Foto', { quadrada: true })}
        <div>${fLinha(c + '.nome', 'Nome')}${fLinha(c + '.cargo', 'Cargo')}${fArea(c + '.bio', 'Apresentação', { linhas: 5 })}</div>
      </div>`, { nome: (it) => it.nome, add: 'Pessoa' })}
  </section>`;
}

function formContato() {
  return `
  <section class="bloco-ed"><h2>Seções</h2>
    <p class="nota-ed">Cada seção é um título e um texto, nesta ordem. A primeira abre a página.</p>
    ${fLista('secoes', 'Seção', (c) => `${fLinha(c + '.titulo', 'Título')}${fArea(c + '.texto', 'Texto', { linhas: 5 })}`, { nome: (it) => it.titulo })}
  </section>`;
}

function desenharPagina() {
  const rolagem = $('#paginaEd').scrollTop;
  $('#pagForm').innerHTML = pg.nome === 'sobre' ? formSobre() : formContato();
  $('#paginaEd').scrollTop = rolagem;
}

$('#pagForm').addEventListener('input', (e) => {
  const cam = e.target.dataset.cam;
  if (!cam) return;
  porCaminho(pg.d, cam, e.target.value);
  // o nome do item no cabeçalho do cartão acompanha o que é digitado
  const cab = e.target.closest('.item-ed')?.querySelector('.item-cab b');
  if (cab && /\.(nome|titulo|ano|descricao)$/.test(cam) && !e.target.closest('textarea')) {
    const base = cam.replace(/\.[^.]+$/, '');
    const it = pegarCaminho(pg.d, base);
    const lista = base.replace(/\.\d+$/, '');
    if (lista === 'premiacoes' || lista === 'publicacoes') cab.textContent = [it.ano, it.descricao].filter(Boolean).join(' — ');
    else if (/\.(nome|titulo)$/.test(cam)) cab.textContent = e.target.value;
  }
  pagMudou();
});

$('#pagForm').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao;
  if (acao === 'img') { pg.alvoImg = b.dataset.cam; return $('#pagArquivo').click(); }
  const cam = b.dataset.lista;
  const lista = pegarCaminho(pg.d, cam) || [];
  const i = +b.dataset.i;
  if (acao === 'item-novo') { lista.push(NOVOS[cam.split('.').pop()]()); porCaminho(pg.d, cam, lista); }
  else if (acao === 'item-subir' && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
  else if (acao === 'item-descer' && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
  else if (acao === 'item-apagar') {
    const it = lista[i];
    const nome = it?.nome || it?.titulo || it?.descricao || '';
    if (!confirm(`Excluir ${nome ? `“${nome}”` : 'este item'}?`)) return;
    lista.splice(i, 1);
  } else return;
  desenharPagina();
  pagMudou();
  if (acao === 'item-novo') {
    const itens = $$(`[data-lista="${cam}"][data-acao="item-apagar"]`);
    itens.at(-1)?.closest('.item-ed')?.querySelector('input, textarea')?.focus();
  }
});

$('#pagArquivo').addEventListener('change', async (e) => {
  const arq = e.target.files[0];
  e.target.value = '';
  const cam = pg.alvoImg;
  if (!arq || !cam) return;
  const nome = pg.nome;
  const temp = { _preview: URL.createObjectURL(arq), _enviando: true };
  porCaminho(pg.d, cam, temp);
  pg.enviando++;
  desenharPagina();
  pagMudou();
  try {
    const r = await enviarImagem(arq);
    if (pg.nome === nome && pegarCaminho(pg.d, cam) === temp) porCaminho(pg.d, cam, r);
  } catch (err) {
    aviso(`A imagem não foi enviada: ${err.message}`, true);
    if (pegarCaminho(pg.d, cam) === temp) porCaminho(pg.d, cam, null);
  }
  pg.enviando--;
  if (pg.nome === nome) { desenharPagina(); pagMudou(); }
});

// tira campos internos (_preview, _enviando) e imagens ainda sem envio
function limparPagina(v) {
  if (Array.isArray(v)) return v.map(limparPagina);
  if (v && typeof v === 'object') {
    if (v._enviando) return null;
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_') && k !== 'atualizado') o[k] = limparPagina(x);
    return o;
  }
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n') : v;
}

async function salvarPagina() {
  if (vista !== 'pagina' || pg.enviando || !pg.d) return;
  const nome = pg.nome;
  estadoPag('salvando', 'Salvando…');
  try {
    const res = await nuvem.gravarPagina(nome, limparPagina(pg.d));
    if (pg.nome !== nome) return;
    pg.d.atualizado = res.atualizado;
    pg.sujo = false;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    estadoPag('salvo', `Salvo às ${hora}`);
    $('#pagInfo').textContent = `Última alteração em ${new Date(res.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`;
    aviso('Salvo. O site atualiza em até 1 minuto.');
  } catch (err) {
    estadoPag('erro', 'Não salvo');
    aviso(`Não foi possível salvar: ${err.message}`, true);
  }
}
$('#pagSalvar').addEventListener('click', salvarPagina);

// ------------------------------------------------------------------ métricas
let dias = 30;
let dadosMet = null;
$('#periodo').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  dias = +b.dataset.dias;
  $$('#periodo button').forEach((x) => x.classList.toggle('ativo', x === b));
  carregarMetricas();
});

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const fmtTempo = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s || 0} s`);
const dataCurta = (d) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const NOMES_SAIDA = { whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', elaia: 'Elaia (Substack)', objetos: 'Odisse Objetos', servicos: 'Serviços (projetos.odisse)', candidatura: 'Formulário de candidatura' };
const NOMES_PAG = { '/': 'Home', '/sobre/': 'Sobre', '/contato/': 'Contato' };

async function carregarMetricas() {
  const painel = $('#painelMetricas');
  painel.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const [m] = await Promise.all([nuvem.metricas(dias), indice.length ? null : nuvem.lista().then((l) => { indice = l; })]);
    dadosMet = m;
    desenharMetricas(m);
  } catch (err) {
    painel.innerHTML = `<p class="vazio">Não foi possível carregar as métricas: ${esc(err.message)}</p>`;
  }
}

function variacao(atual, antes, inverso = false) {
  if (!antes) return atual ? '<span>sem base anterior</span>' : '<span>—</span>';
  const pct = Math.round(((atual - antes) / antes) * 100);
  if (pct === 0) return '<span>igual ao período anterior</span>';
  const bom = inverso ? pct < 0 : pct > 0;
  return `<span class="${bom ? 'sobe' : 'desce'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> vs. ${dias} dias antes`;
}

function ranque(lista, nome = (x) => x.nome, vazio = 'Sem dados no período.') {
  if (!lista?.length) return `<p class="sem">${vazio}</p>`;
  const max = Math.max(...lista.map((x) => x.n));
  return `<ul class="ranque">${lista.map((x) => `
    <li><span class="nome" title="${esc(nome(x))}">${esc(nome(x))}</span><span class="val">${fmt(x.n)}</span>
    <span class="trilha"><i style="width:${Math.max(2, (100 * x.n) / max)}%"></i></span></li>`).join('')}</ul>`;
}

function desenharMetricas(m) {
  const t = m.total, a = m.anterior;
  $('#metInfo').textContent = `${dataCurta(m.periodo.inicio)} a ${dataCurta(m.periodo.fim)} · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const titulo = (slug) => indice.find((r) => r.slug === slug)?.titulo || slug;
  const kpi = (rot, val, txtVar) => `<div class="kpi"><span>${rot}</span><b>${val}</b><small>${txtVar}</small></div>`;

  const maxDia = Math.max(1, ...m.serie.map((d) => d.visitantes));
  const passo = maxDia <= 4 ? 1 : Math.ceil(maxDia / 4 / 5) * 5 || 1;
  const topo = Math.max(maxDia, passo * Math.ceil(maxDia / passo));
  const linhas = [];
  for (let v = passo; v <= topo; v += passo) linhas.push(v);
  const maxHora = Math.max(1, ...m.horas);
  const maxProj = Math.max(1, ...m.projetos.map((p) => p.vistas));
  const semDados = !t.paginas && !t.projetos;

  $('#painelMetricas').innerHTML = `
    <section class="kpis">
      ${kpi('Visitantes', fmt(t.visitantes), variacao(t.visitantes, a.visitantes))}
      ${kpi('Páginas vistas', fmt(t.paginas), variacao(t.paginas, a.paginas))}
      ${kpi('Projetos abertos', fmt(t.projetos), variacao(t.projetos, a.projetos))}
      ${kpi('Tempo médio por página', fmtTempo(t.tempo), variacao(t.tempo, a.tempo))}
      ${kpi('Cliques de contato', fmt(t.contatos), variacao(t.contatos, a.contatos))}
      ${kpi('Saíram na 1ª página', `${t.rejeicao}%`, variacao(t.rejeicao, a.rejeicao, true))}
    </section>
    ${semDados ? '<div class="aviso-nuvem"><span>Ainda não há visitas registradas neste período. A contagem começa assim que o site novo estiver no ar.</span></div>' : ''}
    <section class="cartoes">
      <div class="cartao largo">
        <h3>Visitantes por dia</h3>
        <p>Pessoas diferentes em cada dia. Passe o mouse sobre as colunas para ver páginas e projetos.</p>
        <div class="colunas" id="colunas" style="--n:${m.serie.length}">
          ${linhas.map((v) => `<div class="grade" style="bottom:${(100 * v) / topo}%"><span>${fmt(v)}</span></div>`).join('')}
          ${m.serie.map((d, i) => `<div class="col" tabindex="0" data-i="${i}"><i style="height:${(100 * d.visitantes) / topo}%"></i></div>`).join('')}
        </div>
        <div class="eixo"><span>${dataCurta(m.serie[0].dia)}</span><span>${dataCurta(m.serie[Math.floor(m.serie.length / 2)].dia)}</span><span>${dataCurta(m.serie.at(-1).dia)}</span></div>
      </div>

      <div class="cartao largo">
        <h3>Projetos</h3>
        <p>Aberturas na página própria e no acordeão da Home, tempo médio de leitura e quantos viram a sequência até o fim.</p>
        ${m.projetos.length ? `<table class="tabela">
          <thead><tr><th>Projeto</th><th class="n">Aberturas</th><th class="n">Pela Home</th><th class="n">Tempo médio</th><th class="n">Viram até o fim</th></tr></thead>
          <tbody>${m.projetos.map((p) => `<tr>
            <td><span class="barra-mini" style="width:${Math.max(4, (60 * p.vistas) / maxProj)}px"></span>${esc(titulo(p.slug))}</td>
            <td class="n">${fmt(p.vistas)}</td><td class="n">${fmt(p.home)}</td><td class="n">${fmtTempo(p.tempo)}</td><td class="n">${p.fim === null ? '—' : p.fim + '%'}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sem">Nenhum projeto aberto no período.</p>'}
      </div>

      <div class="cartao"><h3>De onde vêm</h3><p>Site de origem da visita (ou campanha, quando o link tem utm_source).</p>${ranque(m.origens)}</div>
      <div class="cartao"><h3>Cliques de saída</h3><p>Contato e links para fora do site.</p>${ranque(m.saidas, (x) => NOMES_SAIDA[x.nome] || x.nome, 'Nenhum clique de saída no período.')}</div>
      <div class="cartao"><h3>Páginas</h3><p>Páginas vistas.</p>${ranque(m.paginas, (x) => NOMES_PAG[x.nome] || (x.nome.startsWith('/projeto/') ? titulo(x.nome.slice(9)) : x.nome))}</div>
      <div class="cartao"><h3>Cidades</h3><p>Localização aproximada da conexão.</p>${ranque(m.lugares)}</div>
      <div class="cartao"><h3>Dispositivos</h3><p>Páginas vistas por tipo de aparelho.</p>${ranque(m.dispositivos, (x) => x.nome[0].toUpperCase() + x.nome.slice(1))}</div>
      <div class="cartao"><h3>Horário das visitas</h3><p>Páginas vistas por hora do dia (horário de Brasília).</p>
        <div class="horas">${m.horas.map((n, h) => `<i title="${h}h: ${fmt(n)}" style="height:${n ? Math.max(4, (100 * n) / maxHora) : 0}%"></i>`).join('')}</div>
        <div class="horas-eixo"><span>0h</span><span>6h</span><span>12h</span><span>18h</span></div></div>
    </section>
    <p class="nota">Contagem própria do site, sem cookies: cada pessoa é reconhecida só dentro do mesmo dia, de forma anônima. Robôs e as visitas feitas de um navegador com o painel aberto não entram. O Google Analytics continua ativo para campanhas e anúncios.</p>`;
}

// dica das colunas
const dica = $('#dica');
function mostrarDica(col) {
  const d = dadosMet.serie[+col.dataset.i];
  const r = col.getBoundingClientRect();
  dica.innerHTML = `<b>${new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</b><br>${fmt(d.visitantes)} visitantes · ${fmt(d.paginas)} páginas · ${fmt(d.projetos)} projetos`;
  dica.style.left = `${r.left + r.width / 2}px`;
  dica.style.top = `${r.top + r.height - (col.firstElementChild.offsetHeight || 0)}px`;
  dica.hidden = false;
}
$('#painelMetricas').addEventListener('mouseover', (e) => { const c = e.target.closest('.col'); if (c) mostrarDica(c); });
$('#painelMetricas').addEventListener('focusin', (e) => { const c = e.target.closest('.col'); if (c) mostrarDica(c); });
$('#painelMetricas').addEventListener('mouseout', (e) => { if (e.target.closest('.col')) dica.hidden = true; });
$('#painelMetricas').addEventListener('focusout', () => { dica.hidden = true; });

// ------------------------------------------------------------------ início
$$('[data-marca]').forEach((el) => { el.innerHTML = mark(el.dataset.marca, el.dataset.marca === 'odisse' ? 13 : 26); });
rota();
