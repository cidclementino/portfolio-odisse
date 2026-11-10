// Idioma do site (PT/EN). Carregado no <head>, antes de desenhar a página.
// O idioma vem do ENDEREÇO: tudo sob /en/ é inglês (/en/, /en/about/, /en/contact/,
// /en/privacy/, /en/projects/<slug>/); o resto, português. Assim cada idioma tem
// páginas próprias, que o Google indexa (com hreflang ligando as duas versões).
// O <html> já chega com lang="en" e a classe lang-en nas páginas em inglês — o CSS
// mostra o texto fixo certo (<span class="t-pt">…</span><span class="t-en">…</span>).
//
// O conteúdo vindo do painel usa o campo em inglês quando existe (titulo_en,
// texto_en…) e, sem ele, o português. Os vocabulários fixos (tipologia, escala,
// status) são traduzidos por aqui.
//
// Endereços antigos com ?lang=en levam à página equivalente em /en/. A escolha
// feita no botão PT/EN fica guardada e vale ao ENTRAR no site de novo (não para
// robôs, nem para quem já está navegando).

(function () {
  var O = (window.Odisse = window.Odisse || {});
  var raiz = document.documentElement;

  // pares de endereços português ⇄ inglês (o resto segue /x/ ⇄ /en/x/)
  var PARES = [['/', '/en/'], ['/sobre/', '/en/about/'], ['/contato/', '/en/contact/'],
    ['/privacidade/', '/en/privacy/'], ['/projeto/', '/en/project/']];
  function ehIngles(caminho) { return /^\/en(\/|$)/.test(caminho); }
  // caminho equivalente no idioma pedido
  function rota(caminho, para) {
    caminho = caminho || '/';
    if (caminho === '/en') caminho = '/en/';
    var en = ehIngles(caminho);
    if ((para === 'en') === en) return caminho;
    for (var i = 0; i < PARES.length; i++) {
      if (caminho === PARES[i][en ? 1 : 0]) return PARES[i][en ? 0 : 1];
    }
    var m;
    if (!en && (m = caminho.match(/^\/projetos\/(.+)$/))) return '/en/projects/' + m[1];
    if (en && (m = caminho.match(/^\/en\/projects\/(.+)$/))) return '/projetos/' + m[1];
    return en ? caminho.replace(/^\/en/, '') || '/' : '/en' + caminho;
  }

  var lang = ehIngles(location.pathname) ? 'en' : 'pt';
  try {
    var q = new URLSearchParams(location.search).get('lang');
    var guardado = localStorage.getItem('odisse-lang');
    var destino = '';
    if (q === 'en' || q === 'pt') {
      localStorage.setItem('odisse-lang', q);
      destino = q;
    } else if (guardado && guardado !== lang && !/bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent)) {
      // entrou no site agora (veio de fora ou digitou o endereço): vale a escolha guardada
      var ref = '';
      try { ref = document.referrer ? new URL(document.referrer).host : ''; } catch (e) { /* idem */ }
      if (ref !== location.host && !/[?&]previa=/.test(location.search)) destino = guardado;
    }
    if (destino) {
      var u = new URL(location.href);
      u.searchParams.delete('lang');
      u.pathname = rota(u.pathname, destino);
      if (u.href !== location.href) { location.replace(u.href); lang = destino; }
    }
  } catch (e) { /* sem armazenamento: idioma do endereço */ }
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
    privacidade: ['Política de privacidade', 'Privacy policy'],
    whatsapp_frase: ['Fale com a gente também pelo', 'You can also reach us on'],
    caixa_postal: ['Caixa Postal', 'P.O. Box'],
    cep: ['CEP:', 'Postal code:'],
    atualizada_em: ['Atualizada em', 'Last updated'],
    rever_cookies: ['Rever minha escolha sobre cookies', 'Review my cookie choice'],
    ver_galeria: ['Ver em galeria', 'Gallery view'],
    ver_lista: ['Ver em lista', 'List view'],
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
  // troca de idioma (botão PT/EN): vai para a página equivalente no outro idioma
  function trocar(novo) {
    try { localStorage.setItem('odisse-lang', novo); } catch (e) { /* idem */ }
    var u = new URL(location.href);
    u.searchParams.delete('lang');
    u.pathname = rota(u.pathname, novo);
    location.href = u.href;
  }
  // endereço interno (escrito em português, ex.: '/projetos/x/') no idioma da página
  function url(caminho) {
    var partes = String(caminho || '/').match(/^([^?#]*)(.*)$/);
    return rota(partes[1] || '/', lang) + partes[2];
  }

  O.lang = lang;
  O.t = t;
  O.tr = tr;
  O.voc = voc;
  O.data = data;
  O.trocarIdioma = trocar;
  O.rota = rota;
  O.url = url;
})();
