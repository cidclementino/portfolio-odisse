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
  // motivo 'restauracao': o servidor guarda o estado atual como versão mesmo que a última seja recente
  gravar: (p, motivo) => req(`/api/admin/projetos/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(motivo ? { 'X-Motivo': motivo } : {}) }, body: JSON.stringify(p) }),
  apagar: (id) => req(`/api/admin/projetos/${id}`, { method: 'DELETE' }),
  ordem: (ids) => req('/api/admin/ordem', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) }),
  imagem: (ref, blob) => req(`/api/admin/imagens/${ref}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }),
  metricas: (dias) => req(`/api/admin/metricas?dias=${dias}`),
  pagina: (nome) => req(`/api/admin/paginas/${nome}`),
  gravarPagina: (nome, d, motivo) => req(`/api/admin/paginas/${nome}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(motivo ? { 'X-Motivo': motivo } : {}) }, body: JSON.stringify(d) }),
  versoes: (tipo, id) => req(tipo ? `/api/admin/versoes/${tipo}/${encodeURIComponent(id)}` : '/api/admin/versoes'),
  versao: (chave) => req(`/api/admin/versao?chave=${encodeURIComponent(chave)}`),
  backups: () => req('/api/admin/backups'),
  fazerBackup: () => req('/api/admin/backups', { method: 'POST' }),
  backup: (chave) => req(`/api/admin/backups/${encodeURIComponent(chave)}`),
  link: (url) => req('/api/admin/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }),
  rss: (url) => req('/api/admin/rss' + (url ? `?url=${encodeURIComponent(url)}` : '')),
  // Acervo do Universo (banco único de imagens): projetos, imagens públicas do projeto, envio e descrição
  acervoProjetos: () => req('/api/admin/acervo/projetos'),
  acervoPublicas: (prj) => req(`/api/admin/acervo/projetos/${prj}`),
  acervoNova: (prj, d) => req(`/api/admin/acervo/projetos/${prj}/imagens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  acervoConteudo: (arq, v, blob) => req(`/api/admin/acervo/imagens/${arq}?variante=${v}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }),
  acervoDescrever: (arq, d) => req(`/api/admin/acervo/imagens/${arq}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }),
  // páginas estáticas (Google, previews, versão em inglês): estado do último pedido e pedir agora
  geracao: () => req('/api/admin/gerar'),
  gerar: () => req('/api/admin/gerar', { method: 'POST' }),
};
const SITE = 'https://www.odisse.com.br';
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
// Converte para WebP (ou JPEG, onde o navegador não gera WebP): 2400, 1200 e 960 px no lado maior
// (a de 960 px, "-s", é a das capas na Home e das fotos do Sobre).
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
  const pequena = await reduzir(bmp, 960);
  bmp.close?.();
  // projeto ligado ao Universo: a imagem entra no Acervo (pública, ligada ao projeto)
  if (ed.p?.universo) return paraAcervo({ nome: arquivo.name, g: grande.blob, m: media.blob, s: pequena.blob, w: grande.w, h: grande.h });
  const ref = novoId();
  await nuvem.imagem(ref, grande.blob);
  await nuvem.imagem(`${ref}-m`, media.blob);
  await nuvem.imagem(`${ref}-s`, pequena.blob);
  return { ref, w: grande.w, h: grande.h };
}

// ------------------------------------------------------------------ Acervo do Universo
// Ref das imagens do Acervo no site: a-<arq_id> (o Worker serve /img/a-… a partir do Universo).
const ACERVO = 'a-';
const doAcervo = (ref) => typeof ref === 'string' && ref.startsWith(ACERVO);
const sha256 = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

// envia as três versões para o Acervo; a mesma imagem já pública só ganha a ligação ao projeto
async function paraAcervo({ nome, g, m, s, w, h, alt = '' }) {
  const r = await nuvem.acervoNova(ed.p.universo, { nome_original: nome || 'imagem.webp', tipo_mime: g.type, sha256: await sha256(g),
    largura: w, altura: h, texto_alternativo: alt || null });
  const arq = r.registro.id;
  if (!r.ja_existia) {
    for (const [v, blob] of [['g', g], ['m', m], ['s', s]]) await nuvem.acervoConteudo(arq, v, blob);
  }
  ed.acervoVersao.set(arq, r.registro.versao);
  return { ref: ACERVO + arq, w: r.registro.largura || w, h: r.registro.altura || h, ...(r.ja_existia && r.registro.texto_alternativo ? { alt: r.registro.texto_alternativo } : {}) };
}

let acervoProjetos = null; // lista do Universo (uma leitura por sessão)
async function carregarAcervoProjetos() {
  if (acervoProjetos) return acervoProjetos;
  try { acervoProjetos = (await nuvem.acervoProjetos()).itens || []; } catch { acervoProjetos = null; }
  return acervoProjetos || [];
}
async function desenharUniverso() {
  const sel = $('#fUniverso');
  const lista = await carregarAcervoProjetos();
  const atual = ed.p?.universo || '';
  sel.innerHTML = '<option value="">— não ligado —</option>' + lista.map((x) =>
    `<option value="${x.id}"${x.id === atual ? ' selected' : ''}>${esc(x.codigo)} · ${esc(x.nome_publico || x.nome)}${x.publicas ? ` (${x.publicas})` : ''}</option>`).join('')
    + (atual && !lista.some((x) => x.id === atual) ? `<option value="${atual}" selected>${atual} (não encontrado)</option>` : '');
  sel.disabled = !acervoProjetos;
  if (!acervoProjetos) sel.title = 'O Universo não respondeu.';
  desenharImportar();
}
function desenharImportar() {
  const locais = ed.p?.universo ? ed.p.banco.filter((b) => b.ref && !doAcervo(b.ref)) : [];
  $('#universoImportar').hidden = !locais.length;
  $('#universoImportarTxt').textContent = locais.length
    ? `${locais.length} ${locais.length === 1 ? 'imagem do banco ainda está' : 'imagens do banco ainda estão'} só no site. Leve-as ao Acervo: entram públicas, ligadas ao projeto, e a sequência passa a usá-las de lá.`
    : '';
}

// Banco do projeto ligado: as públicas do Acervo + as do site que ainda não foram levadas.
// Imagem do Acervo usada na sequência que deixou de ser pública fica marcada (o site deixa de mostrá-la).
async function juntarAcervo() {
  ed.acervoVersao = new Map();
  if (!ed.p.universo) return;
  let publicas;
  try { publicas = (await nuvem.acervoPublicas(ed.p.universo)).itens || []; } catch (err) {
    aviso(`O Acervo do Universo não respondeu: ${err.message}`, true);
    return;
  }
  const refs = new Set(publicas.map((x) => ACERVO + x.id));
  const usadas = new Set([...ed.p.secoes.filter((x) => x.tipo === 'imagem').map((x) => x.ref), ed.p.capa?.ref]);
  // fica do banco: o que é do site, e o que é do Acervo e continua público ou está em uso
  ed.p.banco = ed.p.banco.filter((b) => !doAcervo(b.ref) || refs.has(b.ref) || usadas.has(b.ref));
  for (const b of ed.p.banco) if (doAcervo(b.ref) && !refs.has(b.ref)) b._retirada = true;
  for (const x of publicas) {
    const ref = ACERVO + x.id;
    ed.acervoVersao.set(x.id, x.versao);
    let b = ed.p.banco.find((y) => y.ref === ref);
    if (!b) { b = { ref, w: x.largura, h: x.altura, alt: '' }; ed.p.banco.push(b); }
    // a descrição é da imagem no Acervo: vale aqui, no marketing e lá
    b.alt = x.texto_alternativo || '';
    ed.p.secoes.forEach((sec) => { if (sec.tipo === 'imagem' && sec.ref === ref) sec.alt = b.alt; });
  }
  desenharEditor();
}

// descrição de imagem do Acervo: grava lá (com um pequeno atraso enquanto digita)
const tDescricao = new Map();
function descreverNoAcervo(ref, alt) {
  const arq = ref.slice(ACERVO.length);
  clearTimeout(tDescricao.get(arq));
  tDescricao.set(arq, setTimeout(async () => {
    try {
      const r = await nuvem.acervoDescrever(arq, { versao: ed.acervoVersao.get(arq), texto_alternativo: alt.trim() || null });
      ed.acervoVersao.set(arq, r.registro.versao);
    } catch (err) {
      aviso(err.status === 409 ? 'A descrição desta imagem mudou no Universo. Reabra o projeto.' : `Descrição não gravada no Acervo: ${err.message}`, true);
    }
  }, 900));
}

// Leva as imagens do banco que estão só no site para o Acervo (públicas, ligadas ao projeto) e troca as refs.
async function importarParaAcervo() {
  const locais = ed.p.banco.filter((b) => b.ref && !doAcervo(b.ref));
  if (!locais.length || !ed.p.universo) return;
  if (!confirm(`Levar ${locais.length} ${locais.length === 1 ? 'imagem' : 'imagens'} ao Acervo do Universo? Entram públicas e ligadas ao projeto; depois, salve o projeto.`)) return;
  const bt = $('#btLevarAcervo');
  bt.disabled = true;
  let ok = 0;
  const falhas = [];
  for (const b of locais) {
    bt.textContent = `Levando ${ok + falhas.length + 1} de ${locais.length}…`;
    try {
      const baixar = async (suf) => { const r = await fetch(`${API}/img/${b.ref}${suf}`); if (!r.ok) throw new Error(`imagem ${suf || 'grande'} não encontrada`); return r.blob(); };
      const [g, m, s] = [await baixar(''), await baixar('-m'), await baixar('-s')];
      const novo = await paraAcervo({ nome: `${ed.p.slug || 'projeto'}-${b.ref}.webp`, g, m, s, w: b.w, h: b.h, alt: b.alt });
      const antiga = b.ref;
      Object.assign(b, novo, { alt: b.alt || novo.alt || '' });
      ed.p.secoes.forEach((sec) => { if (sec.tipo === 'imagem' && sec.ref === antiga) Object.assign(sec, { ref: novo.ref, w: novo.w, h: novo.h }); });
      if (ed.p.capa?.ref === antiga) ed.p.capa = { ...ed.p.capa, ref: novo.ref };
      if (b.alt && !novo.alt) descreverNoAcervo(novo.ref, b.alt);
      ok++;
    } catch (err) {
      falhas.push(`${b.ref}: ${err.message}`);
    }
  }
  bt.disabled = false;
  bt.textContent = 'Levar ao Acervo';
  desenharEditor();
  mudou();
  desenharImportar();
  aviso(falhas.length ? `${ok} levadas; ${falhas.length} não: ${falhas[0]}` : `${ok} ${ok === 1 ? 'imagem levada' : 'imagens levadas'} ao Acervo. Salve o projeto.`, !!falhas.length);
}
$('#btLevarAcervo').addEventListener('click', importarParaAcervo);
$('#fUniverso').addEventListener('change', async (e) => {
  ed.p.universo = e.target.value || null;
  mudou();
  await juntarAcervo();
  desenharImportar();
});

