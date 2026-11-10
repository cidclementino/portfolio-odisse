// Projetos vindos da nuvem (API site-odisse — ver worker/).
// Expõe window.Odisse.projetos com: lista(), projeto(slug), img(), e os
// desenhos de HTML usados pela Home (acordeão) e pela página do projeto.

(function () {
  var O = (window.Odisse = window.Odisse || {});
  // idioma (assets/js/i18n.js); fora do navegador (gerador das páginas), português
  function T(k, pt, vars) { return O.t ? O.t(k, vars) : pt.replace('{n}', vars && vars.n); }
  function tr(obj, k) { return O.tr ? O.tr(obj, k) : (obj && obj[k] != null ? obj[k] : ''); }

  function base() {
    var api = O.API || '';
    try { api = localStorage.getItem('odisse-api') || api; } catch (e) { /* sem armazenamento */ }
    return api.replace(/\/$/, '');
  }

  var cache = {};
  // A lista de projetos fica guardada no navegador ENTRE visitas (localStorage):
  // quem volta vê as capas na hora, e a versão nova chega por trás e fica para a
  // próxima. Os projetos abertos ficam só na sessão (sessionStorage).
  var LISTA = '/api/projetos';
  var VALIDADE_LISTA = 7 * 24 * 3600 * 1000; // uma semana
  function guardar(caminho) {
    try { return caminho === LISTA ? localStorage : sessionStorage; } catch (e) { return null; }
  }
  function pegar(caminho) {
    if (cache[caminho]) return cache[caminho];
    var chave = 'odisse:' + caminho;
    var onde = guardar(caminho);
    var guardado = null;
    try {
      var bruto = onde && JSON.parse(onde.getItem(chave) || 'null');
      if (bruto && bruto.t && bruto.d !== undefined) {
        if (Date.now() - bruto.t < VALIDADE_LISTA) guardado = bruto.d;
      } else if (bruto) guardado = bruto; // formato antigo (só os dados)
    } catch (e) { /* sem armazenamento */ }
    var rede = fetch(base() + caminho).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (dados) {
      try { onde && onde.setItem(chave, JSON.stringify({ t: Date.now(), d: dados })); } catch (e) { /* idem */ }
      return dados;
    });
    // com cópia guardada, responde na hora (a rede só atualiza a cópia)
    cache[caminho] = guardado ? Promise.resolve(guardado) : rede;
    if (guardado) rede.catch(function () {});
    return cache[caminho];
  }

  // Reserva: se a API não responder, o site mostra os projetos da semente
  // (os mesmos que o painel importa), com as imagens que estão no repositório.
  var reserva = null;
  function semente() {
    if (!reserva) {
      reserva = fetch('/admin/semente.json').then(function (r) { return r.json(); }).then(function (lista) {
        return lista.map(function (p) {
          var secoes = p.secoes.map(function (s) { return s.tipo === 'imagem' ? { tipo: 'imagem', src: s.arquivo, alt: s.alt } : s; });
          var primeira = secoes.filter(function (s) { return s.src; })[0];
          return Object.assign({}, p, { secoes: secoes, capa: primeira ? { src: primeira.src } : null });
        });
      });
    }
    return reserva;
  }
  function comReserva(caminho, promessa) {
    return promessa.catch(function (err) {
      console.warn('API indisponível, usando a reserva local.', err);
      return semente().then(function (lista) {
        var slug = decodeURIComponent((caminho.match(/^\/api\/projetos\/(.+)$/) || [])[1] || '');
        if (!slug) return lista;
        var p = lista.filter(function (x) { return x.slug === slug; })[0];
        if (!p) throw err;
        return p;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // tamanhos: 's' = pequena (960 px, capas), 'm' = média (1200 px), sem nada = grande (2400 px)
  function img(ref, tamanho) {
    return base() + '/img/' + encodeURIComponent(ref) + (tamanho === 'm' || tamanho === 's' ? '-' + tamanho : '');
  }

  // largura em que a capa aparece, para o navegador escolher entre 960 e 1200 px
  function tamanhosCapa() {
    return document.documentElement.classList.contains('vista-grade')
      ? '(max-width: 640px) calc(50vw - 24px), 300px'
      : '(max-width: 640px) calc(100vw - 32px), min(560px, 62vw)';
  }

  // srcset com a versão média (1200 px) e a grande (2400 px)
  function srcset(ref) {
    return img(ref, 'm') + ' 1200w, ' + img(ref) + ' 2400w';
  }

  // página própria do projeto (gerada pelo workflow "Páginas estáticas"); enquanto
  // ela não existe, o 404.html leva para a página de reserva /projeto/?p=<slug>.
  // Em inglês: /en/projects/<slug>/ (assets/js/i18n.js → Odisse.url)
  function local(caminho) { return O.url ? O.url(caminho) : caminho; }
  function url(slug) {
    return local('/projetos/' + encodeURIComponent(slug) + '/');
  }

  function paragrafos(texto) {
    return String(texto || '').split(/\n+/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  var CAMPOS = [['ano', 'Ano'], ['cliente', 'Cliente'], ['tipologia', 'Tipologia'], ['escala', 'Escala'], ['area', 'Área'], ['status', 'Status']];

  function meta(p) {
    var html = CAMPOS.filter(function (c) { return p[c[0]] !== undefined && String(p[c[0]]).trim() !== ''; })
      .map(function (c) { return '<div><dt>' + T(c[0], c[1]) + '</dt><dd>' + esc(tr(p, c[0])) + '</dd></div>'; }).join('');
    return '<dl class="project__meta">' + html + '</dl>';
  }

  function titulo(p) {
    var local = tr(p, 'local');
    return '<div class="project__title"><h1>' + esc(tr(p, 'titulo')) + '</h1>' +
      (local ? '<span class="place">' + esc(local) + '</span>' : '') + '</div>';
  }

  function spreads(p) {
    return (p.secoes || []).map(function (s) {
      if (s.tipo === 'texto') {
        var larg = s.largura === 'm' || s.largura === 'g' ? ' spread--texto-' + s.largura : '';
        return '<div class="spread spread--texto' + larg + '"><div class="texto-bloco">' + paragrafos(tr(s, 'texto')) + '</div></div>';
      }
      if (s.src) {
        return '<div class="spread spread--imagem"><div class="frame"><img src="' + esc(s.src) + '" alt="' + esc(s.alt || p.titulo) + '" decoding="async" draggable="false"></div></div>';
      }
      if (!s.ref) return '';
      var razao = s.w && s.h ? s.w / s.h : 1.5;
      return '<div class="spread spread--imagem"><div class="frame">' +
        '<img src="' + img(s.ref, 'm') + '" srcset="' + srcset(s.ref) + '" sizes="(max-width: 780px) calc(100vw - 32px), calc(100vh * ' + razao.toFixed(3) + ')"' +
        (s.w ? ' width="' + s.w + '" height="' + s.h + '"' : '') +
        ' alt="' + esc(tr(s, 'alt') || tr(p, 'titulo')) + '" loading="lazy" decoding="async" draggable="false">' +
        '</div></div>';
    }).join('');
  }

  function itemGaleria(r, i) {
    var c = r.capa || {};
    var src = c.src || (c.ref ? img(c.ref, 'm') : '');
    var capa = '';
    if (src) {
      capa = '<img src="' + esc(src) + '"' +
        (c.ref && !c.src ? ' srcset="' + img(c.ref, 's') + ' 960w, ' + img(c.ref, 'm') + ' 1200w" sizes="' + tamanhosCapa() + '"' : '') +
        ' alt="' + esc(tr(r, 'titulo')) + '"' +
        (i === 0 ? ' fetchpriority="high"' : '') +
        (i > 1 ? ' loading="lazy"' : '') + ' decoding="async">';
    }
    return '<div class="gallery__item" data-slug="' + esc(r.slug) + '">' +
      '<a class="gallery__row" href="' + url(r.slug) + '" aria-expanded="false">' +
        '<div class="gallery__thumb">' + capa + '</div>' +
        '<div class="gallery__info">' +
          '<span class="gallery__title">' + esc(tr(r, 'titulo')) + '</span>' +
          '<span class="gallery__place">' + esc(tr(r, 'local')) + '</span>' +
        '</div>' +
      '</a>' +
      '<div class="gallery__panel"></div>' +
    '</div>';
  }

  // Último card da sequência: outros projetos, primeiro os de mesma tipologia e
  // escala, depois os de maior relevância (sorteio dentro do mesmo peso)
  var PESO = { alta: 0.6, media: 0.3, baixa: 0 };
  function relacionados(lista, atual, n) {
    var norm = function (v) { return String(v || '').trim().toLowerCase(); };
    var outros = (lista || []).filter(function (r) { return r.slug !== atual.slug; });
    if (!outros.length) return '';
    var escolha = outros.map(function (r) {
      var nota = Math.random() * 0.5 + (PESO[r.relevancia] || 0.3);
      if (norm(r.tipologia) && norm(r.tipologia) === norm(atual.tipologia)) nota += 2;
      if (norm(r.escala) && norm(r.escala) === norm(atual.escala)) nota += 1;
      return { r: r, nota: nota };
    }).sort(function (a, b) { return b.nota - a.nota; }).slice(0, n || 3);
    return '<div class="spread spread--relacionados"><div class="relacionados">' +
      '<p class="relacionados__titulo">' + esc(T('outros', 'Outros projetos')) + '</p><ul>' +
      escolha.map(function (x) {
        var r = x.r, c = r.capa || {};
        var src = c.src || (c.ref ? img(c.ref, 's') : '');
        return '<li><a href="' + url(r.slug) + '" data-via="relacionados" draggable="false">' +
          '<span class="relacionados__capa">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" draggable="false">' : '') + '</span>' +
          '<span class="relacionados__txt"><span class="relacionados__nome">' + esc(tr(r, 'titulo')) + '</span>' +
          '<span class="relacionados__local">' + esc(tr(r, 'local')) + '</span></span></a></li>';
      }).join('') + '</ul>' +
      '<a class="relacionados__todos" href="' + local('/') + '">' + esc(T('ver_todos', 'Ver todos os projetos')) + ' →</a>' +
      '</div></div>';
  }

  O.projetos = {
    lista: function () { return comReserva('/api/projetos', pegar('/api/projetos')); },
    projeto: function (slug) { var c = '/api/projetos/' + encodeURIComponent(slug); return comReserva(c, pegar(c)); },
    // projeto oculto aberto pelo link de prévia (sem guardar no navegador)
    previa: function (slug, codigo) {
      return fetch(base() + '/api/projetos/' + encodeURIComponent(slug) + '?previa=' + encodeURIComponent(codigo), { cache: 'no-store' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
    },
    relacionados: relacionados,
    T: T,
    tr: tr,
    img: img,
    url: url,
    local: local,
    esc: esc,
    meta: meta,
    titulo: titulo,
    spreads: spreads,
    itemGaleria: itemGaleria,
    tamanhosCapa: tamanhosCapa,
  };
})();
