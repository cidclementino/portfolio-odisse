// Métricas próprias do site (sem cookies). Cada página vista vira um registro
// enviado à API quando a pessoa sai da página: tempo de leitura, rolagem,
// cliques de contato e, nos projetos, até onde a sequência foi vista.
// Quem entrou no painel /admin/ neste navegador não é contado.

(function () {
  var O = (window.Odisse = window.Odisse || {});

  function desligado() {
    try { return !!localStorage.getItem('odisse-admin'); } catch (e) { return false; }
  }

  function enviar(dados) {
    if (desligado() || !O.API) return;
    var corpo = JSON.stringify(dados);
    var destino = (function () {
      try { return (localStorage.getItem('odisse-api') || O.API).replace(/\/$/, ''); } catch (e) { return O.API; }
    })() + '/api/coleta';
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(destino, new Blob([corpo], { type: 'text/plain' }))) return;
    } catch (e) { /* segue para o fetch */ }
    try { fetch(destino, { method: 'POST', body: corpo, keepalive: true, mode: 'cors', headers: { 'Content-Type': 'text/plain' } }); } catch (e) { /* sem rede */ }
  }

  var utm = (function () {
    try { return new URLSearchParams(location.search).get('utm_source') || ''; } catch (e) { return ''; }
  })();

  // Um registro: conta só o tempo com a aba visível.
  function Registro(base) {
    this.d = base;
    this.d.o = [];
    this.ms = 0;
    this.desde = document.visibilityState === 'visible' ? Date.now() : 0;
    this.enviado = false;
  }
  Registro.prototype.pausar = function () { if (this.desde) { this.ms += Date.now() - this.desde; this.desde = 0; } };
  Registro.prototype.retomar = function () { if (!this.desde) this.desde = Date.now(); };
  Registro.prototype.saida = function (tipo) { if (this.d.o.indexOf(tipo) < 0) this.d.o.push(tipo); };
  Registro.prototype.sequencia = function (vistos, total) {
    this.d.st = total;
    this.d.sv = Math.max(this.d.sv || 0, vistos);
  };
  Registro.prototype.fim = function () {
    if (this.enviado) return;
    this.pausar();
    this.enviado = true;
    this.d.dur = Math.round(this.ms / 1000);
    enviar(this.d);
  };

  var abertos = [];
  function abrir(base) {
    var r = new Registro(base);
    abertos.push(r);
    return r;
  }

  var tipoPagina = document.body && document.body.dataset.pagina;
  var pagina = abrir({ t: 'pagina', p: location.pathname, r: document.referrer, u: utm, sc: 0 });
  if (tipoPagina === 'projeto') {
    var slug = new URLSearchParams(location.search).get('p') || '';
    pagina.d.p = '/projeto/' + slug;
  }

  // profundidade de rolagem (vertical)
  function rolagem() {
    var alto = document.documentElement.scrollHeight - window.innerHeight;
    var pct = alto > 0 ? Math.round((100 * window.scrollY) / alto) : 100;
    if (pct > pagina.d.sc) pagina.d.sc = Math.min(100, pct);
  }
  window.addEventListener('scroll', rolagem, { passive: true });
  window.addEventListener('load', rolagem);

  // cliques de saída: contato, redes e os outros núcleos
  function tipoSaida(href) {
    if (/^mailto:/i.test(href)) return 'email';
    if (/^tel:/i.test(href)) return 'telefone';
    if (/wa\.me|whatsapp/i.test(href)) return 'whatsapp';
    if (/instagram\.com/i.test(href)) return 'instagram';
    if (/tiktok\.com/i.test(href)) return 'tiktok';
    if (/youtube\.com/i.test(href)) return 'youtube';
    if (/substack\.com/i.test(href)) return 'elaia';
    if (/odisseobjetos/i.test(href)) return 'objetos';
    if (/projetos\.odisse\.com\.br/i.test(href)) return 'servicos';
    if (/google\.[^/]+\/forms|forms\.gle/i.test(href)) return 'candidatura';
    return '';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var tipo = tipoSaida(a.getAttribute('href'));
    if (!tipo) return;
    abertos.forEach(function (r) { if (!r.enviado) r.saida(tipo); });
  }, true);

  document.addEventListener('visibilitychange', function () {
    abertos.forEach(function (r) { if (document.visibilityState === 'visible') r.retomar(); else r.pausar(); });
    if (document.visibilityState === 'hidden') {
      // o celular pode matar a aba sem aviso: envia já, sem esperar o pagehide
      abertos.forEach(function (r) { r.fim(); });
    }
  });
  window.addEventListener('pagehide', function () { abertos.forEach(function (r) { r.fim(); }); });

  O.metricas = {
    // projeto aberto (na página própria ou no acordeão da Home)
    projeto: function (slug, via) { return abrir({ t: 'projeto', s: slug, via: via || '' }); },
  };
})();
