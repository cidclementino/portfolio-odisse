// Gera, a partir da nuvem, o que o Google e os previews de link precisam ler sem
// executar JavaScript:
//   projetos/<slug>/index.html     -> página própria de cada projeto visível, com o conteúdo no HTML
//   en/projects/<slug>/index.html  -> a mesma página, em inglês
//   assets/og/<ref>.jpg            -> imagens de preview (1200 × 630, JPEG)
//   _data/busca.json               -> ficha do estúdio, títulos/descrições (PT e EN), imagem padrão (aba Busca)
//   _data/projetos.json            -> lista para o sitemap e a lista sem JavaScript da Home
//   _data/paginas.json             -> Sobre, Contato e Privacidade como estão na nuvem (reserva e aviso de cookies)
//   _includes/gerado/*.html        -> conteúdo de Sobre, Contato, Privacidade e das últimas notícias, já
//                                     desenhado em PT e EN (com os mesmos desenhos de assets/js/paginas.js)
// Roda no workflow "Páginas estáticas": quando algo é salvo no painel (o Worker pede), uma vez por dia
// e à mão em Actions.
// Uso: node scripts/gerar-estaticas.mjs   (API=https://… para outra nuvem)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const API = (process.env.API || 'https://site-odisse.reservaprojectbasework.workers.dev').replace(/\/$/, '');
const SITE = 'https://www.odisse.com.br';
const OG_DIR = path.join(RAIZ, 'assets/og');
const PROJ_DIR = path.join(RAIZ, 'projetos');
const PROJ_EN = path.join(RAIZ, 'en/projects');

async function pegar(caminho) {
  const r = await fetch(API + caminho);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}

// os mesmos desenhos de HTML do site (assets/js/i18n.js, projetos.js e paginas.js), um contexto
// por idioma — a página gerada é idêntica à que o navegador montaria
function contexto(lang) {
  const caminho = lang === 'en' ? '/en/' : '/';
  const janela = { Odisse: { API } };
  const ctx = vm.createContext({
    window: janela, console, URL, URLSearchParams,
    location: { pathname: caminho, search: '', hash: '', host: 'www.odisse.com.br', href: SITE + caminho, replace() {} },
    navigator: { userAgent: 'gerador' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { referrer: '', documentElement: { classList: { add() {}, contains: () => false }, lang: '' } },
  });
  for (const arq of ['assets/js/i18n.js', 'assets/js/projetos.js', 'assets/js/paginas.js']) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, arq), 'utf8'), ctx, { filename: arq });
  }
  return janela.Odisse;
}
const LANG = { pt: contexto('pt'), en: contexto('en') };
const P = LANG.pt.projetos;

const limpar = (t) => String(t || '').replace(/\s+/g, ' ').trim();
function resumir(t, max = 155) {
  t = limpar(t);
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return corte.slice(0, corte.lastIndexOf(' ') > 80 ? corte.lastIndexOf(' ') : corte.length).replace(/[,;:—–-]$/, '') + '…';
}
const j = (v) => JSON.stringify(v); // YAML aceita JSON

