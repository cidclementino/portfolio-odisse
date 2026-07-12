// Dinâmica da home: ao clicar num projeto, a capa desliza pra fora (some)
// enquanto o bloco título/local é FISICAMENTE MOVIDO — o mesmo elemento
// do DOM, não uma cópia — pra dentro da barra lateral que aparece abaixo.
// Só os metadados complementares (ano, cliente...) e as imagens/textos
// do projeto são conteúdo novo, buscado (fetch) da página do projeto.
//
// Um projeto aberto por vez (accordion).
//
// Requer ser servido via http/https (GitHub Pages funciona; abrir o
// index.html direto do disco via file:// não funciona, pois fetch()
// não roda em file://).

var ROW_COLLAPSE_MS = 450;
var SCROLL_MAX_WAIT_MS = 600;

document.addEventListener('DOMContentLoaded', function () {
  var items = document.querySelectorAll('.gallery__item');
  if (!items.length) return;

  items.forEach(function (item) {
    var row = item.querySelector('.gallery__row');
    var panel = item.querySelector('.gallery__panel');
    if (!row || !panel) return;

    // guarda as referências reais (o MESMO nó) pra usar tanto ao abrir
    // quanto ao fechar — mesmo depois de o título ser movido de lugar
    item._info = row.querySelector('.gallery__info');
    item._thumb = row.querySelector('.gallery__thumb');
    item._url = row.getAttribute('href');

    row.addEventListener('click', function (e) {
      e.preventDefault();
      startOpen();
    });

    // clicar no título (a mesma barra, esteja ela na linha ou já
    // movida pra dentro do painel) fecha o projeto quando ele já
    // está aberto — como clicar de novo na capa faria
    item._info.addEventListener('click', function (e) {
      if (panel.classList.contains('is-open')) {
        e.preventDefault();
        e.stopPropagation();
        closeProject(row, panel, item._info, item._thumb);
      }
    });

    function startOpen() {
      var isOpen = panel.classList.contains('is-open');

      // fecha qualquer outro projeto aberto (accordion: só um por vez)
      document.querySelectorAll('.gallery__item').forEach(function (otherItem) {
        if (otherItem !== item) {
          var otherRow = otherItem.querySelector('.gallery__row');
          var otherPanel = otherItem.querySelector('.gallery__panel');
          if (otherPanel && otherPanel.classList.contains('is-open')) {
            closeProject(otherRow, otherPanel, otherItem._info, otherItem._thumb);
          }
        }
      });

      if (isOpen) {
        closeProject(row, panel, item._info, item._thumb);
        return;
      }

      // antes de qualquer outra coisa, centraliza a linha clicada na
      // tela — só depois disso a animação de abertura começa
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      waitForScrollEnd(SCROLL_MAX_WAIT_MS).then(function () {
        openProject(row, panel, item._info, item._thumb, item._url);
      });
    }
  });

  // espera o scroll suave terminar (evento 'scrollend', quando o
  // navegador suporta) ou, no máximo, o tempo indicado
  function waitForScrollEnd(maxWait) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener('scrollend', finish);
        resolve();
      }
      window.addEventListener('scrollend', finish, { once: true });
      window.setTimeout(finish, maxWait);
    });
  }

  function openProject(row, panel, info, thumb, url) {
    row.setAttribute('aria-expanded', 'true');
    var isMobile = window.innerWidth <= 640;

    if (!isMobile) {
      // a capa e o título se deslocam JUNTOS, na mesma distância — como
      // se o título empurrasse a capa pra fora. A capa, por estar mais à
      // esquerda, sai da área visível (a linha tem overflow:hidden) e
      // some; o título para exatamente onde a barra lateral começa.
      var rowRect = row.getBoundingClientRect();
      var infoRect = info.getBoundingClientRect();
      var deltaX = infoRect.left - rowRect.left;
      var move = 'translateX(-' + deltaX + 'px)';
      info.style.transform = move;
      thumb.style.transform = move;
    }
    row.classList.add('is-collapsing');

    // o painel começa a abrir NA HORA, junto com a capa saindo — não
    // depois. É isso que evita a sensação de "recolhe, para, e uma
    // caixa aparece" (popup)
    var panelReady = openPanel(panel, url);
    var rowSettled = new Promise(function (resolve) {
      window.setTimeout(resolve, ROW_COLLAPSE_MS);
    });

    Promise.all([panelReady, rowSettled]).then(function (results) {
      var sidebar = results[0];
      row.classList.add('is-settled');
      info.style.transform = '';
      thumb.style.transform = '';

      if (sidebar) {
        // move o título DE VERDADE (mesmo nó) pra dentro da barra lateral —
        // como ele já parou exatamente na mesma posição em que a barra
        // lateral começa (flush à esquerda), não há salto visual. Não
        // recria, não duplica; os metadados entram logo depois dele
        sidebar.insertBefore(info, sidebar.firstChild);
        panel.classList.add('is-revealed');
      }
    });
  }

  function closeProject(row, panel, info, thumb) {
    row.setAttribute('aria-expanded', 'false');
    var isMobile = window.innerWidth <= 640;

    // traz o título de volta pra linha ANTES de fechar/limpar o painel
    // (senão ele seria destruído junto com o resto do conteúdo buscado)
    row.appendChild(info);

    closePanel(panel);
    row.classList.remove('is-settled');

    if (isMobile) {
      row.classList.remove('is-collapsing');
      return;
    }

    requestAnimationFrame(function () {
      var rowRect = row.getBoundingClientRect();
      var infoRect = info.getBoundingClientRect();
      var deltaX = infoRect.left - rowRect.left;
      var move = 'translateX(-' + deltaX + 'px)';
      info.style.transition = 'none'; info.style.transform = move;
      thumb.style.transition = 'none'; thumb.style.transform = move;
      requestAnimationFrame(function () {
        row.classList.remove('is-collapsing');
        info.style.transition = ''; info.style.transform = '';
        thumb.style.transition = ''; thumb.style.transform = '';
      });
    });
  }

  function closePanel(panel) {
    panel.classList.remove('is-open', 'is-revealed');
    // limpa o conteúdo só depois da transição, pra não cortar a animação
    // (o título já foi resgatado antes de chegar aqui)
    window.setTimeout(function () {
      if (!panel.classList.contains('is-open')) panel.innerHTML = '';
    }, 520);
  }

  // retorna uma Promise que resolve com o elemento da barra lateral
  // (ainda vazio, pronto pra receber o título) assim que o conteúdo
  // buscado estiver montado — ou null em caso de erro
  function openPanel(panel, url) {
    panel.innerHTML = '<div class="panel__loading">Carregando projeto…</div>';
    panel.classList.add('is-open');

    return fetch(url)
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
            '<aside class="panel__sidebar"></aside>' +
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

        var sidebar = panel.querySelector('.panel__sidebar');
        // meta/share vêm de um Document diferente (o do DOMParser) —
        // precisam ser "importados" antes de entrar no documento atual
        sidebar.appendChild(document.importNode(meta, true));
        if (share) sidebar.appendChild(document.importNode(share, true));

        wirePanel(panel);
        return sidebar;
      })
      .catch(function (err) {
        panel.innerHTML =
          '<div class="panel__error">Não consegui carregar esse projeto agora. ' +
          '<a href="' + url + '">Abrir em página própria</a>.</div>';
        console.error(err);
        return null;
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
      e.preventDefault(); // impede seleção de texto e o "fantasma" de arrastar imagem
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
