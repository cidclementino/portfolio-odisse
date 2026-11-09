// Sobre e Contato vindos da nuvem (painel /admin/ → Sobre, Contato).
// A página já chega com a versão de reserva (gerada pelo Jekyll a partir de
// _data/paginas.json). Se a nuvem tiver um conteúdo salvo pelo painel, a seção
// é redesenhada com ele — com a MESMA marcação de sobre.html / contato.html.
//
// Formato dos textos: Enter quebra a linha; linha em branco abre parágrafo;
// [texto](endereço) vira link; **texto** vira negrito.

(function () {
  var raiz = document.documentElement;
  var secao = document.querySelector('[data-conteudo]');
  function mostrar() { raiz.classList.remove('pag-aguarda'); }
  if (!secao) return mostrar();
  var nome = secao.getAttribute('data-conteudo');
  var O = window.Odisse || {};

  function base() {
    var api = O.API || '';
    try { api = localStorage.getItem('odisse-api') || api; } catch (e) { /* sem armazenamento */ }
    return api.replace(/\/$/, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function linkSeguro(url) { return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url); }
  function externo(url) { return /^https?:\/\//i.test(url) && !/^https?:\/\/(www\.)?odisse\.com\.br(\/|$)/i.test(url); }
  function linha(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, url) {
        var bruto = url.replace(/&amp;/g, '&');
        if (!linkSeguro(bruto)) return txt;
        return '<a href="' + url + '"' + (externo(bruto) ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>';
      });
  }
  function inline(t) { return String(t || '').trim().split(/\n/).map(linha).join('<br>'); }
  function texto(t) {
    return String(t || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(function (p) { return p.trim(); })
      .filter(Boolean).map(function (p) { return '<p>' + inline(p) + '</p>'; }).join('');
  }
  function img(f, grande) {
    if (!f) return '';
    if (f.ref) return base() + '/img/' + encodeURIComponent(f.ref) + (grande ? '' : '-m');
    return f.src || '';
  }
  function link(url, txt) {
    if (!txt) return '';
    if (!url || !linkSeguro(url)) return esc(txt);
    return '<a href="' + esc(url) + '"' + (externo(url) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(txt) + '</a>';
  }

  function sobre(d) {
    var t = d.titulos || {};
    var anoDesc = function (it) { return '<p><strong>' + esc(it.ano) + '</strong>' + (it.ano && it.descricao ? ' — ' : '') + inline(it.descricao) + '</p>'; };
    var foto = img(d.foto, true);
    return '' +
      '<div class="sobre__wide">' +
        '<p class="eyebrow">' + esc(t.sobre || 'Sobre') + '</p>' +
        (foto ? '<div class="sobre__intro-photo"><div class="frame"><img src="' + esc(foto) + '" alt="Odisse — Estúdio de Arquitetura &amp; Design"></div></div>' : '') +
        '<div class="sobre__intro-text">' + texto(d.descricao) + '</div>' +
      '</div>' +
      ((d.nucleos || []).length ? '<div class="sobre__wide"><h3>' + esc(t.nucleos || 'Núcleos') + '</h3><div class="nucleos-grid">' +
        d.nucleos.map(function (n) {
          return '<div class="nucleo-box"><h4>' + esc(n.nome) + '</h4>' +
            (n.link_texto ? '<p>' + link(n.link_url, n.link_texto) + '</p>' : '') + texto(n.descricao) + '</div>';
        }).join('') + '</div></div>' : '') +
      '<div class="sobre__doc">' +
        ((d.premiacoes || []).length ? '<h3>' + esc(t.premiacoes || 'Premiações') + '</h3>' + d.premiacoes.map(anoDesc).join('') : '') +
        ((d.publicacoes || []).length ? '<h3>' + esc(t.publicacoes || 'Publicações') + '</h3>' + d.publicacoes.map(anoDesc).join('') : '') +
        ((d.equipe || []).length ? '<h3>' + esc(t.equipe || 'Equipe') + '</h3><div class="equipe-grid">' +
          d.equipe.map(function (p) {
            var f = img(p.foto);
            // foto pequena (640 px) quando basta; a média (1200 px) em telas densas
            var fs = p.foto && p.foto.ref ? ' srcset="' + base() + '/img/' + encodeURIComponent(p.foto.ref) + '-p 640w, ' + esc(f) + ' 1200w" sizes="(max-width: 780px) calc(100vw - 48px), 300px"' : '';
            return '<div class="pessoa"><div class="pessoa__foto frame">' + (f ? '<img src="' + esc(f) + '"' + fs + ' alt="' + esc(p.nome) + '" loading="lazy">' : '') + '</div>' +
              '<h4>' + esc(p.nome) + '</h4><p class="pessoa__cargo">' + esc(p.cargo) + '</p>' + texto(p.bio) + '</div>';
          }).join('') + '</div>' : '') +
      '</div>';
  }

  function contato(d) {
    return '<div class="contato__doc">' + (d.secoes || []).map(function (s, i) {
      var tit = s.titulo ? (i === 0 ? '<p class="eyebrow">' + esc(s.titulo) + '</p>' : '<h3>' + esc(s.titulo) + '</h3>') : '';
      return tit + texto(s.texto);
    }).join('') + '</div>';
  }

  function desenhar(d) {
    if (!d) return;
    try { secao.innerHTML = nome === 'sobre' ? sobre(d) : contato(d); } catch (e) { console.error(e); }
  }

  var chave = 'odisse:pagina:' + nome;
  var guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(chave) || 'null'); } catch (e) { /* idem */ }
  if (guardado) { desenhar(guardado); mostrar(); }

  fetch(base() + '/api/paginas/' + nome).then(function (res) {
    if (res.status === 404) return null; // ainda não editada no painel: fica a versão do site
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (d) {
    if (d && (!guardado || guardado.atualizado !== d.atualizado)) desenhar(d);
    try { if (d) sessionStorage.setItem(chave, JSON.stringify(d)); else sessionStorage.removeItem(chave); } catch (e) { /* idem */ }
  }).catch(function (err) {
    console.warn('Conteúdo da página indisponível na nuvem; mantendo a versão do site.', err);
  }).then(mostrar);
})();
