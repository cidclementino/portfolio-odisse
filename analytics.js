/* analytics.js — Google Analytics + Google Ads
   Reaproveita os mesmos IDs já usados em projetos.odisse.com.br
   para manter o rastreamento unificado entre as propriedades do Odisse.
   Se este portfólio deve ter uma propriedade GA própria, troque o ID abaixo. */

(function () {
  var GA_ID = 'G-7LPHDFTZ5T';
  var ADS_ID = 'AW-18312358206';

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
  gtag('config', ADS_ID);
})();
