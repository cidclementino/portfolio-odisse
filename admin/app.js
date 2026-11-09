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
    throw new Error(msg);
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
// Converte para WebP (ou JPEG, onde o navegador não gera WebP): 2400 px e 1200 px no lado maior.
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
  bmp.close?.();
  const ref = novoId();
  await nuvem.imagem(ref, grande.blob);
  await nuvem.imagem(`${ref}-m`, media.blob);
  return { ref, w: grande.w, h: grande.h };
}

// ------------------------------------------------------------------ vistas
let vista = '';
function mostrar(v) {
  vista = v;
  document.body.className = `vista-${v}`;
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.menu === v || (v === 'editor' && a.dataset.menu === 'projetos')));
}

function rota() {
  if (!senha()) return mostrar('login');
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, id] = h.split('/');
  if (nome === 'metricas') { mostrar('metricas'); return carregarMetricas(); }
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
  rota();
});
window.addEventListener('beforeunload', (e) => { if (vista === 'editor' && (ed.sujo || ed.enviando)) { e.preventDefault(); e.returnValue = ''; } });

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
const ed = { p: null, novo: false, sujo: false, enviando: 0, slugManual: false, menuEntre: null };
const CAMPOS = { fTitulo: 'titulo', fSlug: 'slug', fLocal: 'local', fAno: 'ano', fArea: 'area', fCliente: 'cliente', fTipologia: 'tipologia', fStatus: 'status' };

function slugDe(txt) {
  return String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

async function abrirEditor(id) {
  ed.sujo = false;
  ed.enviando = 0;
  ed.novo = !id;
  if (id) {
    $('#esteira').innerHTML = '<p class="esteira-vazia">Carregando…</p>';
    try {
      ed.p = await nuvem.ler(id);
    } catch (err) {
      aviso(`Não foi possível abrir o projeto: ${err.message}`, true);
      location.hash = '#/projetos';
      return;
    }
  } else {
    ed.p = { id: novoId(), titulo: '', slug: '', local: 'João Pessoa, Brasil', ano: String(new Date().getFullYear()), cliente: '', tipologia: '', area: '', status: '', visivel: false, capa: null, secoes: [] };
  }
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
  estado('pendente', 'Alterações não salvas');
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
}

function desenharCapa() {
  const imgs = ed.p.secoes.filter((s) => s.tipo === 'imagem' && s.ref);
  const atual = ed.p.capa?.ref || '';
  $('#capaEscolha').innerHTML =
    `<button class="${atual ? '' : 'ativo'}" data-ref="" title="Usar a primeira imagem da sequência"><span class="auto">Primeira imagem</span></button>` +
    imgs.map((s) => `<button class="${atual === s.ref ? 'ativo' : ''}" data-ref="${s.ref}"><img src="${s._preview || imgUrl(s.ref)}" alt=""></button>`).join('');
}
$('#capaEscolha').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const s = ed.p.secoes.find((x) => x.ref === b.dataset.ref);
  ed.p.capa = s ? { ref: s.ref, w: s.w, h: s.h } : null;
  desenharCapa();
  mudou();
});

function entre(i) {
  return `<div class="entre" data-pos="${i}"><button title="Inserir aqui" data-acao="inserir">+</button></div>`;
}

