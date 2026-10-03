# Handoff: AIROS — Design system + tela Início (versão limpa)

> Instrução para o Claude Code: leia este README inteiro antes de mexer no código. Implemente **na ordem da seção “Plano de implementação”**. Todos os textos da interface são em **português do Brasil**.

## Visão geral
Redesenho do AIROS (sistema interno da AIROS Arquitetura — leads, clientes, projetos, tarefas, horas e agenda). Esta entrega cobre:
1. **Design system enxuto** — tokens de cor (claro/escuro), tipografia, raios, sombras e componentes base com estados.
2. **Tela Início (painel 360°)** — desktop (1440px) e mobile (390px), na direção **“versão limpa”** (v2) aprovada pelo usuário: clean, minimalista, muito espaço, pouca caixa.

As demais telas (Oportunidades, Projeto, Minhas tarefas, Login) virão em entregas seguintes — **não alterar o layout delas agora**, apenas fazê-las herdar os novos tokens.

## Sobre os arquivos de design
Os arquivos em `referencia/` são **referências de design feitas em HTML** (protótipos que mostram aparência e comportamento), **não código de produção**. A tarefa é **recriar esses designs no código existente** (React + Tailwind CSS), usando os padrões, componentes e bibliotecas já existentes no projeto (ícones Lucide, etc.).
- Para ver a referência: abra `referencia/AIROS Redesign - Entrega 1 v2.dc.html` no navegador (precisa do `support.js` na mesma pasta e de internet para fontes/ícones).
- A **v2** é a versão vigente da tela Início. A **v1** fica só como histórico (as seções de Diagnóstico, Design system e Tokens são iguais nas duas).

## Fidelidade
**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamentos e estados são finais. Recriar com precisão usando Tailwind + tokens deste pacote.

---

## Plano de implementação (ordem sugerida)
1. **Tokens**: adicionar `tokens.css` ao CSS global (antes de `@tailwind base`) e mesclar `tailwind.config.js` no config existente. Carregar fontes Inter (400/500/600), Inter Tight (500/600/700) e JetBrains Mono (400/500).
2. **Mapa semântico de status**: criar um helper único (ex.: `src/lib/status.ts`) que devolve as classes de cor para cada estado (tabela abaixo). Remover cores ad-hoc (azul, verde, roxo, laranja saturados) espalhadas pelo código e usar o helper.
3. **Componentes base**: Button, Input, Select, Badge/StatusBadge, Tabs (texto sublinhado), SegmentedControl, Avatar/AvatarGroup, TaskCheck, Checkbox, Switch, EmptyState, Drawer, Modal, ListRow — com os estados descritos.
4. **Shell**: nova Sidebar (sem fundo próprio/borda), Header (timer pill + Assistente + notificações), barra inferior no mobile.
5. **Tela Início** conforme especificação.
6. Garantir modo escuro via classe `.dark` no `<html>` (tokens já prontos).

---

## Design tokens

### Neutros
| Token | Claro | Escuro | Uso |
|---|---|---|---|
| canvas | `#f6f5f2` (Início v2 usa `#f7f6f3`) | `#121110` | Fundo da aplicação **e da sidebar** |
| surface | `#ffffff` | `#1b1a18` | Superfícies (só a fila de atenção, gavetas, modais, menus) |
| subtle | `#faf9f7` | `#211f1c` | Hover de linha |
| line | `#e9e6e1` | `#2c2926` | Bordas |
| line-strong | `#dcd8d1` | `#3a3631` | Borda de controles |
| (hairline canvas) | `#e6e2dc` | — | Linhas divisórias sobre o canvas no Início |
| (hairline surface) | `#f1eee9` | — | Divisórias entre linhas dentro da superfície branca |
| faint | `#8a8379` | `#7d776e` | Rótulos secundários, placeholders, ícones |
| muted | `#6b655c` | `#a8a198` | Texto secundário (AA 5,3:1) |
| ink | `#121110` | `#f2efea` | Texto principal, botão primário |

