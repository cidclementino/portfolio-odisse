// Busca do topo: o botão da lupa (centro do cabeçalho; no celular, à direita)
// desliza para a esquerda e abre o campo. Abaixo dele, filtros por tipologia,
// ano e escala — montados com os valores que os projetos têm.
//   Home: a lista de projetos é filtrada ao vivo (gallery.js → Odisse.galeria).
//   Sobre e Contato: os resultados aparecem logo abaixo, com link para cada projeto
//   e para ver tudo na Home (/?q=…&tipologia=…).

document.addEventListener('DOMContentLoaded', function () {
  var O = window.Odisse || {};
  var P = O.projetos;
  var raiz = document.querySelector('[data-busca]');
  if (!raiz || !P) return;
  var nav = raiz.closest('.nav');
  var campo = raiz.querySelector('.busca__campo');
  var botao = raiz.querySelector('.busca__abrir');
  var fechar = raiz.querySelector('.busca__fechar');
  var painel = raiz.querySelector('.busca__painel');
  var filtrosEl = raiz.querySelector('.busca__filtros');
  var resultadosEl = raiz.querySelector('.busca__resultados');
  var naHome = document.body.dataset.pagina === 'home';
  var T = P.T, esc = P.esc, tr = P.tr;
  if (O.lang === 'en') { campo.placeholder = T('buscar', 'Buscar projetos'); campo.setAttribute('aria-label', campo.placeholder); }

  var estado = { q: '', tipologia: '', ano: '', escala: '' };
  var FILTROS = ['tipologia', 'ano', 'escala'];
  var lista = null;
  function carregar() {
    return lista ? Promise.resolve(lista) : P.lista().then(function (l) { lista = l; return l; });
  }

  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function voc(v) { return O.voc ? O.voc(v) : v; }
  function texto(r) {
    return norm([r.titulo, r.titulo_en, r.local, r.local_en, r.tipologia, voc(r.tipologia), r.escala, voc(r.escala),
      r.cliente, r.ano, r.status, voc(r.status), r.descricao, r.descricao_en].join(' '));
  }
  function passa(r) {
    if (!r) return false;
    for (var i = 0; i < FILTROS.length; i++) {
      var f = FILTROS[i];
      if (estado[f] && norm(r[f]) !== norm(estado[f])) return false;
    }
    var h = texto(r);
    return norm(estado.q).split(/\s+/).filter(Boolean).every(function (t) { return h.indexOf(t) >= 0; });
  }
  function ativo() { return !!(norm(estado.q) || estado.tipologia || estado.ano || estado.escala); }

  // valores de um filtro, sem repetir (ano: do mais novo ao mais antigo)
  function valores(f) {
    var vistos = {}, out = [];
    (lista || []).forEach(function (r) {
      var v = String(r[f] == null ? '' : r[f]).trim();
      if (v && !vistos[norm(v)]) { vistos[norm(v)] = 1; out.push(v); }
    });
    return f === 'ano' ? out.sort(function (a, b) { return String(b).localeCompare(String(a)); })
      : out.sort(function (a, b) { return voc(a).localeCompare(voc(b)); });
  }

  function desenharFiltros() {
    filtrosEl.innerHTML = FILTROS.map(function (f) {
      var vs = valores(f);
      if (!vs.length) return '';
      return '<div class="busca__grupo"><span class="busca__rotulo">' + esc(T(f, f)) + '</span><div class="busca__chips">' +
        vs.map(function (v) {
          var on = norm(estado[f]) === norm(v);
          return '<button type="button" class="busca__chip' + (on ? ' is-on' : '') + '" data-f="' + f + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(voc(v)) + '</button>';
        }).join('') + '</div></div>';
    }).join('') + '<div class="busca__conta"><span></span><button type="button" class="busca__limpar" hidden>' + esc(T('limpar', 'Limpar')) + '</button></div>';
  }

  function contar(n) { return n === 1 ? T('um_projeto', '1 projeto') : T('n_projetos', '{n} projetos', { n: n }); }

  function parametros() {
    var u = new URLSearchParams();
    if (norm(estado.q)) u.set('q', estado.q.trim());
    FILTROS.forEach(function (f) { if (estado[f]) u.set(f, estado[f]); });
    return u.toString();
  }

  function aplicar() {
    if (!lista) return;
    var achados = lista.filter(passa);
    var conta = filtrosEl.querySelector('.busca__conta span');
    if (conta) conta.textContent = ativo() ? contar(achados.length) : '';
    var limpar = filtrosEl.querySelector('.busca__limpar');
    if (limpar) limpar.hidden = !ativo();
    if (naHome) {
      if (O.galeria) O.galeria.filtrar(ativo() ? passa : null);
      // o endereço guarda a busca (recarregar ou compartilhar mantém o filtro)
      try { history.replaceState(null, '', location.pathname + (ativo() ? '?' + parametros() : '') + location.hash); } catch (e) { /* idem */ }
      return;
    }
    if (!ativo()) { resultadosEl.innerHTML = ''; return; }
    resultadosEl.innerHTML = achados.length
      ? '<ul>' + achados.slice(0, 6).map(function (r) {
          var c = r.capa || {};
          var src = c.src || (c.ref ? P.img(c.ref, 's') : '');
          var linha = [tr(r, 'local'), voc(r.tipologia), r.ano].filter(Boolean).join(' · ');
          return '<li><a href="' + P.url(r.slug) + '" data-via="busca"><span class="busca__capa">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : '') + '</span>' +
            '<span><b>' + esc(tr(r, 'titulo')) + '</b><small>' + esc(linha) + '</small></span></a></li>';
        }).join('') + '</ul>' +
        '<a class="busca__todos" href="/?' + parametros() + '">' + esc(T('ver_todos_busca', 'Ver na página de projetos')) + ' →</a>'
      : '<p class="busca__nada">' + esc(T('nenhum', 'Nenhum projeto encontrado.')) + '</p>';
  }

  // o que as pessoas procuram (métricas do painel): termo depois de uma pausa na digitação
  var tTermo;
  function registrar(termo) {
    if (O.metricas && O.metricas.busca && termo) O.metricas.busca(termo);
  }

  function abrirBusca(foco) {
    if (raiz.classList.contains('is-aberta')) { if (foco) campo.focus(); return; }
    if (nav) nav.classList.remove('menu-aberto');
    raiz.classList.add('is-aberta');
    document.documentElement.classList.add('busca-aberta');
    botao.setAttribute('aria-expanded', 'true');
    campo.tabIndex = 0;
    if (foco !== false) setTimeout(function () { campo.focus(); }, 60);
    carregar().then(function () { desenharFiltros(); aplicar(); painel.hidden = false; }).catch(function () {});
  }
  function fecharBusca() {
    raiz.classList.remove('is-aberta');
    document.documentElement.classList.remove('busca-aberta');
    botao.setAttribute('aria-expanded', 'false');
    campo.tabIndex = -1;
    painel.hidden = true;
    estado = { q: '', tipologia: '', ano: '', escala: '' };
    campo.value = '';
    resultadosEl.innerHTML = '';
    if (lista) aplicar();
    campo.blur();
  }

  botao.addEventListener('click', function () { abrirBusca(true); });
  fechar.addEventListener('click', fecharBusca);
  campo.addEventListener('input', function () {
    estado.q = campo.value;
    aplicar();
    clearTimeout(tTermo);
    var termo = norm(campo.value);
    if (termo.length >= 3) tTermo = setTimeout(function () { registrar(termo); }, 1200);
  });
  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!naHome && ativo()) { registrar(norm(estado.q)); location.href = '/?' + parametros(); }
      else campo.blur();
    }
  });
  filtrosEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('busca__limpar')) {
      estado = { q: '', tipologia: '', ano: '', escala: '' };
      campo.value = '';
    } else {
      var f = b.getAttribute('data-f'), v = b.getAttribute('data-v');
      estado[f] = norm(estado[f]) === norm(v) ? '' : v;
      if (estado[f]) registrar(T(f, f).toLowerCase() + ': ' + norm(v));
    }
    desenharFiltros();
    aplicar();
  });
  resultadosEl.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-via]');
    if (a) try { sessionStorage.setItem('odisse-via', 'busca'); } catch (er) { /* idem */ }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && raiz.classList.contains('is-aberta')) fecharBusca();
    // "/" abre a busca (como em muitos sites), fora de campos de texto
    if (e.key === '/' && !raiz.classList.contains('is-aberta') && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) {
      e.preventDefault();
      abrirBusca(true);
    }
  });
  // clique fora: sem nada digitado/escolhido, fecha; com busca ativa, só recolhe os filtros
  document.addEventListener('pointerdown', function (e) {
    if (!raiz.classList.contains('is-aberta') || raiz.contains(e.target)) return;
    if (!ativo()) fecharBusca();
    else if (!naHome) painel.hidden = true;
  });
  campo.addEventListener('focus', function () { if (raiz.classList.contains('is-aberta')) painel.hidden = false; });

  // Home aberta com uma busca no endereço (?q=…&tipologia=…): aplica e mostra
  if (naHome) {
    var u = new URLSearchParams(location.search);
    var veio = false;
    if (u.get('q')) { estado.q = u.get('q'); campo.value = estado.q; veio = true; }
    FILTROS.forEach(function (f) { if (u.get(f)) { estado[f] = u.get(f); veio = true; } });
    if (veio) {
      abrirBusca(false);
      carregar().then(function () { aplicar(); });
    }
  }

  // ---- menu sanduíche (celular)
  var menuBt = nav && nav.querySelector('.nav__menu');
  if (menuBt) {
    menuBt.addEventListener('click', function () {
      var aberto = nav.classList.toggle('menu-aberto');
      menuBt.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      document.documentElement.classList.toggle('menu-aberto', aberto);
      if (aberto && raiz.classList.contains('is-aberta')) fecharBusca();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('menu-aberto')) menuBt.click();
    });
  }

  // ---- PT / EN
  document.querySelectorAll('[data-idioma]').forEach(function (b) {
    b.addEventListener('click', function () {
      var novo = b.getAttribute('data-idioma');
      if (novo !== O.lang && O.trocarIdioma) O.trocarIdioma(novo);
    });
  });
});