// ------------------------------------------------------------------ vistas
let vista = '';
// menu: Projetos · Notícias · Páginas (Sobre, Contato, Privacidade) | Métricas · Ajustes (Busca, Histórico)
// Páginas e Ajustes abrem uma segunda linha com as suas partes
const GRUPOS = {
  paginas: [['sobre', 'Sobre'], ['contato', 'Contato'], ['privacidade', 'Privacidade']],
  ajustes: [['busca', 'Busca e compartilhamento'], ['historico', 'Histórico e backups']],
};
const GRUPO_DE = Object.fromEntries(Object.entries(GRUPOS).flatMap(([g, l]) => l.map(([k]) => [k, g])));
function mostrar(v, menu = v === 'editor' ? 'projetos' : v) {
  vista = v;
  const grupo = GRUPO_DE[menu];
  document.body.className = `vista-${v}${grupo ? ' com-sub' : ''}`;
  if (v !== 'editor') fecharSeletor();
  fecharGaveta();
  $$('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.menu === (grupo || menu)));
  $('#submenu').innerHTML = grupo ? GRUPOS[grupo].map(([k, rot]) =>
    `<a href="#/${k}"${k === menu ? ' class="ativo" aria-current="page"' : ''}>${rot}</a>`).join('') : '';
  // "Páginas" e "Ajustes" voltam para a última parte aberta do grupo
  if (grupo) { const a = $(`.menu a[data-menu="${grupo}"]`); if (a) a.href = `#/${menu}`; }
}

function rota() {
  if (!senha()) return mostrar('login');
  const h = location.hash.replace(/^#\/?/, '');
  const [nome, id] = h.split('/');
  if (nome === 'metricas') { mostrar('metricas'); return carregarMetricas(); }
  if (nome === 'historico') { mostrar('historico'); return carregarHistorico(); }
  if (nome === 'ajustes') { location.replace('#/busca'); return; }
  if (nome === 'paginas') { location.replace('#/sobre'); return; }
  if (['sobre', 'contato', 'privacidade', 'busca', 'noticias'].includes(nome)) { mostrar('pagina', nome); return abrirPagina(nome); }
  if (nome === 'opcoes') { mostrar('opcoes', 'projetos'); return abrirOpcoes(); }
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
  if (vista === 'opcoes' && opc.sujo && location.hash !== '#/opcoes') {
    if (!confirm('Há alterações não salvas nas opções. Sair mesmo assim?')) { history.replaceState(null, '', '#/opcoes'); return; }
    opc.sujo = false;
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
  if ((vista === 'editor' && (ed.sujo || ed.enviando)) || (vista === 'pagina' && (pg.sujo || pg.enviando)) || (vista === 'opcoes' && opc.sujo)) { e.preventDefault(); e.returnValue = ''; }
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
    [indice] = await Promise.all([nuvem.lista(), carregarOpcoes()]);
  } catch (err) {
    lista.innerHTML = `<p class="vazio">Não foi possível carregar os projetos: ${esc(err.message)}</p>`;
    return;
  }
  desenharLista();
}

function desenharLista() {
  const vis = indice.filter((r) => r.visivel).length;
  $('#projInfo').textContent = indice.length
    ? `${indice.length} ${indice.length === 1 ? 'projeto' : 'projetos'} · ${vis} no site. Na Home, a ordem é sorteada a cada nova visita, por prioridade: primeiro os de alta, depois média, depois baixa.`
    : 'Nenhum projeto na nuvem ainda.';
  $('#avisoImportar').hidden = indice.length > 0;
  const lista = $('#lista');
  if (!indice.length) { lista.innerHTML = ''; return; }
  lista.innerHTML = indice.map((r) => `
    <div class="proj${r.visivel ? '' : ' oculto'}" data-id="${r.id}" draggable="true">
      <span class="alca" title="Arraste para reordenar">⋮⋮</span>
      <a class="proj-capa" href="#/projeto/${r.id}">${r.capa?.ref ? `<img src="${imgUrl(r.capa.ref)}" alt="" loading="lazy">` : ''}</a>
      <div class="proj-info">
        <a class="proj-nome" href="#/projeto/${r.id}">${esc(r.titulo) || 'Sem título'}</a>
        <span class="proj-local">${[r.local, r.ano].filter(Boolean).map(esc).join(' · ') || '<em>Sem local</em>'}</span>
        <span class="proj-conta">${r.nimagens} ${r.nimagens === 1 ? 'imagem' : 'imagens'} · ${r.ntextos} ${r.ntextos === 1 ? 'texto' : 'textos'}</span>
      </div>
      <div class="proj-campo">
        <span class="proj-rot">Prioridade</span>
        <div class="seg relev" role="group" aria-label="Prioridade na Home" title="Prioridade na Home: a ordem é sorteada dentro de cada nível">${RELEV.map(([k, n]) =>
          `<button data-acao="relev" data-r="${k}" class="${(r.relevancia || 'media') === k ? 'ativo' : ''}">${n}</button>`).join('')}</div>
      </div>
      <label class="proj-campo">
        <span class="proj-rot">Status</span>
        <select class="proj-status" data-acao="status" aria-label="Status do projeto">${opcoesSelect('status', r.status, 'Sem status')}</select>
      </label>
      <div class="proj-campo">
        <span class="proj-rot">Site</span>
        <label class="chave" title="Mostrar ou esconder do site"><input type="checkbox" data-acao="visivel" ${r.visivel ? 'checked' : ''}><b>${r.visivel ? 'No site' : 'Oculto'}</b></label>
      </div>
      <div class="proj-acoes">
        <a class="bt" href="#/projeto/${r.id}">Editar</a>
        <button class="bt perigo" data-acao="apagar">Excluir</button>
      </div>
    </div>`).join('');
}

const RELEV = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];

// grava um campo do projeto direto da lista (lê o projeto inteiro, troca o campo, grava)
async function gravarCampo(id, campo, valor) {
  const p = await nuvem.ler(id);
  p[campo] = valor;
  traduzirEscolhas(p);
  const res = await nuvem.gravar(p);
  indice[indice.findIndex((r) => r.id === id)] = res.resumo;
  desenharLista();
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
  if (bt.dataset.acao === 'status') return;
  if (bt.dataset.acao === 'relev') {
    const v = bt.dataset.r;
    if ((indice[i].relevancia || 'media') === v) return;
    $$('button', bt.parentElement).forEach((b) => { b.classList.toggle('ativo', b === bt); b.disabled = true; });
    try {
      await gravarCampo(id, 'relevancia', v);
      aviso(`Relevância ${RELEV.find((x) => x[0] === v)[1].toLowerCase()}.`);
    } catch (err) {
      desenharLista();
      aviso(`Não foi possível alterar: ${err.message}`, true);
    }
    return;
  }
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
  if (e.target.dataset.acao === 'status') {
    const sel = e.target;
    const id = sel.closest('.proj').dataset.id;
    sel.disabled = true;
    try {
      await gravarCampo(id, 'status', sel.value);
      aviso(sel.value ? `Status: ${sel.value}.` : 'Status apagado.');
    } catch (err) {
      desenharLista();
      aviso(`Não foi possível alterar: ${err.message}`, true);
    }
    return;
  }
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
  if (!linha || e.target.closest?.('select, input, button')) return;
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
$('#btOpcoes').addEventListener('click', () => { location.hash = '#/opcoes'; });

// ------------------------------------------------------------------ opções dos campos
// As listas sugeridas de Tipologia, Escala e Status (com a versão em inglês) ficam na
// nuvem como a "página" opcoes. Ao gravar um projeto, a tradução da opção escolhida
// vai junto (tipologia_en…), e o site a usa no lugar do vocabulário fixo.
const OPC_CAMPOS = [
  ['tipologia', 'Tipologia', 'Vira filtro na busca do site.'],
  ['escala', 'Escala', 'Vira filtro na busca do site.'],
  ['status', 'Status', 'Aparece na ficha do projeto; também se troca direto na lista de projetos.'],
];
const OPC_PADRAO = {
  tipologia: [['Residencial', 'Residential'], ['Comercial', 'Commercial'], ['Corporativo', 'Corporate'], ['Interiores', 'Interiors'], ['Institucional', 'Institutional'], ['Retrofit', 'Retrofit'], ['Mobiliário', 'Furniture']],
  escala: [['Objeto', 'Object'], ['Interior', 'Interior'], ['Edifício', 'Building'], ['Conjunto', 'Complex'], ['Urbano', 'Urban'], ['Paisagem', 'Landscape']],
  status: [['Ideia', 'Idea'], ['Conceito', 'Concept'], ['Em projeto', 'In design'], ['Em construção', 'Under construction'], ['Concluído', 'Completed'], ['Não construído', 'Unbuilt']],
};
const normOpc = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let opcoes = null;
function opcoesDe(d) {
  const out = {};
  for (const [c] of OPC_CAMPOS) {
    const l = Array.isArray(d?.[c]) ? d[c] : OPC_PADRAO[c].map(([pt, en]) => ({ pt, en }));
    out[c] = l.filter((o) => o && String(o.pt || '').trim()).map((o) => ({ pt: String(o.pt).trim(), en: String(o.en || '').trim() }));
  }
  return out;
}
async function carregarOpcoes(forcar = false) {
  if (opcoes && !forcar) return opcoes;
  try { opcoes = opcoesDe(await nuvem.pagina('opcoes')); }
  catch (err) { if (err.status !== 404 && opcoes) return opcoes; opcoes = opcoesDe(null); }
  encherListas();
  return opcoes;
}
// sugestões dos campos do editor
function encherListas() {
  const ids = { tipologia: 'listaTipologia', escala: 'listaEscala', status: 'listaStatus' };
  for (const [c] of OPC_CAMPOS) {
    const dl = document.getElementById(ids[c]);
    if (dl) dl.innerHTML = opcoes[c].map((o) => `<option value="${esc(o.pt)}">`).join('');
  }
}
// <option>s de um campo; um valor que não está na lista também aparece (marcado)
function opcoesSelect(campo, atual, vazio) {
  const l = opcoes?.[campo] || [];
  const tem = !atual || l.some((o) => normOpc(o.pt) === normOpc(atual));
  return `<option value="">${esc(vazio)}</option>` +
    (tem ? '' : `<option value="${esc(atual)}" selected>${esc(atual)} (fora da lista)</option>`) +
    l.map((o) => `<option value="${esc(o.pt)}"${normOpc(o.pt) === normOpc(atual) ? ' selected' : ''}>${esc(o.pt)}</option>`).join('');
}
// grava no projeto a versão em inglês das escolhas (vazia: o site usa o vocabulário fixo)
function traduzirEscolhas(p) {
  if (!opcoes) return p;
  for (const [c] of OPC_CAMPOS) {
    const o = opcoes[c].find((x) => normOpc(x.pt) === normOpc(p[c]));
    if (p[c] && o?.en) p[c + '_en'] = o.en; else delete p[c + '_en'];
  }
  return p;
}

const opc = { sujo: false, salvando: false };
async function abrirOpcoes() {
  $('#opcForm').innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const [l] = await Promise.all([nuvem.lista(), carregarOpcoes(true)]);
    indice = l;
  } catch (err) {
    $('#opcForm').innerHTML = `<p class="vazio">Não foi possível carregar: ${esc(err.message)}</p>`;
    return;
  }
  opc.sujo = false;
  desenharOpcoes();
}
const usoDe = (campo, v) => indice.filter((r) => v && normOpc(r[campo]) === normOpc(v)).length;
function linhaOpc(campo, o = { pt: '', en: '' }, orig = o.pt) {
  const n = usoDe(campo, orig);
  return `<li class="opc-item" data-orig="${esc(orig)}">
    <span class="alca" draggable="true" title="Arraste para reordenar">⋮⋮</span>
    <input type="text" class="opc-pt" value="${esc(o.pt)}" placeholder="Nome em português" aria-label="Português">
    <input type="text" class="opc-en" value="${esc(o.en)}" placeholder="${esc(o.pt) || 'In English'}" aria-label="Inglês">
    <span class="opc-uso" title="${n ? `Usada em ${n} ${n === 1 ? 'projeto' : 'projetos'}` : 'Nenhum projeto usa'}">${n || ''}</span>
    <button class="bt ico perigo" data-acao="opc-tirar" title="Tirar da lista">✕</button>
  </li>`;
}
function desenharOpcoes() {
  $('#opcForm').innerHTML = OPC_CAMPOS.map(([c, rot, nota]) => {
    const fora = [...new Set(indice.map((r) => (r[c] || '').trim()).filter((v) => v && !opcoes[c].some((o) => normOpc(o.pt) === normOpc(v))))];
    return `<section class="opc-cartao" data-campo="${c}">
      <div class="opc-cab"><h2>${rot}</h2><p>${nota}</p></div>
      <div class="opc-cols"><span></span><span>Português</span><span>Inglês</span><span title="Projetos que usam">Usos</span><span></span></div>
      <ol class="opc-lista">${opcoes[c].map((o) => linhaOpc(c, o)).join('')}</ol>
      <button class="bt opc-add" data-acao="opc-add">+ Adicionar opção</button>
      ${fora.length ? `<div class="opc-fora"><span>Em uso nos projetos, fora da lista:</span>${fora.map((v) =>
        `<button class="chip" data-acao="opc-incluir" data-v="${esc(v)}" title="Incluir na lista">${esc(v)} +</button>`).join('')}</div>` : ''}
    </section>`;
  }).join('');
}
function opcMudou() {
  opc.sujo = true;
  $('#opcInfo').textContent = 'Alterações não salvas';
}
$('#opcForm').addEventListener('input', (e) => {
  if (e.target.classList.contains('opc-pt')) e.target.nextElementSibling.placeholder = e.target.value || 'In English';
  opcMudou();
});
$('#opcForm').addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const cartao = b.closest('.opc-cartao');
  const lista = $('.opc-lista', cartao);
  if (b.dataset.acao === 'opc-add' || b.dataset.acao === 'opc-incluir') {
    const v = b.dataset.v || '';
    lista.insertAdjacentHTML('beforeend', linhaOpc(cartao.dataset.campo, { pt: v, en: '' }, v));
    if (v) b.remove(); else lista.lastElementChild.querySelector('.opc-pt').focus();
    opcMudou();
  }
  if (b.dataset.acao === 'opc-tirar') {
    const li = b.closest('.opc-item');
    const n = usoDe(cartao.dataset.campo, li.dataset.orig);
    if (n && !confirm(`“${li.dataset.orig}” está em ${n} ${n === 1 ? 'projeto' : 'projetos'}. Tirar da lista não muda esses projetos — só deixa de ser sugerida. Continuar?`)) return;
    li.remove();
    opcMudou();
  }
});
// reordenar arrastando pela alça
let opcArrastada = null;
$('#opcForm').addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.opc-item');
  if (!li) return;
  opcArrastada = li;
  li.classList.add('arrastando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'opcao');
  e.dataTransfer.setDragImage(li, 12, 12);
});
$('#opcForm').addEventListener('dragover', (e) => {
  if (!opcArrastada) return;
  const li = e.target.closest('.opc-item');
  if (!li || li === opcArrastada || li.parentElement !== opcArrastada.parentElement) return;
  e.preventDefault();
  const r = li.getBoundingClientRect();
  li.parentElement.insertBefore(opcArrastada, e.clientY < r.top + r.height / 2 ? li : li.nextSibling);
});
$('#opcForm').addEventListener('dragend', () => {
  if (opcArrastada) { opcArrastada.classList.remove('arrastando'); opcArrastada = null; opcMudou(); }
});

async function salvarOpcoes() {
  if (opc.salvando) return;
  const novas = {};
  const renomear = [];
  for (const cartao of $$('#opcForm .opc-cartao')) {
    const c = cartao.dataset.campo;
    const vistos = new Set();
    novas[c] = [];
    for (const li of $$('.opc-item', cartao)) {
      const pt = $('.opc-pt', li).value.trim();
      const en = $('.opc-en', li).value.trim();
      const orig = li.dataset.orig;
      if (!pt || vistos.has(normOpc(pt))) continue;
      vistos.add(normOpc(pt));
      novas[c].push({ pt, en });
      if (orig && orig !== pt && usoDe(c, orig)) renomear.push({ c, de: orig, para: pt });
    }
  }
  const afetados = indice.filter((r) => renomear.some((x) => normOpc(r[x.c]) === normOpc(x.de)));
  let trocar = false;
  if (afetados.length) {
    trocar = confirm(`Opções renomeadas: ${renomear.map((x) => `“${x.de}” → “${x.para}”`).join(', ')}.\n\nAtualizar também ${afetados.length === 1 ? 'o projeto que usa' : `os ${afetados.length} projetos que usam`} o nome antigo? (Cancelar: só a lista muda.)`);
  }
  opc.salvando = true;
  $('#opcSalvar').disabled = true;
  $('#opcInfo').textContent = 'Salvando…';
  try {
    await nuvem.gravarPagina('opcoes', novas);
    opcoes = opcoesDe(novas);
    encherListas();
    let n = 0;
    // projetos: troca o nome antigo e, em todos que usam uma opção com inglês, atualiza a tradução
    const usamTraducao = indice.filter((r) => OPC_CAMPOS.some(([c]) => r[c] && (r[c + '_en'] || '') !== (opcoes[c].find((o) => normOpc(o.pt) === normOpc(r[c]))?.en || '')));
    const alvos = [...new Set([...(trocar ? afetados : []), ...usamTraducao])];
    for (const r of alvos) {
      $('#opcInfo').textContent = `Atualizando projetos… ${++n} de ${alvos.length}`;
      const p = await nuvem.ler(r.id);
      if (trocar) for (const x of renomear) if (normOpc(p[x.c]) === normOpc(x.de)) p[x.c] = x.para;
      const res = await nuvem.gravar(traduzirEscolhas(p));
      indice[indice.findIndex((y) => y.id === r.id)] = res.resumo;
    }
    opc.sujo = false;
    desenharOpcoes();
    $('#opcInfo').textContent = '';
    aviso(alvos.length ? `Opções salvas · ${alvos.length} ${alvos.length === 1 ? 'projeto atualizado' : 'projetos atualizados'}.` : 'Opções salvas.');
  } catch (err) {
    $('#opcInfo').textContent = 'Alterações não salvas';
    aviso(`Não foi possível salvar: ${err.message}`, true);
  } finally {
    opc.salvando = false;
    $('#opcSalvar').disabled = false;
  }
}
$('#opcSalvar').addEventListener('click', salvarOpcoes);

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
// E um texto corrido (redacao) só do painel: lista de pedaços — texto solto (string)
// ou { id } de um card de texto da sequência. O texto do card mora só no card, então
// corrigir na redação ou na sequência é corrigir o mesmo texto.
const lerPref = (k, padrao) => { try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; } };
const gravarPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ed = {
  p: null, novo: false, sujo: false, enviando: 0, slugManual: false, filtro: 'todas',
  modo: ['texto', 'galeria', 'sequencia'].includes(lerPref('odisse-painel-modo')) ? lerPref('odisse-painel-modo') : 'sequencia',
  semBanco: lerPref('odisse-painel-sem-banco') === '1',
  aba: lerPref('odisse-painel-aba') === 'textos' ? 'textos' : 'imagens', filtroTextos: 'todas',
};
const CAMPOS = { fTitulo: 'titulo', fSlug: 'slug', fLocal: 'local', fAno: 'ano', fArea: 'area', fCliente: 'cliente', fTipologia: 'tipologia', fEscala: 'escala', fStatus: 'status', fDescricao: 'descricao' };
// campos com versão em inglês (botão PT/EN da barra): em EN, editam <campo>_en
const TRADUZ = { fTitulo: 'titulo', fLocal: 'local', fCliente: 'cliente', fDescricao: 'descricao' };
ed.idioma = 'pt';
const chaveDo = (campo) => (ed.idioma === 'en' && TRADUZ[campo] ? CAMPOS[campo] + '_en' : CAMPOS[campo]);
for (const campo of Object.keys(CAMPOS)) { const el = $('#' + campo); el.dataset.ph = el.getAttribute('placeholder') || ''; }
function preencherCampos() {
  for (const campo of Object.keys(CAMPOS)) {
    const el = $('#' + campo);
    const traduz = ed.idioma === 'en' && !!TRADUZ[campo];
    el.value = ed.p[chaveDo(campo)] ?? '';
    el.placeholder = traduz ? (ed.p[CAMPOS[campo]] || '') : el.dataset.ph;
    el.closest('.campo')?.classList.toggle('traduz', traduz);
  }
  contarDescricao();
}
function aplicarIdioma() {
  $$('#edIdioma button').forEach((b) => b.classList.toggle('ativo', b.dataset.idioma === ed.idioma));
  $('#editor').classList.toggle('idioma-en', ed.idioma === 'en');
  if (ed.p) { preencherCampos(); desenharEsteira(); }
}
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
  const add = (x) => { if (x?.ref && !vistos.has(x.ref)) { vistos.add(x.ref); out.push({ ref: x.ref, w: x.w, h: x.h, alt: x.alt || '' }); } };
  (p.banco || []).forEach(add);
  p.secoes.filter((s) => s.tipo === 'imagem').forEach(add);
  add(p.capa);
  // a descrição é da imagem (vale em toda posição da sequência); projetos antigos a tinham só na sequência
  for (const b of out) if (!b.alt) b.alt = p.secoes.find((s) => s.tipo === 'imagem' && s.ref === b.ref && s.alt)?.alt || '';
  return out;
}

async function abrirEditor(id) {
  carregarOpcoes();
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
    ed.p = { id: novoId(), titulo: '', slug: '', local: 'João Pessoa, Brasil', ano: String(new Date().getFullYear()), cliente: '', tipologia: '', area: '', status: '', visivel: false, capa: null, banco: [], textos: [], secoes: [] };
  }
  ed.p.banco = montarBanco(ed.p);
  ed.p.textos = Array.isArray(ed.p.textos) ? ed.p.textos.map((t) => ({ ...t, tipo: 'texto' })) : [];
  prepararRedacao(ed.p);
  $('#redacao').dataset.p = '';
  ed.slugManual = !!id;
  preencherCampos();
  $('#editor').classList.toggle('idioma-en', ed.idioma === 'en');
  $('#fVisivel').checked = ed.p.visivel !== false;
  desenharPrevia();
  desenharAntigos();
  $('#fRelevancia').value = ed.p.relevancia || 'media';
  desenharEditor();
  estado(ed.novo ? 'pendente' : 'pronto', ed.novo ? 'Projeto novo, ainda não salvo' : '');
  if (ed.novo) setTimeout(() => $('#fTitulo').focus(), 50);
  ed.acervoVersao = new Map();
  desenharUniverso();
  if (ed.p.universo) { const sujo = ed.sujo; await juntarAcervo(); ed.sujo = sujo; desenharImportar(); }
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
  desenharPrevia();
}

