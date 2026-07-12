// Lógica das páginas de projeto: converte a rolagem vertical do mouse em
// deslocamento horizontal entre spreads, monta os pontinhos de navegação
// (um por spread, clicáveis, centralizando o conteúdo na tela) e permite
// arrastar com o mouse.

document.addEventListener('DOMContentLoaded', function () {
  var track = document.querySelector('.project__spreads');
  if (!track) return;

  var dotsWrap = document.querySelector('.project__dots');

  var spreads = Array.prototype.slice.call(track.querySelectorAll('.spread'));
  var dots = [];

  // calcula o scrollLeft necessário pra que o CENTRO do spread coincida
  // com o centro real da tela (onde ficam a marca "Odisse" e os
  // pontinhos) — em vez de encostar o spread na borda esquerda da galeria
  function centerScrollFor(spread) {
    var trackRect = track.getBoundingClientRect();
    var viewportCenter = window.innerWidth / 2;
    var spreadCenter = spread.offsetLeft + spread.offsetWidth / 2;
    return spreadCenter - (viewportCenter - trackRect.left);
  }

  if (dotsWrap && spreads.length > 1) {
    spreads.forEach(function (spread, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Ir para o conteúdo ' + (i + 1));
      dot.addEventListener('click', function () {
        track.scrollTo({ left: centerScrollFor(spread), behavior: 'smooth' });
      });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });
  }

  function updateActiveDot() {
    if (!dots.length) return;
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
  }

  // Roda do mouse (trackpads já mandam deltaX naturalmente; mouse comum só
  // manda deltaY, então convertemos deltaY em scrollLeft quando fizer sentido).
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
  window.addEventListener('resize', updateActiveDot);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
    if (e.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
  });

  // arrastar com o mouse (touch já rola nativamente)
  var isDown = false;
  var startX = 0;
  var startScroll = 0;
  var moved = false;

  track.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
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
  track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

  updateActiveDot();
});