### Bronze (marca) — fixo
50 `#f8f6f3` · 100 `#efebe4` · 200 `#e0d7ca` · 300 `#c9baa4` · 400 `#ad9a7e` · **500 `#8f7c61`** · 600 `#76654e` · 700 `#5f513f` · 800 `#4a3f32` · 900 `#3a3128`
Uso: foco, seleção, etapa atual, links de ação (`#5f513f`), escala do funil (200→600).

### Semânticas (bg / line / solid / fg)
| Nome | Token | Claro | Escuro | Significado |
|---|---|---|---|---|
| Atrasado | danger | `#faf0ed` / `#efcfc5` / `#b4553c` / `#8c3b27` | `#2e1d18` / `#5a3328` / `#d07a62` / `#eba58f` | vencido, erro, destrutivo |
| A vencer | warning | `#faf4e8` / `#ecdbb3` / `#b5862f` / `#7d5b1a` | `#2c2416` / `#5a4622` / `#c99a48` / `#e3c27e` | prazo na janela de 7 dias, retorno hoje |
| Em andamento | info | `#eff3f5` / `#cfdbe2` / `#557589` / `#3b5566` | `#1a2329` / `#34495a` / `#7b9db3` / `#a9c3d4` | trabalho em curso |
| Concluído | success | `#eff4ef` / `#cfdecf` / `#5d8263` / `#3f5d45` | `#1b261d` / `#36503b` / `#7fa585` / `#aecdb2` | concluída, ganho |

### Regra-mãe de cor
**Só ganha cor o que pede ação.** Prazo fora da janela “a vencer” (configurável, padrão 7 dias) = texto neutro. Dentro da janela = `warning-fg`. Vencido = `danger-fg`.

### Mapa de uso (implementar no helper `status`)
- **Status da tarefa**: A fazer → `bg-stone-100 text-stone-700` + ponto vazado `border-stone-500` · Em andamento → `info` · Em revisão → `bg-brand-100 text-brand-700` ponto `brand-500` · Pausada → neutro com ícone Pause · Concluída → `success` com ícone Check.
- **Prazo**: Atrasada (`danger`), Vence hoje / em N≤7 dias (`warning`), > 7 dias → só texto `muted` com ícone Clock.
- **Funil (etapas)**: Novo lead `#e0d7ca` · Primeiro contato `#c9baa4` · Reunião agendada `#ad9a7e` · Proposta enviada `#8f7c61` · Negociação `#76654e`. **Ganho** = success. **Perdido** = neutro (`stone`), nunca vermelho.
- **Prioridade**: Alta `danger-fg` · Média `warning-fg` · Baixa `muted` — só ícone Flag + texto, sem fundo.
- **Avatares**: fundo claro + texto escuro (não discos saturados). Atribuir por pessoa de forma estável (hash do id) entre: slate `#dfe7ec/#3b5566`, sage `#dde8de/#3f5d45`, clay `#efe2d6/#7a4a30`, plum `#e8e2ee/#5a4a6b`, stone `#e9e6e1/#4f4a44`.

### Tipografia
Inter (texto) e Inter Tight (títulos e números). Números sempre `tabular-nums`.
| Token | Fonte | Tamanho/linha | Peso | Tracking |
|---|---|---|---|---|
| hero (saudação Início v2) | Inter Tight | 40/44 | 500 | -0.03em |
| display | Inter Tight | 36/40 | 600 | -0.025em |
| h1 | Inter Tight | 28/34 | 600 | -0.02em |
| h2 | Inter Tight | 20/28 | 600 | -0.015em |
| section (títulos de seção Início v2) | Inter Tight | 18/24 | 600 | -0.01em |
| h3 | Inter Tight | 16/24 | 600 | -0.01em |
| metric (KPIs v2) | Inter Tight | 32/36 | 400 | -0.025em |
| body-lg | Inter | 15/24 | 400 | 0 |
| body | Inter | 14/20 | 400 | 0 |
| sm | Inter | 13/18 | 400 | 0 |
| xs | Inter | 12/16 | 500 | 0 |
| eyebrow | Inter | 11/16 uppercase | 600 | 0.14em |
| mono (cronômetro, horários) | JetBrains Mono | 12–13px | 400 | 0 |

