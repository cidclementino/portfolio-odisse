// Lógica das páginas de projeto: converte a rolagem vertical do mouse em
// deslocamento horizontal entre spreads, atualiza a barra de progresso,
// monta os pontinhos de navegação (um por spread) e permite arrastar
// com o mouse.

document.addEventListener('DOMContentLoaded', function () {
  var track = document.querySelector('.project__spreads');
  if (!track) return;

  var progressBar = document.querySelector('.project__progress span');
  var dotsWrap = document.querySelector('.project__dots');

  var spreads = Array.prototype.slice.call(track.querySelectorAll('.spread'));
  var dots = [];

  if (dotsWrap && spreads.length > 1) {
    spreads.forEach(function (spread, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Ir para o conteúdo ' + (i + 1));
      dot.addEventListener('click', function () {
        track.scrollTo({ left: spread.offsetLeft, behavior: 'smooth' });
      });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });
  }

  function updateProgress() {
    var max = track.scrollWidth - track.clientWidth;
    var pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + '%';

    if (dots.length) {
      var current = 0;
      var best = Infinity;
      spreads.forEach(function (spread, i) {
        var dist = Math.abs(spread.offsetLeft - track.scrollLeft);
        if (dist < best) { best = dist; current = i; }
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === current);
      });
    }
  }

  // Roda do mouse (trackpads já mandam deltaX naturalmente; mouse comum só
  // manda deltaY, então convertemos deltaY em scrollLeft quando fizer sentido).
  track.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  track.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

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

  updateProgress();
});
