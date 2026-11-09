// Dinâmica da home: ao clicar num projeto, a capa desliza pra fora (some)
// enquanto o bloco título/local é FISICAMENTE MOVIDO — o mesmo elemento
// do DOM, não uma cópia — pra dentro da barra lateral que aparece abaixo.
// Só os metadados complementares (ano, cliente...) e as imagens/textos
// do projeto são conteúdo novo, buscado da nuvem (API — ver projetos.js).
//
// Um projeto aberto por vez (accordion). A lista de projetos também vem
// da nuvem: a galeria é montada aqui e só depois ganha a dinâmica.

var ROW_COLLAPSE_MS = 450;
var SCROLL_MS = 620; // centralização: um pouco mais que o recolhimento do projeto de cima

// altura final do painel aberto — a mesma de .gallery__panel.is-open no CSS
function alturaPainel() {
  return window.innerWidth <= 780
    ? Math.min(720, window.innerHeight * 0.82)
    : Math.min(680, window.innerHeight * 0.76);
}

// Leva o elemento `el` até a altura `alvo()` da tela (px a partir do topo),
// com easing. A cada quadro a rolagem é recalculada a partir da posição REAL
// do elemento — então, se o projeto de cima está se recolhendo (e puxando
// tudo pra cima), a compensação é exata e o projeto clicado desliza direto
// pro centro, sem ser arrastado pra fora da tela. Uma nova rolagem cancela a
// anterior; a roda do mouse ou o toque do usuário também.
var rolagemAtual = 0;
// rolagem imediata — o CSS tem scroll-behavior: smooth, que transformaria
// cada correção de quadro numa animação própria (e uma cancelaria a outra)
function rolarJa(dy) {
  window.scrollTo({ top: window.scrollY + dy, behavior: 'instant' });
}
function seguir(el, alvo, ms) {
  var id = ++rolagemAtual;
  var reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise(function (resolve) {
    var t0 = performance.now();
    var inicio = el.getBoundingClientRect().top;
    function interromper() { if (rolagemAtual === id) rolagemAtual = -1; }
    function fim() {
      window.removeEventListener('wheel', interromper);
      window.removeEventListener('touchstart', interromper);
      if (rolagemAtual === id) rolagemAtual = 0;
      resolve();
    }
    window.addEventListener('wheel', interromper, { passive: true });
    window.addEventListener('touchstart', interromper, { passive: true });
    function passo(agora) {
      if (rolagemAtual !== id) return fim();
      var t = reduzir ? 1 : Math.min(1, (agora - t0) / ms);
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      var desejado = inicio + (alvo() - inicio) * e;
      var dy = el.getBoundingClientRect().top - desejado;
      if (Math.abs(dy) >= 0.5) rolarJa(dy);
      if (t < 1) requestAnimationFrame(passo); else fim();
    }
    requestAnimationFrame(passo);
  });
}

function emGrade() {
  return document.documentElement.classList.contains('vista-grade');
}

