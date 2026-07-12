// Dinâmica da home: ao clicar num projeto, a capa e o bloco título/local
// se deslocam JUNTOS pra esquerda (mesma distância, calculada via FLIP) —
// como se o texto empurrasse a capa pra fora; a capa acaba saindo da área
// visível e some, o texto para exatamente onde vai assentar de verdade,
// sem pular. O bloco de título/local NUNCA é recriado — ele é o mesmo
// elemento que já estava na linha; só ganham fade os metadados
// complementares (ano, cliente...) e as imagens/textos do projeto,
// que aparecem abaixo dele.
//
// Um projeto aberto por vez (accordion).
//
// Requer ser servido via http/https (GitHub Pages funciona; abrir o
// index.html direto do disco via file:// não funciona, pois fetch()
// não roda em file://).

var ROW_COLLAPSE_MS = 450;
var REVEAL_DELAY_MS = 30;

document.addEventListener('DOMContentLoaded', function () {
  var items = document.querySelectorAll('.gallery__item');
  if (!items.length) return;

  items.forEach(function (item) {
    var row = item.querySelector('.gallery__row');
    var panel = item.querySelector('.gallery__panel');
    if (!row || !panel) return;

    var info = row.querySelector('.gallery__info');
    var thumb = row.querySelector('.gallery__thumb');
    var url = row.getAttribute('href');

    row.addEventListener('click', function (e) {
      e.preventDefault();

      var isOpen = panel.classList.contains('is-open');

      // fecha qualquer outro projeto aberto (accordion: só um por vez)
      document.querySelectorAll('.gallery__item').forEach(function (otherItem) {
        if (otherItem !== item) {
          var otherRow = otherItem.querySelector('.gallery__row');
          var otherPanel = otherItem.querySelector('.gallery__panel');
          if (otherPanel && otherPanel.classList.contains('is-open')) {
            closeProject(otherRow, otherPanel);
          }
        }
      });

      if (isOpen) {
        closeProject(row, panel);
      } else {
        openProject(row, panel, info, thumb, url);
      }
    });
  });

  function openProject(row, panel, info, thumb, url) {
    row.setAttribute('aria-expanded', 'true');
    var isMobile = window.innerWidth <= 640;

    if (!isMobile) {
      // --- técnica FLIP (só faz sentido no layout lado a lado) ---
      // 1) mede onde o texto está agora, relativo à linha
      var rowRect = row.getBoundingClientRect();
      var infoRect = info ? info.getBoundingClientRect() : null;
      var deltaX = infoRect ? (infoRect.left - rowRect.left) : 0;

      // 2) desloca o texto E a capa JUNTOS, na mesma distância — como se o
      //    texto estivesse empurrando a capa pra fora. A capa, por estar
      //    mais à esquerda, acaba saindo da área visível (clipada) e some;
      //    o texto para exatamente onde vai assentar de verdade.
      var move = 'translateX(-' + deltaX + 'px)';
      if (info) info.style.transform = move;
      if (thumb) thumb.style.transform = move;
    }
    row.classList.add('is-collapsing');

    // 3) abre o painel NA HORA — junto com o recolhimento da linha, não
    //    depois. É isso que faz parecer uma coisa só se movendo, ao invés
    //    de "a linha recolhe, para, e uma caixa aparece" (popup)
    openPanel(panel, url);

    window.setTimeout(function () {
      // 4) só então zera a coluna de verdade e remove os transforms —
      //    como o transform já deixou tudo exatamente nessa posição,
      //    não há salto visual
      row.classList.add('is-settled');
      if (info) info.style.transform = '';
      if (thumb) thumb.style.transform = '';
    }, ROW_COLLAPSE_MS);
  }

  function closeProject(row, panel) {
    row.setAttribute('aria-expanded', 'false');
    closePanel(panel);

    var info = row.querySelector('.gallery__info');
    var thumb = row.querySelector('.gallery__thumb');
    var isMobile = window.innerWidth <= 640;
    // volta pro layout original e, com o mesmo truque ao contrário,
    // anima texto e capa voltando pro lugar deles, juntos
    row.classList.remove('is-settled');

    if (isMobile) {
      row.classList.remove('is-collapsing');
      return;
    }

    requestAnimationFrame(function () {
      var rowRect = row.getBoundingClientRect();
      var infoRect = info ? info.getBoundingClientRect() : null;
      var deltaX = infoRect ? (infoRect.left - rowRect.left) : 0;
      var move = 'translateX(-' + deltaX + 'px)';
      if (info) { info.style.transition = 'none'; info.style.transform = move; }
      if (thumb) { thumb.style.transition = 'none'; thumb.style.transform = move; }
      requestAnimationFrame(function () {
        row.classList.remove('is-collapsing');
        if (info) { info.style.transition = ''; info.style.transform = ''; }
        if (thumb) { thumb.style.transition = ''; thumb.style.transform = ''; }
      });
    });
  }

  function closePanel(panel) {
    panel.classList.remove('is-open', 'is-revealed');
    // limpa o conteúdo só depois da transição, pra não cortar a animação
    window.setTimeout(function () {
      if (!panel.classList.contains('is-open')) panel.innerHTML = '';
    }, 520);
  }

  function openPanel(panel, url) {
    panel.innerHTML = '<div class="panel__loading">Carregando projeto…</div>';
    panel.classList.add('is-open');

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var meta = doc.querySelector('.project__meta');
        var share = doc.querySelector('.project__share');
        var spreads = doc.querySelector('.project__spreads');
        if (!meta || !spreads) throw new Error('estrutura inesperada em ' + url);

        panel.innerHTML =
          '<div class="panel__inner">' +
            '<aside class="panel__sidebar">' +
              meta.outerHTML +
              (share ? share.outerHTML : '') +
            '</aside>' +
            '<div class="panel__reveal">' +
              '<div class="panel__spreads">' + spreads.innerHTML + '</div>' +
            '</div>' +
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

        // dispara a revelação (fade do conteúdo + fade dos metadados)
        // num próximo frame, pra garantir que o browser já pintou o
        // estado inicial (opacity 0) antes de animar
        window.setTimeout(function () {
          panel.classList.add('is-revealed');
        }, REVEAL_DELAY_MS);
      })
      .catch(function (err) {
        panel.innerHTML =
          '<div class="panel__error">Não consegui carregar esse projeto agora. ' +
          '<a href="' + url + '">Abrir em página própria</a>.</div>';
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

    // arrastar com o mouse (touch já rola nativamente)
    var isDown = false;
    var startX = 0;
    var startScroll = 0;
    var moved = false;

    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return; // touch já tem scroll nativo
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startScroll - dx;
    });
    function endDrag() {
      isDown = false;
      track.classList.remove('is-dragging');
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', function () { if (isDown) endDrag(); });
    // evita que o "arrastar" dispare cliques em links dentro do spread
    track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

    updateProgress();
  }
});