// ---- link de prévia: endereço secreto que abre o projeto mesmo oculto
function urlPrevia(p) { return `${SITE}/projeto/?p=${encodeURIComponent(p.slug || '')}&previa=${p.previa}`; }
function desenharPrevia() {
  const box = $('#previaBox');
  const p = ed.p;
  if (!box || !p) return;
  if (!p.previa) {
    box.innerHTML = `<button class="bt" data-previa="criar">Criar link de prévia</button>
      <small>Um endereço secreto para mostrar o projeto a alguém antes de publicá-lo. Funciona com o projeto oculto e fica fora do Google.</small>`;
    return;
  }
  const url = urlPrevia(p);
  box.innerHTML = `<span class="previa-rot">Link de prévia</span>
    <div class="previa-link"><input type="text" readonly value="${esc(url)}" aria-label="Link de prévia"><button class="bt" data-previa="copiar">Copiar</button></div>
    <div class="previa-acoes">
      ${p._previaNova ? '' : `<a class="bt" href="${esc(url)}" target="_blank" rel="noopener">Abrir ↗</a>`}
      <button class="bt" data-previa="novo" title="O link anterior deixa de funcionar">Gerar outro</button>
      <button class="bt perigo" data-previa="desligar" title="O link deixa de funcionar">Desativar</button>
    </div>
    <small>${p._previaNova ? '<b>Salve o projeto</b> para o link passar a funcionar. ' : ''}Quem tiver o link vê o projeto, mesmo oculto. Se o endereço do projeto mudar, copie o link de novo.</small>`;
}
$('#previaBox').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-previa]');
  if (!b) return;
  const acao = b.dataset.previa;
  if (acao === 'copiar') {
    try { await navigator.clipboard.writeText(urlPrevia(ed.p)); aviso(ed.p._previaNova ? 'Link copiado — salve o projeto para ele funcionar.' : 'Link de prévia copiado.'); }
    catch { $('#previaBox input').select(); }
    return;
  }
  if (acao === 'desligar' && !confirm('Desativar o link de prévia? Quem tiver o endereço não verá mais o projeto (depois de salvar).')) return;
  if (acao === 'novo' && !confirm('Gerar outro link? O atual deixa de funcionar (depois de salvar).')) return;
  if (acao === 'criar' || acao === 'novo') { ed.p.previa = novoId(); ed.p._previaNova = true; }
  if (acao === 'desligar') { ed.p.previa = ''; delete ed.p._previaNova; }
  mudou();
});
$('#edIdioma').addEventListener('click', (e) => {
  const b = e.target.closest('[data-idioma]');
  if (!b || b.dataset.idioma === ed.idioma) return;
  if (ed.modo === 'texto') lerRedacao();
  ed.idioma = b.dataset.idioma;
  aplicarIdioma();
});
$$('[data-modo-ir]').forEach((b) => b.addEventListener('click', () => trocarModo(b.dataset.modoIr)));
$('#btVersoes').addEventListener('click', () => {
  if (ed.novo) return aviso('O projeto ainda não foi salvo — não há versões anteriores.');
  abrirVersoes('projeto', ed.p.id, ed.p.titulo || 'Projeto');
});

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
  aplicarModo();
}

// ---- as três vistas: Texto · Galeria de imagens · Sequência
function aplicarModo() {
  const el = $('#editor');
  el.dataset.modo = ed.modo;
  el.classList.toggle('sem-banco', ed.semBanco);
  $$('#modos button').forEach((b) => {
    const at = b.dataset.modo === ed.modo;
    b.classList.toggle('ativo', at);
    b.setAttribute('aria-selected', at ? 'true' : 'false');
  });
  $('#btBanco').textContent = ed.semBanco ? 'Mostrar bancos' : 'Ocultar bancos';
  $('#bancoLado').dataset.aba = ed.aba;
  $$('#bancoAbas button').forEach((b) => { const at = b.dataset.aba === ed.aba; b.classList.toggle('ativo', at); b.setAttribute('aria-selected', at ? 'true' : 'false'); });
  if (ed.modo === 'texto') {
    // não redesenha por baixo de quem está digitando (ex.: uma imagem terminou de subir)
    if ($('#redacao').dataset.p !== ed.p.id || document.activeElement !== $('#redacao')) desenharRedacao();
    desenharTrechos();
  }
  if (ed.modo === 'sequencia') requestAnimationFrame(medirEsteira);
  esconderCriarCard();
}
function trocarModo(m) {
  if (m === ed.modo) return;
  if (ed.modo === 'texto') lerRedacao();
  ed.modo = m;
  gravarPref('odisse-painel-modo', m);
  fecharSeletor();
  if (m === 'sequencia') desenharEsteira();
  aplicarModo();
}
$('#modos').addEventListener('click', (e) => { const b = e.target.closest('[data-modo]'); if (b) trocarModo(b.dataset.modo); });
$('#bancoAbas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-aba]');
  if (!b || b.dataset.aba === ed.aba) return;
  ed.aba = b.dataset.aba;
  gravarPref('odisse-painel-aba', ed.aba);
  aplicarModo();
});
$('#btBanco').addEventListener('click', () => {
  ed.semBanco = !ed.semBanco;
  gravarPref('odisse-painel-sem-banco', ed.semBanco ? '1' : '0');
  aplicarModo();
});

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
  desenharBancoTextos();
  const banco = ed.p.banco;
  contarSemDescricao();
  const livres = banco.filter((b) => b.ref && !posicoesDe(b.ref).length).length;
  $('#bancoInfo').textContent = banco.length
    ? `${banco.length} ${banco.length === 1 ? 'imagem' : 'imagens'} · ${livres} fora da sequência`
    : 'Nenhuma imagem ainda';
  $$('#bancoFiltro button, #galeriaFiltro button').forEach((b) => b.classList.toggle('ativo', b.dataset.f === ed.filtro));
  // a mesma coleção aparece na coluna da direita (sequência) e na vista Galeria
  for (const [el, galeria] of [[$('#banco'), false], [$('#galeria'), true]]) {
    if (!banco.length) {
      el.innerHTML = `<div class="banco-vazio"><span>Envie aqui todas as imagens do projeto.</span><button class="bt" data-acao="b-enviar">Escolher arquivos</button><span>ou solte os arquivos ${galeria ? 'nesta área' : 'nesta coluna'}</span></div>`;
      continue;
    }
    const itens = banco.map((b, k) => ({ b, k, pos: posicoesDe(b.ref) }))
      .filter(({ b, pos }) => ed.filtro === 'todas' || !b.ref || !pos.length);
    if (!itens.length) { el.innerHTML = '<p class="banco-nada">Todas as imagens do banco já estão na sequência.</p>'; continue; }
    el.innerHTML = `<div class="${galeria ? 'galeria-grade' : 'banco-grade'}">` + itens.map(({ b, k, pos }) => {
      const capa = ed.p.capa?.ref && ed.p.capa.ref === b.ref;
      return `${galeria ? '<div class="gimg">' : ''}
      <div class="bimg${pos.length ? ' em-uso' : ''}${b._enviando ? ' subindo' : ''}" data-k="${k}" draggable="${b.ref && !galeria ? 'true' : 'false'}"
        ${b.w && galeria ? `style="--r:${(b.w / b.h).toFixed(4)}"` : ''}
        title="${pos.length ? `Na sequência: posição ${pos.join(', ')}` : 'Fora da sequência'}${galeria ? '' : ' — arraste para a sequência'}">
        <img src="${srcDe(b)}" alt="" loading="lazy" draggable="false">
        ${pos.length ? `<span class="uso">${galeria ? 'Na sequência: ' : ''}${pos.join(' · ')}</span>` : ''}
        ${capa ? '<span class="capa-tag">Capa</span>' : ''}
        ${doAcervo(b.ref) ? `<span class="origem-tag${b._retirada ? ' retirada' : ''}" title="${b._retirada ? 'Restrita no Acervo do Universo: o site deixa de mostrá-la' : 'Imagem pública do Acervo do Universo'}">${b._retirada ? 'Restrita no Acervo' : 'Acervo'}</span>` : ''}
        ${b._enviando ? '<span class="enviando">Enviando…</span>' : `<span class="bimg-acoes">
          ${galeria && !capa ? '<button data-acao="b-capa" title="Usar como capa na Home">Capa</button>' : ''}
          <button data-acao="b-usar" title="Pôr no fim da sequência">+</button>
          ${doAcervo(b.ref) && !b._retirada ? '' : '<button data-acao="b-apagar" class="perigo" title="Excluir do banco">✕</button>'}</span>`}
      </div>${galeria ? `<textarea class="galt${(b.alt || '').trim() ? '' : ' vazia'}" data-campo="alt" data-k="${k}" rows="2"
        placeholder="Descreva a imagem: o que se vê, que parte do projeto é…"${b.ref ? '' : ' disabled'}>${esc(b.alt || '')}</textarea></div>` : ''}`;
    }).join('') + '</div>';
  }
}

for (const id of ['#bancoFiltro', '#galeriaFiltro']) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ed.filtro = b.dataset.f;
    desenharBanco();
  });
}
$('#btBancoEnviar').addEventListener('click', () => { alvoArquivo = { pos: null }; $('#arquivo').click(); });
$('#btGaleriaEnviar').addEventListener('click', () => { alvoArquivo = { pos: null }; $('#arquivo').click(); });

function secaoDoBanco(b) { return { tipo: 'imagem', ref: b.ref, w: b.w, h: b.h, alt: b.alt || '' }; }

function inserirDoBanco(b, pos) {
  ed.p.secoes.splice(pos, 0, secaoDoBanco(b));
  desenharEditor();
  mudou();
  $(`.caixa[data-i="${pos}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}
function trocarPeloBanco(b, i) {
  const antiga = ed.p.secoes[i];
  ed.p.secoes[i] = secaoDoBanco(b);
  desenharEditor();
  mudou();
}

function cliqueBanco(e) {
  const bt = e.target.closest('[data-acao]');
  if (!bt) return;
  if (bt.dataset.acao === 'b-enviar') { alvoArquivo = { pos: null }; return $('#arquivo').click(); }
  const k = +bt.closest('.bimg').dataset.k;
  const b = ed.p.banco[k];
  if (!b?.ref) return;
  if (bt.dataset.acao === 'b-usar') {
    if (ed.modo !== 'sequencia') {
      ed.p.secoes.push(secaoDoBanco(b));
      desenharEditor();
      mudou();
      return aviso(`Imagem posta no fim da sequência (posição ${ed.p.secoes.length}).`);
    }
    return inserirDoBanco(b, ed.p.secoes.length);
  }
  if (bt.dataset.acao === 'b-capa') {
    ed.p.capa = { ref: b.ref, w: b.w, h: b.h };
    desenharCapa();
    desenharBanco();
    mudou();
    return aviso('Capa trocada.');
  }
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
}
$('#banco').addEventListener('click', cliqueBanco);
$('#galeria').addEventListener('click', cliqueBanco);
$('#banco').addEventListener('dblclick', (e) => {
  const item = e.target.closest('.bimg');
  if (!item || e.target.closest('button')) return;
  const b = ed.p.banco[+item.dataset.k];
  if (b?.ref) inserirDoBanco(b, ed.p.secoes.length);
});

// soltar arquivos na vista Galeria: entram no banco
const galPane = $('#galeriaPane');
galPane.addEventListener('dragover', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  galPane.classList.add('solta');
});
galPane.addEventListener('dragleave', (e) => { if (!galPane.contains(e.relatedTarget)) galPane.classList.remove('solta'); });
galPane.addEventListener('drop', (e) => {
  const arquivos = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  galPane.classList.remove('solta');
  if (!arquivos.length) return;
  e.preventDefault();
  adicionarImagens(arquivos, null);
});

// ---- esteira (a sequência)
function entre(i) {
  return `<div class="entre" data-pos="${i}"><button title="Inserir aqui" data-acao="inserir">+</button></div>`;
}

function desenharEsteira() {
  const est = $('#esteira');
  requestAnimationFrame(medirEsteira);
  const sec = ed.p.secoes;
  const lig = idsNaRedacao();
  if (!sec.length) {
    est.innerHTML = `<div class="esteira-vazia"><span>A sequência está vazia.</span><span>Arraste imagens e textos dos bancos para cá, ou use + Imagem e + Texto.</span></div>`;
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
        <button data-acao="excluir" class="perigo" title="Tirar da sequência (continua no banco de ${s.tipo === 'imagem' ? 'imagens' : 'textos'})">✕</button>
      </div>`;
    if (s.tipo === 'texto') {
      const ligado = s.id && lig.has(s.id);
      const en = ed.idioma === 'en';
      return entre(i) + `<div class="caixa caixa--texto larg-${larg}${ligado ? ' ligado' : ''}${en ? ' em-ingles' : ''}" data-i="${i}">${barra}
        <div class="caixa-corpo">${en ? `<div class="ref-pt" title="Texto original, em português">${esc(s.texto) || '<em>Sem texto em português.</em>'}</div>` : ''}<textarea data-campo="${en ? 'texto_en' : 'texto'}" placeholder="${en ? 'Tradução em inglês deste texto. Vazio, o site mostra o português.' : 'Escreva o texto. Cada Enter abre um novo parágrafo.'}">${esc(en ? s.texto_en || '' : s.texto)}</textarea></div>
        <small>${ligado ? `<button class="vinculo" data-acao="ver-trecho" title="Abrir este trecho na vista Texto">Ligado ao texto ↗</button>` : ''}Cada Enter vira um parágrafo no site.${larg === 'g' ? ' No site, este texto corre em duas colunas.' : ''}</small></div>`;
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
  else if (acao === 'ver-trecho') { const id = sec[i].id; trocarModo('texto'); return mostrarTrecho(id); }
  else if (acao === 'excluir') {
    const s = sec[i];
    sec.splice(i, 1); // imagem: sai só da sequência, continua no banco
    // texto: também sai só da sequência e vai para o banco de textos (vazio, some)
    if (s.tipo === 'texto' && ((s.texto || '').trim() || idsNaRedacao().has(s.id))) {
      ed.p.textos.push(s);
      aviso('Texto tirado da sequência — continua no banco de textos.');
    }
  } else if (acao === 'trocar') return abrirSeletor(b, { trocar: i });
  else return;
  desenharEditor();
  mudou();
});

function inserirTexto(pos) {
  ed.p.secoes.splice(pos, 0, { tipo: 'texto', id: novoId(), texto: '', largura: 'p' });
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
// a roda do mouse (vertical) corre a sequência na horizontal — menos dentro de um
// texto que ainda tem para onde rolar
$('#esteira').addEventListener('wheel', (e) => {
  if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  const ta = e.target.closest?.('textarea');
  if (ta && ta.scrollHeight > ta.clientHeight + 1) {
    const noTopo = ta.scrollTop <= 0, noFim = ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 1;
    if ((e.deltaY < 0 && !noTopo) || (e.deltaY > 0 && !noFim)) return;
  }
  const est = e.currentTarget;
  if (est.scrollWidth <= est.clientWidth) return;
  e.preventDefault();
  const passo = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * est.clientWidth : e.deltaY;
  est.scrollLeft += passo;
}, { passive: false });
window.addEventListener('resize', fecharSeletor);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharSeletor();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    if (vista === 'editor') { e.preventDefault(); salvar(); }
    if (vista === 'pagina') { e.preventDefault(); salvarPagina(); }
    if (vista === 'opcoes') { e.preventDefault(); salvarOpcoes(); }
  }
});

$('#esteira').addEventListener('input', (e) => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const i = +e.target.closest('.caixa').dataset.i;
  const s = ed.p.secoes[i];
  if (campo === 'alt' && s.ref) return descreverImagem(s.ref, e.target.value);
  s[campo] = e.target.value;
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
  const lote = arquivos.map((f) => ({ ref: '', alt: '', _preview: URL.createObjectURL(f), _enviando: true, _arq: f }));
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
  else $(`${ed.modo === 'galeria' ? '#galeria' : '#banco'} .bimg:last-child`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
let textoArrastado = null; // id do card do banco de textos sendo arrastado
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
  const card = e.target.closest?.('.ttxt');
  if (card) {
    textoArrastado = card.dataset.t;
    card.classList.add('arrastando');
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', 'texto');
    return;
  }
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
  textoArrastado = null;
  $$('.caixa, .bimg, .ttxt').forEach((x) => x.classList.remove('arrastando'));
  limparAlvos();
});

