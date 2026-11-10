// Sobre, Contato e Privacidade vindos da nuvem (painel /admin/ → Sobre, Contato,
// Privacidade). A página já chega com o conteúdo no HTML (gerado pelo workflow
// "Páginas estáticas" a partir da nuvem, no idioma da página). Se a nuvem tiver
// uma versão mais nova, a seção é redesenhada — com a MESMA marcação: os desenhos
// abaixo (Odisse.paginasHtml) são usados também pelo gerador (scripts/gerar-estaticas.mjs).
//
// Formato dos textos: Enter quebra a linha; linha em branco abre parágrafo;
// [texto](endereço) vira link; **texto** vira negrito; um parágrafo começado por
// "## " vira subtítulo; linhas começadas por "- " viram lista.

(function () {
  var O = (window.Odisse = window.Odisse || {});
  // campo no idioma da página (titulo_en, texto_en…; sem tradução, o português)
  function tr(obj, k) { return O.tr ? O.tr(obj, k) : (obj && obj[k]) || ''; }
  function T(k, pt) { return O.t ? O.t(k) : pt; }
  function titulo(t, k, padrao) {
    var v = tr(t || {}, k);
    return v || (O.t ? O.t(k) : padrao);
  }

  function base() {
    var api = O.API || '';
    try { api = localStorage.getItem('odisse-api') || api; } catch (e) { /* sem armazenamento */ }
    return api.replace(/\/$/, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function linkSeguro(url) { return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url); }
  function externo(url) { return /^https?:\/\//i.test(url) && !/^https?:\/\/(www\.)?odisse\.com\.br(\/|$)/i.test(url); }
  // link interno escrito em português (/contato/) leva à versão no idioma da página
  function interno(url) { return O.url && /^\/(?!\/)/.test(url) && !/^\/(admin|img|images|assets)\//.test(url) ? O.url(url) : url; }
  function linha(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
        var bruto = url.replace(/&amp;/g, '&');
        if (!linkSeguro(bruto)) return txt;
        return '<a href="' + esc(interno(bruto)) + '"' + (externo(bruto) ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>';
      });
  }
  function inline(t) { return String(t || '').trim().split(/\n/).map(linha).join('<br>'); }
  function texto(t) {
    return String(t || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) {
        var linhas = p.split('\n');
        // "## Subtítulo" (o texto pode vir logo na linha de baixo)
        if (/^##\s+/.test(linhas[0])) {
          var resto = linhas.slice(1).join('\n').trim();
          return '<h3>' + linha(linhas[0].replace(/^##\s+/, '')) + '</h3>' + (resto ? texto(resto) : '');
        }
        if (linhas.every(function (l) { return /^\s*[-•]\s+/.test(l); })) {
          return '<ul>' + linhas.map(function (l) { return '<li>' + linha(l.replace(/^\s*[-•]\s+/, '')) + '</li>'; }).join('') + '</ul>';
        }
        return '<p>' + inline(p) + '</p>';
      }).join('');
  }
  function img(f, grande) {
    if (!f) return '';
    if (f.ref) return base() + '/img/' + encodeURIComponent(f.ref) + (grande ? '' : '-m');
    return f.src || '';
  }
  function link(url, txt) {
    if (!txt) return '';
    if (!url || !linkSeguro(url)) return esc(txt);
    return '<a href="' + esc(interno(url)) + '"' + (externo(url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(txt) + '</a>';
  }

  // ordem: apresentação · equipe · núcleos · premiações · publicações (as notícias vêm à parte)
  function sobre(d) {
    var t = d.titulos || {};
    var anoDesc = function (it) { var ds = tr(it, 'descricao'); return '<p><strong>' + esc(it.ano) + '</strong>' + (it.ano && ds ? ' — ' : '') + inline(ds) + '</p>'; };
    var foto = img(d.foto, true);
    var premios = (d.premiacoes || []).length, pubs = (d.publicacoes || []).length;
    return '' +
      '<div class="sobre__wide">' +
        '<p class="eyebrow">' + esc(titulo(t, 'sobre', 'Sobre')) + '</p>' +
        (foto ? '<div class="sobre__intro-photo"><div class="frame"><img src="' + esc(foto) + '" alt="Odisse — Estúdio de Arquitetura &amp; Design"></div></div>' : '') +
        '<div class="sobre__intro-text">' + texto(tr(d, 'descricao')) + '</div>' +
      '</div>' +
      ((d.equipe || []).length ? '<div class="sobre__doc"><h3>' + esc(titulo(t, 'equipe', 'Equipe')) + '</h3><div class="equipe-grid">' +
        d.equipe.map(function (p) {
          var f = img(p.foto);
          // foto pequena (960 px) quando basta; a média (1200 px) em telas densas
          var fs = p.foto && p.foto.ref ? ' srcset="' + base() + '/img/' + encodeURIComponent(p.foto.ref) + '-s 960w, ' + esc(f) + ' 1200w" sizes="(max-width: 780px) calc(100vw - 80px), 300px"' : '';
          return '<div class="pessoa"><div class="pessoa__foto frame">' + (f ? '<img src="' + esc(f) + '"' + fs + ' alt="' + esc(p.nome) + '" loading="lazy">' : '') + '</div>' +
            '<h4>' + esc(p.nome) + '</h4><p class="pessoa__cargo">' + esc(tr(p, 'cargo')) + '</p>' + texto(tr(p, 'bio')) + '</div>';
        }).join('') + '</div></div>' : '') +
      ((d.nucleos || []).length ? '<div class="sobre__wide"><h3>' + esc(titulo(t, 'nucleos', 'Núcleos')) + '</h3><div class="nucleos-grid">' +
        d.nucleos.map(function (n) {
          var lt = tr(n, 'link_texto');
          return '<div class="nucleo-box"><h4>' + esc(tr(n, 'nome')) + '</h4>' +
            (lt ? '<p>' + link(n.link_url, lt) + '</p>' : '') + texto(tr(n, 'descricao')) + '</div>';
        }).join('') + '</div></div>' : '') +
      (premios || pubs ? '<div class="sobre__doc">' +
        (premios ? '<h3>' + esc(titulo(t, 'premiacoes', 'Premiações')) + '</h3>' + d.premiacoes.map(anoDesc).join('') : '') +
        (pubs ? '<h3>' + esc(titulo(t, 'publicacoes', 'Publicações')) + '</h3>' + d.publicacoes.map(anoDesc).join('') : '') +
      '</div>' : '');
  }

  // Contato: cada seção tem um tipo (painel → Páginas → Contato). O painel guarda os dados em
  // campos separados e aqui eles viram o mesmo texto corrido de sempre:
  //   texto    -> texto livre (com links)
  //   contato  -> e-mail, telefone e WhatsApp
  //   endereco -> endereço, caixa postal, bairro, cidade, UF e CEP
  //   links    -> lista de nome + endereço (redes sociais)
  // Seções antigas (só título e texto) são tratadas como texto.
  function digitos(t) { return String(t || '').replace(/\D/g, ''); }
  function blocoContato(s) {
    var linhas = [];
    if (s.email) linhas.push('<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>');
    if (s.telefone) linhas.push(esc(s.telefone));
    var zap = digitos(s.whatsapp);
    return (linhas.length ? '<p>' + linhas.join('<br>') + '</p>' : '') +
      (zap ? '<p>' + esc(T('whatsapp_frase', 'Fale com a gente também pelo')) + ' <a href="https://wa.me/' + zap + '" target="_blank" rel="noopener">WhatsApp</a>.</p>' : '');
  }
  function blocoEndereco(s) {
    var cidade = [s.bairro, s.cidade].filter(Boolean).join(', ') + (s.uf ? (s.cidade || s.bairro ? ' – ' : '') + s.uf : '');
    var linhas = [
      s.logradouro ? esc(s.logradouro) : '',
      s.caixa_postal ? esc(T('caixa_postal', 'Caixa Postal')) + ' ' + esc(s.caixa_postal) : '',
      cidade ? esc(cidade) : '',
      s.cep ? esc(T('cep', 'CEP:')) + ' ' + esc(s.cep) : '',
    ].filter(Boolean);
    return linhas.length ? '<p>' + linhas.join('<br>') + '</p>' : '';
  }
  function blocoLinks(s) {
    return (s.itens || []).filter(function (x) { return x && (x.nome || x.url); }).map(function (x) {
      return '<p>' + link(x.url, tr(x, 'nome') || x.url) + '</p>';
    }).join('');
  }
  function contato(d) {
    return '<div class="contato__doc">' + (d.secoes || []).map(function (s, i) {
      var tt = tr(s, 'titulo');
      var tit = tt ? (i === 0 ? '<p class="eyebrow">' + esc(tt) + '</p>' : '<h3>' + esc(tt) + '</h3>') : '';
      var corpo = s.tipo === 'contato' ? blocoContato(s) : s.tipo === 'endereco' ? blocoEndereco(s)
        : s.tipo === 'links' ? blocoLinks(s) : texto(tr(s, 'texto'));
      return corpo ? tit + corpo : '';
    }).join('') + '</div>';
  }

  // política de privacidade + botão para rever a escolha sobre cookies (assets/js/cookies.js)
  function privacidade(d) {
    return '<div class="contato__doc privacidade__doc">' +
      '<h1 class="eyebrow">' + esc(tr(d, 'titulo') || T('privacidade', 'Política de privacidade')) + '</h1>' +
      (d.atualizado && O.data ? '<p class="privacidade__data">' + esc(T('atualizada_em', 'Atualizada em')) + ' ' + esc(O.data(d.atualizado)) + '</p>' : '') +
      texto(tr(d, 'texto')) +
      '<p class="privacidade__acoes"><button type="button" class="privacidade__rever" data-cookies-rever>' + esc(T('rever_cookies', 'Rever minha escolha sobre cookies')) + '</button></p>' +
      '</div>';
  }

  function urlImg(x) {
    if (x.imagem && x.imagem.ref) return base() + '/img/' + encodeURIComponent(x.imagem.ref) + '-s';
    return x.imagem_url || '';
  }
  function noticia(x) {
    var tit = tr(x, 'titulo');
    var txt = tr(x, 'texto');
    var url = x.url && linkSeguro(x.url) ? x.url : '';
    var alvo = url && externo(url) ? ' target="_blank" rel="noopener"' : '';
    var src = urlImg(x);
    var fonte = x.tipo === 'elaia' ? 'Elaia' : (x.fonte || '');
    var longo = !url && String(txt).length > 320;
    return '<article class="noticia' + (src ? ' noticia--img' : '') + '">' +
      (src ? (url ? '<a class="noticia__img" href="' + esc(url) + '"' + alvo + ' tabindex="-1" aria-hidden="true">' : '<span class="noticia__img">') +
        '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' + (url ? '</a>' : '</span>') : '') +
      '<div class="noticia__corpo">' +
        '<p class="noticia__meta">' + [x.data ? '<time datetime="' + esc(x.data) + '">' + esc(O.data ? O.data(x.data) : x.data) + '</time>' : '', fonte ? esc(fonte) : ''].filter(Boolean).join(' · ') + '</p>' +
        '<h4>' + (url ? '<a href="' + esc(url) + '"' + alvo + ' data-noticia="' + esc(x.tipo) + '">' + esc(tit) + (alvo ? ' <span aria-hidden="true">↗</span>' : '') + '</a>' : esc(tit)) + '</h4>' +
        (txt ? '<div class="noticia__texto' + (longo ? ' is-curto' : '') + '">' + (url ? '<p>' + esc(txt) + '</p>' : texto(txt)) + '</div>' : '') +
        (longo ? '<button type="button" class="noticia__mais" aria-expanded="false">' + esc(T('ler_mais', 'Ler mais')) + '</button>' : '') +
      '</div></article>';
  }

  var DESENHOS = { sobre: sobre, contato: contato, privacidade: privacidade };
  O.paginasHtml = { sobre: sobre, contato: contato, privacidade: privacidade, noticia: noticia, texto: texto, inline: inline };

  // ---------------------------------------------------------------- no navegador
  if (typeof document === 'undefined' || !document.querySelector) return; // gerador das páginas
  var raiz = document.documentElement;
  var secao = document.querySelector('[data-conteudo]');
  function mostrar() { raiz.classList.remove('pag-aguarda'); }
  if (!secao) return mostrar();
  var nome = secao.getAttribute('data-conteudo');

  function desenhar(d) {
    if (!d || !DESENHOS[nome]) return;
    try { secao.innerHTML = DESENHOS[nome](d); } catch (e) { console.error(e); }
  }

  // a página já traz no HTML a versão gerada (data-atualizado): só redesenha se a nuvem tiver outra
  var naPagina = secao.getAttribute('data-atualizado') || '';
  var chave = 'odisse:pagina:' + nome;
  var guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(chave) || 'null'); } catch (e) { /* idem */ }
  if (guardado && guardado.atualizado !== naPagina) desenhar(guardado);
  mostrar();

  fetch(base() + '/api/paginas/' + nome).then(function (res) {
    if (res.status === 404) return null; // ainda não editada no painel: fica a versão do site
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (d) {
    if (d && d.atualizado !== naPagina && (!guardado || guardado.atualizado !== d.atualizado)) desenhar(d);
    try { if (d) sessionStorage.setItem(chave, JSON.stringify(d)); else sessionStorage.removeItem(chave); } catch (e) { /* idem */ }
  }).catch(function (err) {
    console.warn('Conteúdo da página indisponível na nuvem; mantendo a versão do site.', err);
  });

  // ---------------------------------------------------------------- notícias (Sobre)
  // As 5 mais recentes; ‹ › passam para as mais antigas, de 5 em 5 (como no e-mail).
  // Fontes: notícias escritas no painel, links de outros sites e os textos da Elaia.
  var hub = document.querySelector('[data-noticias]');
  if (!hub) return;
  var listaEl = hub.querySelector('.noticias__lista');
  var navEl = hub.querySelector('.noticias__nav');
  var POR_PAGINA = 5;
  var memoria = {};

  function pagina(de) {
    var chaveM = 'n' + de;
    var pedido = memoria[chaveM] || (memoria[chaveM] = fetch(base() + '/api/noticias?de=' + de + '&n=' + POR_PAGINA).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }));
    pedido.then(function (d) {
      if (!d.total) {
        if (de === 0) { hub.hidden = true; return; }
      }
      hub.hidden = false;
      listaEl.innerHTML = d.itens.length ? d.itens.map(noticia).join('') : '<p class="noticias__vazio">' + esc(T('sem_noticias', 'Nenhuma notícia por enquanto.')) + '</p>';
      var ate = Math.min(d.total, de + d.itens.length);
      navEl.hidden = d.total <= POR_PAGINA;
      navEl.innerHTML = '<span>' + (de + 1) + '–' + ate + ' ' + esc(T('de', 'de')) + ' ' + d.total + '</span>' +
        '<button type="button" data-de="' + Math.max(0, de - POR_PAGINA) + '"' + (de === 0 ? ' disabled' : '') + ' aria-label="' + esc(T('mais_recentes', 'Mais recentes')) + '" title="' + esc(T('mais_recentes', 'Mais recentes')) + '">‹</button>' +
        '<button type="button" data-de="' + (de + POR_PAGINA) + '"' + (ate >= d.total ? ' disabled' : '') + ' aria-label="' + esc(T('mais_antigas', 'Mais antigas')) + '" title="' + esc(T('mais_antigas', 'Mais antigas')) + '">›</button>';
      if (O.pontos) O.pontos.atualizar();
    }).catch(function (err) {
      delete memoria[chaveM];
      if (de === 0 && !listaEl.querySelector('.noticia')) hub.hidden = true; // sem nuvem: fica a versão da página, se houver
      console.warn('Notícias indisponíveis agora.', err);
    });
  }
  navEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-de]');
    if (!b || b.disabled) return;
    var topo = hub.getBoundingClientRect().top;
    pagina(+b.getAttribute('data-de'));
    if (topo < 0) hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  listaEl.addEventListener('click', function (e) {
    var b = e.target.closest('.noticia__mais');
    if (!b) return;
    var t = b.previousElementSibling;
    var aberto = t.classList.toggle('is-curto') === false;
    b.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    b.textContent = aberto ? T('ler_menos', 'Ler menos') : T('ler_mais', 'Ler mais');
  });
  pagina(0);
})();