// ---- imagens de preview
const ogUsadas = new Set();
async function ogDe(ref) {
  if (!ref) return null;
  const arq = `${ref}.jpg`;
  ogUsadas.add(arq);
  const destino = path.join(OG_DIR, arq);
  if (!fs.existsSync(destino)) {
    let r = await fetch(`${API}/img/${encodeURIComponent(ref)}`);
    if (!r.ok) r = await fetch(`${API}/img/${encodeURIComponent(ref)}-m`);
    if (!r.ok) { console.log(`  sem imagem para o preview: ${ref}`); ogUsadas.delete(arq); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    const jpg = await sharp(buf).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    fs.writeFileSync(destino, jpg);
    console.log(`  preview ${arq}: ${Math.round(jpg.length / 1024)} KB`);
  }
  return `/assets/og/${arq}`;
}

// ---- dados
const lista = (await pegar('/api/projetos')) || [];
const buscaSemente = JSON.parse(fs.readFileSync(path.join(RAIZ, 'admin/busca-semente.json'), 'utf8'));
const busca = (await pegar('/api/paginas/busca')) || buscaSemente;
console.log(`${lista.length} projetos visíveis`);

fs.mkdirSync(OG_DIR, { recursive: true });
for (const d of [PROJ_DIR, PROJ_EN]) {
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

const est = busca.estudio || {};
const NOME = limpar(est.nome) || 'Odisse, Estúdio de Arquitetura e Design';
const dadosProjetos = [];
let primeiraOg = null;

for (const r of lista) {
  const p = await pegar(`/api/projetos/${encodeURIComponent(r.slug)}`);
  if (!p) continue;
  const imgs = (p.secoes || []).filter((s) => s.tipo === 'imagem' && s.ref);
  const capa = p.capa?.ref ? p.capa : imgs[0];
  const og = await ogDe(capa?.ref);
  primeiraOg ||= og;
  const altCapa = limpar(imgs.find((s) => s.ref === capa?.ref)?.alt) || p.titulo;
  const altCapaEn = limpar(imgs.find((s) => s.ref === capa?.ref)?.alt_en) || altCapa;

  for (const lang of ['pt', 'en']) {
    const en = lang === 'en';
    const L = LANG[lang].projetos;
    const tr = (o, k) => limpar(L.tr(o, k));
    const titulo = tr(p, 'titulo') || p.titulo;
    const primeiroTexto = (p.secoes || []).map((s) => (s.tipo === 'texto' ? tr(s, 'texto') : '')).find(Boolean);
    const local = tr(p, 'local');
    const descricao = resumir(en ? p.descricao_en : p.descricao) || resumir(primeiroTexto) || (en
      ? `${titulo}${local ? `, ${local}` : ''}. A project by Odisse, Architecture and Design Studio.`
      : `${titulo}${local ? `, ${local}` : ''}. Projeto do estúdio Odisse, Arquitetura e Design.`);
    const caminho = en ? `/en/projects/${p.slug}/` : `/projetos/${p.slug}/`;
    const outro = en ? `/projetos/${p.slug}/` : `/en/projects/${p.slug}/`;
    const url = SITE + caminho;

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: titulo,
      description: descricao,
      url,
      inLanguage: en ? 'en' : 'pt-BR',
      ...(p.ano ? { dateCreated: String(p.ano) } : {}),
      ...(local ? { locationCreated: { '@type': 'Place', name: local } } : {}),
      ...(p.tipologia ? { genre: tr(p, 'tipologia') } : {}),
      creator: { '@type': 'Organization', name: NOME, url: `${SITE}/` },
      image: imgs.slice(0, 12).map((s) => ({
        '@type': 'ImageObject', contentUrl: P.img(s.ref, 'm'), ...(tr(s, 'alt') ? { description: tr(s, 'alt') } : {}),
      })),
    };

    const corpo = `<div class="project is-ready" id="conteudo" tabindex="-1">
  <aside class="project__sidebar">
    <div>${L.titulo(p)}${L.meta(p)}</div>
  </aside>
  <div class="project__spreads" tabindex="0" role="region" aria-label="${L.esc(titulo)}">${L.spreads(p)}</div>
  <div class="project__dots"></div>
</div>`;

    const pagina = `---
layout: projeto
permalink: ${caminho}
pagina: projeto
lang: ${lang}
alt: ${outro}
slug: ${j(p.slug)}
atualizado: ${j(p.atualizado || '')}
seo_titulo: ${j(`${titulo} — Odisse`)}
seo_descricao: ${j(descricao)}
${og ? `og_imagem: ${j(og)}\nog_imagem_alt: ${j(en ? altCapaEn : altCapa)}\n` : ''}ld_projeto: ${j(ld)}
---
{%- comment -%} Gerado por scripts/gerar-estaticas.mjs — não editar à mão (é regravado a partir do painel). {%- endcomment -%}
{% raw %}
${corpo}
{% endraw %}
`;
    const dir = path.join(en ? PROJ_EN : PROJ_DIR, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pagina);
  }
  dadosProjetos.push({
    slug: p.slug, titulo: p.titulo, titulo_en: limpar(p.titulo_en), local: p.local || '', local_en: limpar(LANG.en.projetos.tr(p, 'local')),
    atualizado: p.atualizado || '',
    imagens: imgs.map((s) => ({ url: P.img(s.ref, 'm') })),
  });
  console.log(`  /projetos/${p.slug}/ · /en/projects/${p.slug}/`);
}

// ---- endereços antigos: página que redireciona para o endereço atual
const vivos = new Set(dadosProjetos.map((x) => x.slug));
for (const r of lista) {
  const p = await pegar(`/api/projetos/${encodeURIComponent(r.slug)}`);
  for (const velho of p?.enderecos_antigos || []) {
    if (vivos.has(velho) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(velho)) continue; // endereço em uso por um projeto vale mais
    for (const [base, dir] of [['/projetos/', PROJ_DIR], ['/en/projects/', PROJ_EN]]) {
      const novo = `${base}${p.slug}/`;
      fs.mkdirSync(path.join(dir, velho), { recursive: true });
      fs.writeFileSync(path.join(dir, velho, 'index.html'), `---
layout: null
permalink: ${base}${velho}/
---
<!DOCTYPE html>
<html lang="${base === '/projetos/' ? 'pt-BR' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${p.titulo.replace(/[<&]/g, '')} — Odisse</title>
<link rel="canonical" href="${SITE}${novo}">
<meta http-equiv="refresh" content="0; url=${novo}">
<script>location.replace(${JSON.stringify(novo)} + location.hash);</script>
</head>
<body><p><a href="${novo}">${SITE}${novo}</a></p></body>
</html>
`);
    }
    console.log(`  /projetos/${velho}/ → /projetos/${p.slug}/`);
  }
}

// ---- busca.json (com a ficha pronta para o Google)
const ogPadrao = (await ogDe(busca.imagem?.ref)) || primeiraOg;
// e-mail, telefone, endereço e redes vêm do Contato (seções com tipo); os campos antigos da aba Busca são reserva
const reservaPaginas = JSON.parse(fs.readFileSync(path.join(RAIZ, '_data/paginas.json'), 'utf8'));
const contatoNuvem = (await pegar('/api/paginas/contato')) || reservaPaginas.contato || {};
const secoesContato = contatoNuvem.secoes || [];
const cont = secoesContato.find((x) => x.tipo === 'contato') || {};
const endC = secoesContato.find((x) => x.tipo === 'endereco');
const end = endC
  ? { rua: endC.logradouro, caixa: endC.caixa_postal, bairro: endC.bairro, cidade: endC.cidade, uf: endC.uf, cep: endC.cep }
  : est.endereco || {};
const linksContato = secoesContato.filter((x) => x.tipo === 'links').flatMap((x) => x.itens || []);
const redes = [...new Set([...linksContato, ...(est.redes || [])].map((x) => limpar(x.url)).filter((u) => /^https?:\/\//.test(u)))];
const fundadores = String(est.fundadores || '').split(',').map(limpar).filter(Boolean);
const ficha = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  '@id': `${SITE}/#estudio`,
  name: NOME,
  url: `${SITE}/`,
  logo: `${SITE}/assets/brand/favicon-512.png`,
  ...(ogPadrao ? { image: SITE + ogPadrao } : {}),
  ...(limpar(est.descricao) ? { description: limpar(est.descricao) } : {}),
  ...(limpar(est.descricao_en) ? { disambiguatingDescription: limpar(est.descricao_en) } : {}),
  ...(limpar(cont.telefone || est.telefone) ? { telephone: limpar(cont.telefone || est.telefone) } : {}),
  ...(limpar(cont.email || est.email) ? { email: limpar(cont.email || est.email) } : {}),
  ...((end.rua || end.cidade) ? {
    address: {
      '@type': 'PostalAddress',
      ...(limpar(end.rua) ? { streetAddress: [limpar(end.rua), limpar(end.bairro)].filter(Boolean).join(', ') } : {}),
      ...(limpar(end.caixa) ? { postOfficeBoxNumber: limpar(end.caixa) } : {}),
      ...(limpar(end.cidade) ? { addressLocality: limpar(end.cidade) } : {}),
      ...(limpar(end.uf) ? { addressRegion: limpar(end.uf) } : {}),
      ...(limpar(end.cep) ? { postalCode: limpar(end.cep) } : {}),
      addressCountry: 'BR',
    },
  } : {}),
  ...(limpar(est.atende) ? { areaServed: limpar(est.atende) } : {}),
  ...(limpar(est.fundacao) ? { foundingDate: limpar(est.fundacao) } : {}),
  ...(fundadores.length ? { founder: fundadores.map((n) => ({ '@type': 'Person', name: n })) } : {}),
  ...(redes.length ? { sameAs: redes } : {}),
};
// títulos/descrições por página; em inglês, sem tradução no painel, os textos padrão de busca-semente.json
const paginas = {};
const sem = buscaSemente.paginas || {};
for (const k of new Set([...Object.keys(sem), ...Object.keys(busca.paginas || {})])) {
  const v = (busca.paginas || {})[k] || {}, s0 = sem[k] || {};
  paginas[k] = {
    titulo: limpar(v.titulo) || limpar(s0.titulo),
    descricao: limpar(v.descricao) || limpar(s0.descricao),
    titulo_en: limpar(v.titulo_en) || limpar(s0.titulo_en),
    descricao_en: limpar(v.descricao_en) || limpar(s0.descricao_en),
  };
}

const escrever = (arq, dados) => fs.writeFileSync(path.join(RAIZ, arq), JSON.stringify(dados, null, 2) + '\n');
escrever('_data/busca.json', {
  estudio: { nome: NOME, descricao: limpar(est.descricao), descricao_en: limpar(est.descricao_en) || limpar(buscaSemente.estudio?.descricao_en) },
  paginas, og_imagem: ogPadrao, ficha,
});
escrever('_data/projetos.json', dadosProjetos);

// ---- Sobre, Contato e Privacidade (e as últimas notícias), já desenhados nos dois idiomas
const GERADO = path.join(RAIZ, '_includes/gerado');
fs.mkdirSync(GERADO, { recursive: true });
const embrulhar = (html) => `{%- comment -%} Gerado por scripts/gerar-estaticas.mjs a partir da nuvem — não editar à mão. {%- endcomment -%}\n{% raw %}${html}{% endraw %}\n`;
const reserva = JSON.parse(fs.readFileSync(path.join(RAIZ, '_data/paginas.json'), 'utf8'));
const dadosPaginas = {};
for (const nome of ['sobre', 'contato', 'privacidade']) {
  const d = (await pegar(`/api/paginas/${nome}`)) || reserva[nome];
  if (!d) continue;
  dadosPaginas[nome] = d;
  for (const lang of ['pt', 'en']) fs.writeFileSync(path.join(GERADO, `${nome}-${lang}.html`), embrulhar(LANG[lang].paginasHtml[nome](d)));
  console.log(`  página ${nome}${d.atualizado ? ` (${d.atualizado.slice(0, 10)})` : ' (reserva)'}`);
}
try {
  const n = await pegar('/api/noticias?de=0&n=5');
  for (const lang of ['pt', 'en']) {
    fs.writeFileSync(path.join(GERADO, `noticias-${lang}.html`), embrulhar((n?.itens || []).map(LANG[lang].paginasHtml.noticia).join('')));
  }
  console.log(`  notícias: ${n?.itens?.length || 0} de ${n?.total || 0}`);
} catch (e) {
  console.log(`  notícias indisponíveis agora (${e.message}); mantidas as anteriores`);
}
escrever('_data/paginas.json', { ...reserva, ...dadosPaginas });

// previews que ninguém mais usa
for (const f of fs.readdirSync(OG_DIR)) if (f.endsWith('.jpg') && !ogUsadas.has(f)) { fs.rmSync(path.join(OG_DIR, f)); console.log(`  removido ${f}`); }
console.log('Pronto.');
