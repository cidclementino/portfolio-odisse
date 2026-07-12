# Odisse — Portfólio Institucional

Site institucional em **Jekyll** — o mesmo motor de template do repositório
`projetos-odisse` (as LPs). GitHub Pages builda Jekyll automaticamente,
sem você precisar instalar nada (Ruby, gems etc.) — basta fazer o push.

Continua sendo um repositório próprio, separado do `projetos-odisse`.

## O que mudou nessa rodada

Antes, cada projeto era um arquivo HTML inteiro escrito à mão. Agora, cada
projeto é só **front matter YAML** — os mesmos dados que antes estavam
espalhados no HTML agora ficam num bloco de metadados no topo do arquivo,
e o layout (`_layouts/projeto.html`) é quem desenha a página a partir
desses dados. Isso é o mesmo padrão de `_data/*.yml` do `projetos-odisse`,
só que usando front matter de uma collection ao invés de um arquivo `_data`
separado (mais prático aqui porque cada projeto também precisa virar uma
página própria, o que uma collection já resolve sozinha).

## Estrutura de arquivos

```
_config.yml          → configuração do Jekyll (baseurl, collection de projetos)
_layouts/
  default.html        → casca compartilhada: nav + conteúdo + footer (Home/Sobre/Contato)
  projeto.html         → desenha a página de um projeto a partir do front matter
_includes/
  nav.html             → navegação (usada pelo default.html)
  footer.html           → rodapé (usado pelo default.html)
_projetos/               → um arquivo por projeto (front matter puro, sem HTML)
  yvc.html
  dcmcc.html
  altavista.html
images/{slug}/  → imagens de cada projeto (capa.jpg, 01.jpg, 02.jpg...)
index.html            → Home (front matter + loop automático nos projetos)
sobre.html             → Sobre (front matter + conteúdo)
contato.html            → Contato (front matter + conteúdo)
styles.css              → todo o CSS
script.js               → ano do rodapé + animação da linha de assinatura (Sobre)
project.js               → navegação horizontal quando o projeto abre em página própria
gallery.js                → dinâmica de expandir/recolher (accordion) na Home
analytics.js               → GA + Google Ads
```

## Como editar um projeto existente

Abra o arquivo dele em `_projetos/` — por exemplo `_projetos/yvc.html`:

```yaml
---
titulo: "Residência YVC"
local: "João Pessoa, Brasil"
ano: 2024
cliente: "Privado"
tipologia: "Residencial"
area: "—"
status: "Concluído"
capa: /images/yvc/capa.jpg
ordem: 1
secoes:
  - tipo: imagem
    imagem: /images/yvc/01.jpg
    alt: "Residência YVC — fachada"

  - tipo: texto
    texto: >
      Seu texto aqui. Pode ter mais de um parágrafo — só dar uma linha
      em branco entre eles, como neste exemplo.

  - tipo: imagem
    imagem: /images/yvc/02.jpg
---
```

- **Metadados** (`titulo`, `local`, `ano`, `cliente`, `tipologia`, `area`,
  `status`) aparecem na barra lateral da página do projeto. Qualquer um
  deles pode ficar de fora (some da lista automaticamente).
- **`secoes`** é a lista de "compartimentos" que aparecem deslizando na
  horizontal, na ordem em que estão escritos. Existem só 2 tipos:
  - **`imagem`** — uma imagem em tela cheia. Campos: `imagem` (caminho do
    arquivo) e `alt` (texto alternativo, opcional).
  - **`texto`** — um bloco de texto ocupando metade da largura da tela,
    alinhado à esquerda. Campo: `texto`.
- **Adicionar ou remover um compartimento** é só adicionar ou apagar um
  item da lista `secoes:` — nada de HTML ou JS pra tocar.
- **`ordem`** controla a posição do projeto na Home (menor número aparece
  primeiro).
- **`capa`** é a imagem usada na galeria da Home.

## Como adicionar um projeto novo

1. Duplique um arquivo de `_projetos/` (ex.: `_projetos/yvc.html`) com um
   nome novo, ex.: `_projetos/nome-do-projeto.html`
2. Preencha o front matter (metadados + `secoes`)
3. Coloque as imagens em `images/nome-do-projeto/`
4. Pronto — o projeto aparece sozinho na Home (a Home faz um loop
   automático em todos os arquivos de `_projetos/`) e ganha uma página
   própria em `/projetos/nome-do-projeto.html`

Não precisa mexer em `index.html` nem duplicar nada lá.

## Sobre as imagens

Os três projetos atuais (YVC, DCMCC, Altavista) estão com **imagens
placeholder geradas** (retângulo com o padrão listrado de identidade visual
+ nome do arquivo) só pra não aparecer ícone de imagem quebrada. Substitua
os arquivos em `images/{slug}/` pelos renders reais, mantendo os
mesmos nomes de arquivo (ou trocando o campo `imagem`/`capa` no front
matter se preferir nomes diferentes).

## Deploy em repositório novo (passo a passo)

1. No GitHub (conta `cidclementino`), criar um repositório novo (ou
   reaproveitar o `portfolio-odisse` que você já publicou — nesse caso é
   só substituir todos os arquivos pela estrutura acima)
2. Subir **todos** os arquivos e pastas mantendo a estrutura exata
   (incluindo as pastas que começam com `_`, que são as mais importantes
   — é isso que o Jekyll processa)
3. Em **Settings → Pages**, source: `Deploy from a branch`, branch `main`,
   pasta `/ (root)` — o Jekyll builda sozinho, sem passo extra
4. Publica em `https://cidclementino.github.io/portfolio-odisse/`

**Se o nome do repositório mudar:** abra `_config.yml` e ajuste a linha
`baseurl: "/portfolio-odisse"` para `/nome-do-novo-repositorio`.

**Se um domínio próprio for configurado depois (CNAME):** troque
`baseurl` para uma string vazia (`baseurl: ""`), porque nesse caso o site
passa a viver na raiz do domínio, não mais num subdiretório.

## Domínio próprio (opcional)

1. Criar um arquivo `CNAME` (sem extensão) na raiz do repo contendo só o
   domínio escolhido, ex.: `portfolio.odisse.com.br`
2. No painel de DNS da Wix, criar um CNAME apontando o subdomínio
   escolhido para `cidclementino.github.io`
3. Em **Settings → Pages**, campo "Custom domain", inserir o mesmo
   domínio e aguardar a verificação do HTTPS
4. Lembrar de zerar o `baseurl` no `_config.yml` (ver acima)

## Se o site não aparecer certo depois do push

Como o Jekyll builda no servidor do GitHub (não dá pra testar isso aqui
antes de você subir), se algo sair diferente do esperado:

- **Settings → Pages** mostra o status do último build; se der erro, ele
  aparece ali
- Confira se as pastas `_layouts`, `_includes` e `_projetos` foram
  realmente enviadas (às vezes o upload pela interface web do GitHub
  ignora pastas que começam com `_` dependendo de como os arquivos são
  arrastados — o mais seguro é subir via `git push` de um clone local)
