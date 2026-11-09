// Projetos vindos da nuvem (API site-odisse — ver worker/).
// Expõe window.Odisse.projetos com: lista(), projeto(slug), img(), e os
// desenhos de HTML usados pela Home (acordeão) e pela página do projeto.

(function () {
  var O = (window.Odisse = window.Odisse || {});

  function base() {
    var api = O.API || '';
    try { api = localStorage.getItem('odisse-api') || api; } catch (e) { /* sem armazenamento */ }
    return api.replace(/\/$/, '');
  }

  var cache = {};
  function pegar(caminho) {
    if (cache[caminho]) return cache[caminho];
    var chaveSessao = 'odisse:' + caminho;
    var guardado = null;
    try { guardado = JSON.parse(sessionStorage.getItem(chaveSessao) || 'null'); } catch (e) { /* idem */ }
    var rede = fetch(base() + caminho).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (dados) {
      try { sessionStorage.setItem(chaveSessao, JSON.stringify(dados)); } catch (e) { /* idem */ }
      return dados;
    });
    // com cópia da sessão, responde na hora (navegação de volta instantânea)
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

  function img(ref, tamanho) {
    return base() + '/img/' + encodeURIComponent(ref) + (tamanho === 'm' ? '-m' : '');
  }

  // srcset com a versão média (1200 px) e a grande (2400 px)
  function srcset(ref) {
    return img(ref, 'm') + ' 1200w, ' + img(ref) + ' 2400w';
  }

  function url(slug) {
    return '/projeto/?p=' + encodeURIComponent(slug);
  }

  function paragrafos(texto) {
    return String(texto || '').split(/\n+/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }

  var CAMPOS = [['ano', 'Ano'], ['cliente', 'Cliente'], ['tipologia', 'Tipologia'], ['area', 'Área'], ['status', 'Status']];

  function meta(p) {
    var html = CAMPOS.filter(function (c) { return p[c[0]] !== undefined && String(p[c[0]]).trim() !== ''; })
      .map(function (c) { return '<div><dt>' + c[1] + '</dt><dd>' + esc(p[c[0]]) + '</dd></div>'; }).join('');
    return '<dl class="project__meta">' + html + '</dl>';
  }

  function titulo(p) {
    return '<div class="project__title"><h1>' + esc(p.titulo) + '</h1>' +
      (p.local ? '<span class="place">' + esc(p.local) + '</span>' : '') + '</div>';
  }

  function spreads(p) {
    return (p.secoes || []).map(function (s) {
      if (s.tipo === 'texto') {
        return '<div class="spread spread--texto"><div class="texto-bloco">' + paragrafos(s.texto) + '</div></div>';
      }
      if (s.src) {
        return '<div class="spread spread--imagem"><div class="frame"><img src="' + esc(s.src) + '" alt="' + esc(s.alt || p.titulo) + '" decoding="async" draggable="false"></div></div>';
      }
      if (!s.ref) return '';
      var razao = s.w && s.h ? s.w / s.h : 1.5;
      return '<div class="spread spread--imagem"><div class="frame">' +
        '<img src="' + img(s.ref, 'm') + '" srcset="' + srcset(s.ref) + '" sizes="calc(100vh * ' + razao.toFixed(3) + ')"' +
        (s.w ? ' width="' + s.w + '" height="' + s.h + '"' : '') +
        ' alt="' + esc(s.alt || p.titulo) + '" loading="lazy" decoding="async" draggable="false">' +
        '</div></div>';
    }).join('');
  }

  function itemGaleria(r, i) {
    var src = r.capa ? (r.capa.src || (r.capa.ref ? img(r.capa.ref, 'm') : '')) : '';
    var capa = src ? '<img src="' + esc(src) + '" alt="' + esc(r.titulo) + '"' + (i > 1 ? ' loading="lazy"' : '') + ' decoding="async">' : '';
    return '<div class="gallery__item" data-slug="' + esc(r.slug) + '">' +
      '<a class="gallery__row" href="' + url(r.slug) + '" aria-expanded="false">' +
        '<div class="gallery__thumb">' + capa + '</div>' +
        '<div class="gallery__info">' +
          '<span class="gallery__title">' + esc(r.titulo) + '</span>' +
          '<span class="gallery__place">' + esc(r.local) + '</span>' +
        '</div>' +
      '</a>' +
      '<div class="gallery__panel"></div>' +
    '</div>';
  }

  O.projetos = {
    lista: function () { return comReserva('/api/projetos', pegar('/api/projetos')); },
    projeto: function (slug) { var c = '/api/projetos/' + encodeURIComponent(slug); return comReserva(c, pegar(c)); },
    img: img,
    url: url,
    esc: esc,
    meta: meta,
    titulo: titulo,
    spreads: spreads,
    itemGaleria: itemGaleria,
  };
})();
