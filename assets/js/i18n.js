// Idioma do site (PT/EN). Carregado no <head>, antes de desenhar a página:
// decide o idioma (?lang=en no endereço, ou a escolha guardada neste navegador)
// e marca o <html> com a classe lang-en — o CSS mostra o texto fixo certo
// (<span class="t-pt">…</span><span class="t-en">…</span>) sem piscar.
//
// O conteúdo vindo do painel usa o campo em inglês quando existe (titulo_en,
// texto_en…) e, sem ele, o português. Os vocabulários fixos (tipologia, escala,
// status) são traduzidos por aqui.

(function () {
  var O = (window.Odisse = window.Odisse || {});
  var lang = 'pt';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'pt') { lang = q; localStorage.setItem('odisse-lang', q); }
    else lang = localStorage.getItem('odisse-lang') === 'en' ? 'en' : 'pt';
  } catch (e) { /* sem armazenamento: português */ }
  var raiz = document.documentElement;
  if (lang === 'en') { raiz.classList.add('lang-en'); raiz.lang = 'en'; }

  var TXT = {
    projetos: ['Projetos', 'Projects'],
    sobre: ['Sobre', 'About'],
    contato: ['Contato', 'Contact'],
    buscar: ['Buscar projetos', 'Search projects'],
    fechar_busca: ['Fechar busca', 'Close search'],
    tipologia: ['Tipologia', 'Typology'],
    ano: ['Ano', 'Year'],
    escala: ['Escala', 'Scale'],
    cliente: ['Cliente', 'Client'],
    area: ['Área', 'Area'],
    status: ['Status', 'Status'],
    limpar: ['Limpar', 'Clear'],
    n_projetos: ['{n} projetos', '{n} projects'],
    um_projeto: ['1 projeto', '1 project'],
    nenhum: ['Nenhum projeto encontrado.', 'No projects found.'],
    ver_todos_busca: ['Ver na página de projetos', 'See on the projects page'],
    outros: ['Outros projetos', 'Other projects'],
    ver_todos: ['Ver todos os projetos', 'See all projects'],
    fechar_projeto: ['Fechar projeto', 'Close project'],
    carregando_projeto: ['Carregando projeto…', 'Loading project…'],
    erro_projeto: ['Não consegui carregar esse projeto agora.', 'This project could not be loaded right now.'],
    pagina_propria: ['Abrir em página própria', 'Open on its own page'],
    em_breve: ['Em breve, novos projetos.', 'New projects coming soon.'],
    erro_lista: ['Não foi possível carregar os projetos agora. Tente recarregar a página.', 'The projects could not be loaded right now. Please reload the page.'],
    nao_encontrado: ['Projeto não encontrado', 'Project not found'],
    ir_conteudo: ['Ir para o conteúdo {n}', 'Go to item {n}'],
    noticias: ['Notícias', 'News'],
    mais_recentes: ['Mais recentes', 'Newer'],
    mais_antigas: ['Mais antigas', 'Older'],
    de: ['de', 'of'],
    ler_mais: ['Ler mais', 'Read more'],
    ler_menos: ['Ler menos', 'Read less'],
    sem_noticias: ['Nenhuma notícia por enquanto.', 'No news yet.'],
    nucleos: ['Núcleos', 'Studios'],
    premiacoes: ['Premiações', 'Awards'],
    publicacoes: ['Publicações', 'Publications'],
    equipe: ['Equipe', 'Team'],
    previa: ['Prévia — este projeto ainda não está publicado.', 'Preview — this project is not published yet.'],
    menu: ['Menu', 'Menu'],
  };

  // vocabulário dos campos de escolha (o painel sugere estes valores)
  var VOC = {
    'residencial': 'Residential', 'comercial': 'Commercial', 'corporativo': 'Corporate', 'interiores': 'Interiors',
    'institucional': 'Institutional', 'retrofit': 'Retrofit', 'mobiliário': 'Furniture', 'hotelaria': 'Hospitality',
    'cultural': 'Cultural', 'urbanismo': 'Urbanism', 'paisagismo': 'Landscape', 'expografia': 'Exhibition design',
    'ideia': 'Idea', 'conceito': 'Concept', 'em projeto': 'In design', 'em construção': 'Under construction',
    'em obra': 'Under construction', 'concluído': 'Completed', 'construído': 'Built', 'não construído': 'Unbuilt',
    'objeto': 'Object', 'interior': 'Interior', 'edifício': 'Building', 'conjunto': 'Complex', 'urbana': 'Urban',
    'urbano': 'Urban', 'paisagem': 'Landscape', 'território': 'Territory', 'privado': 'Private', 'pública': 'Public',
    'sobre': 'About', 'núcleos': 'Studios', 'premiações': 'Awards', 'publicações': 'Publications', 'equipe': 'Team',
    'contato': 'Contact', 'trabalhe conosco': 'Work with us', 'endereço': 'Address', 'redes sociais': 'Social media',
    'também em': 'Also at', 'notícias': 'News',
  };
  var MESES = {
    pt: ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  };

  function t(chave, vars) {
    var par = TXT[chave];
    var s = par ? par[lang === 'en' ? 1 : 0] : chave;
    if (vars) for (var k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  // valor de um vocabulário conhecido (ex.: tipologia "Residencial")
  function voc(v) {
    if (lang !== 'en' || v == null) return v;
    var s = String(v);
    var k = s.trim().toLowerCase();
    if (VOC[k]) return VOC[k];
    return s.replace(/\bBrasil\b/g, 'Brazil');
  }
  // campo traduzível de um objeto: obj[chave + '_en'] em inglês, se preenchido
  function tr(obj, chave) {
    if (!obj) return '';
    var pt = obj[chave];
    if (lang !== 'en') return pt == null ? '' : pt;
    var en = obj[chave + '_en'];
    if (en != null && String(en).trim() !== '') return en;
    return pt == null ? '' : voc(pt);
  }
  function data(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length < 3) return iso;
    var m = MESES[lang][+p[1] - 1] || '';
    return lang === 'en' ? m + ' ' + (+p[2]) + ', ' + p[0] : (+p[2]) + ' ' + m + ' ' + p[0];
  }
  function trocar(novo) {
    try { localStorage.setItem('odisse-lang', novo); } catch (e) { /* idem */ }
    var u = new URL(location.href);
    u.searchParams.delete('lang');
    if (u.href === location.href) location.reload(); else location.replace(u.href);
  }

  O.lang = lang;
  O.t = t;
  O.tr = tr;
  O.voc = voc;
  O.data = data;
  O.trocarIdioma = trocar;
})();