### Espaçamento, raios, sombras
- Base 4px (escala padrão do Tailwind).
- Altura de controles: 36px (md), 32px (sm), 44px (toque/mobile).
- Raios: xs 6 (badges) · sm 8 (itens de menu) · md 10 (botões, campos) · lg 14 (card kanban) · xl 18 (cards) · 2xl 24 (modal, gaveta). Superfície da fila no Início v2: **16px**.
- Sombras: xs `0 1px 0 rgb(18 17 16/.04)` · sm `0 1px 2px rgb(18 17 16/.05)` · surface `0 1px 2px rgb(18 17 16/.04), 0 0 0 1px rgb(18 17 16/.04)` · md `0 6px 16px -4px rgb(18 17 16/.10)` (menus) · lg `0 24px 48px -12px rgb(18 17 16/.20)` (modal/gaveta) · drag `0 14px 28px -8px rgb(18 17 16/.22)` · focus `0 0 0 1px #8f7c61, 0 0 0 4px rgb(143 124 97/.28)`.

---

## Componentes base (estados)
**Foco visível em tudo**: anel `shadow-focus` (bronze), apenas em `:focus-visible`.

### Button (h 36, px 14, radius 10, Inter 14/500, gap 8, ícone 16 stroke 1.6)
| Variante | Padrão | Hover | Desabilitado | Carregando |
|---|---|---|---|---|
| Primário | bg `#121110` texto branco | bg `#34312d` | bg `#e9e6e1` texto `#8a8379` | bg `#34312d` + spinner 14px (borda 1.6 branca 30%, topo branco, 0.8s linear) + “Salvando…” |
| Secundário | bg branco, borda `#dcd8d1`, shadow-xs | bg `#f6f5f2`, borda `#cfc9c0` | bg `#faf9f7`, borda `#e9e6e1`, texto `#b3aca2` | spinner escuro |
| Fantasma | transparente, texto `#4f4a44` (v2: `#34312d`) | bg `#f3f1ed` / `rgba(18,17,16,.05)` | texto `#b3aca2` | spinner escuro |
| Perigo | bg branco, borda `#efcfc5`, texto `#8c3b27` | bg `#faf0ed`, borda `#e3b7a9` | idem desabilitado | spinner |
Tamanhos: sm 32 (radius 9, 13px) · md 36 · touch 44 (radius 12, 15px). Botão só-ícone 36×36 com `aria-label` e tooltip.

### Input / Select
h 36, px 12, radius 10, borda `#dcd8d1`, bg branco, 14px. Label 12.5px/500 `#34312d` acima (gap 6). Ajuda 12px `muted` abaixo.
- Foco: borda `#8f7c61` + `0 0 0 3px rgba(143,124,97,.22)`.
- Erro: borda `#b4553c` + `0 0 0 3px rgba(180,85,60,.12)`; mensagem 12px `#8c3b27` com ícone TriangleAlert 14.
- Desabilitado: bg `#f6f5f2`, borda `#e9e6e1`, texto `#8a8379`.
- **Select customizado** (não usar `<select>` nativo): gatilho igual ao input + ChevronDown; menu com radius 12, borda `#e9e6e1`, shadow-md, padding 4; itens h 32, radius 8, 13.5px; hover bg `#f6f5f2`; selecionado com Check `#76654e` à direita. Pode exibir avatar 20px no gatilho (ex.: Responsável).

### Badge
h 22, px 8, radius 6, 12px/500, gap 6, ponto 6px `solid`. Variantes por token semântico (`bg` + `fg`). Variante contorno: borda 1px `line` + texto `fg`.

### Tabs (texto)
Itens 13.5–14px, gap 20–22. Ativo: texto ink/500 + sublinhado (`box-shadow: inset 0 -1px 0 #121110` na v2; 2px no DS). Inativo: `#8a8379`. Contador opcional ao lado (mesmo texto ou pill ink).

