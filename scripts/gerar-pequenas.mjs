// Gera a versão pequena (640 px, "-p") das imagens que já estavam na nuvem
// antes de o painel passar a criá-la no envio: capas dos projetos e fotos
// das páginas Sobre e Contato. Parte da versão média (1200 px).
// Uso: API=https://... SITE_SENHA=... node scripts/gerar-pequenas.mjs
import sharp from 'sharp';

const API = (process.env.API || 'https://site-odisse.reservaprojectbasework.workers.dev').replace(/\/$/, '');
const SENHA = process.env.SITE_SENHA;
if (!SENHA) throw new Error('Falta SITE_SENHA');
const auth = { Authorization: `Bearer ${SENHA}` };

async function pegar(caminho) {
  const r = await fetch(API + caminho, { headers: auth });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
}
function refsEm(obj, refs) {
  if (Array.isArray(obj)) obj.forEach((x) => refsEm(x, refs));
  else if (obj && typeof obj === 'object') {
    if (typeof obj.ref === 'string' && obj.ref) refs.add(obj.ref);
    Object.values(obj).forEach((x) => refsEm(x, refs));
  }
}

const refs = new Set();
for (const r of (await pegar('/api/admin/projetos')) || []) if (r.capa?.ref) refs.add(r.capa.ref);
for (const nome of ['sobre', 'contato']) refsEm(await pegar(`/api/admin/paginas/${nome}`), refs);
console.log(`${refs.size} imagens para conferir`);

let feitas = 0;
for (const ref of refs) {
  const media = await fetch(`${API}/img/${encodeURIComponent(ref)}-m`);
  if (!media.ok) { console.log(`  ${ref}: sem versão média, pulando`); continue; }
  const entrada = Buffer.from(await media.arrayBuffer());
  const saida = await sharp(entrada).resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const put = await fetch(`${API}/api/admin/imagens/${encodeURIComponent(ref)}-p`, {
    method: 'PUT', headers: { ...auth, 'Content-Type': 'image/webp' }, body: saida,
  });
  if (!put.ok) throw new Error(`${ref}: envio falhou (HTTP ${put.status})`);
  feitas++;
  console.log(`  ${ref}: ${Math.round(entrada.length / 1024)} KB → ${Math.round(saida.length / 1024)} KB`);
}
console.log(`Pronto: ${feitas} versões pequenas geradas.`);
