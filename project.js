// Lógica das páginas de projeto: converte a rolagem vertical do mouse em
// deslocamento horizontal entre spreads, atualiza a barra de progresso,
// e liga as setas de navegação e o teclado.

document.addEventListener('DOMContentLoaded', function () {
  var track = document.querySelector('.project__spreads');
  if (!track) return;

  var progressBar = document.querySelector('.project__progress span');
  var prevBtn = document.querySelector('.project__arrows .prev');
  var nextBtn = document.querySelector('.project__arrows .next');

  function updateProgress() {
    var max = track.scrollWidth - track.clientWidth;
    var pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + '%';
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

  function goToSpread(direction) {
    var width = track.clientWidth;
    track.scrollBy({ left: direction * width, behavior: 'smooth' });
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { goToSpread(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { goToSpread(1); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') goToSpread(1);
    if (e.key === 'ArrowLeft') goToSpread(-1);
  });

  updateProgress();
});