### SegmentedControl
Container bg `#f3f1ed`, radius 10, padding 3, gap 2. Item h 28, px 10, radius 7, 13px. Ativo: bg branco + `0 1px 2px rgba(18,17,16,.08)`, 500. (No Início v2 foi substituído por Tabs de texto.)

### Avatar
Tamanhos 20/24/32/40 (texto 8.5/9.5/12/14px, 600). Grupo: sobreposição -5/-6px com anel 2px da cor do fundo; excedente “+N” em `#f3f1ed/#4f4a44`. “Você”: anel duplo `0 0 0 2px #fff, 0 0 0 3.5px #8f7c61`.

### TaskCheck (concluir tarefa)
Círculo 18px. Aberta: borda 1.5 `#b3aca2`. Hover: borda `#4f4a44` bg `#f3f1ed` + check. Feita: bg `#5d8263` check branco 11px. Atrasada: borda `#b4553c`.

### Checkbox / Switch
Checkbox 16px radius 5; marcado bg ink + check branco. Switch 32×18, desligado `#d9d4cc`, ligado ink, knob 14px branco.

### ListRow (estados)
Padrão · Hover (bg `#faf9f7`, ações aparecem: botões 26×26 radius 7 brancos com borda) · Selecionada (bg `#f8f6f3` + `inset 2px 0 0 #8f7c61`, checkbox marcado) · Concluída (título `#8a8379` riscado com `text-decoration-color:#c9c3ba`, avatar opacidade .6) · Carregando (skeleton: barras `#efece7`/`#f3f1ed`).

### Kanban card (para entrega seguinte)
bg branco, borda `#e9e6e1`, radius 14, padding 14. Arrastando: `rotate(1.2deg)`, shadow-drag, borda `#c9baa4`. Zona de soltar: borda 1.5 tracejada `#c9baa4`, bg `#f8f6f3`, texto “Soltar em {etapa}” `#5f513f`.

### EmptyState
Centralizado: quadrado 40px radius 12 com ícone (ex.: success-bg + CircleCheck), título Inter Tight 15/600, texto 12.5px `muted` max 240px, ação fantasma. Ex.: “Nada atrasado” / “Quando uma tarefa ou retorno passar do prazo, ele aparece aqui.” / “Ver próximos 7 dias →”.

### Drawer / Modal
Gaveta 520px à direita, modal 560px; radius 24 (modal) ; shadow-lg; overlay `rgba(18,17,16,.28)` + `backdrop-blur-[2px]`. Esc fecha; focus trap; foco volta ao gatilho.

---

## Tela: Início — Desktop (1440px), versão limpa (v2)

### Propósito
Painel 360° que responde “o que precisa de ação agora?”. A hierarquia vai: fila de atenção → agenda de hoje → visão geral (números) → projetos/funil → equipe.

### Princípios da v2
- **Uma única superfície branca** na tela: a fila “Pede sua atenção”. Todo o resto vive direto no canvas, separado por espaço e hairlines `#e6e2dc`.
- Sem ícones decorativos em quadrados; marcadores são **pontos de 6px**.
- Sem botões com borda repetidos por linha: ação = **link de texto bronze** `#5f513f` 13px/500 + ChevronRight 14.
- Cor só em pontos e texto de prazo.

### Layout geral
- Grid: `grid-cols-[232px_1fr]`, fundo `#f7f6f3` (canvas) em ambos — **sidebar sem fundo próprio e sem borda**.
- Main: padding `0 64px 72px`. Header 72px. Conteúdo com `max-width: 1080px`, coluna com `gap: 56px`, padding-top 24.

