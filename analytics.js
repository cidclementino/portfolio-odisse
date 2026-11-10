/* analytics.js — aviso de cookies + Google Analytics e Google Ads (só com consentimento)

   O Google Analytics e o Google Ads usam cookies; por isso (LGPD) só são carregados
   depois que a pessoa clica em "Aceitar" no aviso (_includes/cookies.html). A escolha
   fica guardada neste navegador por 12 meses; depois o aviso aparece de novo.
   "Recusar" não carrega nada do Google. As métricas próprias do site (metricas.js)
   não usam cookies e funcionam sempre.

   Na página de privacidade, o botão [data-cookies-rever] reabre o aviso; quem retira
   o consentimento tem os cookies do Google apagados.

   Os IDs são os mesmos de projetos.odisse.com.br (rastreamento unificado). */

(function () {
  var GA_ID = 'G-7LPHDFTZ5T';
  var ADS_ID = 'AW-18312358206';
  var CHAVE = 'odisse-cookies';
  var VALIDADE = 365 * 24 * 3600 * 1000;
  var O = (window.Odisse = window.Odisse || {});

  function ler() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (v && (v.e === 'aceito' || v.e === 'recusado') && Date.now() - v.t < VALIDADE) return v.e;
    } catch (e) { /* sem armazenamento: pergunta de novo */ }
    return '';
  }
  function gravar(e) {
    try { localStorage.setItem(CHAVE, JSON.stringify({ e: e, t: Date.now() })); } catch (er) { /* idem */ }
  }

  var carregado = false;
  function carregarGoogle() {
    if (carregado) return;
    carregado = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', GA_ID);
    gtag('config', ADS_ID);
  }

  // apaga os cookies do Google (_ga, _gid, _gcl…) neste domínio e em .odisse.com.br
  function apagarCookies() {
    var dominios = ['', location.hostname, '.' + location.hostname.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var nome = c.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat|_gcl|_gac|__gads|__gpi)/.test(nome)) return;
      dominios.forEach(function (d) {
        document.cookie = nome + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  var aviso = document.getElementById('cookies');
  function mostrarAviso() {
    if (!aviso) return;
    aviso.hidden = false;
    document.documentElement.classList.add('cookies-aberto');
    // altura do aviso: no celular, os atalhos da Home sobem por cima dele
    document.documentElement.style.setProperty('--cookies-h', aviso.offsetHeight + 'px');
  }
  function esconderAviso() {
    if (!aviso) return;
    aviso.hidden = true;
    document.documentElement.classList.remove('cookies-aberto');
  }

  function aceitar() { gravar('aceito'); esconderAviso(); carregarGoogle(); }
  function recusar() {
    var antes = ler();
    gravar('recusado');
    esconderAviso();
    if (antes === 'aceito' || carregado) { apagarCookies(); location.reload(); } // o Google já estava carregado
  }

  if (aviso) {
    aviso.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cookies]');
      if (!b) return;
      if (b.getAttribute('data-cookies') === 'aceitar') aceitar(); else recusar();
    });
  }
  // botão da política de privacidade (o conteúdo pode ser redesenhado: escuta no documento)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cookies-rever]');
    if (!b) return;
    mostrarAviso();
    var primeiro = aviso && aviso.querySelector('button');
    if (primeiro) primeiro.focus();
  });

  var estado = ler();
  if (estado === 'aceito') carregarGoogle();
  else if (!estado) mostrarAviso();

  O.cookies = { estado: ler, aceitar: aceitar, recusar: recusar, rever: mostrarAviso };
})();
