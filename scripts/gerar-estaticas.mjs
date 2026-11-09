// Gera, a partir da nuvem, o que o Google e os previews de link precisam ler sem
// executar JavaScript:
//   projetos/<slug>/index.html  -> página própria de cada projeto visível, com o conteúdo no HTML
//   assets/og/<ref>.jpg         -> imagens de preview (1200 × 630, JPEG)
//   _data/busca.json            -> ficha do estúdio, títulos/descrições, imagem padrão (aba Busca do painel)
//   _data/projetos.json         -> lista para o sitemap e a lista sem JavaScript da Home
// Roda no workflow "Páginas estáticas" (a cada 15 min e após publicar a API).
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

async function pegar(caminho) {
  const r = await fetch(API + caminho);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}

// os mesmos desenhos de HTML do site (assets/js/projetos.js), para a página gerada
// ser idêntica à que o navegador montaria
const janela = { Odisse: { API } };
const ctx = vm.createContext({ window: janela, document: { documentElement: { classList: { contains: () => false } } }, console });
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets/js/projetos.js'), 'utf8'), ctx);
const P = janela.Odisse.projetos;

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
const busca = (await pegar('/api/paginas/busca')) || JSON.parse(fs.readFileSync(path.join(RAIZ, 'admin/busca-semente.json'), 'utf8'));
console.log(`${lista.length} projetos visíveis`);

fs.mkdirSync(OG_DIR, { recursive: true });
fs.rmSync(PROJ_DIR, { recursive: true, force: true });
fs.mkdirSync(PROJ_DIR, { recursive: true });

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
  const primeiroTexto = (p.secoes || []).find((s) => s.tipo === 'texto' && limpar(s.texto))?.texto;
  const descricao = resumir(p.descricao) || resumir(primeiroTexto) ||
    `${p.titulo}${p.local ? `, ${p.local}` : ''}. Projeto do estúdio Odisse, Arquitetura e Design.`;
  const url = `${SITE}/projetos/${p.slug}/`;
  const altCapa = limpar(imgs.find((s) => s.ref === capa?.ref)?.alt) || p.titulo;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: p.titulo,
    description: descricao,
    url,
    inLanguage: 'pt-BR',
    ...(p.ano ? { dateCreated: String(p.ano) } : {}),
    ...(p.local ? { locationCreated: { '@type': 'Place', name: p.local } } : {}),
    ...(p.tipologia ? { genre: p.tipologia } : {}),
    creator: { '@type': 'Organization', name: NOME, url: `${SITE}/` },
    image: imgs.slice(0, 12).map((s) => ({
      '@type': 'ImageObject', contentUrl: P.img(s.ref, 'm'), ...(limpar(s.alt) ? { description: limpar(s.alt) } : {}),
    })),
  };

  const corpo = `<div class="project is-ready">
  <aside class="project__sidebar">
    <div>${P.titulo(p)}${P.meta(p)}</div>
  </aside>
  <div class="project__spreads">${P.spreads(p)}</div>
  <div class="project__dots"></div>
</div>`;

  const pagina = `---
layout: projeto
permalink: /projetos/${p.slug}/
pagina: projeto
slug: ${j(p.slug)}
atualizado: ${j(p.atualizado || '')}
seo_titulo: ${j(`${p.titulo} — Odisse`)}
seo_descricao: ${j(descricao)}
${og ? `og_imagem: ${j(og)}\nog_imagem_alt: ${j(altCapa)}\n` : ''}ld_projeto: ${j(ld)}
---
{%- comment -%} Gerado por scripts/gerar-estaticas.mjs — não editar à mão (é regravado a partir do painel). {%- endcomment -%}
{% raw %}
${corpo}
{% endraw %}
`;
  fs.mkdirSync(path.join(PROJ_DIR, p.slug), { recursive: true });
  fs.writeFileSync(path.join(PROJ_DIR, p.slug, 'index.html'), pagina);
  dadosProjetos.push({
    slug: p.slug, titulo: p.titulo, local: p.local || '', atualizado: p.atualizado || '',
    imagens: imgs.map((s) => ({ url: P.img(s.ref, 'm') })),
  });
  console.log(`  /projetos/${p.slug}/`);
}

// ---- endereços antigos: página que redireciona para o endereço atual
const vivos = new Set(dadosProjetos.map((x) => x.slug));
for (const r of lista) {
  const p = await pegar(`/api/projetos/${encodeURIComponent(r.slug)}`);
  for (const velho of p?.enderecos_antigos || []) {
    if (vivos.has(velho) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(velho)) continue; // endereço em uso por um projeto vale mais
    const novo = `/projetos/${p.slug}/`;
    fs.mkdirSync(path.join(PROJ_DIR, velho), { recursive: true });
    fs.writeFileSync(path.join(PROJ_DIR, velho, 'index.html'), `---
layout: null
permalink: /projetos/${velho}/
---
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${p.titulo.replace(/[<&]/g, '')} — Odisse</title>
<link rel="canonical" href="${SITE}${novo}">
<meta http-equiv="refresh" content="0; url=${novo}">
<script>location.replace(${JSON.stringify(novo)} + location.hash);</script>
</head>
<body><p>Este projeto mudou de endereço: <a href="${novo}">${SITE}${novo}</a></p></body>
</html>
`);
    console.log(`  /projetos/${velho}/ → ${novo}`);
  }
}

// ---- busca.json (com a ficha pronta para o Google)
const ogPadrao = (await ogDe(busca.imagem?.ref)) || primeiraOg;
const end = est.endereco || {};
const redes = (est.redes || []).map((x) => limpar(x.url)).filter((u) => /^https?:\/\//.test(u));
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
  ...(limpar(est.telefone) ? { telephone: limpar(est.telefone) } : {}),
  ...(limpar(est.email) ? { email: limpar(est.email) } : {}),
  ...((end.rua || end.cidade) ? {
    address: {
      '@type': 'PostalAddress',
      ...(limpar(end.rua) ? { streetAddress: [limpar(end.rua), limpar(end.bairro)].filter(Boolean).join(', ') } : {}),
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
const paginas = {};
for (const [k, v] of Object.entries(busca.paginas || {})) paginas[k] = { titulo: limpar(v?.titulo), descricao: limpar(v?.descricao) };

const escrever = (arq, dados) => fs.writeFileSync(path.join(RAIZ, arq), JSON.stringify(dados, null, 2) + '\n');
escrever('_data/busca.json', { estudio: { nome: NOME, descricao: limpar(est.descricao) }, paginas, og_imagem: ogPadrao, ficha });
escrever('_data/projetos.json', dadosProjetos);

// previews que ninguém mais usa
for (const f of fs.readdirSync(OG_DIR)) if (f.endsWith('.jpg') && !ogUsadas.has(f)) { fs.rmSync(path.join(OG_DIR, f)); console.log(`  removido ${f}`); }
console.log('Pronto.');