### Sidebar (232px, padding 32px 20px 24px, coluna gap 32)
- Logo do escritório (upload em Configurações) ou wordmark “AIROS” (Inter Tight 700 15px, tracking .38em) + “ARQUITETURA” (8.5px, tracking .32em, `#8a8379`).
- Busca: h 34, radius 9, bg `rgba(18,17,16,.04)`, ícone Search 14, “Buscar”, “⌘K” 11.5px à direita, texto `#8a8379`. Abre a paleta de comandos.
- Navegação (nomes **inalterados**), grupos separados apenas por **gap 20px**, sem rótulos:
  - Início
  - Oportunidades (indicador: ponto 6px `#b5862f` quando há retornos pendentes) · Clientes
  - Projetos · Minhas tarefas (contador 12px `#8a8379`) · Agenda
  - Relatórios · Equipe · Configurações
- Item: h 34, px 10, radius 9, gap 12, ícone Lucide 16 stroke 1.6, 14px `#6b655c`; hover texto ink; ativo bg `rgba(18,17,16,.05)`, ink, 500.
- Rodapé: avatar 28 + nome 13/500 + papel 11.5 `#8a8379` (sem borda).

### Header (72px, sem borda, transparente)
- Esquerda — **Cronômetro** (quando rodando): pílula h 34, radius full, bg branco, `box-shadow: 0 0 0 1px #ebe7e1`, padding `0 4px 0 12px`, gap 10: ponto 7px `#d07a62` pulsando (opacidade 1→.3, 1.6s ease-in-out infinite) · tempo `HH:MM:SS` JetBrains Mono 12.5 tabular · “{tarefa} · {projeto}” `#6b655c` · botão parar 26px círculo bg `#f3f1ed` com ícone Square 11. Parado: texto “Iniciar cronômetro” com ícone Play, `#6b655c`.
- Direita: botão fantasma “Assistente” (Sparkles 16) · sino 34×34 com ponto 6px `#b4553c` quando há notificações não lidas.

### Cabeçalho da página (flex, space-between, align end)
- “Sábado, 3 de outubro” 13px `#8a8379` (data dinâmica, pt-BR).
- “Boa tarde, Matheus.” — hero 40/44 Inter Tight 500 -0.03em (Bom dia / Boa tarde / Boa noite conforme hora).
- Resumo 15/24 `#6b655c`: “{N} itens pedem atenção, <span danger-fg>{M} atrasados</span>.” (se M=0, omitir a segunda parte).
- Ações: fantasma “+ Tarefa” e primário “+ Oportunidade”.

### Linha 1 — `grid-cols-[1fr_300px] gap-16` (64px)
**A) Pede sua atenção** (coluna esquerda)
- Título “Pede sua atenção” (section 18/600) + à direita Tabs de texto 13px: “Tudo 8 · Tarefas 2 · Comercial 5 · Projetos 1” (ativo ink/500 com sublinhado 1px, padding-bottom 3).
- Superfície: bg branco, radius 16, shadow `surface`, padding-bottom 6.
- Grupos (cabeçalho: padding `18px 24px 8px`, 12.5px/500, cor do grupo + contador `#8a8379` 400):
  - **Atrasado** (`#8c3b27`) — tarefas vencidas + retornos de leads vencidos.
  - **Hoje** (`#7d5b1a`) — retornos e prazos de hoje.
  - **Nesta semana** (`#4f4a44`) — prazos de projeto dentro da janela, leads parados, oportunidades fechadas aguardando cadastro.
- Linha: `grid-cols-[6px_1fr_auto_128px] gap-16 items-center`, padding `13px 24px`, `border-top: 1px solid #f1eee9`, hover bg `#faf9f7`.
  - ponto 6px (danger-solid / warning-solid / `#b3aca2` neutro / `#8f7c61` cadastro)
  - título 14.5/500 (truncate) + linha 2: “{tipo} · {contexto}” 13px `#6b655c` (truncate)
  - meta à direita 13px na cor do grupo (ex.: “venceu 1 out”, “hoje”, “qui, 8 out”, “há +7 dias”)
  - ação: link bronze “Abrir tarefa ›”, “Registrar contato ›”, “Ver projeto ›”, “Ver no funil ›”, “Completar ›”.
