// Revela a "linha de tensão" (elemento de assinatura) quando o hero entra em vista.
document.addEventListener('DOMContentLoaded', function () {
  var tensao = document.querySelector('.tensao');
  if (tensao) {
    // pequeno delay para o load da página assentar antes de desenhar a linha
    requestAnimationFrame(function () {
      setTimeout(function () { tensao.classList.add('is-visible'); }, 200);
    });
  }

  var ano = document.getElementById('ano-atual');
  if (ano) ano.textContent = new Date().getFullYear();
});
