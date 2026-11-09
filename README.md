# Odisse — site institucional (odisse.com.br)

Site em **Jekyll** no GitHub Pages, com os **projetos na nuvem**: a lista,
a ordem, os textos e as imagens ficam numa API própria na Cloudflare
(Worker + KV, a mesma solução do Universo em `marketing-odisse`) e são
geridos pelo painel **odisse.com.br/admin/**, protegido por senha.

## Painel (odisse.com.br/admin/)

Entrada por senha (o secret `SITE_SENHA`). A senha fica lembrada no
navegador até clicar em **Sair**. Quatro abas:

**Projetos**
- A ordem da lista é a ordem da Home: arraste pela alça (⋮⋮) ou use ↑ ↓.
- A chave **No site / Oculto** mostra ou esconde o projeto sem apagá-lo.
- **Editar** abre o projeto em três colunas: informações à esquerda
  (título, endereço, local, ano, área, cliente, tipologia, status, capa da
  Home), a **sequência** ao centro e o **banco de imagens** à direita.
- O banco guarda todas as imagens do projeto. Envie de uma vez (botão
  **+ Enviar** ou soltando arquivos na coluna) e depois arraste cada uma
  para o ponto da sequência onde ela entra — ou use o **+** da miniatura
  para pôr no fim. Os números na miniatura mostram em que posição ela está.
  Tirar uma imagem da sequência (✕, ou arrastá-la de volta ao banco) não a
  apaga; excluir do banco, sim.
- O **+** entre as caixas abre: imagem do banco, do computador ou texto.
  Arraste pelo rótulo da caixa para reordenar, ou use ← →.
- Cartão de texto em três larguras — **P** (esguio, o padrão), **M** (uma
  coluna larga) e **G** (duas colunas, para textos longos).
- Imagens são convertidas no navegador para WebP em dois tamanhos
  (2400 px e 1200 px) antes de subir.
- Texto: cada Enter vira um parágrafo. Campos vazios não aparecem no site.
- **Salvar** (ou Ctrl/Cmd + S). O site atualiza em até 1 minuto.

**Sobre** e **Contato**
- Todo o conteúdo das duas páginas: textos, foto do estúdio, núcleos,
  premiações, publicações, equipe (com fotos) e as seções do Contato.
- Nos textos: Enter quebra a linha, linha em branco abre parágrafo,
  `[texto](https://…)` vira link, `**texto**` vira negrito.
- Enquanto uma página nunca foi salva pelo painel, o site mostra a versão
  de `_data/paginas.json`; depois do primeiro Salvar, vale a da nuvem.

**Métricas**
- Visitantes, páginas vistas, projetos abertos, tempo médio, cliques de
  contato (WhatsApp, e-mail, telefone) e quem saiu na primeira página,
  comparados ao período anterior (7, 30 ou 90 dias).
- Visitantes por dia, desempenho de cada projeto (aberturas, pela Home,
  tempo médio, % que viu a sequência até o fim), origens, cliques de saída,
  páginas, cidades, dispositivos e horários.
- Contagem própria, sem cookies: cada pessoa é reconhecida só dentro do
  mesmo dia, por um código anônimo. Robôs e navegadores com o painel
  aberto não entram. O Google Analytics continua ativo (`analytics.js`).

## API (pasta `worker/`)

Worker `site-odisse`, publicado pelo workflow **Publicar API** a cada
mudança em `worker/`. Na primeira publicação ele cria sozinho o namespace
KV `SITE_ODISSE`. Precisa de três secrets no repositório
(Settings → Secrets and variables → Actions):

| Secret | O que é |
|---|---|
| `CLOUDFLARE_API_TOKEN` | o mesmo token usado no `marketing-odisse` (Workers + KV: editar) |
| `CLOUDFLARE_ACCOUNT_ID` | o mesmo id de conta do `marketing-odisse` |
| `SITE_SENHA` | a senha do painel |

Endereço: `https://site-odisse.reservaprojectbasework.workers.dev`
(configurado em `assets/js/config.js`).

Limites do plano gratuito da Cloudflare que importam aqui: 1.000 gravações
por dia no KV (cada página vista grava um registro de métrica) e 100.000
leituras. Se o site passar de ~800 páginas vistas por dia, vale ativar o
plano Workers Paid (US$ 5/mês) — nada no código muda.

## Estrutura

```
_config.yml            configuração do Jekyll
_layouts/default.html  casca: nav + conteúdo + rodapé (Home, Sobre, Contato)
_includes/             head, nav, rodapé, logos em SVG (marca-odisse, selo-mao)
_data/paginas.json     versão de reserva de Sobre e Contato (o painel parte dela)
index.html             Home — galeria montada por gallery.js com os projetos da nuvem
projeto.html           página do projeto (/projeto/?p=<endereço>), montada por project.js
404.html               redireciona endereços antigos (/projetos/<slug>/) para /projeto/?p=<slug>
admin/                 painel (index.html, app.js, admin.css, semente.json para importar)
assets/js/             config (endereço da API), projetos (leitura e desenho),
                       metricas (coleta), pontos (pontos laterais), marks (logos)
assets/fonts/          Inter variável (com eixo óptico)
assets/brand/          favicon e logos (SVG e PNG)
styles.css             todo o CSS do site
worker/                API Cloudflare Worker + KV
```

## Identidade

- **Inter** em todo o site (Manual do sistema Odisse), servida localmente.
- Palavra **ODISSE** no topo e no rodapé, **selo da mão** no rodapé e no favicon.
- **Pontos laterais**: três de cada lado, centrados na margem, alinhados à
  marca do cabeçalho, ao meio da tela e ao pé — o mesmo sistema dos posts
  3:4. Ardósia sobre fundo claro, claros sobre imagem ou fundo escuro.