function desenharEsteira() {
  const est = $('#esteira');
  requestAnimationFrame(medirEsteira);
  const sec = ed.p.secoes;
  if (!sec.length) {
    est.innerHTML = `<div class="esteira-vazia"><span>A sequência está vazia.</span><span>Adicione imagens e textos — ou solte arquivos de imagem aqui.</span></div>`;
    return;
  }
  est.innerHTML = sec.map((s, i) => {
    const barra = `<div class="caixa-barra">
        <span class="n">${i + 1}</span>
        <span class="tipo" draggable="true" title="Arraste para reordenar">${s.tipo === 'imagem' ? 'Imagem' : 'Texto'} ⠿</span>
        <button data-acao="esq" title="Mover para a esquerda" ${i === 0 ? 'disabled' : ''}>←</button>
        <button data-acao="dir" title="Mover para a direita" ${i === sec.length - 1 ? 'disabled' : ''}>→</button>
        ${s.tipo === 'imagem' ? '<button data-acao="trocar" title="Trocar imagem">Trocar</button>' : ''}
        <button data-acao="excluir" class="perigo" title="Excluir">✕</button>
      </div>`;
    if (s.tipo === 'texto') {
      return entre(i) + `<div class="caixa caixa--texto" data-i="${i}">${barra}
        <div class="caixa-corpo"><textarea data-campo="texto" placeholder="Escreva o texto. Cada Enter abre um novo parágrafo.">${esc(s.texto)}</textarea></div>
        <small>Cada Enter vira um parágrafo no site.</small></div>`;
    }
    const src = s._preview || (s.ref ? imgUrl(s.ref) : '');
    return entre(i) + `<div class="caixa caixa--imagem" data-i="${i}"${s.w ? ` style="--r:${(s.w / s.h).toFixed(4)}"` : ''}>${barra}
      <div class="caixa-corpo">${src ? `<img src="${src}" alt="">` : '<button class="sem-img" data-acao="trocar">Escolher imagem</button>'}
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
let alvoArquivo = null; // { pos, substituir }
$('#esteira').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) {
    if (ed.menuEntre && !e.target.closest('.menu-entre')) fecharMenuEntre();
    return;
  }
  const acao = b.dataset.acao;
  if (acao === 'inserir') return abrirMenuEntre(b.closest('.entre'));
  if (acao === 'novo-img') { alvoArquivo = { pos: +b.closest('.entre').dataset.pos }; fecharMenuEntre(); return $('#arquivo').click(); }
  if (acao === 'novo-txt') { const pos = +b.closest('.entre').dataset.pos; fecharMenuEntre(); return inserirTexto(pos); }
  const caixa = b.closest('.caixa');
  if (!caixa) return;
  const i = +caixa.dataset.i;
  const sec = ed.p.secoes;
  if (acao === 'esq' && i > 0) [sec[i - 1], sec[i]] = [sec[i], sec[i - 1]];
  else if (acao === 'dir' && i < sec.length - 1) [sec[i + 1], sec[i]] = [sec[i], sec[i + 1]];
  else if (acao === 'excluir') {
    const s = sec[i];
    const vazio = s.tipo === 'texto' ? !s.texto?.trim() : !s.ref;
    if (!vazio && !confirm(s.tipo === 'imagem' ? 'Excluir esta imagem do projeto?' : 'Excluir este texto?')) return;
    sec.splice(i, 1);
    if (ed.p.capa && s.ref === ed.p.capa.ref) ed.p.capa = null;
  } else if (acao === 'trocar') { alvoArquivo = { pos: i, substituir: true }; return $('#arquivo').click(); }
  else return;
  desenharEditor();
  mudou();
});

function abrirMenuEntre(el) {
  fecharMenuEntre();
  el.insertAdjacentHTML('beforeend', '<div class="menu-entre"><button data-acao="novo-img">+ Imagem</button><button data-acao="novo-txt">+ Texto</button></div>');
  ed.menuEntre = el;
}
function fecharMenuEntre() {
  ed.menuEntre?.querySelector('.menu-entre')?.remove();
  ed.menuEntre = null;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenuEntre();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && vista === 'editor') { e.preventDefault(); salvar(); }
});

function inserirTexto(pos) {
  ed.p.secoes.splice(pos, 0, { tipo: 'texto', texto: '' });
  desenharEditor();
  mudou();
  $(`.caixa[data-i="${pos}"] textarea`)?.focus();
  $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
$('#btAddTxt').addEventListener('click', () => inserirTexto(ed.p.secoes.length));
$('#btAddImg').addEventListener('click', () => { alvoArquivo = { pos: ed.p.secoes.length }; $('#arquivo').click(); });

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

async function adicionarImagens(arquivos, pos, substituir = false) {
  const novas = arquivos.map((f) => ({ tipo: 'imagem', ref: '', alt: '', _preview: URL.createObjectURL(f), _enviando: true, _arq: f }));
  if (substituir) {
    const antiga = ed.p.secoes[pos];
    novas[0].alt = antiga.alt || '';
    if (ed.p.capa && antiga.ref === ed.p.capa.ref) ed.p.capa = null;
    ed.p.secoes.splice(pos, 1, novas[0]);
    novas.length = 1;
  } else {
    ed.p.secoes.splice(pos, 0, ...novas);
  }
  desenharEditor();
  mudou();
  $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  for (const s of novas) {
    ed.enviando++;
    estado('enviando', `Enviando ${ed.enviando} ${ed.enviando === 1 ? 'imagem' : 'imagens'}…`);
    try {
      Object.assign(s, await enviarImagem(s._arq));
    } catch (err) {
      aviso(`Uma imagem não foi enviada: ${err.message}`, true);
      ed.p.secoes.splice(ed.p.secoes.indexOf(s), 1);
    }
    delete s._enviando; delete s._arq;
    ed.enviando--;
    desenharEditor();
    estado(ed.enviando ? 'enviando' : 'pendente', ed.enviando ? `Enviando ${ed.enviando}…` : 'Alterações não salvas');
  }
}

// soltar arquivos na esteira
const est = $('#esteira');
est.addEventListener('dragover', (e) => {
  if (secArrastada !== null) return;
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  est.classList.add('solta');
});
est.addEventListener('dragleave', (e) => { if (!est.contains(e.relatedTarget)) est.classList.remove('solta'); });
est.addEventListener('drop', (e) => {
  if (secArrastada !== null) return;
  const arquivos = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  est.classList.remove('solta');
  if (!arquivos.length) return;
  e.preventDefault();
  const entreEl = e.target.closest('.entre');
  const caixa = e.target.closest('.caixa');
  const pos = entreEl ? +entreEl.dataset.pos : caixa ? +caixa.dataset.i + 1 : ed.p.secoes.length;
  adicionarImagens(arquivos, pos);
});

// reordenar caixas arrastando pelo rótulo
let secArrastada = null;
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
est.addEventListener('dragover', (e) => {
  if (secArrastada === null) return;
  e.preventDefault();
  const alvo = posicaoSoltar(e);
  $$('.entre', est).forEach((x) => x.classList.toggle('alvo', +x.dataset.pos === alvo));
});
est.addEventListener('drop', (e) => {
  if (secArrastada === null) return;
  e.preventDefault();
  let para = posicaoSoltar(e);
  const [s] = ed.p.secoes.splice(secArrastada, 1);
  if (para > secArrastada) para--;
  ed.p.secoes.splice(para, 0, s);
  secArrastada = null;
  desenharEditor();
  mudou();
});
est.addEventListener('dragend', () => {
  secArrastada = null;
  $$('.caixa', est).forEach((x) => x.classList.remove('arrastando'));
  $$('.entre', est).forEach((x) => x.classList.remove('alvo'));
});
function posicaoSoltar(e) {
  // a fresta mais próxima do cursor
  let melhor = 0, dist = Infinity;
  for (const x of $$('.entre', est)) {
    const r = x.getBoundingClientRect();
    const d = Math.abs(e.clientX - (r.left + r.width / 2));
    if (d < dist) { dist = d; melhor = +x.dataset.pos; }
  }
  return melhor;
}

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
    secoes: p.secoes
      .filter((s) => (s.tipo === 'imagem' ? s.ref : (s.texto || '').trim()))
      .map((s) => (s.tipo === 'imagem' ? { tipo: 'imagem', ref: s.ref, w: s.w, h: s.h, alt: (s.alt || '').trim() } : { tipo: 'texto', texto: s.texto.trim() })),
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