document.addEventListener('DOMContentLoaded', function () {
  var P = window.Odisse.projetos;
  var galeria = document.querySelector('.gallery');
  if (!galeria) return;

  P.lista().then(function (lista) {
    if (!lista.length) {
      galeria.innerHTML = '<p class="gallery__aviso">Em breve, novos projetos.</p>';
      return;
    }
    galeria.innerHTML = lista.map(P.itemGaleria).join('');
    galeria.classList.add('is-ready');
    ligar();
    if (window.Odisse.pontos) window.Odisse.pontos.atualizar();
  }).catch(function (err) {
    console.error(err);
    galeria.innerHTML = '<p class="gallery__aviso">Não foi possível carregar os projetos agora. Tente recarregar a página.</p>';
  });

  function ligar() {
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
    item._slug = item.getAttribute('data-slug');

    row.addEventListener('click', function (e) {
      // na vista em galeria a capa é um link comum: vai pra página do projeto
      if (emGrade()) return;
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
      if (isOpen) {
        closeProject(row, panel, item._info, item._thumb);
        return;
      }
      if (item._abrindo) return;
      item._abrindo = true;

      // fecha qualquer outro projeto aberto (accordion: só um por vez).
      // Fechar um projeto que está ACIMA devolve a capa dele à linha na
      // hora (a página cresce de uma vez) e recolhe o painel aos poucos
      // (a página encolhe). O salto imediato é compensado aqui mesmo, no
      // mesmo quadro — o projeto clicado não sai do lugar; o recolhimento
      // gradual é compensado pela rolagem que persegue o alvo (seguir).
      var antes = row.getBoundingClientRect().top;
      fecharOutros(item);
      var salto = row.getBoundingClientRect().top - antes;
      if (salto) rolarJa(salto);

      // o projeto abre no lugar da linha (a linha recolhe e o painel ocupa
      // o espaço dela): a linha vai pra posição em que o painel aberto fica
      // centralizado na tela — e só então a abertura começa
      seguir(row, function () {
        return Math.max(64, (window.innerHeight - alturaPainel()) / 2);
      }, SCROLL_MS).then(function () {
        item._abrindo = false;
        openProject(row, panel, item._info, item._thumb, item._url, item._slug);
      });
    }
  });

  // botão de vista (lista ⇄ galeria) — a escolha fica guardada neste navegador
  var botaoVista = document.querySelector('.dock__vista');
  function marcarBotao() {
    if (!botaoVista) return;
    var g = emGrade();
    var rotulo = g ? 'Ver em lista' : 'Ver em galeria';
    botaoVista.setAttribute('aria-label', rotulo);
    botaoVista.setAttribute('title', rotulo);
    botaoVista.setAttribute('aria-pressed', g ? 'true' : 'false');
  }
  marcarBotao();
  if (botaoVista) botaoVista.addEventListener('click', function () {
    var paraGrade = !emGrade();
    if (paraGrade) fecharJa();
    galeria.classList.add('is-trocando');
    setTimeout(function () {
      document.documentElement.classList.toggle('vista-grade', paraGrade);
      try { localStorage.setItem('odisse-vista', paraGrade ? 'grade' : 'lista'); } catch (e) {}
      marcarBotao();
      galeria.classList.remove('is-trocando');
      if (window.Odisse.pontos) window.Odisse.pontos.atualizar();
    }, 180);
  });

  // fecha o projeto aberto sem animação (ao trocar para a galeria)
  function fecharJa() {
    document.querySelectorAll('.gallery__item').forEach(function (it) {
      var pn = it.querySelector('.gallery__panel');
      if (!pn || !pn.classList.contains('is-open')) return;
      var rw = it.querySelector('.gallery__row');
      rw.setAttribute('aria-expanded', 'false');
      rw.appendChild(it._info);
      closePanel(pn);
      rw.classList.remove('is-settled', 'is-collapsing');
      it._info.style.transform = ''; it._thumb.style.transform = '';
    });
  }

  function fecharOutros(atual) {
    document.querySelectorAll('.gallery__item').forEach(function (otherItem) {
      if (otherItem === atual) return;
      var otherPanel = otherItem.querySelector('.gallery__panel');
      if (otherPanel && otherPanel.classList.contains('is-open')) {
        closeProject(otherItem.querySelector('.gallery__row'), otherPanel, otherItem._info, otherItem._thumb);
      }
    });
  }

  // Esc fecha o projeto aberto
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fecharOutros(null);
  });

  } // fim de ligar()

  function openProject(row, panel, info, thumb, url, slug) {
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
    var panelReady = openPanel(panel, url, slug);
    var rowSettled = new Promise(function (resolve) {
      window.setTimeout(resolve, ROW_COLLAPSE_MS);
    });

    Promise.all([panelReady, rowSettled]).then(function (results) {
      var sidebar = results[0];
      row.classList.add('is-settled');
      info.style.transform = '';
      thumb.style.transform = '';

      if (sidebar) {
        // a linha recolhe (capa some) e o painel sobe pro lugar dela — já
        // centralizado, porque a rolagem levou a linha até lá antes de abrir
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
    if (panel._registro) { panel._registro.fim(); panel._registro = null; }
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
  function openPanel(panel, url, slug) {
    panel.innerHTML = '<div class="panel__loading">Carregando projeto…</div>';
    panel.classList.add('is-open');

    return P.projeto(slug)
      .then(function (p) {
        panel.innerHTML =
          '<div class="panel__inner">' +
            '<aside class="panel__sidebar"></aside>' +
            '<div class="panel__reveal">' +
              '<div class="panel__spreads">' + P.spreads(p) + '</div>' +
            '</div>' +
            '<div class="panel__dots"></div>' +
          '</div>';

        var sidebar = panel.querySelector('.panel__sidebar');
        sidebar.insertAdjacentHTML('beforeend', P.meta(p) +
          '<button type="button" class="panel__fechar" aria-label="Fechar projeto" title="Fechar projeto">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>');
        sidebar.querySelector('.panel__fechar').addEventListener('click', function (e) {
          e.stopPropagation();
          var item = panel.closest('.gallery__item');
          closeProject(item.querySelector('.gallery__row'), panel, item._info, item._thumb);
        });

        if (window.Odisse.metricas) panel._registro = window.Odisse.metricas.projeto(slug, 'home');
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

  // calcula o scrollLeft necessário pra que o CENTRO do spread coincida
  // com o centro real da tela (onde ficam a marca "Odisse" e os
  // pontinhos) — em vez de encostar o spread na borda esquerda da galeria
  function centerScrollFor(track, spread) {
    var trackRect = track.getBoundingClientRect();
    var viewportCenter = window.innerWidth / 2;
    var spreadCenter = spread.offsetLeft + spread.offsetWidth / 2;
    return spreadCenter - (viewportCenter - trackRect.left);
  }

  function wirePanel(panel) {
    var track = panel.querySelector('.panel__spreads');
    var dotsWrap = panel.querySelector('.panel__dots');
    if (!track) return;

    var spreads = Array.prototype.slice.call(track.querySelectorAll('.spread'));
    var dots = [];

    if (dotsWrap && spreads.length > 1) {
      spreads.forEach(function (spread, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Ir para o conteúdo ' + (i + 1));
        dot.addEventListener('click', function (e) {
          e.stopPropagation();
          track.scrollTo({ left: centerScrollFor(track, spread), behavior: 'smooth' });
        });
        dotsWrap.appendChild(dot);
        dots.push(dot);
      });
    }

    function updateActiveDot() {
      if (!dots.length) {
        if (panel._registro && spreads.length) panel._registro.sequencia(1, 1);
        return;
      }
      // acha o spread cujo CENTRO está mais próximo do centro visível
      // atual da esteira (equivalente ao ponto de "encaixe" dos pontinhos)
      var currentCenter = track.scrollLeft + track.clientWidth / 2;
      var current = 0;
      var best = Infinity;
      spreads.forEach(function (spread, i) {
        var center = spread.offsetLeft + spread.offsetWidth / 2;
        var dist = Math.abs(center - currentCenter);
        if (dist < best) { best = dist; current = i; }
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === current);
      });
      if (panel._registro) panel._registro.sequencia(current + 1, spreads.length);
    }

    track.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        var atStart = track.scrollLeft <= 0;
        var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
        // já chegou na ponta na direção em que o usuário está rolando?
        // então devolve o scroll pra página, não captura
        if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
        e.preventDefault();
        track.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    track.addEventListener('scroll', updateActiveDot, { passive: true });

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

    updateActiveDot();
  }
});