- Ordenação: por grupo, depois por atraso desc.
- Dados de exemplo usados:
  - Atrasado: “Levantamento fotográfico e legislação” (Tarefa · CASA S.A. · Levantamento · venceu 1 out) · “Programa de necessidades” (Tarefa · APTO B.F. · Briefing de interiores · venceu ontem) · “Patrícia Lemos” (Retorno · Primeiro contato · Pinhais · 140 m² · desde 1 out) · “Thiago Moreira” (Retorno · Proposta enviada · R$ 18.500 · desde 2 out)
  - Hoje: “Clínica Sorriso Pleno” (Retorno · Reunião agendada · Araucária · R$ 32.000)
  - Nesta semana: “CASA J.D. · entrega em 5 dias” (Prazo · 4 tarefas abertas em Projeto Executivo · qui, 8 out) · “2 leads parados em Novo lead” (Comercial · Mariana Duarte (10 dias) · Felipe Andrade (9 dias)) · “Gabriela Nunes aguarda cadastro” (Comercial · Oportunidade fechada · completar dados para virar cliente)
- Regras: “lead parado” = dias na mesma etapa > configuração “Lead parado (dias)”; “a vencer” = configuração “Alerta ‘a vencer’ (dias)”.
- Vazio: EmptyState “Nada atrasado”.

**B) Hoje** (coluna direita, 300px, sem caixa)
- Título “Hoje” + link “Agenda” 13px `#8a8379`.
- Itens com `grid-cols-[44px_1fr] gap-12`, padding 12px 0, `border-top 1px #e6e2dc`. Coluna 1: horário JetBrains Mono 12 (passado `#b3aca2`) ou “hoje” 12px `#7d5b1a`. Item passado: texto `#8a8379`.
- Subtítulo “Próximos dias” 12.5 `#8a8379` (padding 24/8), depois 5 itens: coluna 1 “dom 4” 12px `#8a8379` capitalize; título 13.5 truncate; linha 2: horário mono 11.5 + contexto 12.5 (prazo de projeto em `#7d5b1a`).
- Rodapé: “Google Agenda · Conectar” (Conectar em `#5f513f`/500) quando não conectado — substitui o card vazio antigo.

### Linha 2 — Visão geral (sem caixa)
- Rótulo “Visão geral” 12.5 `#8a8379`.
- `grid-cols-6 gap-8`, `border-top 1px #e6e2dc`, padding-top 20. Cada item: rótulo 12.5 `#8a8379` + número metric 32/36 Inter Tight 400 tabular.
- Itens: Projetos ativos 4 · Prazo vencido 0 · Vencem em 7 dias 1 (`#7d5b1a`) · Tarefas atrasadas 2 (`#8c3b27`) · Oportunidades abertas 9 · Conversão · 90 dias 71%. Cor só se valor > 0 nos indicadores de risco.

### Linha 3 — `grid-cols-[1fr_300px] gap-16`
**Projetos** (esquerda): título + “Ver todos”. Linhas `grid-cols-[180px_1fr_44px_130px_56px] gap-24`, padding 16px 0, `border-top #e6e2dc`:
- nome Inter Tight 14.5/600 tracking .01em + cliente 12.5 `#8a8379`
- **trilho de etapas**: 6 segmentos flex gap 3, altura 2px — concluídas `#34312d`, atual `#8f7c61`, futuras `#dcd8d1`; abaixo nome da etapa 12.5 `#6b655c`. Etapas: Levantamento, Estudo Preliminar, Anteprojeto, Projeto Legal, Projeto Executivo, Entrega (usar as etapas do tipo de projeto).
- % 13px `#6b655c` à direita
- prazo: 13px — `#7d5b1a` se na janela (“em 5 dias”), senão `#4f4a44` (data “21 out”); linha 2 12px `#8a8379` (“qui, 8 out” / “18 dias”)
- avatares 22px sobrepostos (anel 2px `#f7f6f3`)
- Ordenação por urgência (prazo mais próximo / tarefas atrasadas primeiro). Exemplos: CASA J.D. (João Dias, Projeto Executivo 5/6, 68%, em 5 dias, AR+BC) · CASA S.A. (Sofia Almeida, Levantamento, 0%, 11 jan) · APTO B.F. (Beatriz Fontana, Entrega, 87%, 21 out) · CASA L.M. (Lucas Martins, Anteprojeto, 26%, 23 fev).

