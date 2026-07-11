// Dinâmica da home: ao clicar num projeto, ao invés de navegar pra uma
// página nova, busca o HTML da página do projeto (fetch) e injeta o
// conteúdo (sidebar + spreads) num painel que se expande logo abaixo
// da linha clicada. Um projeto aberto por vez (accordion).
//
// Requer ser servido via http/https (GitHub Pages funciona; abrir o
// index.html direto do disco via file:// não funciona, pois fetch()
// não roda em file://).

document.addEventListener('DOMContentLoaded', function () {
  var items = document.querySelectorAll('.gallery__item');
  if (!items.length) return;

  items.forEach(function (item) {
    var row = item.querySelector('.gallery__row');
    var panel = item.querySelector('.gallery__panel');
    if (!row || !panel) return;

    var slug = row.getAttribute('data-project');

    row.addEventListener('click', function (e) {
      e.preventDefault();

      var isOpen = panel.classList.contains('is-open');

      // fecha qualquer outro painel aberto (accordion: só um por vez)
      document.querySelectorAll('.gallery__panel.is-open').forEach(function (p) {
        if (p !== panel) closePanel(p);
      });

      if (isOpen) {
        closePanel(panel);
      } else {
        openPanel(panel, slug, row);
      }
    });
  });

  function closePanel(panel) {
    panel.classList.remove('is-open');
    var row = panel.parentElement.querySelector('.gallery__row');
    if (row) row.setAttribute('aria-expanded', 'false');
    // limpa o conteúdo só depois da transição, pra não cortar a animação
    window.setTimeout(function () {
      if (!panel.classList.contains('is-open')) panel.innerHTML = '';
    }, 520);
  }

  function openPanel(panel, slug, row) {
    panel.innerHTML = '<div class="panel__loading">Carregando projeto…</div>';
    panel.classList.add('is-open');
    row.setAttribute('aria-expanded', 'true');

    fetch('projetos/' + slug + '.html')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var sidebar = doc.querySelector('.project__sidebar');
        var spreads = doc.querySelector('.project__spreads');
        if (!sidebar || !spreads) throw new Error('estrutura inesperada em projetos/' + slug + '.html');

        panel.innerHTML =
          '<div class="panel__inner">' +
            '<aside class="panel__sidebar">' + sidebar.innerHTML + '</aside>' +
            '<div class="panel__spreads">' + spreads.innerHTML + '</div>' +
            '<div class="panel__progress"><span></span></div>' +
            '<div class="panel__arrows">' +
              '<button class="prev" aria-label="Spread anterior" type="button">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
              '</button>' +
              '<button class="next" aria-label="Próximo spread" type="button">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>';

        wirePanel(panel);
      })
      .catch(function (err) {
        panel.innerHTML =
          '<div class="panel__error">Não consegui carregar esse projeto agora. ' +
          '<a href="projetos/' + slug + '.html">Abrir em página própria</a>.</div>';
        console.error(err);
      });
  }

  function wirePanel(panel) {
    var track = panel.querySelector('.panel__spreads');
    var progressBar = panel.querySelector('.panel__progress span');
    var prevBtn = panel.querySelector('.panel__arrows .prev');
    var nextBtn = panel.querySelector('.panel__arrows .next');
    if (!track) return;

    function updateProgress() {
      var max = track.scrollWidth - track.clientWidth;
      var pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
      if (progressBar) progressBar.style.width = pct + '%';
    }

    track.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        track.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    track.addEventListener('scroll', updateProgress, { passive: true });

    function goTo(dir) {
      track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
    }
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); goTo(1); });

    updateProgress();
  }
});