est.addEventListener('dragover', (e) => {
  const arquivos = temArquivos(e);
  if (secArrastada === null && bancoArrastado === null && textoArrastado === null && !arquivos) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = secArrastada !== null ? 'move' : 'copy';
  const alvo = posicaoSoltar(e);
  est.classList.toggle('solta', arquivos || bancoArrastado !== null || textoArrastado !== null);
  $$('.entre', est).forEach((x) => x.classList.toggle('alvo', +x.dataset.pos === alvo));
});
est.addEventListener('dragleave', (e) => { if (!est.contains(e.relatedTarget)) limparAlvos(); });
est.addEventListener('drop', (e) => {
  const arquivos = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (secArrastada === null && bancoArrastado === null && textoArrastado === null && !arquivos.length) return;
  e.preventDefault();
  let para = posicaoSoltar(e);
  if (textoArrastado !== null) {
    const id = textoArrastado;
    textoArrastado = null;
    limparAlvos();
    return porTextoNaSequencia(id, para);
  }
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
  const caixa = secArrastada !== null && ed.p.secoes[secArrastada];
  if (!temArquivos(e) && !caixa) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = caixa ? 'move' : 'copy';
  banco.classList.add(caixa ? 'tirar' : 'solta');
});
banco.addEventListener('dragleave', (e) => { if (!banco.contains(e.relatedTarget)) banco.classList.remove('solta', 'tirar'); });
banco.addEventListener('drop', (e) => {
  if (secArrastada !== null && ed.p.secoes[secArrastada]?.tipo === 'texto') {
    e.preventDefault();
    limparAlvos();
    const [s] = ed.p.secoes.splice(secArrastada, 1);
    secArrastada = null;
    ed.p.textos.push(s);
    if (ed.aba !== 'textos') { ed.aba = 'textos'; gravarPref('odisse-painel-aba', 'textos'); aplicarModo(); }
    desenharEditor();
    mudou();
    return aviso('Texto tirado da sequência — continua no banco de textos.');
  }
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
for (const campo of Object.keys(CAMPOS)) {
  $('#' + campo).addEventListener('input', (e) => {
    const v = e.target.value;
    const chave = chaveDo(campo);
    if (chave === 'slug') { ed.slugManual = true; }
    if (chave === 'titulo' && !ed.slugManual) {
      ed.p.slug = slugDe(v);
      $('#fSlug').value = ed.p.slug;
    }
    ed.p[chave] = v;
    mudou();
  });
}
function desenharAntigos() {
  const l = ed.p.enderecos_antigos || [];
  $('#fAntigos').textContent = l.length ? `Endereços antigos que levam a este: ${l.map((s) => `/projetos/${s}/`).join(', ')}` : '';
}

function contarDescricao() {
  const n = ($('#fDescricao').value || '').length;
  const el = $('#fDescricaoConta');
  el.textContent = `${n} caracteres · ideal até 155`;
  el.style.color = n > 155 ? 'var(--ocre)' : '';
}
$('#fDescricao').addEventListener('input', contarDescricao);

// descrição de uma imagem: vale para ela no banco e em toda posição da sequência
function descreverImagem(ref, alt) {
  const b = ed.p.banco.find((x) => x.ref === ref);
  if (b) b.alt = alt;
  if (doAcervo(ref) && !b?._retirada) descreverNoAcervo(ref, alt);
  ed.p.secoes.forEach((s) => { if (s.tipo === 'imagem' && s.ref === ref) s.alt = alt; });
  contarSemDescricao();
  mudou();
}
function contarSemDescricao() {
  const imgs = ed.p.banco.filter((b) => b.ref);
  const sem = imgs.filter((b) => !(b.alt || '').trim()).length;
  $('#galeriaAlt').textContent = imgs.length ? (sem ? `${sem} de ${imgs.length} sem descrição.` : 'Todas as imagens descritas.') : '';
  $('#galeriaAlt').classList.toggle('falta', sem > 0);
}
$('#galeria').addEventListener('input', (e) => {
  if (e.target.dataset.campo !== 'alt') return;
  const b = ed.p.banco[+e.target.dataset.k];
  e.target.classList.toggle('vazia', !e.target.value.trim());
  if (b?.ref) descreverImagem(b.ref, e.target.value);
});

$('#fSlug').addEventListener('change', (e) => { ed.p.slug = slugDe(e.target.value); e.target.value = ed.p.slug; });
$('#fVisivel').addEventListener('change', (e) => { ed.p.visivel = e.target.checked; mudou(); });
$('#fRelevancia').addEventListener('change', (e) => { ed.p.relevancia = e.target.value; mudou(); });

// ---- redação (vista Texto)
// O texto corrido do projeto. Um trecho selecionado vira card na sequência; o
// trecho e o card são o mesmo texto (o card guarda, a redação aponta para ele).
const red = $('#redacao');
try { red.contentEditable = 'plaintext-only'; } catch { /* navegador sem plaintext-only */ }
if (red.contentEditable !== 'plaintext-only') {
  red.contentEditable = 'true';
  red.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
}

// um card de texto mora na sequência ou, fora dela, no banco de textos (ed.p.textos)
const secTexto = (id) => ed.p.secoes.find((s) => s.tipo === 'texto' && s.id === id) || (ed.p.textos || []).find((s) => s.id === id);
const rotuloCard = (id) => (numeroDe(id) ? `Card ${numeroDe(id)}` : 'Card no banco');
const idsNaRedacao = () => new Set((ed.p?.redacao || []).filter((r) => typeof r !== 'string').map((r) => r.id));
const numeroDe = (id) => ed.p.secoes.findIndex((s) => s.tipo === 'texto' && s.id === id) + 1;
const textoDe = (r) => (typeof r === 'string' ? r : secTexto(r.id)?.texto || '');

function juntarSoltos(lista) {
  const out = [];
  for (const r of lista) {
    if (typeof r === 'string') {
      if (!r) continue;
      if (typeof out[out.length - 1] === 'string') out[out.length - 1] += r; else out.push(r);
    } else out.push({ id: r.id });
  }
  return out;
}

// projeto aberto: todo card de texto ganha id; projeto sem redação ganha uma
// feita dos cards que já existem (cada um vira um trecho ligado)
function prepararRedacao(p) {
  p.secoes.forEach((s) => { if (s.tipo === 'texto' && !s.id) s.id = novoId(); });
  (p.textos || []).forEach((s) => { if (!s.id) s.id = novoId(); });
  if (!Array.isArray(p.redacao)) {
    p.redacao = [];
    p.secoes.filter((s) => s.tipo === 'texto' && (s.texto || '').trim()).forEach((s, k) => {
      if (k) p.redacao.push('\n\n');
      p.redacao.push({ id: s.id });
    });
  }
  const ids = new Set([...p.secoes.filter((s) => s.tipo === 'texto'), ...(p.textos || [])].map((s) => s.id));
  const vistos = new Set();
  p.redacao = juntarSoltos(p.redacao.filter((r) => {
    if (typeof r === 'string') return true;
    if (!r || !ids.has(r.id) || vistos.has(r.id)) return false;
    vistos.add(r.id);
    return true;
  }));
}

// tira o vínculo: o texto fica na redação como texto comum
function desligarTrecho(id) {
  const s = secTexto(id);
  ed.p.redacao = juntarSoltos(ed.p.redacao.map((r) => (typeof r !== 'string' && r.id === id ? (s?.texto || '') : r)));
}

function desenharRedacao() {
  red.innerHTML = (ed.p.redacao || []).map((r) => {
    if (typeof r === 'string') return esc(r);
    const s = secTexto(r.id);
    return s ? `<mark data-t="${r.id}" data-n="${numeroDe(r.id) || 'B'}"${numeroDe(r.id) ? '' : ' title="No banco de textos, fora da sequência"'}>${esc(s.texto)}</mark>` : '';
  }).join('') + '\n'; // quebra final de reserva: o Chrome se perde com uma quebra no fim do bloco
  garantirFinal();
  red.dataset.p = ed.p.id;
  infoRedacao();
}

function infoRedacao() {
  const txt = (ed.p.redacao || []).map(textoDe).join('');
  const palavras = (txt.match(/\S+/g) || []).length;
  const n = idsNaRedacao().size;
  $('#redInfo').textContent = palavras ? `${palavras} ${palavras === 1 ? 'palavra' : 'palavras'} · ${n} ${n === 1 ? 'trecho' : 'trechos'} em cards` : '';
  red.classList.toggle('vazia', !txt);
}

function garantirFinal() {
  const u = red.lastChild;
  if (!u || u.nodeType !== 3 || !u.data.endsWith('\n')) red.appendChild(document.createTextNode('\n'));
}

// o que está na tela, em pedaços: { t, id, node } na ordem do texto
function tokens(el) {
  const out = [];
  const walk = (n, id) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (c.data) out.push({ t: c.data, id, node: c }); }
      else if (c.nodeName === 'BR') out.push({ t: '\n', id, node: c });
      else if (c.nodeType === 1) {
        // navegadores sem plaintext-only quebram linha com <div>
        if (/^(DIV|P)$/.test(c.nodeName) && out.length && !out[out.length - 1].t.endsWith('\n')) out.push({ t: '\n', id, node: null });
        walk(c, c.nodeName === 'MARK' && c.dataset.t ? c.dataset.t : id);
      }
    }
  };
  walk(el, null);
  return out;
}

// lê a tela de volta para o projeto (e corrige o texto dos cards ligados)
function lerRedacao() {
  if (ed.modo !== 'texto' || red.dataset.p !== ed.p?.id) return;
  const tk = tokens(red);
  // quebra de linha entre dois pedaços do mesmo trecho pertence a ele
  tk.forEach((x, k) => {
    if (x.id === null && /^\n+$/.test(x.t) && tk[k - 1]?.id && tk[k - 1].id === tk[k + 1]?.id) x.id = tk[k - 1].id;
  });
  const runs = [];
  for (const x of tk) {
    const u = runs[runs.length - 1];
    if (u && u.id === x.id) u.t += x.t; else runs.push({ id: x.id, t: x.t });
  }
  const ult = runs[runs.length - 1];
  if (ult && !ult.id && ult.t.endsWith('\n')) ult.t = ult.t.slice(0, -1); // a quebra de reserva
  const vistos = new Set();
  const nova = [];
  for (const r of runs) {
    const s = r.id && !vistos.has(r.id) ? secTexto(r.id) : null;
    const [, ini, miolo, fim] = r.t.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!s || !miolo) { nova.push(r.t); continue; }
    vistos.add(r.id);
    // espaços nas pontas ficam fora do card
    nova.push(ini, { id: r.id }, fim);
    if (s.texto !== miolo) s.texto = miolo;
  }
  ed.p.redacao = juntarSoltos(nova);
}

let tTrechos;
red.addEventListener('input', () => {
  garantirFinal();
  const antes = idsNaRedacao();
  lerRedacao();
  const agora = idsNaRedacao();
  const saiu = [...antes].filter((id) => !agora.has(id) && secTexto(id));
  if (saiu.length) {
    aviso(`${saiu.map(rotuloCard).join(', ')} saiu do texto — o card continua, sem vínculo. Ctrl+Z desfaz.`);
  }
  infoRedacao();
  clearTimeout(tTrechos);
  tTrechos = setTimeout(desenharTrechos, saiu.length ? 0 : 200);
  mudou();
});

// digitar colado na borda de um trecho escreve fora dele (para continuar o texto
// depois de um card sem esticar o card); para esticar, selecione e use "Ampliar card"
const textosDe = (m) => { const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); const l = []; while (w.nextNode()) l.push(w.currentNode); return l; };
red.addEventListener('beforeinput', (e) => {
  const dado = e.inputType === 'insertText' ? e.data
    : (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') ? '\n' : null;
  if (!dado) return;
  const sel = getSelection();
  if (!sel.isCollapsed || !sel.anchorNode) return;
  const n = sel.anchorNode, o = sel.anchorOffset;
  const m = (n.nodeType === 3 ? n.parentElement : n)?.closest?.('mark[data-t]');
  if (!m || !red.contains(m)) return;
  const ts = textosDe(m);
  if (!ts.length) return;
  const fim = n === ts[ts.length - 1] && o === n.data.length;
  const ini = n === ts[0] && o === 0;
  if (!fim && !ini) return;
  e.preventDefault();
  let alvo, pos;
  if (fim) {
    alvo = m.nextSibling?.nodeType === 3 ? m.nextSibling : m.parentNode.insertBefore(document.createTextNode(''), m.nextSibling);
    alvo.insertData(0, dado); pos = dado.length;
  } else {
    alvo = m.previousSibling?.nodeType === 3 ? m.previousSibling : m.parentNode.insertBefore(document.createTextNode(''), m);
    alvo.appendData(dado); pos = alvo.data.length;
  }
  sel.collapse(alvo, pos);
  red.dispatchEvent(new Event('input'));
});

// ---- selecionar → criar card
// posição de um ponto da seleção no texto corrido
function posicaoNoTexto(tk, node, off) {
  if (node.nodeType === 3) {
    let p = 0;
    for (const x of tk) { if (x.node === node) return p + off; p += x.t.length; }
    return null;
  }
  const r = document.createRange();
  r.setStart(node, off);
  let p = 0;
  for (let k = 0; k < tk.length; k++) {
    const ref = tk[k].node || tk.slice(k + 1).find((y) => y.node)?.node;
    if (!ref || r.comparePoint(ref, 0) >= 0) break;
    p += tk[k].t.length;
  }
  return p;
}

// a seleção atual em posições do texto, já sem espaços nas pontas, e os cards que ela toca
function selecaoNoTexto() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const rg = sel.getRangeAt(0);
  if (!red.contains(rg.startContainer) || !red.contains(rg.endContainer)) return null;
  const tk = tokens(red);
  let a = posicaoNoTexto(tk, rg.startContainer, rg.startOffset);
  let b = posicaoNoTexto(tk, rg.endContainer, rg.endOffset);
  if (a === null || b === null) return null;
  const pecas = [];
  let p = 0;
  for (const r of ed.p.redacao) { const t = textoDe(r); pecas.push({ r, a: p, b: p + t.length, t }); p += t.length; }
  const todo = pecas.map((x) => x.t).join('');
  a = Math.min(a, todo.length); b = Math.min(b, todo.length);
  while (a < b && /\s/.test(todo[a])) a++;
  while (b > a && /\s/.test(todo[b - 1])) b--;
  if (a >= b) return null;
  const toca = pecas.filter((x) => typeof x.r !== 'string' && x.a < b && x.b > a).map((x) => x.r.id);
  return { a, b, pecas, todo, toca, rg };
}

const bCard = $('#criarCard');
function esconderCriarCard() { bCard.hidden = true; }
function posicionarCriarCard() {
  if (ed.modo !== 'texto' || vista !== 'editor') return esconderCriarCard();
  const s = selecaoNoTexto();
  if (!s) return esconderCriarCard();
  bCard.disabled = s.toca.length > 1;
  bCard.textContent = s.toca.length === 0 ? 'Criar card'
    : s.toca.length === 1 ? `Ampliar ${rotuloCard(s.toca[0]).toLowerCase()}` : 'A seleção toca mais de um card';
  const r = s.rg.getBoundingClientRect();
  bCard.hidden = false;
  const w = bCard.offsetWidth;
  bCard.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  bCard.style.top = `${r.top > 70 ? r.top - 42 : r.bottom + 10}px`;
}
let tSel;
document.addEventListener('selectionchange', () => { clearTimeout(tSel); tSel = setTimeout(posicionarCriarCard, 120); });
$('#redacaoPane').addEventListener('scroll', posicionarCriarCard, { passive: true });
bCard.addEventListener('mousedown', (e) => e.preventDefault()); // não perder a seleção
bCard.addEventListener('click', criarCard);

function criarCard() {
  lerRedacao();
  const s = selecaoNoTexto();
  if (!s || s.toca.length > 1) return;
  const id = s.toca[0] || novoId();
  // cada letra com o seu dono; o trecho escolhido (somado ao card que ele toca) passa a ser do card
  const donos = [];
  for (const x of s.pecas) for (let k = 0; k < x.t.length; k++) donos.push(typeof x.r === 'string' ? null : x.r.id);
  let a = s.a, b = s.b;
  donos.forEach((d, k) => { if (d === id) { a = Math.min(a, k); b = Math.max(b, k + 1); } });
  for (let k = a; k < b; k++) donos[k] = id;
  const nova = [];
  let k = 0;
  while (k < donos.length) {
    let j = k;
    while (j < donos.length && donos[j] === donos[k]) j++;
    const t = s.todo.slice(k, j);
    if (donos[k]) { nova.push({ id: donos[k] }); const sec = secTexto(donos[k]); if (sec) sec.texto = t; } else nova.push(t);
    k = j;
  }
  let msg;
  if (!s.toca.length) {
    // o card novo vai para o banco de textos; dali é arrastado para a posição certa da sequência
    ed.p.textos.push({ tipo: 'texto', id, texto: s.todo.slice(a, b), largura: 'p' });
    msg = 'Card criado — está no banco de textos, pronto para ir à sequência.';
  } else msg = `${rotuloCard(id)} ampliado.`;
  ed.p.redacao = juntarSoltos(nova);
  getSelection().removeAllRanges();
  esconderCriarCard();
  desenharRedacao();
  desenharTrechos();
  desenharEsteira();
  desenharBanco();
  mudou();
  aviso(msg);
  piscar(id);
}