**Funil** (direita): título + “Abrir”. `border-top #e6e2dc` pt 16: “R$ 286.500” metric 32 + “em 9 oportunidades abertas” 12.5 `#8a8379`. Barra empilhada h 4, radius 2, gap 2, flex por quantidade, cores bronze da escala. Lista: etapa 13px `#4f4a44` · quantidade tabular · valor 12.5 `#8a8379` (Novo lead 2 sem proposta · Primeiro contato 2 R$ 68.000 · Reunião agendada 2 R$ 87.000 · Proposta enviada 2 R$ 90.500 · Negociação 1 R$ 41.000). Rodapé “90 dias · 71% de conversão”.

### Linha 4 — Equipe esta semana
Título + “de 40h” à direita. `grid-cols-4 gap-8`, border-top, pt 20. Cada pessoa: avatar 24 + nome 13.5 + horas 13 `#6b655c` à direita; barra h 2 (trilho `#e6e2dc`, preenchimento `#8f7c61` = horas/40h); “15 abertas · 1 atrasada” 12px `#8a8379` (atrasada em `#8c3b27`).

### Removido do Início (em relação ao atual)
- Cards de KPI individuais com ícone → linha “Visão geral”.
- Card vazio “Google Agenda” → linha “Conectar”.
- “Projetos por etapa” → trilho de etapas em cada projeto.
- “Como os clientes chegam” → mover para **Relatórios**.
- “Atividade recente” → sai do Início (fica em Projeto/Atividade).
- Banner “1 oportunidade fechada aguarda cadastro” → item da fila.

---

## Tela: Início — Mobile (390px)
- Fundo canvas `#f7f6f3`. Padding lateral 20.
- **App bar** 52px: wordmark à esquerda; Search e Bell (alvos 44×44) à direita.
- Saudação: data 13 `#8a8379`; “Boa tarde, Matheus.” Inter Tight 30/36 500; resumo 14.5/21.
- **Cronômetro**: barra h 44, radius 12, bg branco + contorno 1px `#ebe7e1`; ponto pulsante, tempo mono 13, tarefa truncada, botão parar 36×36 radius 9 `#f3f1ed`. Ao rolar, recolhe para texto no app bar compacto (48px, título “Início”).
- Tabs de texto 14px (Tudo 8 · Tarefas 2 · Comercial 5 · Projetos), sublinhado 1px, linha inferior `#e6e2dc`, alvos com padding 10px 0.
- **Fila** em superfície branca radius 16: grupos como no desktop; linhas min-height 64, padding 10/18, ponto 6px, título 15/500, contexto 13 `#8a8379`, meta 13 à direita. Retorno de hoje tem botão Phone 44×44 (ligar).
- **Swipe para a esquerda** revela 2 ações de 72px: “Adiar” (bg `#f3f1ed`, AlarmClock) e “Concluir” (bg ink, branco, Check). Implementar com gesto (ex.: framer-motion / react-swipeable) e alternativa acessível via menu “…”.
- Ao rolar: “Visão geral” em grade 2×2 sem cards (border-top `#e6e2dc`, rótulo 12.5, número Inter Tight 28/34 400): Tarefas atrasadas 2 (danger) · Vencem em 7 dias 1 (warning) · Projetos ativos 4 · Conversão 90d 71%. Depois “Próximos dias” e “Projetos” como listas no canvas (linhas ≥ 56px, trilho de etapas 2px).
- **Navegação inferior** (substitui a sidebar no mobile): bg `rgba(247,246,243,.94)` + blur 12, border-top `#ebe7e1`, padding `6px 8px 26px` (safe-area). 5 itens h 52: Início · Oportunidades · **+** (círculo 48 ink, abre menu Criar: Tarefa / Oportunidade / Reunião / Lançar horas) · Tarefas (→ Minhas tarefas) · Mais (abre folha com Clientes, Projetos, Agenda, Relatórios, Equipe, Configurações). Ícones 22, rótulos 10.5; ativo ink/500, inativo `#8a8379`.
- Breakpoint: usar layout mobile abaixo de `md` (768px); entre 768–1279px sidebar pode recolher para ícones.

