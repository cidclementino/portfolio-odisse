// Página do projeto (/projetos/<slug>/ ou /projeto/?p=<slug>): busca o projeto na
// nuvem, desenha a barra lateral e a sequência de imagens/textos e, no fim, o card
// de outros projetos.
//   Computador: esteira horizontal — a roda do mouse vira deslocamento lateral,
//   pontinhos de navegação (um por item) e arrastar com o mouse.
//   Celular (até 780 px): a mesma sequência empilhada, rolando a página para baixo.
// Com ?previa=<código> abre um projeto oculto (link de prévia do painel).

document.addEventListener('DOMContentLoaded', function () {
  var O = window.Odisse;
  var P = O.projetos;
  var track = document.querySelector('.project__spreads');
  var lateral = document.querySelector('.project__sidebar > div');
  if (!track || !lateral) return;
  var celular = window.matchMedia('(max-width: 780px)');

  // /projetos/<slug>/ (página própria, já com o conteúdo no HTML) ou /projeto/?p=<slug> (reserva)
  var busca = new URLSearchParams(location.search);
  var slug = document.body.dataset.slug || busca.get('p') || '';
  var codigoPrevia = busca.get('previa') || '';
  if (!slug) { location.replace('/'); return; }
  var pronto = !!document.body.dataset.atualizado && !!track.querySelector('.spread');
  var emIngles = O.lang === 'en';

  // por onde a pessoa chegou (card de outros projetos, busca…), marcado no clique
  var via = '';
  try { via = sessionStorage.getItem('odisse-via') || ''; sessionStorage.removeItem('odisse-via'); } catch (e) { /* idem */ }

  function iniciar(p) {
    if (p) acrescentarRelacionados(p);
    var registro = O.metricas && !codigoPrevia ? O.metricas.projeto(slug, via) : null;
    ligar(registro);
    if (O.pontos) O.pontos.atualizar();
  }

  var pedido = codigoPrevia ? P.previa(slug, codigoPrevia) : P.projeto(slug);
  pedido.then(function (p) {
    // endereço antigo (o projeto mudou de endereço): vai para o atual
    if (p.slug && p.slug !== slug) { location.replace(P.url(p.slug) + location.search + location.hash); return; }
    // a página própria só é redesenhada se o projeto mudou desde que ela foi gerada (ou em inglês)
    if (!pronto || emIngles || codigoPrevia || p.atualizado !== document.body.dataset.atualizado) {
      document.title = P.tr(p, 'titulo') + ' — Odisse';
      var desc = document.querySelector('meta[name="description"]');
      if (desc && !pronto) desc.setAttribute('content', p.descricao || (p.titulo + (p.local ? ' — ' + p.local : '') + '. Projeto do estúdio Odisse.'));
      lateral.innerHTML = P.titulo(p) + P.meta(p) +
        (codigoPrevia ? '<p class="project__previa">' + P.esc(P.T('previa', 'Prévia — este projeto ainda não está publicado.')) + '</p>' : '');
      track.innerHTML = P.spreads(p);
    }
    document.querySelector('.project').classList.add('is-ready');
    iniciar(p);
  }).catch(function (err) {
    console.error(err);
    if (pronto) return iniciar(null); // sem nuvem, fica a versão da página
    lateral.innerHTML = '<div class="project__title"><h1>' + P.esc(P.T('nao_encontrado', 'Projeto não encontrado')) + '</h1>' +
      '<span class="place"><a href="/">' + P.esc(P.T('ver_todos', 'Ver todos os projetos')) + '</a></span></div>';
  });

  // o último card: outros projetos (só os publicados; a prévia também mostra)
  function acrescentarRelacionados(p) {
    P.lista().then(function (lista) {
      var html = P.relacionados(lista, p, 3);
      if (!html || track.querySelector('.spread--relacionados')) return;
      track.insertAdjacentHTML('beforeend', html);
      if (track._recontar) track._recontar();
    }).catch(function () { /* sem lista, sem card */ });
  }

  // clique num projeto relacionado: a próxima página registra a origem
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-via]');
    if (a) try { sessionStorage.setItem('odisse-via', a.getAttribute('data-via')); } catch (er) { /* idem */ }
  }, true);

  function ligar(registro) {
    var dotsWrap = document.querySelector('.project__dots');
    var spreads = [];
    var dots = [];

    // calcula o scrollLeft necessário pra que o CENTRO do spread coincida com o
    // centro real da tela (onde ficam a marca "Odisse" e os pontinhos)
    function centerScrollFor(spread) {
      var trackRect = track.getBoundingClientRect();
      var viewportCenter = window.innerWidth / 2;
      var spreadCenter = spread.offsetLeft + spread.offsetWidth / 2;
      return spreadCenter - (viewportCenter - trackRect.left);
    }

    // (re)monta os pontinhos — de novo quando o card de outros projetos chega
    function recontar() {
      spreads = Array.prototype.slice.call(track.querySelectorAll('.spread'));
      dots = [];
      if (dotsWrap) dotsWrap.innerHTML = '';
      if (dotsWrap && spreads.length > 1) {
        spreads.forEach(function (spread, i) {
          var dot = document.createElement('button');
          dot.type = 'button';
          dot.setAttribute('aria-label', P.T('ir_conteudo', 'Ir para o conteúdo {n}', { n: i + 1 }));
          dot.addEventListener('click', function () {
            track.scrollTo({ left: centerScrollFor(spread), behavior: 'smooth' });
          });
          dotsWrap.appendChild(dot);
          dots.push(dot);
        });
      }
      observar();
      atualizar();
    }
    track._recontar = recontar;

    // até onde a sequência foi vista (o card de outros projetos não conta)
    var vistos = 0;
    function totalSeq() { return spreads.filter(function (s) { return !s.classList.contains('spread--relacionados'); }).length; }
    function marcar(i) {
      vistos = Math.max(vistos, Math.min(i + 1, totalSeq()));
      if (registro && totalSeq()) registro.sequencia(vistos, totalSeq());
    }

    // celular: a sequência empilhada — conta o que passou pela tela
    var obs = null;
    function observar() {
      if (obs) obs.disconnect();
      if (!('IntersectionObserver' in window)) return;
      obs = new IntersectionObserver(function (entradas) {
        if (!celular.matches) return;
        entradas.forEach(function (en) { if (en.isIntersecting) marcar(spreads.indexOf(en.target)); });
      }, { threshold: 0.5 });
      spreads.forEach(function (s) { obs.observe(s); });
    }

    function atualizar() {
      if (celular.matches) return;
      if (!dots.length) { if (spreads.length) marcar(0); return; }
      // acha o spread cujo CENTRO está mais próximo do centro visível da esteira
      var currentCenter = track.scrollLeft + track.clientWidth / 2;
      var current = 0;
      var best = Infinity;
      spreads.forEach(function (spread, i) {
        var center = spread.offsetLeft + spread.offsetWidth / 2;
        var dist = Math.abs(center - currentCenter);
        if (dist < best) { best = dist; current = i; }
      });
      dots.forEach(function (dot, i) { dot.classList.toggle('is-active', i === current); });
      marcar(current);
    }

    // Roda do mouse (trackpads já mandam deltaX; mouse comum só manda deltaY,
    // então convertemos deltaY em scrollLeft). No celular a página rola normal.
    track.addEventListener('wheel', function (e) {
      if (celular.matches) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        var atStart = track.scrollLeft <= 0;
        var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
        if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
        e.preventDefault();
        track.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    track.addEventListener('scroll', atualizar, { passive: true });
    window.addEventListener('resize', atualizar);

    document.addEventListener('keydown', function (e) {
      if (celular.matches) return;
      if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    });

    // arrastar com o mouse (só no computador; o toque rola a página)
    var isDown = false;
    var startX = 0;
    var startScroll = 0;
    var moved = false;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || celular.matches || e.button !== 0) return;
      // em link (card de outros projetos) o clique precisa passar: só captura quando arrasta de fato
      if (!e.target.closest('a')) e.preventDefault(); // impede seleção de texto e o "fantasma" de arrastar imagem
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('is-dragging');
    });
    track.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4 && !moved) { moved = true; try { track.setPointerCapture(e.pointerId); } catch (er) { /* idem */ } }
      if (moved) track.scrollLeft = startScroll - dx;
    });
    function endDrag() {
      isDown = false;
      track.classList.remove('is-dragging');
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', function () { if (isDown) endDrag(); });
    // um arrasto não vira clique (nos links do card de outros projetos)
    track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

    recontar();
  }
});