function piscar(id) {
  const m = red.querySelector(`mark[data-t="${id}"]`);
  if (!m) return;
  m.classList.add('pisca');
  setTimeout(() => m.classList.remove('pisca'), 1400);
}
function mostrarTrecho(id) {
  const m = red.querySelector(`mark[data-t="${id}"]`);
  if (!m) return;
  m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  piscar(id);
  marcarTrecho(id);
}
function marcarTrecho(id) {
  $$('#trechos .trecho').forEach((x) => x.classList.toggle('ativo', x.dataset.t === id));
  $(`#trechos .trecho[data-t="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
red.addEventListener('click', (e) => {
  const m = e.target.closest('mark[data-t]');
  if (m) marcarTrecho(m.dataset.t);
});

// ---- banco de textos: todos os cards de texto, na sequência ou fora dela
const todosTextos = () => [...ed.p.secoes.filter((s) => s.tipo === 'texto'), ...(ed.p.textos || [])];
const resumoTxt = (t, n = 220) => esc(t.length > n ? `${t.slice(0, n).trim()}…` : t);

// põe um card do banco (ou já da sequência) na posição `pos` da sequência
function porTextoNaSequencia(id, pos = ed.p.secoes.length) {
  const naSeq = ed.p.secoes.findIndex((s) => s.tipo === 'texto' && s.id === id);
  let s;
  if (naSeq >= 0) {
    [s] = ed.p.secoes.splice(naSeq, 1);
    if (pos > naSeq) pos--;
  } else {
    const k = ed.p.textos.findIndex((x) => x.id === id);
    if (k < 0) return;
    [s] = ed.p.textos.splice(k, 1);
  }
  ed.p.secoes.splice(pos, 0, s);
  desenharEditor();
  if (ed.modo === 'texto') { desenharRedacao(); desenharTrechos(); }
  mudou();
  if (ed.modo === 'sequencia') {
    const cx = $(`.caixa[data-i="${pos}"]`);
    cx?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    cx?.classList.add('pisca');
    setTimeout(() => cx?.classList.remove('pisca'), 1400);
  } else aviso(`Card posto na sequência (posição ${pos + 1}).`);
}

// exclui um card de vez (o trecho da narrativa, se havia, fica como texto comum)
function excluirCard(id) {
  const ligado = idsNaRedacao().has(id);
  if (!confirm(ligado
    ? `Desfazer ${rotuloCard(id).toLowerCase()}? O texto continua na narrativa; o card sai do banco${numeroDe(id) ? ' e da sequência' : ''}.`
    : `Excluir ${rotuloCard(id).toLowerCase()}? Ele não está na narrativa, então o texto se perde.`)) return false;
  if (ligado) desligarTrecho(id);
  ed.p.secoes = ed.p.secoes.filter((s) => !(s.tipo === 'texto' && s.id === id));
  ed.p.textos = ed.p.textos.filter((s) => s.id !== id);
  return true;
}

// vista Sequência: aba "Textos" do banco (arrastáveis para a esteira)
function desenharBancoTextos() {
  const el = $('#bancoTextos');
  if (!el || !ed.p) return;
  const lig = idsNaRedacao();
  const ordemNarr = (ed.p.redacao || []).filter((r) => typeof r !== 'string').map((r) => r.id);
  const pesoNarr = (id) => { const k = ordemNarr.indexOf(id); return k < 0 ? 1e6 : k; };
  // primeiro os que estão fora da sequência (na ordem da narrativa), depois os da sequência, em ordem
  const fora = (ed.p.textos || []).filter((s) => (s.texto || '').trim() || lig.has(s.id)).sort((a, b) => pesoNarr(a.id) - pesoNarr(b.id));
  const dentro = ed.p.secoes.filter((s) => s.tipo === 'texto');
  const livres = fora.length;
  $('#bancoTextosInfo').textContent = fora.length + dentro.length
    ? `${fora.length + dentro.length} ${fora.length + dentro.length === 1 ? 'card' : 'cards'} · ${livres} fora da sequência`
    : 'Nenhum card de texto ainda';
  $$('#textosFiltro button').forEach((b) => b.classList.toggle('ativo', b.dataset.f === ed.filtroTextos));
  const lista = ed.filtroTextos === 'livres' ? fora : [...fora, ...dentro];
  if (!fora.length && !dentro.length) {
    el.innerHTML = `<div class="banco-vazio"><span>Selecione um trecho na <b>Narrativa projetual</b> e use <b>Criar card</b> — ele aparece aqui.</span><button class="bt" data-acao="tx-narrativa">Ir para a narrativa</button></div>`;
    return;
  }
  if (!lista.length) { el.innerHTML = '<p class="banco-nada">Todos os cards já estão na sequência.</p>'; return; }
  el.innerHTML = '<div class="textos-lista">' + lista.map((s) => {
    const n = numeroDe(s.id);
    const larg = LARGURAS[s.largura] ? s.largura : 'p';
    return `<div class="ttxt${n ? ' em-uso' : ''}${lig.has(s.id) ? ' ligado' : ''}" data-t="${s.id}" draggable="true"
        title="${n ? `Na sequência: posição ${n}` : 'Fora da sequência'} — arraste para a sequência">
      <div class="ttxt-cab">
        <span class="ttxt-pos">${n ? `Na sequência · ${n}` : 'Fora da sequência'}</span>
        <span class="trecho-larg" title="${LARG_TIT[larg]}">${LARGURAS[larg]}</span>
        ${lig.has(s.id) ? '<span class="ttxt-lig" title="Ligado a um trecho da narrativa">Narrativa</span>' : ''}
        <span class="ttxt-acoes">
          ${n ? '' : '<button data-acao="tx-usar" title="Pôr no fim da sequência">+</button>'}
          <button data-acao="tx-apagar" class="perigo" title="${lig.has(s.id) ? 'Desfazer o card (o texto fica na narrativa)' : 'Excluir o card'}">✕</button>
        </span>
      </div>
      <p>${resumoTxt(s.texto || '', 260) || '<em>Sem texto.</em>'}</p>
    </div>`;
  }).join('') + '</div>';
}
$('#textosFiltro').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  ed.filtroTextos = b.dataset.f;
  desenharBancoTextos();
});
$('#bancoTextos').addEventListener('click', (e) => {
  const bt = e.target.closest('[data-acao]');
  if (!bt) return;
  if (bt.dataset.acao === 'tx-narrativa') return trocarModo('texto');
  const id = bt.closest('.ttxt')?.dataset.t;
  if (!id) return;
  if (bt.dataset.acao === 'tx-usar') return porTextoNaSequencia(id);
  if (bt.dataset.acao === 'tx-apagar' && excluirCard(id)) { desenharEditor(); mudou(); }
});
$('#bancoTextos').addEventListener('dblclick', (e) => {
  const it = e.target.closest('.ttxt');
  if (!it || e.target.closest('button') || numeroDe(it.dataset.t)) return;
  porTextoNaSequencia(it.dataset.t);
});
$('#btTextoNovo').addEventListener('click', () => {
  // um card solto, fora da narrativa, direto no fim da sequência para escrever
  inserirTexto(ed.p.secoes.length);
});

// ---- coluna da direita na vista Narrativa: o banco de textos, na ordem da narrativa
function desenharTrechos() {
  const lig = (ed.p.redacao || []).filter((r) => typeof r !== 'string' && secTexto(r.id));
  const ligIds = new Set(lig.map((r) => r.id));
  const soltos = todosTextos().filter((s) => !ligIds.has(s.id) && (s.texto || '').trim());
  const fora = lig.filter((r) => !numeroDe(r.id)).length;
  $('#trechosInfo').textContent = lig.length
    ? `${lig.length} ${lig.length === 1 ? 'card' : 'cards'} na ordem da narrativa${fora ? ` · ${fora} fora da sequência` : ''}`
    : 'Nenhum trecho virou card ainda';
  const item = (s, ligado) => {
    const n = numeroDe(s.id);
    return `
    <div class="trecho${ligado ? '' : ' solto'}${n ? '' : ' no-banco'}" data-t="${s.id}">
      <div class="trecho-cab">
        <span class="trecho-n">${n ? `Card ${n}` : 'Fora da sequência'}</span>
        <span class="trecho-larg" title="${LARG_TIT[s.largura || 'p']}">${LARGURAS[s.largura || 'p']}</span>
        <span class="trecho-acoes">
          ${ligado ? '' : '<button data-acao="t-inserir" title="Pôr este texto no fim da narrativa, ligado ao card">Pôr no texto</button>'}
          ${n ? '<button data-acao="t-seq" title="Ver este card na sequência">Sequência →</button>'
            : '<button data-acao="t-usar" title="Pôr este card no fim da sequência">+ Sequência</button>'}
          <button data-acao="t-desfazer" class="perigo" title="${ligado ? 'Desfazer o card: o texto fica aqui' : 'Excluir o card'}">✕</button>
        </span>
      </div>
      <p>${resumoTxt(s.texto || '')}</p>
    </div>`;
  };
  $('#trechos').innerHTML =
    (lig.length ? lig.map((r) => item(secTexto(r.id), true)).join('')
      : '<p class="trechos-vazio">Selecione um trecho do texto e clique em <b>Criar card</b>. Ele entra no banco de textos e fica ligado à narrativa; na <b>Sequência</b>, arraste-o para a posição que quiser.</p>') +
    (soltos.length ? `<h3 class="trechos-sub">Fora da narrativa</h3><p class="trechos-nota">Cards de texto escritos direto na sequência.</p>${soltos.map((s) => item(s, false)).join('')}` : '');
}

$('#trechos').addEventListener('click', (e) => {
  const it = e.target.closest('.trecho');
  if (!it) return;
  const id = it.dataset.t;
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (!acao) return it.classList.contains('solto') ? null : mostrarTrecho(id);
  lerRedacao();
  if (acao === 't-seq') {
    trocarModo('sequencia');
    const i = ed.p.secoes.findIndex((s) => s.id === id);
    const cx = $(`.caixa[data-i="${i}"]`);
    cx?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    cx?.classList.add('pisca');
    setTimeout(() => cx?.classList.remove('pisca'), 1400);
    return;
  }
  if (acao === 't-usar') return porTextoNaSequencia(id);
  if (acao === 't-desfazer') {
    if (!excluirCard(id)) return;
  } else if (acao === 't-inserir') {
    const fimTxt = (ed.p.redacao || []).map(textoDe).join('');
    ed.p.redacao = juntarSoltos([...ed.p.redacao, fimTxt.trim() ? (/\n\s*$/.test(fimTxt) ? '\n' : '\n\n') : '', { id }]);
  }
  desenharRedacao();
  desenharTrechos();
  desenharEsteira();
  desenharBanco();
  mudou();
  if (acao === 't-inserir') mostrarTrecho(id);
});

async function salvar() {
  if (vista !== 'editor' || ed.enviando) return;
  if (ed.modo === 'texto') lerRedacao();
  const p = ed.p;
  p.titulo = p.titulo.trim();
  p.slug = slugDe(p.slug || p.titulo);
  $('#fSlug').value = p.slug;
  if (!p.titulo) { aviso('Dê um título ao projeto antes de salvar.', true); $('#fTitulo').focus(); return; }
  if (!p.slug) { aviso('O endereço do projeto está vazio.', true); return; }
  const limpo = {
    ...p,
    banco: p.banco.filter((b) => b.ref).map((b) => ({ ref: b.ref, w: b.w, h: b.h, ...((b.alt || '').trim() ? { alt: b.alt.trim() } : {}) })),
    universo: p.universo || null,
    secoes: p.secoes
      .filter((s) => (s.tipo === 'imagem' ? s.ref : (s.texto || '').trim()))
      .map((s) => (s.tipo === 'imagem'
        ? { tipo: 'imagem', ref: s.ref, w: s.w, h: s.h, alt: (p.banco.find((b) => b.ref === s.ref)?.alt ?? s.alt ?? '').trim() }
        : { tipo: 'texto', id: s.id || novoId(), texto: s.texto.trim(), ...((s.texto_en || '').trim() ? { texto_en: s.texto_en.trim() } : {}), ...(s.largura === 'm' || s.largura === 'g' ? { largura: s.largura } : {}) })),
  };
  // banco de textos: cards fora da sequência (os ligados à narrativa ficam mesmo vazios de espaço)
  limpo.textos = (p.textos || []).filter((s) => (s.texto || '').trim()).map((s) => ({
    id: s.id || novoId(), texto: s.texto.trim(),
    ...((s.texto_en || '').trim() ? { texto_en: s.texto_en.trim() } : {}),
    ...(s.largura === 'm' || s.largura === 'g' ? { largura: s.largura } : {}),
  }));
  for (const k of Object.keys(limpo)) if (k.startsWith('_')) delete limpo[k];
  // a redação guarda só os vínculos com cards que vão ser gravados
  const ids = new Set([...limpo.secoes.filter((s) => s.tipo === 'texto'), ...limpo.textos].map((s) => s.id));
  limpo.redacao = juntarSoltos((p.redacao || []).filter((r) => typeof r === 'string' || ids.has(r.id)));
  for (const k of [...Object.values(CAMPOS), ...Object.values(TRADUZ).map((x) => x + '_en')]) if (typeof limpo[k] === 'string') limpo[k] = limpo[k].trim();
  traduzirEscolhas(limpo);
  estado('salvando', 'Salvando…');
  try {
    const res = await nuvem.gravar(limpo);
    p.atualizado = res.atualizado;
    ed.sujo = false;
    delete p._previaNova;
    desenharPrevia();
    try { p.enderecos_antigos = (await nuvem.ler(p.id)).enderecos_antigos || []; desenharAntigos(); } catch { /* só informativo */ }
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
const pg = { nome: '', d: null, sujo: false, enviando: 0, alvoImg: null, idioma: 'pt', rss: null };
const PAG_NOME = { sobre: 'Sobre', contato: 'Contato', privacidade: 'Privacidade', busca: 'Busca e compartilhamento', noticias: 'Notícias', opcoes: 'Opções dos campos' };
const NOTICIAS_SEMENTE = () => ({ rss: 'https://odisse.substack.com/feed', mostrar_rss: true, rss_ocultos: [], itens: [] });
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const porData = (a, b) => String(b.data || '').localeCompare(String(a.data || ''));



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
  pg.rss = null;
  $('#pagTitulo').textContent = PAG_NOME[nome];
  $('#pagVer').href = nome === 'busca' ? '/' : nome === 'noticias' ? '/sobre/' : `/${nome}/`;
  $('#pagIdioma').hidden = false;
  $('#paginaEd').dataset.nome = nome;
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
      // a aba Busca parte de busca-semente.json (o mesmo que o gerador das páginas usa enquanto ela não é salva)
      pg.d = nome === 'noticias' ? NOTICIAS_SEMENTE() : nome === 'busca'
        ? await (await fetch('busca-semente.json', { cache: 'no-store' })).json()
        : (await (await fetch('paginas-semente.json', { cache: 'no-store' })).json())[nome];
      semente = true;
    } catch {
      $('#pagForm').innerHTML = '<p class="vazio">Não encontrei o conteúdo atual da página.</p>';
      return;
    }
  }
  if (pg.nome !== nome) return;
  if (nome === 'noticias') { pg.d.itens = (pg.d.itens || []).sort(porData); pg.d.rss_ocultos ||= []; }
  const convertida = nome === 'contato' && separarContato(pg.d);
  desenharPagina();
  $('#pagInfo').textContent = semente
    ? (nome === 'busca' ? 'Já preenchida com o que o site usa hoje. Revise, complete e salve.'
      : nome === 'noticias' ? 'Os textos da Elaia já entram sozinhos. Acrescente notícias do estúdio e links de outros sites, e salve.'
      : nome === 'privacidade' ? 'Texto inicial da política, já em português e inglês. Revise (de preferência com quem cuida da parte jurídica do estúdio) e salve.'
      : 'Este é o conteúdo que está hoje no site. Ao salvar, a página passa a ser editada só por aqui.')
    : pg.d.atualizado ? `Última alteração em ${new Date(pg.d.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : '';
  if (semente) estadoPag('pendente', 'Ainda não salva na nuvem');
  if (convertida) {
    $('#pagInfo').textContent = 'Separado em campos (o site fica igual). Confira e salve.';
    pagMudou();
  }
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
// opc.tr = campo com versão em inglês: no modo EN edita <campo>_en e mostra o português como referência
const emIngles = (opc) => !!opc.tr && pg.idioma === 'en';
function fLinha(cam, rot, opc = {}) {
  const en = emIngles(opc);
  const c = en ? cam + '_en' : cam;
  const ph = en ? pegarCaminho(pg.d, cam) || '' : opc.ph;
  return `<label class="campo${en ? ' traduz' : ''}"><span>${rot}</span>
  <input type="${opc.tipo || 'text'}" data-cam="${c}" value="${esc(pegarCaminho(pg.d, c))}"${ph ? ` placeholder="${esc(ph)}"` : ''}>${opc.dica && !en ? `<small>${opc.dica}</small>` : ''}</label>`;
}
function fArea(cam, rot, opc = {}) {
  const en = emIngles(opc);
  const c = en ? cam + '_en' : cam;
  const pt = pegarCaminho(pg.d, cam) || '';
  return `<label class="campo${en ? ' traduz' : ''}"><span>${rot}</span>
  ${en && pt.length > 140 ? `<details class="ref-pt"><summary>Original em português</summary><div>${esc(pt)}</div></details>` : ''}
  <textarea data-cam="${c}" rows="${opc.linhas || 4}"${(en ? pt : opc.ph) ? ` placeholder="${esc(en ? pt : opc.ph)}"` : ''}>${esc(pegarCaminho(pg.d, c))}</textarea>${opc.dica && !en ? `<small>${opc.dica}</small>` : ''}</label>`;
}
const fCheck = (cam, rot) => `<label class="check"><input type="checkbox" data-cam="${cam}"${pegarCaminho(pg.d, cam) ? ' checked' : ''}> ${rot}</label>`;
function fImagem(cam, rot, opc = {}) {
  const v = pegarCaminho(pg.d, cam) || {};
  const src = v._preview || (v.ref ? imgUrl(v.ref) : v.src || '');
  return `<div class="campo campo-img${opc.quadrada ? ' quadrada' : ''}"><span>${rot}</span>
    <div class="img-campo">
      <div class="img-previa">${src ? `<img src="${esc(src)}" alt="">` : '<em>Sem imagem</em>'}${v._enviando ? '<b>Enviando…</b>' : ''}</div>
      <button class="bt" data-acao="img" data-cam="${cam}">${src ? 'Trocar imagem' : 'Escolher imagem'}</button>
    </div></div>`;
}
const TIT_EN = { sobre: 'About', nucleos: 'Studios', premiacoes: 'Awards', publicacoes: 'Publications', equipe: 'Team' };
// título do bloco do Sobre = título da seção no site (editável no próprio cabeçalho do bloco)
function fTitulo(chave, padrao) {
  const en = pg.idioma === 'en';
  const c = `titulos.${chave}${en ? '_en' : ''}`;
  const v = en ? pegarCaminho(pg.d, c) || '' : pegarCaminho(pg.d, c) ?? padrao;
  const ph = en ? TIT_EN[chave] || '' : padrao;
  return `<h2 class="h2-editavel"><input class="titulo-cartao${en ? ' traduz' : ''}" type="text" data-cam="${c}" value="${esc(v)}"
    placeholder="${esc(ph)}" aria-label="Título da seção no site${en ? ' (inglês)' : ''}" title="Título da seção no site — clique para editar"></h2>`;
}

function fLista(cam, rotItem, corpo, opc = {}) {
  const itens = pegarCaminho(pg.d, cam) || [];
  return `<div class="lista-ed${opc.compacta ? ' compacta' : ''}">` + itens.map((it, i) => `
    <div class="item-ed">
      <div class="item-cab">${opc.titulo ? fTituloCartao(`${cam}.${i}.titulo`, `${rotItem} ${i + 1}`) : `<b>${esc(opc.nome?.(it) || `${rotItem} ${i + 1}`)}</b>`}
        ${opc.tipo ? `<span class="chip-tipo">${esc(opc.tipo(it))}</span>` : ''}
        <button class="bt ico" data-acao="item-subir" data-lista="${cam}" data-i="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="bt ico" data-acao="item-descer" data-lista="${cam}" data-i="${i}" title="Descer" ${i === itens.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="bt ico perigo" data-acao="item-apagar" data-lista="${cam}" data-i="${i}" title="Excluir">✕</button>
      </div>
      <div class="item-corpo">${corpo(`${cam}.${i}`, it, i)}</div>
    </div>`).join('') +
    (opc.semAdd ? '' : `<button class="bt add-item" data-acao="item-novo" data-lista="${cam}">+ ${opc.add || rotItem}</button>`) + '</div>';
}

// título editável no próprio cabeçalho (cartão do Contato, blocos do Sobre): é o título da seção no site
function fTituloCartao(cam, ph) {
  const en = pg.idioma === 'en';
  const c = en ? cam + '_en' : cam;
  const pt = pegarCaminho(pg.d, cam) || '';
  return `<input class="titulo-cartao${en ? ' traduz' : ''}" type="text" data-cam="${c}" value="${esc(pegarCaminho(pg.d, c) || '')}"
    placeholder="${esc(en ? pt || ph : ph)}" aria-label="Título da seção no site${en ? ' (inglês)' : ''}" title="Título da seção no site — clique para editar">`;
}

const NOVOS = {
  nucleos: () => ({ nome: '', link_texto: '', link_url: '', descricao: '' }),
  premiacoes: () => ({ ano: String(new Date().getFullYear()), descricao: '' }),
  publicacoes: () => ({ ano: String(new Date().getFullYear()), descricao: '' }),
  equipe: () => ({ nome: '', cargo: '', foto: null, bio: '' }),
  secoes: () => ({ titulo: '', texto: '' }),
  redes: () => ({ nome: '', url: '' }),
  itens: () => ({ nome: '', url: '' }), // links de uma seção do Contato
};
const NOVA_SECAO = {
  texto: () => ({ tipo: 'texto', titulo: '', texto: '' }),
  contato: () => ({ tipo: 'contato', titulo: 'Contato', email: '', telefone: '', whatsapp: '' }),
  endereco: () => ({ tipo: 'endereco', titulo: 'Endereço', logradouro: '', caixa_postal: '', bairro: '', cidade: '', uf: '', cep: '' }),
  links: () => ({ tipo: 'links', titulo: 'Redes sociais', itens: [{ nome: '', url: '' }] }),
};

// contador de caracteres para descrições (o Google mostra ~155)
const fConta = (cam, ideal, opc = {}) => {
  if (emIngles(opc)) cam += '_en';
  const n = String(pegarCaminho(pg.d, cam) || '').length;
  return `<small class="conta${n > ideal ? ' passou' : ''}" data-conta="${cam}" data-ideal="${ideal}">${n} caracteres · ideal até ${ideal}</small>`;
};

function formBusca() {
  const pagina = (k, nome) => `
    <div class="item-ed"><div class="item-cab"><b>${nome}</b></div><div class="item-corpo">
      ${fLinha(`paginas.${k}.titulo`, 'Título (aba do navegador e resultado do Google)', { tr: true })}
      ${fArea(`paginas.${k}.descricao`, 'Descrição (texto abaixo do título no Google e no preview do link)', { linhas: 3, tr: true })}
      ${fConta(`paginas.${k}.descricao`, 155, { tr: true })}
    </div></div>`;
  return `
  <section class="bloco-ed"><h2>Como o site aparece</h2>
    <p class="nota-ed">O que está nesta aba não aparece como texto no site: é o que o Google e os aplicativos (WhatsApp,
    Instagram, LinkedIn…) leem para mostrar o site nas buscas e nos previews de link. As páginas de cada projeto usam
    a <b>descrição de busca</b> do projeto (editor do projeto, coluna Informações) e a capa; a descrição de cada imagem
    fica na Galeria de imagens do projeto. Depois de salvar, as páginas lidas pelo Google se atualizam em ~2 minutos.</p>
    <p class="nota-ed">Com o botão <b>EN</b> da barra, escreva os títulos e descrições da versão em inglês do site
    (odisse.com.br/en/). Vazios, o site usa um texto padrão em inglês.</p>
    <div class="geracao" id="geracao"><span id="geracaoTxt">Páginas para o Google: verificando…</span>
      <button class="bt" data-acao="gerar">Atualizar agora</button></div>
  </section>
  <section class="bloco-ed"><h2>Imagem de compartilhamento</h2>
    ${fImagem('imagem', 'Imagem do preview (Home, Sobre e Contato)')}
    <p class="nota-ed">Aparece quando alguém compartilha o endereço do site. É cortada em 1200 × 630 px (formato deitado, 1,9 : 1) —
    o centro da imagem é o que fica. Sem imagem, usamos a capa do primeiro projeto.</p>
  </section>
  <section class="bloco-ed"><h2>Páginas</h2>
    <div class="lista-ed">${pagina('home', 'Home')}${pagina('sobre', 'Sobre')}${pagina('contato', 'Contato')}${pagina('privacidade', 'Política de privacidade')}</div>
  </section>
  <section class="bloco-ed"><h2>Ficha do estúdio</h2>
    <p class="nota-ed">Vai para o Google como dados do negócio (nome, contato, endereço, redes). Ajuda o estúdio a aparecer
    no quadro lateral das buscas e em buscas locais. Campos vazios ficam de fora.</p>
    ${fLinha('estudio.nome', 'Nome')}
    ${fArea('estudio.descricao', 'Descrição curta do estúdio', { linhas: 3, tr: true })}
    ${fConta('estudio.descricao', 200, { tr: true })}
    <p class="nota-ed">E-mail, telefone, endereço e redes sociais vêm da aba <a href="#/contato">Páginas → Contato</a> — não é preciso repetir aqui.</p>
    ${fLinha('estudio.atende', 'Onde atende', { ph: 'João Pessoa, Paraíba e outras cidades do Brasil' })}
    <div class="duas">${fLinha('estudio.fundacao', 'Ano de fundação', { ph: '2021' })}${fLinha('estudio.fundadores', 'Fundadores', { dica: 'Separados por vírgula.' })}</div>
    <h3 class="sub-ed">Outros endereços do estúdio</h3>
    <p class="nota-ed">Além das redes do Contato: Elaia, loja, outros sites do estúdio…</p>
    ${fLista('estudio.redes', 'Endereço', (c) => `<div class="duas">${fLinha(c + '.nome', 'Nome', { ph: 'Instagram' })}${fLinha(c + '.url', 'Endereço', { ph: 'https://…' })}</div>`,
      { compacta: true, nome: (it) => it.nome, add: 'Endereço' })}
  </section>`;
}

// ordem do site: abertura · equipe · núcleos · premiações · publicações (as notícias vêm da aba Notícias)
function formSobre() {
  const anoDesc = (c) => `<div class="ano-desc">${fLinha(c + '.ano', 'Ano')}${fLinha(c + '.descricao', 'Descrição', { tr: true })}</div>`;
  return `
  <section class="bloco-ed">
    ${fTitulo('sobre', 'Sobre')}
    ${fImagem('foto', 'Foto do estúdio')}
    ${fArea('descricao', 'Texto de apresentação', { linhas: 14, dica: 'Uma linha em branco separa os parágrafos.', tr: true })}
  </section>
  <section class="bloco-ed">
    ${fTitulo('equipe', 'Equipe')}
    <p class="nota-ed">A equipe (fotos, cargos e apresentações, em português e inglês) é editada no Universo:
      <a href="https://universo.odisse.com.br/#/equipe" target="_blank" rel="noopener">universo.odisse.com.br → Equipe</a>.
      Aparece aqui quem estiver marcado “aparece no site”. A lista antiga deste painel fica guardada só de reserva.</p>
  </section>
  <section class="bloco-ed">
    ${fTitulo('nucleos', 'Núcleos')}
    ${fLista('nucleos', 'Núcleo', (c) => `
      ${fLinha(c + '.nome', 'Nome', { tr: true })}
      <div class="duas">${fLinha(c + '.link_texto', 'Texto do link', { ph: 'Visite nossa loja', tr: true })}${fLinha(c + '.link_url', 'Endereço do link', { ph: 'https://…' })}</div>
      ${fArea(c + '.descricao', 'Descrição', { linhas: 3, tr: true })}`, { nome: (it) => it.nome })}
  </section>
  <section class="bloco-ed">
    ${fTitulo('premiacoes', 'Premiações')}
    ${fLista('premiacoes', 'Prêmio', anoDesc, { compacta: true, nome: (it) => [it.ano, it.descricao].filter(Boolean).join(' — ') })}
  </section>
  <section class="bloco-ed">
    ${fTitulo('publicacoes', 'Publicações')}
    <p class="nota-ed">Sem nenhum item, a seção não aparece no site.</p>
    ${fLista('publicacoes', 'Publicação', anoDesc, { compacta: true, nome: (it) => [it.ano, it.descricao].filter(Boolean).join(' — ') })}
  </section>
  <section class="bloco-ed"><h2>Notícias</h2>
    <p class="nota-ed">As notícias do fim da página (do estúdio, links de outros sites e textos da Elaia) ficam na aba <a href="#/noticias">Notícias</a>.</p>
  </section>`;
}

function formPrivacidade() {
  return `
  <section class="bloco-ed"><h2>Aviso de cookies</h2>
    <p class="nota-ed">A caixa que aparece no canto da tela na primeira visita, com os botões <b>Aceitar</b> e <b>Recusar</b>.
    O Google Analytics e o Google Ads só são carregados depois de "Aceitar". O link para a política entra sozinho no fim do texto.</p>
    ${fArea('aviso', 'Texto do aviso', { linhas: 3, tr: true })}
    ${fConta('aviso', 200, { tr: true })}
  </section>
  <section class="bloco-ed"><h2>Política de privacidade</h2>
    <p class="nota-ed">Página odisse.com.br/privacidade/ (em inglês, /en/privacy/). Fica fora do menu do topo: o link está no rodapé
    e no aviso de cookies. No fim da página entra sozinho o botão para a pessoa rever a escolha sobre cookies, e no topo a data
    da última alteração.</p>
    ${fLinha('titulo', 'Título', { tr: true })}
    ${fArea('texto', 'Texto', { linhas: 24, tr: true, dica: 'Linha em branco separa parágrafos. Um parágrafo começado por <b>## </b> vira subtítulo; linhas começadas por <b>- </b> viram lista; [texto](https://…) vira link; **texto** vira negrito.' })}
  </section>`;
}

// ---- Contato: seções com tipo; o painel guarda campos separados e o site monta o texto corrido
// (assets/js/paginas.js → contato). O título de cada seção é editado no próprio cabeçalho do cartão.
const TIPOS_CONTATO = { contato: 'Contato', endereco: 'Endereço', links: 'Links', texto: 'Texto' };
// converte seções antigas (só título e texto) em campos separados, quando o texto tem esse formato
function separarContato(d) {
  let mudou = false;
  const linkMd = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
  d.secoes = (d.secoes || []).map((s) => {
    if (s.tipo) return s;
    const t = String(s.texto || '').trim();
    const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
    const base = { titulo: s.titulo || '', ...(s.titulo_en ? { titulo_en: s.titulo_en } : {}) };
    let nova = null;
    if (linhas.length && linhas.every((l) => linkMd.test(l))) {
      nova = { ...base, tipo: 'links', itens: linhas.map((l) => { const m = l.match(linkMd); return { nome: m[1], url: m[2] }; }) };
    } else if (/mailto:|wa\.me\//.test(t)) {
      const email = (t.match(/mailto:([^)\s]+)/) || t.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[1] || '';
      const zap = (t.match(/wa\.me\/(\d+)/) || [])[1] || '';
      const tel = (linhas.find((l) => /^\+?[\d\s().-]{8,}$/.test(l)) || '').trim();
      const resto = linhas.filter((l) => !/mailto:|wa\.me\//.test(l) && l !== tel);
      // WhatsApp igual ao telefone: fica com o número como está escrito (+55 83 99122-3088)
      const whatsapp = zap && tel.replace(/\D/g, '') === zap ? tel : zap ? '+' + zap : '';
      if (!resto.length) nova = { ...base, tipo: 'contato', email, telefone: tel, whatsapp };
    } else if (/endere|address/i.test(s.titulo || '') && linhas.length <= 6) {
      const e = { ...base, tipo: 'endereco', logradouro: '', caixa_postal: '', bairro: '', cidade: '', uf: '', cep: '' };
      const sobra = [];
      for (const l of linhas) {
        let m;
        if ((m = l.match(/^caixa postal\s*(.+)$/i))) e.caixa_postal = m[1];
        else if ((m = l.match(/^cep:?\s*(.+)$/i))) e.cep = m[1];
        else if ((m = l.match(/^(?:(.+?),\s*)?(.+?)\s*[–-]\s*([A-Z]{2})$/))) { e.bairro = m[1] || ''; e.cidade = m[2]; e.uf = m[3]; }
        else if (!e.logradouro) e.logradouro = l;
        else sobra.push(l);
      }
      if (!sobra.length) nova = e;
    }
    if (!nova) return { ...s, tipo: 'texto' };
    mudou = true;
    return nova;
  });
  return mudou;
}
function corpoSecaoContato(c, it) {
  if (it.tipo === 'contato') {
    return `<div class="duas">${fLinha(c + '.email', 'E-mail', { ph: 'contato@odisse.com.br' })}${fLinha(c + '.telefone', 'Telefone', { ph: '+55 83 …' })}</div>
      ${fLinha(c + '.whatsapp', 'WhatsApp (número)', { ph: '+55 83 9…', dica: 'Vira a frase “Fale com a gente também pelo WhatsApp.” com o link. Também é o número do botão de WhatsApp da Home.' })}`;
  }
  if (it.tipo === 'endereco') {
    return `${fLinha(c + '.logradouro', 'Rua, número e complemento', { ph: 'Rua Bananeiras, nº 361 – Sala 107' })}
      <div class="duas">${fLinha(c + '.caixa_postal', 'Caixa postal', { ph: '393' })}${fLinha(c + '.cep', 'CEP', { ph: '58.038-170' })}</div>
      <div class="tres">${fLinha(c + '.bairro', 'Bairro')}${fLinha(c + '.cidade', 'Cidade')}${fLinha(c + '.uf', 'Estado (sigla)', { ph: 'PB' })}</div>`;
  }
  if (it.tipo === 'links') {
    return fLista(c + '.itens', 'Link', (ci) => `<div class="duas">${fLinha(ci + '.nome', 'Nome', { ph: 'Instagram' })}${fLinha(ci + '.url', 'Endereço', { ph: 'https://…' })}</div>`,
      { compacta: true, nome: (x) => x.nome, add: 'Link' });
  }
  return fArea(c + '.texto', 'Texto', { linhas: 5, tr: true, dica: '[texto](https://…) vira link; **texto** vira negrito; linha em branco separa parágrafos.' });
}
function formContato() {
  return `
  <section class="bloco-ed"><h2>Seções</h2>
    <p class="nota-ed">Na ordem em que aparecem no site; a primeira abre a página. O nome de cada cartão é o título da seção
    no site — clique nele para editar. Os campos viram o mesmo texto corrido da página.</p>
    ${fLista('secoes', 'Seção', corpoSecaoContato, { titulo: true, semAdd: true, tipo: (it) => TIPOS_CONTATO[it.tipo || 'texto'] })}
    <div class="add-tipos"><span>Nova seção:</span>${Object.entries(TIPOS_CONTATO).map(([k, rot]) =>
      `<button class="bt" data-acao="secao-nova" data-tipo="${k}">+ ${rot}</button>`).join('')}</div>
  </section>`;
}

// ---- Notícias: do estúdio (texto no próprio site), links de outros sites e textos da Elaia (RSS)
function itemNoticia(it, i) {
  const c = `itens.${i}`;
  const link = it.tipo === 'link';
  const img = link && it.imagem_url ? `<div class="img-previa link-img"><img src="${esc(it.imagem_url)}" alt="" referrerpolicy="no-referrer"></div>` : '';
  return `<div class="item-ed noticia-ed${it.oculta ? ' oculta' : ''}">
    <div class="item-cab"><span class="chip-tipo${link ? ' link' : ''}">${link ? 'Link' : 'Estúdio'}</span>
      <b>${esc([it.data ? new Date(it.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '', it.titulo || 'Sem título'].filter(Boolean).join(' — '))}</b>
      <button class="bt ico perigo" data-acao="item-apagar" data-lista="itens" data-i="${i}" title="Excluir">✕</button>
    </div>
    <div class="item-corpo">
      ${link ? `<div class="link-linha">${fLinha(c + '.url', 'Endereço da matéria', { ph: 'https://…' })}<button class="bt" data-acao="link-ler" data-i="${i}">Buscar dados do link</button></div>` : ''}
      <div class="duas">${fLinha(c + '.data', 'Data', { tipo: 'date' })}${link ? fLinha(c + '.fonte', 'Veículo ou site', { ph: 'ArchDaily, revista, jornal…' }) : '<span></span>'}</div>
      ${fLinha(c + '.titulo', 'Título', { tr: true })}
      ${fArea(c + '.texto', link ? 'Resumo' : 'Texto', { linhas: link ? 3 : 7, tr: true, dica: link ? 'Aparece abaixo do título; o título leva à matéria.' : 'Textos longos aparecem com “Ler mais”.' })}
      ${link ? `<div class="link-img-linha">${img}${fLinha(c + '.imagem_url', 'Imagem (endereço, opcional)', { ph: 'https://…' })}</div>` : fImagem(c + '.imagem', 'Imagem (opcional)')}
      ${fCheck(c + '.oculta', 'Esconder do site')}
    </div></div>`;
}
function formNoticias() {
  const itens = pg.d.itens || [];
  return `
  <section class="bloco-ed"><h2>Notícias no Sobre</h2>
    <p class="nota-ed">O fim da página Sobre mostra as 5 notícias mais recentes; as anteriores aparecem de 5 em 5 (‹ ›). Entram as notícias
    escritas aqui, os links para matérias de outros sites e os textos da Elaia — todos pela data, do mais novo para o mais antigo.</p>
    <div class="nova-noticia">
      <button class="bt-forte" data-acao="noticia-nova" data-tipo="propria">+ Notícia do estúdio</button>
      <button class="bt" data-acao="noticia-nova" data-tipo="link">+ Link de outro site</button>
    </div>
  </section>
  <section class="bloco-ed"><h2>Do estúdio e links <span class="conta-h">${itens.length}</span></h2>
    ${itens.length ? `<div class="lista-ed">${itens.map(itemNoticia).join('')}</div>` : '<p class="nota-ed">Nenhuma ainda.</p>'}
  </section>
  <section class="bloco-ed"><h2>Textos da Elaia (Substack)</h2>
    ${fCheck('mostrar_rss', 'Mostrar os textos publicados na Elaia')}
    ${fLinha('rss', 'Endereço do feed (RSS)', { ph: 'https://odisse.substack.com/feed', dica: 'O site lê o feed sozinho, a cada hora: um texto novo na Elaia entra nas notícias sem precisar fazer nada.' })}
    <div id="rssLista">${desenharRss()}</div>
  </section>`;
}
function desenharRss() {
  if (pg.nome !== 'noticias') return '';
  if (!pg.rss) return '<p class="nota-ed">Lendo os textos da Elaia…</p>';
  if (pg.rss.erro) return `<p class="nota-ed">Não consegui ler o feed agora (${esc(pg.rss.erro)}).</p>`;
  if (!pg.rss.itens.length) return '<p class="nota-ed">Nenhum texto encontrado neste endereço.</p>';
  const ocultos = new Set(pg.d.rss_ocultos || []);
  return `<p class="nota-ed">${pg.rss.itens.length} textos no feed. Desligue os que não devem aparecer no site.</p><div class="rss-lista">` +
    pg.rss.itens.map((x) => `<label class="rss-item${ocultos.has(x.url) ? ' oculto' : ''}">
      <span class="chave"><input type="checkbox" data-acao="rss-alternar" data-url="${esc(x.url)}"${ocultos.has(x.url) ? '' : ' checked'}></span>
      ${x.imagem_url ? `<img src="${esc(x.imagem_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<i></i>'}
      <span><b>${esc(x.titulo)}</b><small>${x.data ? new Date(x.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</small></span>
      <a href="${esc(x.url)}" target="_blank" rel="noopener" title="Abrir na Elaia">↗</a></label>`).join('') + '</div>';
}
async function carregarRss() {
  const nome = pg.nome;
  pg.rss = null;
  const el = $('#rssLista');
  if (el) el.innerHTML = desenharRss();
  try {
    const r = await nuvem.rss((pg.d.rss || '').trim() || undefined);
    if (pg.nome === nome) pg.rss = r;
  } catch (err) {
    if (pg.nome === nome) pg.rss = { erro: err.message, itens: [] };
  }
  const el2 = $('#rssLista');
  if (el2 && pg.nome === nome) el2.innerHTML = desenharRss();
}

// estado das páginas estáticas (aba Busca): quando o painel pediu a última atualização ao GitHub
async function mostrarGeracao() {
  const el = $('#geracaoTxt');
  if (!el) return;
  try {
    const g = await nuvem.geracao();
    if (!$('#geracaoTxt')) return;
    const quando = g.quando ? new Date(g.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    $('#geracaoTxt').textContent = !g.quando ? 'Páginas para o Google: nenhuma atualização pedida pelo painel ainda.'
      : g.ok ? `Páginas para o Google: atualização pedida em ${quando} (ficam prontas ~2 min depois).`
      : g.erro === 'sem GH_TOKEN' ? 'Páginas para o Google: falta o token do GitHub (secret GH_DISPATCH_TOKEN) — elas só se atualizam uma vez por dia.'
      : `Páginas para o Google: o último pedido (${quando}) falhou — ${g.erro || 'HTTP ' + g.status}. Confira o token do GitHub.`;
  } catch {
    if ($('#geracaoTxt')) $('#geracaoTxt').textContent = 'Páginas para o Google: estado indisponível agora.';
  }
}

function desenharPagina() {
  const rolagem = $('#paginaEd').scrollTop;
  $$('#pagIdioma button').forEach((b) => b.classList.toggle('ativo', b.dataset.idioma === pg.idioma));
  const avisoEn = pg.idioma === 'en'
    ? '<div class="aviso-en"><b>Versão em inglês.</b> Os campos marcados com EN recebem a tradução; o texto em cinza é o original. Campo vazio = o site mostra o português.</div>' : '';
  $('#pagForm').innerHTML = avisoEn + (pg.nome === 'sobre' ? formSobre() : pg.nome === 'busca' ? formBusca()
    : pg.nome === 'noticias' ? formNoticias() : pg.nome === 'privacidade' ? formPrivacidade() : formContato());
  if (pg.nome === 'busca') mostrarGeracao();
  $('#paginaEd').scrollTop = rolagem;
  if (pg.nome === 'noticias' && !pg.rss) carregarRss();
}
$('#pagIdioma').addEventListener('click', (e) => {
  const b = e.target.closest('[data-idioma]');
  if (!b || b.dataset.idioma === pg.idioma) return;
  pg.idioma = b.dataset.idioma;
  desenharPagina();
});
$('#pagVersoes').addEventListener('click', () => abrirVersoes('pagina', pg.nome, PAG_NOME[pg.nome]));
$('#pagForm').addEventListener('change', (e) => {
  // trocou o endereço do feed: lê de novo
  if (e.target.dataset.cam === 'rss') carregarRss();
  if (e.target.dataset.acao === 'rss-alternar') {
    const url = e.target.dataset.url;
    const ocultos = new Set(pg.d.rss_ocultos || []);
    if (e.target.checked) ocultos.delete(url); else ocultos.add(url);
    pg.d.rss_ocultos = [...ocultos];
    e.target.closest('.rss-item')?.classList.toggle('oculto', !e.target.checked);
    pagMudou();
  }
});

$('#pagForm').addEventListener('input', (e) => {
  const cam = e.target.dataset.cam;
  if (!cam) return;
  porCaminho(pg.d, cam, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  if (/^itens\.\d+\.oculta$/.test(cam)) e.target.closest('.noticia-ed')?.classList.toggle('oculta', e.target.checked);
  const conta = $(`[data-conta="${cam}"]`);
  if (conta) {
    const n = e.target.value.length, ideal = +conta.dataset.ideal;
    conta.textContent = `${n} caracteres · ideal até ${ideal}`;
    conta.classList.toggle('passou', n > ideal);
  }
  // o nome do item no cabeçalho do cartão acompanha o que é digitado
  const cab = e.target.classList.contains('titulo-cartao') ? null : e.target.closest('.item-ed')?.querySelector(':scope > .item-cab b');
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
  if (acao === 'rss-alternar') return; // tratado no change
  if (acao === 'gerar') {
    b.disabled = true;
    nuvem.gerar().then((g) => {
      aviso(g.ok ? 'Pedido enviado. As páginas para o Google ficam prontas em ~2 minutos.' : `Não consegui pedir: ${g.erro || 'HTTP ' + g.status}`, !g.ok);
      mostrarGeracao();
    }).catch((err) => aviso(`Não consegui pedir: ${err.message}`, true)).finally(() => { b.disabled = false; });
    return;
  }
  if (acao === 'noticia-nova') {
    pg.d.itens ||= [];
    pg.d.itens.unshift({ id: novoId(), tipo: b.dataset.tipo, data: hojeISO(), titulo: '', texto: '', url: '', fonte: '', imagem: null, imagem_url: '' });
    desenharPagina();
    pagMudou();
    $('.noticia-ed input[type=text]')?.focus();
    return;
  }
  if (acao === 'link-ler') return lerLinkNoticia(+b.dataset.i, b);
  if (acao === 'secao-nova') {
    (pg.d.secoes ||= []).push(NOVA_SECAO[b.dataset.tipo]());
    desenharPagina();
    pagMudou();
    $$('#pagForm .titulo-cartao').at(-1)?.focus();
    return;
  }
  const cam = b.dataset.lista;
  const lista = pegarCaminho(pg.d, cam) || [];
  const i = +b.dataset.i;
  if (acao === 'item-novo') { lista.push(NOVOS[cam.split('.').pop()]()); porCaminho(pg.d, cam, lista); }
  else if (acao === 'item-subir' && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
  else if (acao === 'item-descer' && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
  else if (acao === 'item-apagar') {
    const it = lista[i];
    const nome = it?.nome || it?.titulo || it?.descricao || it?.url || '';
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

// "Buscar dados do link": título, resumo, veículo, imagem e data da matéria (preenche só o que está vazio)
async function lerLinkNoticia(i, bt) {
  const it = pg.d.itens?.[i];
  const url = (it?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) { aviso('Cole primeiro o endereço da matéria (começando com https://).', true); return; }
  bt.disabled = true;
  bt.textContent = 'Lendo…';
  try {
    const d = await nuvem.link(url);
    let n = 0;
    for (const k of ['titulo', 'texto', 'fonte', 'imagem_url', 'data']) {
      if (d[k] && !(it[k] || '').trim()) { it[k] = d[k]; n++; }
    }
    desenharPagina();
    pagMudou();
    aviso(n ? 'Dados do link preenchidos. Revise antes de salvar.' : 'Nada novo: os campos já estavam preenchidos.');
  } catch (err) {
    aviso(`Não consegui ler o link: ${err.message}`, true);
    bt.disabled = false;
    bt.textContent = 'Buscar dados do link';
  }
}

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
  if (nome === 'noticias') {
    const sem = (pg.d.itens || []).find((x) => !(x.titulo || '').trim());
    if (sem) { aviso('Há uma notícia sem título. Dê um título ou exclua antes de salvar.', true); return; }
    pg.d.itens = (pg.d.itens || []).sort(porData);
    desenharPagina(); // a ordem pode ter mudado com as datas
  }
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
const NOMES_SAIDA = { whatsapp: 'WhatsApp', email: 'E-mail', telefone: 'Telefone', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', elaia: 'Elaia (Substack)', objetos: 'Odisse Objetos', servicos: 'Serviços (projetos.odisse)', candidatura: 'Formulário de candidatura', noticia: 'Notícias (links)' };
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

  const pagNome = (x) => NOMES_PAG[x] || (x.startsWith('/projeto/') ? titulo(x.slice(9)) : x);
  const canais = m.canais || [];
  const maxCanal = Math.max(1, ...canais.map((c) => c.visitas));
  const pct = (v) => `${String(v ?? 0).replace('.', ',')}%`;

  $('#painelMetricas').innerHTML = `
    <section class="kpis">
      ${kpi('Visitantes', fmt(t.visitantes), variacao(t.visitantes, a.visitantes))}
      ${kpi('Páginas vistas', fmt(t.paginas), variacao(t.paginas, a.paginas))}
      ${kpi('Projetos abertos', fmt(t.projetos), variacao(t.projetos, a.projetos))}
      ${kpi('Tempo médio por página', fmtTempo(t.tempo), variacao(t.tempo, a.tempo))}
      ${kpi('Cliques de contato', fmt(t.contatos), variacao(t.contatos, a.contatos))}
      ${kpi('Visitas com contato', pct(t.taxa), variacao(t.taxa, a.taxa))}
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
        <h3>De onde vêm — e quem chega a falar com o estúdio</h3>
        <p>Canal de chegada de cada visita (a origem da primeira página: Instagram, Google, Elaia, anúncio, direto…), o que fizeram no site
        e quantas visitas terminaram em contato (WhatsApp, e-mail ou telefone).</p>
        ${canais.length ? `<table class="tabela">
          <thead><tr><th>Canal</th><th class="n">Visitas</th><th class="n">vs. antes</th><th class="n">Páginas por visita</th><th class="n">Projetos vistos</th><th class="n">Cliques no WhatsApp</th><th class="n">Visitas com contato</th><th class="n">Taxa</th></tr></thead>
          <tbody>${canais.map((c) => `<tr>
            <td><span class="barra-mini" style="width:${Math.max(4, (60 * c.visitas) / maxCanal)}px"></span>${esc(c.nome)}</td>
            <td class="n">${fmt(c.visitas)}</td>
            <td class="n">${c.antes ? `<span class="${c.visitas >= c.antes ? 'sobe' : 'desce'}">${c.visitas >= c.antes ? '▲' : '▼'} ${Math.abs(Math.round(((c.visitas - c.antes) / c.antes) * 100))}%</span>` : '<span class="cinza">novo</span>'}</td>
            <td class="n">${(c.paginas / c.visitas).toFixed(1).replace('.', ',')}</td>
            <td class="n">${fmt(c.projetos)}</td>
            <td class="n">${fmt(c.whatsapp)}</td>
            <td class="n">${fmt(c.contato)}</td>
            <td class="n"><b>${pct(c.taxa)}</b></td></tr>`).join('')}</tbody>
        </table>
        <p class="nota-tab">“Google Ads” aparece quando um anúncio traz a pessoa (o Google acrescenta um código ao endereço). Visitas que chegam por
        aplicativos (WhatsApp, Instagram no celular) às vezes vêm sem origem e contam como “Direto” — para medir um post ou a bio, use o link com
        <code>?utm_source=instagram</code> (ou outro nome) no fim do endereço.</p>` : '<p class="sem">Sem visitas no período.</p>'}
      </div>

      <div class="cartao largo">
        <h3>Projetos</h3>
        <p>Aberturas (página própria e acordeão da Home), por onde a pessoa chegou ao projeto, tempo médio, quantos viram a sequência até o fim
        e quantas visitas com esse projeto terminaram em contato.</p>
        ${m.projetos.length ? `<table class="tabela">
          <thead><tr><th>Projeto</th><th class="n">Aberturas</th><th class="n">Pela Home</th><th class="n">Por outros projetos</th><th class="n">Pela busca</th><th class="n">Tempo médio</th><th class="n">Viram até o fim</th><th class="n">Geraram contato</th></tr></thead>
          <tbody>${m.projetos.map((p) => `<tr>
            <td><span class="barra-mini" style="width:${Math.max(4, (60 * p.vistas) / maxProj)}px"></span>${esc(titulo(p.slug))}</td>
            <td class="n">${fmt(p.vistas)}</td><td class="n">${fmt(p.home)}</td><td class="n">${fmt(p.relacionados || 0)}</td><td class="n">${fmt(p.busca || 0)}</td>
            <td class="n">${fmtTempo(p.tempo)}</td><td class="n">${p.fim === null ? '—' : p.fim + '%'}</td>
            <td class="n">${p.contato === undefined ? '—' : `${fmt(p.contato)}${p.visitas ? ` <span class="cinza">(${Math.round((100 * p.contato) / p.visitas)}%)</span>` : ''}`}</td></tr>`).join('')}</tbody>
        </table>` : '<p class="sem">Nenhum projeto aberto no período.</p>'}
      </div>

      <div class="cartao"><h3>WhatsApp: de onde saem os cliques</h3><p>${fmt(m.whatsapp?.total || 0)} cliques no período, pela página em que a pessoa estava.</p>
        ${ranque(m.whatsapp?.paginas, (x) => pagNome(x.nome), 'Nenhum clique no WhatsApp no período.')}</div>
      <div class="cartao"><h3>O que procuram no site</h3><p>Termos digitados na busca do topo e filtros escolhidos.</p>
        ${ranque(m.buscas, (x) => x.nome, 'Ninguém usou a busca no período.')}</div>

      <div class="cartao"><h3>Site anterior</h3><p>De onde veio cada página vista (ou a campanha, quando o link tem utm_source).</p>${ranque(m.origens)}</div>
      <div class="cartao"><h3>Cliques de saída</h3><p>Contato e links para fora do site.</p>${ranque(m.saidas, (x) => NOMES_SAIDA[x.nome] || x.nome, 'Nenhum clique de saída no período.')}</div>
      <div class="cartao"><h3>Páginas</h3><p>Páginas vistas.</p>${ranque(m.paginas, (x) => pagNome(x.nome))}</div>
      <div class="cartao"><h3>Idioma</h3><p>Páginas vistas em português e em inglês (botão PT/EN do site).</p>${ranque(m.idiomas)}</div>
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

// ------------------------------------------------------------------ histórico
// Gaveta lateral com as versões de um projeto ou página; aba Histórico com projetos
// excluídos, últimas alterações e backups.
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace('.', '') : '—');
const MOTIVO = { edicao: 'Antes de uma alteração', exclusao: 'Projeto excluído', restauracao: 'Antes de uma restauração' };
const gav = { tipo: '', id: '' };

function fecharGaveta() { const g = $('#gaveta'); if (g) g.hidden = true; }
$('#gavetaFechar').addEventListener('click', fecharGaveta);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharGaveta(); });

function linhaVersao(v, opc = {}) {
  const det = v.tipo === 'projeto'
    ? [`${v.ni ?? '?'} ${v.ni === 1 ? 'imagem' : 'imagens'}`, `${v.nt ?? '?'} ${v.nt === 1 ? 'texto' : 'textos'}`, v.visivel === false ? 'oculto' : ''].filter(Boolean).join(' · ')
    : '';
  return `<div class="versao">
    <div class="versao-txt">
      ${opc.nome ? `<b>${esc(opc.nome)}</b>` : ''}
      <span class="versao-data">${v.atualizado ? `Como estava em ${quando(v.atualizado)}` : `Guardada em ${quando(v.quando)}`}</span>
      <small>${esc(MOTIVO[v.motivo] || 'Versão')}${v.motivo !== 'exclusao' ? ` · substituída em ${quando(v.quando)}` : ` em ${quando(v.quando)}`}${det ? ' · ' + det : ''}</small>
    </div>
    <button class="bt" data-restaurar="${esc(v.chave)}" data-tipo="${v.tipo}" data-id="${esc(v.id)}">Restaurar</button>
  </div>`;
}

async function abrirVersoes(tipo, id, titulo) {
  gav.tipo = tipo; gav.id = id;
  $('#gavetaTitulo').textContent = 'Versões anteriores';
  $('#gavetaInfo').textContent = titulo;
  $('#gavetaCorpo').innerHTML = '<p class="vazio">Carregando…</p>';
  $('#gaveta').hidden = false;
  try {
    const lista = await nuvem.versoes(tipo, id);
    if (gav.id !== id) return;
    $('#gavetaCorpo').innerHTML = lista.length
      ? `<p class="nota-ed">Até 10 versões. Restaurar não apaga nada: o estado de agora também fica guardado aqui.</p>${lista.map((v) => linhaVersao(v)).join('')}`
      : '<p class="vazio">Ainda não há versões anteriores. A cada salvamento, o estado de antes fica guardado aqui.</p>';
  } catch (err) {
    $('#gavetaCorpo').innerHTML = `<p class="vazio">Não foi possível carregar: ${esc(err.message)}</p>`;
  }
}

async function restaurarVersao(chave, tipo, id, bt) {
  const sujo = (tipo === 'projeto' && vista === 'editor' && ed.p?.id === id && ed.sujo) || (tipo === 'pagina' && vista === 'pagina' && pg.nome === id && pg.sujo);
  if (!confirm(`Restaurar esta versão?${sujo ? '\n\nAs alterações ainda não salvas serão descartadas.' : ''}\n\nO estado atual fica guardado no histórico — dá para desfazer.`)) return;
  if (bt) { bt.disabled = true; bt.textContent = 'Restaurando…'; }
  try {
    const v = await nuvem.versao(chave);
    if (tipo === 'projeto') {
      const res = await nuvem.gravar(v, 'restauracao');
      const i = indice.findIndex((r) => r.id === id);
      if (i >= 0) indice[i] = res.resumo; else indice.unshift(res.resumo);
      fecharGaveta();
      aviso(v.visivel === false ? 'Versão restaurada (o projeto está oculto do site).' : 'Versão restaurada. O site atualiza em até 1 minuto.');
      if (vista === 'editor' && ed.p?.id === id) { ed.sujo = false; abrirEditor(id); }
      else if (vista === 'historico') carregarHistorico();
    } else {
      const { atualizado, ...d } = v;
      await nuvem.gravarPagina(id, d, 'restauracao');
      fecharGaveta();
      aviso('Versão restaurada. O site atualiza em até 1 minuto.');
      if (vista === 'pagina' && pg.nome === id) { pg.sujo = false; abrirPagina(id); }
      else if (vista === 'historico') carregarHistorico();
    }
  } catch (err) {
    aviso(`Não foi possível restaurar: ${err.message}`, true);
    if (bt) { bt.disabled = false; bt.textContent = 'Restaurar'; }
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-restaurar]');
  if (b) restaurarVersao(b.dataset.restaurar, b.dataset.tipo, b.dataset.id, b);
});

let hist = { versoes: [], backups: [], abertos: {} };
async function carregarHistorico() {
  const el = $('#painelHistorico');
  if (!hist.versoes.length && !hist.backups.length) el.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const [versoes, backups, lista] = await Promise.all([nuvem.versoes(), nuvem.backups(), nuvem.lista()]);
    indice = lista;
    hist.versoes = versoes;
    hist.backups = backups;
    desenharHistorico();
  } catch (err) {
    el.innerHTML = `<p class="vazio">Não foi possível carregar o histórico: ${esc(err.message)}</p>`;
  }
}

function nomeDe(v) {
  if (v.tipo === 'pagina') return `Página ${PAG_NOME[v.id] || v.id}`;
  return indice.find((r) => r.id === v.id)?.titulo || v.titulo || 'Projeto';
}

function desenharHistorico() {
  const vivos = new Set(indice.map((r) => r.id));
  const excluidos = [];
  const vistos = new Set();
  // a versão mais nova de cada projeto que não está mais na lista
  for (const v of hist.versoes) if (v.tipo === 'projeto' && !vivos.has(v.id) && !vistos.has(v.id)) { vistos.add(v.id); excluidos.push(v); }
  const recentes = [...hist.versoes].sort((a, b) => (b.quando || '').localeCompare(a.quando || '')).filter((v) => vivos.has(v.id) || v.tipo === 'pagina').slice(0, 15);
  const MOT = { mensal: 'Mensal', manual: 'Feito à mão' };
  $('#painelHistorico').innerHTML = `
    <section class="bloco-ed"><h2>Projetos excluídos</h2>
      ${excluidos.length ? `<p class="nota-ed">Restaurar traz o projeto de volta à lista, com as imagens, como estava quando foi excluído.</p>${excluidos.map((v) => linhaVersao(v, { nome: v.titulo || 'Projeto' })).join('')}`
        : '<p class="nota-ed">Nenhum projeto excluído recentemente.</p>'}
    </section>
    <section class="bloco-ed"><h2>Últimas alterações</h2>
      <p class="nota-ed">O estado de antes de cada alteração. Também dá para ver e restaurar pelo botão <b>Versões</b> do projeto ou da página.</p>
      ${recentes.length ? recentes.map((v) => linhaVersao(v, { nome: nomeDe(v) })).join('') : '<p class="nota-ed">Nenhuma alteração guardada ainda — começa a contar a partir de agora.</p>'}
    </section>
    <section class="bloco-ed"><h2>Backups</h2>
      <p class="nota-ed">Cópia de todos os projetos e páginas, feita sozinha no dia 1 de cada mês (ficam os 12 últimos) ou pelo botão acima (ficam os 5 últimos).
      As imagens usadas em um backup ficam guardadas enquanto ele existir. <b>Baixar</b> salva uma cópia no seu computador.</p>
      ${hist.backups.length ? hist.backups.map((b) => `
        <div class="backup" data-chave="${esc(b.chave)}">
          <div class="versao">
            <div class="versao-txt"><b>${quando(b.criado)}</b><small>${MOT[b.motivo] || b.motivo} · ${b.nprojetos} projetos · ${b.npaginas} páginas · ${b.kb} KB</small></div>
            <div class="backup-acoes">
              <button class="bt" data-backup="ver">${hist.abertos[b.chave] ? 'Fechar' : 'Ver conteúdo'}</button>
              <button class="bt" data-backup="baixar">Baixar</button>
            </div>
          </div>
          ${hist.abertos[b.chave] ? conteudoBackup(b.chave) : ''}
        </div>`).join('') : '<p class="nota-ed">Nenhum backup ainda. O primeiro mensal sai no dia 1; para fazer um agora, use o botão acima.</p>'}
    </section>`;
}

const backupsLidos = {};
function conteudoBackup(chave) {
  const b = backupsLidos[chave];
  if (!b) return '<p class="nota-ed backup-corpo">Carregando…</p>';
  const ordem = (b.indice || []).map((r) => r.id);
  const projetos = Object.values(b.projetos || {}).sort((x, y) => ordem.indexOf(x.id) - ordem.indexOf(y.id));
  const vivos = new Set(indice.map((r) => r.id));
  return `<div class="backup-corpo">
    ${projetos.map((p) => `<div class="versao mini">
      <div class="versao-txt"><b>${esc(p.titulo)}</b><small>${vivos.has(p.id) ? 'Na lista hoje' : 'Excluído depois deste backup'} · como estava em ${quando(p.atualizado)}</small></div>
      <button class="bt" data-backup="projeto" data-id="${esc(p.id)}">Restaurar</button></div>`).join('')}
    ${Object.entries(b.paginas || {}).map(([nome, d]) => `<div class="versao mini">
      <div class="versao-txt"><b>Página ${esc(PAG_NOME[nome] || nome)}</b><small>como estava em ${quando(d.atualizado)}</small></div>
      <button class="bt" data-backup="pagina" data-id="${esc(nome)}">Restaurar</button></div>`).join('')}
    <div class="backup-tudo"><button class="bt perigo" data-backup="tudo">Restaurar tudo deste backup</button>
      <small>Volta todos os projetos e páginas a este ponto (e a ordem da lista). Projetos criados depois continuam.</small></div>
  </div>`;
}

$('#painelHistorico').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-backup]');
  if (!b) return;
  const chave = b.closest('.backup').dataset.chave;
  const acao = b.dataset.backup;
  const ler = async () => (backupsLidos[chave] ||= await nuvem.backup(chave));
  try {
    if (acao === 'ver') {
      hist.abertos[chave] = !hist.abertos[chave];
      desenharHistorico();
      if (hist.abertos[chave] && !backupsLidos[chave]) { await ler(); desenharHistorico(); }
      return;
    }
    if (acao === 'baixar') {
      const d = await ler();
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `odisse-site-backup-${(d.criado || '').slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return;
    }
    const d = await ler();
    if (acao === 'projeto') {
      const p = d.projetos[b.dataset.id];
      if (!confirm(`Restaurar “${p.titulo}” como estava neste backup? O estado atual fica no histórico.`)) return;
      await nuvem.gravar(p, 'restauracao');
      aviso('Projeto restaurado.');
    } else if (acao === 'pagina') {
      const nome = b.dataset.id;
      if (!confirm(`Restaurar a página ${PAG_NOME[nome] || nome} como estava neste backup? O estado atual fica no histórico.`)) return;
      const { atualizado, ...pagina } = d.paginas[nome];
      await nuvem.gravarPagina(nome, pagina, 'restauracao');
      aviso('Página restaurada.');
    } else if (acao === 'tudo') {
      if (!confirm('Restaurar TODOS os projetos e páginas deste backup?\n\nO estado atual de cada um fica guardado no histórico (Versões).')) return;
      b.disabled = true;
      const falhas = [];
      const projetos = Object.values(d.projetos || {});
      for (const [n, p] of projetos.entries()) {
        b.textContent = `Restaurando ${n + 1} de ${projetos.length}…`;
        try { await nuvem.gravar(p, 'restauracao'); } catch (err) { falhas.push(`${p.titulo}: ${err.message}`); }
      }
      for (const [nome, pagina] of Object.entries(d.paginas || {})) {
        const { atualizado, ...resto } = pagina;
        try { await nuvem.gravarPagina(nome, resto, 'restauracao'); } catch (err) { falhas.push(`Página ${nome}: ${err.message}`); }
      }
      const atuais = await nuvem.lista();
      const ordem = (d.indice || []).map((r) => r.id).filter((id) => atuais.some((r) => r.id === id));
      await nuvem.ordem([...ordem, ...atuais.map((r) => r.id).filter((id) => !ordem.includes(id))]);
      if (falhas.length) alert(`Restaurado, com estas exceções:\n\n${falhas.join('\n')}`);
      else aviso('Tudo restaurado. O site atualiza em até 1 minuto.');
    }
    carregarHistorico();
  } catch (err) {
    aviso(`Não foi possível: ${err.message}`, true);
  }
});

$('#btBackup').addEventListener('click', async () => {
  const bt = $('#btBackup');
  bt.disabled = true;
  bt.textContent = 'Fazendo backup…';
  try {
    const r = await nuvem.fazerBackup();
    aviso(`Backup feito: ${r.nprojetos} projetos e ${r.npaginas} páginas.`);
    carregarHistorico();
  } catch (err) {
    aviso(`Não foi possível fazer o backup: ${err.message}`, true);
  } finally {
    bt.disabled = false;
    bt.textContent = 'Fazer backup agora';
  }
});

// ------------------------------------------------------------------ início
$$('[data-marca]').forEach((el) => { el.innerHTML = mark(el.dataset.marca, el.dataset.marca === 'odisse' ? 13 : 26); });
rota();
