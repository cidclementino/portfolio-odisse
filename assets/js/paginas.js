// Sobre e Contato vindos da nuvem (painel /admin/ → Sobre, Contato).
// A página já chega com a versão de reserva (gerada pelo Jekyll a partir de
// _data/paginas.json). Se a nuvem tiver um conteúdo salvo pelo painel, a seção
// é redesenhada com ele — com a MESMA marcação de sobre.html / contato.html.
//
// Formato dos textos: Enter quebra a linha; linha em branco abre parágrafo;
// [texto](endereço) vira link; **texto** vira negrito.

(function () {
  var raiz = document.documentElement;
  var secao = document.querySelector('[data-conteudo]');
  function mostrar() { raiz.classList.remove('pag-aguarda'); }
  if (!secao) return mostrar();
  var nome = secao.getAttribute('data-conteudo');
  var O = window.Odisse || {};
  var emIngles = O.lang === 'en';
  // campo no idioma da página (titulo_en, texto_en…; sem tradução, o português)
  function tr(obj, k) { return O.tr ? O.tr(obj, k) : (obj && obj[k]) || ''; }
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
  function linha(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
        var bruto = url.replace(/&amp;/g, '&');
        if (!linkSeguro(bruto)) return txt;
        return '<a href="' + url + '"' + (externo(bruto) ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>';
      });
  }
  function inline(t) { return String(t || '').trim().split(/\n/).map(linha).join('<br>'); }
  function texto(t) {
    return String(t || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) { return '<p>' + inline(p) + '</p>'; }).join('');
  }
  function img(f, grande) {
    if (!f) return '';
    if (f.ref) return base() + '/img/' + encodeURIComponent(f.ref) + (grande ? '' : '-m');
    return f.src || '';
  }
  function link(url, txt) {
    if (!txt) return '';
    if (!url || !linkSeguro(url)) return esc(txt);
    return '<a href="' + esc(url) + '"' + (externo(url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(txt) + '</a>';
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

  function contato(d) {
    return '<div class="contato__doc">' + (d.secoes || []).map(function (s, i) {
      var tt = tr(s, 'titulo');
      var tit = tt ? (i === 0 ? '<p class="eyebrow">' + esc(tt) + '</p>' : '<h3>' + esc(tt) + '</h3>') : '';
      return tit + texto(tr(s, 'texto'));
    }).join('') + '</div>';
  }

  function desenhar(d) {
    if (!d) return;
    try { secao.innerHTML = nome === 'sobre' ? sobre(d) : contato(d); } catch (e) { console.error(e); }
  }

  var chave = 'odisse:pagina:' + nome;
  var guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(chave) || 'null'); } catch (e) { /* idem */ }
  if (guardado) { desenhar(guardado); mostrar(); }

  fetch(base() + '/api/paginas/' + nome).then(function (res) {
    if (res.status === 404) return null; // ainda não editada no painel: fica a versão do site
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (d) {
    if (d && (!guardado || emIngles || guardado.atualizado !== d.atualizado)) desenhar(d);
    try { if (d) sessionStorage.setItem(chave, JSON.stringify(d)); else sessionStorage.removeItem(chave); } catch (e) { /* idem */ }
  }).catch(function (err) {
    console.warn('Conteúdo da página indisponível na nuvem; mantendo a versão do site.', err);
  }).then(mostrar);

  // ---------------------------------------------------------------- notícias (Sobre)
  // As 5 mais recentes; ‹ › passam para as mais antigas, de 5 em 5 (como no e-mail).
  // Fontes: notícias escritas no painel, links de outros sites e os textos da Elaia.
  var hub = document.querySelector('[data-noticias]');
  if (!hub) return;
  var listaEl = hub.querySelector('.noticias__lista');
  var navEl = hub.querySelector('.noticias__nav');
  var POR_PAGINA = 5;
  var T = function (k, pt) { return O.t ? O.t(k) : pt; };
  var memoria = {};

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
      if (de === 0) hub.hidden = true;
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
