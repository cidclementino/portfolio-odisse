// Seis pontos laterais — três de cada lado, centrados na margem, alinhados à
// marca do cabeçalho, ao meio da tela e ao pé (mesmo sistema dos posts 3:4).
// A cor acompanha o que está por baixo: imagem ou fundo escuro → claro;
// fundo claro → ardósia.

(function () {
  var O = (window.Odisse = window.Odisse || {});

  function montar() {
    var wrap = document.createElement('div');
    wrap.className = 'pontos';
    wrap.setAttribute('aria-hidden', 'true');
    ['e1', 'e2', 'e3', 'd1', 'd2', 'd3'].forEach(function (p) {
      var s = document.createElement('span');
      s.className = 'ponto ponto--' + p;
      wrap.appendChild(s);
    });
    document.body.appendChild(wrap);
    return Array.prototype.slice.call(wrap.children);
  }

  function rgba(cor) {
    var m = cor && cor.match(/[\d.]+/g);
    if (!m) return null;
    var v = m.map(Number);
    if (v.length > 3 && v[3] === 0) return null;
    return v;
  }

  function escuroSob(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth) return true;
      var bg = rgba(getComputedStyle(el).backgroundColor);
      if (!bg) continue;
      var lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
      return lum < 0.5;
    }
    return document.body.classList.contains('is-dark-page');
  }

  var pontos = [];
  var pendente = false;
  function atualizar() {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(function () {
      pendente = false;
      pontos.forEach(function (p) {
        var r = p.getBoundingClientRect();
        p.classList.toggle('is-claro', escuroSob(r.left + r.width / 2, r.top + r.height / 2));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    pontos = montar();
    atualizar();
    document.addEventListener('scroll', atualizar, { capture: true, passive: true });
    window.addEventListener('resize', atualizar);
    window.addEventListener('load', atualizar);
    document.addEventListener('load', function (e) { if (e.target.tagName === 'IMG') atualizar(); }, true);
    document.addEventListener('transitionend', atualizar, true);
  });

  O.pontos = { atualizar: atualizar };
})();
