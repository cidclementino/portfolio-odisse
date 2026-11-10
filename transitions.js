// Transição de página: um fade rápido ao entrar (feito em CSS puro, sem
// depender deste script) e um fade de saída ao clicar num link interno,
// antes de navegar de verdade pra próxima página.

document.addEventListener('DOMContentLoaded', function () {
  var EXIT_MS = 90;
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return; // só o clique principal (botão esquerdo)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // abrir em nova aba etc.

    var link = e.target.closest('a');
    if (!link) return;

    // a galeria da Home já tem sua própria dinâmica (abre o acordeão);
    // não intercepta o clique dela
    if (link.closest('.gallery__row')) return;

    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

    // só intercepta links pro próprio site — externos abrem normal
    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== window.location.origin) return;

    if (reduceMotion) return; // sem atraso artificial pra quem pediu menos animação

    e.preventDefault();
    document.body.classList.add('is-leaving');
    window.setTimeout(function () {
      window.location.href = url.href;
    }, EXIT_MS);
  });
});