---

## Interações e comportamento
- Hover de linha: bg `subtle`, transição 120ms.
- Clique na linha da fila abre o item (gaveta da tarefa, gaveta do lead, ou página do projeto); o link de ação executa a ação direta (ex.: “Registrar contato” abre modal de contato com data do próximo retorno).
- Tabs da fila filtram client-side por categoria (tarefa / comercial / projeto).
- Cronômetro: estado global (contexto/store), tick por segundo, persistir início no servidor/localStorage para sobreviver a reload; parar = lança horas na tarefa.
- ⌘K / Ctrl+K abre paleta de comandos.
- Carregando: skeletons nas listas (sem spinners de página inteira).
- Acessibilidade: contraste AA (valores acima já verificados), `:focus-visible` com anel bronze, alvos ≥ 40px no mobile (usados 44–52), `aria-label` em botões só-ícone, `prefers-reduced-motion` desliga o pulso do cronômetro e o giro do card arrastado.

## Estado / dados necessários para o Início
- `attentionItems`: derivado de tarefas (prazo < hoje e não concluídas; prazo = hoje), leads (retorno ≤ hoje; dias na etapa > limite), projetos (prazo ≤ hoje + janela), oportunidades fechadas sem cadastro de cliente. Cada item: `{ id, kind: 'task'|'followup'|'deadline'|'stale_leads'|'pending_client', group: 'overdue'|'today'|'week', title, context, meta, assigneeId, href, action }`.
- `todayEvents` e `upcomingEvents` (5 próximos): reuniões, retornos, entregas de projeto, tarefas avulsas com horário.
- `kpis`: projetos ativos, prazo vencido, vencem em 7 dias, tarefas atrasadas, oportunidades abertas, conversão 90d.
- `projects` ativos com etapa atual (índice/total), %, prazo, equipe.
- `funnel`: contagem e soma de valor por etapa aberta; ganhos/perdidos em 90 dias.
- `teamLoad`: horas na semana, abertas, atrasadas por pessoa.
- `timer`: `{ running, startedAt, taskId, projectId }`.
- Configurações usadas: `alertDueDays` (padrão 7), `staleLeadDays` (padrão 7).

## Assets
- Ícones: **Lucide** (stroke 1.6), ex.: LayoutGrid, FolderKanban, Contact, Building2, ListChecks, CalendarDays, ChartColumn, Users, Settings, Search, Sparkles, Bell, Plus, Clock, TriangleAlert, Phone, Check, CircleCheck, ChevronRight, ChevronDown, Square, Play, Pause, Ellipsis, Hourglass, UserCheck, Menu, Flag, CalendarClock, AlarmClock.
- Fontes: Google Fonts — Inter, Inter Tight, JetBrains Mono.
- Logo: o logo enviado pelo escritório (Configurações) substitui o wordmark no menu, login e aba.
- Nenhuma imagem/ilustração nova.

## Arquivos deste pacote
- `README.md` — este documento.
- `tokens.css` — variáveis CSS (claro e `.dark`).
- `tailwind.config.js` — extensão de tema pronta para mesclar.
- `referencia/AIROS Redesign - Entrega 1 v2.dc.html` — **referência vigente** (diagnóstico, design system, Início desktop/mobile v2, tokens). Abrir no navegador.
- `referencia/AIROS Redesign - Entrega 1 (v1).dc.html` — versão anterior do Início (histórico).
- `referencia/support.js` — runtime necessário para abrir os HTMLs.
