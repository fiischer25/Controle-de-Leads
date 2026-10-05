# AIROS · Gestão de Leads e Projetos

Sistema interno da **AIROS Arquitetura** para controlar tudo o que entra e sai do escritório:
oportunidades (leads), clientes, projetos, prazos, tarefas da equipe e horas trabalhadas, com
uma **visão 360°** no painel inicial. Não possui módulo financeiro.

## Funcionalidades

**Acesso e equipe**
- Login com e-mail e senha. No primeiro acesso, cria-se a conta de **administrador**.
- O administrador cadastra os membros (nome, cargo, cor, nível de acesso), redefine senhas e
  desativa quem sai do escritório. Cada membro pode editar o próprio perfil e trocar a senha.
- **Acessos por módulo:** no cadastro do membro, o administrador marca o que ele pode ver e usar:
  *Projetos e tarefas* (lista e detalhe dos projetos, tarefas da equipe), *Oportunidades e clientes*,
  *Relatórios*, *Equipe*, *Configurações* e *Financeiro* (este desmarcado por padrão). O **Meu painel** (com a agenda) e as tarefas da
  própria pessoa ficam sempre disponíveis. Administradores têm acesso a tudo; exclusões críticas e
  o backup continuam exclusivos deles. O banco aplica as mesmas regras (RLS), e o assistente também.

**Oportunidades (funil comercial)**
- Cadastro do lead: nome, telefone, e-mail, cidade/UF do projeto, tamanho (m²), categoria,
  tipo de projeto, origem (tráfego pago, indicação, Instagram…), quem indicou, valor da proposta,
  responsável, próximo contato e previsão de fechamento.
- **Kanban com arrastar e soltar** entre as etapas (configuráveis), e visão em lista. Funil padrão de
  CRM: Novo lead → Em contato → Qualificado → Reunião agendada → Proposta em elaboração → Proposta
  enviada → Negociação → Ganho / Perdido.
- Origens padrão: Instagram e Facebook (orgânico), Meta Ads, Google Ads, Google (busca orgânica),
  Google Meu Negócio, site/formulário, WhatsApp, indicação de cliente, indicação de parceiro,
  cliente recorrente, prospecção ativa, eventos e feiras, portais e marketplaces e outros.
- Histórico de contatos (ligação, WhatsApp, reunião, visita…), lembrete de retorno, alerta de
  lead parado, motivo de perda, atalhos para WhatsApp/e-mail e exportação CSV.
- **Fechamento com forma de pagamento:** ao marcar o lead como ganho (botão *Ganho*, etapa ou
  arrastando no kanban), informa-se o valor fechado e as parcelas combinadas — 30% · 40% · 30%,
  50% · 50%, à vista, mensal ou personalizado, com as datas. As parcelas entram sozinhas em
  **contas a receber** do Financeiro (categoria honorários), mesmo quando quem fecha só tem o módulo
  Comercial, e passam para o projeto quando o lead vira cliente. Editar depois não duplica.
- **Virar cliente**: disponível quando o lead está “Ganho”, e só conclui com **todos os dados do
  cliente** (CPF/CNPJ validado, e-mail, telefone, endereço completo — CEP preenche o endereço).

**Projetos**
- A conversão cria o cliente e o projeto (ex.: `CASA J.D.`) do tipo escolhido — Arquitetura,
  Interiores, Arquitetura e Interiores… — já com **todas as tarefas do modelo** daquele tipo, sem
  datas: o início e o fim de cada tarefa são definidos no projeto.
- Lista de projetos com status, cliente, pessoas à frente, etapa atual, progresso e prazo
  (vencidos / a vencer), em cards ou tabela, com filtros e exportação.
- Tela do projeto: tarefas em tabela por etapa (nº, checklist, status, início e fim — clique para
  escolher a data —, duração em dias úteis calculada pelas datas e editável (recalcula o fim), horas estimadas e realizadas, responsável, prioridade), **cronograma (Gantt)**, equipe e horas por pessoa,
  dados do cliente, links (Drive, pranchas…), anotações e histórico de atividades.
- **Usar como modelo:** as tarefas de um projeto (etapas, ordem, checklist, observações, prioridade,
  horas; sem datas) viram as tarefas-modelo de um tipo existente ou
  de um tipo novo; depois é só ajustar em Configurações. Projetos já criados não mudam.

**Tarefas**
- Cada tarefa tem responsável, data de início e fim, status, prioridade, estimativa, checklist e
  comentários.
- **Cronômetro** (iniciar/parar) e lançamento manual de horas: o tempo que cada pessoa está à frente
  da tarefa fica registrado.
- Qualquer usuário pode **designar uma tarefa** a outro (avulsa ou dentro de um projeto) — ela
  aparece em “Minhas tarefas” da pessoa e gera notificação.
- “Minhas tarefas” agrupa atrasadas, hoje, próximos 7 dias…; também em quadro kanban.

**Telas iniciais**
- **Meu painel** (tela inicial de cada pessoa): minhas tarefas atrasadas, de hoje e dos próximos 7 dias,
  meus projetos com prazos (vencidos e a vencer), retornos de leads, minhas horas na semana e a
  minha agenda (hoje, próximos dias e o calendário filtrado em mim).
- **Dashboard do escritório** (só administradores, tela inicial deles): andamento de todos os
  projetos, gráficos por etapa, tarefas por status e entregas previstas, comercial (funil com valores,
  retornos pendentes da equipe, novos leads, conversão, leads parados), carga da equipe e a agenda
  do escritório. O administrador também tem o próprio **Meu painel** no menu.
- **Pede sua atenção** (em *Minhas tarefas*): fila única com o que está atrasado, vence hoje ou pede
  ação nesta semana, com ação direta em cada linha.
- No celular: navegação inferior com botão **+** (tarefa, reunião, projeto, oportunidade, lançar
  horas) e arrastar a linha para a esquerda para **Adiar** ou **Concluir**.

**Financeiro** (administradores e quem tiver o módulo *Financeiro*)
- **Visão geral:** saldo em contas e previsto para o fim do mês, recebido e pago no mês, resultado,
  vencidos a receber e a pagar, próximos vencimentos com "Receber/Pagar" na linha, entradas e saídas
  dos últimos 12 meses e despesas do mês por categoria.
- **Lançamentos:** contas a receber e a pagar e transferências, por mês, com filtros (situação, conta,
  categoria, projeto), busca e exportação CSV. Despesas fixas que se repetem todo mês e compras
  parceladas; editar ou excluir também as próximas parcelas.
- **Contas:** banco, caixa, cartão e investimento, com saldo inicial e saldo atual de cada uma.
- **Honorários por projeto:** aba *Financeiro* no projeto com o plano de parcelas (30% · 40% · 30%,
  50/50, à vista ou mensal; percentuais e datas editáveis), despesas do projeto e resultado.
- **Rentabilidade:** honorários − despesas do projeto − custo das horas da equipe (custo/hora de cada
  pessoa, visível só no Financeiro), com margem por projeto.
- **Categorias** de receitas e despesas editáveis. Os números principais aparecem também no dashboard
  do escritório.
- **Importar extrato** (OFX ou CSV do internet banking): dá baixa nos lançamentos em aberto com o
  mesmo valor e vencimento próximo, lança o restante já pago com a categoria sugerida pelo histórico e
  ignora o que já foi importado na conta.
- **Comprovantes e notas** (PDF, imagem ou XML da NF-e, até 10 MB) anexados a cada lançamento, guardados
  em armazenamento privado do Supabase.
- **Relatório mensal em PDF** (botão *Relatório*): resumo de caixa, saldos por conta, receitas e
  despesas por categoria, recebido por projeto, a receber e a pagar em aberto e lançamentos do mês.

**Resumo diário no WhatsApp**
- No horário escolhido (Configurações → **Resumo diário**), cada pessoa com telefone recebe uma
  mensagem só quando há algo a avisar: tarefas atrasadas, que vencem hoje e amanhã, prazos dos
  projetos em que está e retornos de leads do dia. Administradores recebem também os números do
  escritório. Cada pessoa pode desligar em **Meu perfil**.
- Quem falou com o número nas últimas 24 horas recebe a lista completa; os demais recebem o modelo
  aprovado pela Meta com o resumo em uma linha (regra do WhatsApp Business) e podem responder pedindo
  os detalhes ao assistente.
- Publicação: migração `20261005000000_whatsapp_alerts.sql`, modelo `resumo_diario` na Meta, segredo
  `ALERTS_CRON_SECRET`, função `whatsapp-alerts` (arquivo único) e um agendamento de hora em hora em
  *Integrations → Cron*. O passo a passo está na própria tela de configurações.

**Assistente no WhatsApp (e dentro do sistema)**
- A equipe conversa com o número do escritório no WhatsApp — ou pelo botão **Assistente** no topo — em
  linguagem natural: “agenda reunião amanhã 14h com a Ana”, “passa pro Bruno revisar a marcenaria até
  sexta”, “concluí o levantamento métrico”, “lança 1h30 na modelagem 3D”, “o que tenho essa semana?”.
- Ele cria e designa tarefas, conclui, remarca, troca responsável, comenta, lança horas, consulta a agenda,
  agenda/remarca/cancela reuniões, busca clientes e projetos e cadastra oportunidades.
- Reconhece cada pessoa pelo telefone do cadastro e age com as permissões dela. Mensagens de quem não é da
  equipe (clientes) são ignoradas, sem resposta nem confirmação de leitura, então dá para usar o número do
  escritório junto com o WhatsApp Business app. Usa o modelo Claude (Anthropic).

**Reuniões e identidade visual**
- Reuniões na Agenda com participantes (notificados), local/link, vínculo com projeto ou oportunidade,
  link “adicionar ao Google Agenda” e sincronização automática opcional com a agenda do escritório.
- Logo do escritório em **Configurações → Escritório e logo**: substitui o nome no menu, no login e na aba.

**Mais**
- Agenda mensal (na tela inicial) com reuniões, entregas, inícios, prazos de tarefas e retornos de leads
  + Google Agenda.
- Relatórios: conversão por origem, motivos de perda, tempo médio de fechamento, entregas no
  prazo, horas por pessoa/projeto/tipo, horas por m² e exportação de horas (timesheet).
- Busca global (**Ctrl + K**), notificações, atualização em tempo real entre usuários,
  backup em JSON, layout responsivo (celular) e **modo escuro** (menu da conta → Tema).

**Configurações (administrador ou quem tiver o módulo)**
- Tipos de projeto e suas **tarefas-modelo**, em tabela por etapas: nº, horas estimadas, quem fica à
  frente, prioridade, **checklist** e **observações** de cada tarefa (copiados para cada novo projeto) e
  etapas que se renomeiam e reordenam. Sem datas nem duração: isso é definido em cada projeto.
- Modelo **Arquitetura e Interiores** do escritório: LD - Levantamento de Dados, EP - Estudo
  Preliminar, C3D - Concepção 3D, PI - Projeto de Interiores, PL - Projeto Legal, PCE - Projetos
  Complementares Engenharia, CO - Compatibilização, PE - Projeto Executivo, PEI - Projeto Executivo
  de Interiores e VL - Visita em Lojas (23 tarefas com checklist; migração `20261010000000_arq_int_templates.sql`).
- Etapas do funil, origens de leads, Google Agenda do escritório, dias de alerta de prazo e prefixo
  dos códigos.

---

## Rodando localmente

```bash
npm install
npm run dev
```

Sem configurar nada, o sistema abre em **modo demonstração**: os dados ficam salvos apenas no
navegador (ótimo para conhecer o sistema — marque “carregar dados de exemplo” no primeiro acesso).
Para uso real pela equipe, configure o Supabase.

## Colocando em produção (Supabase + hospedagem)

1. **Crie um projeto** gratuito em [supabase.com](https://supabase.com).
2. **Banco de dados:** abra *SQL Editor* e execute, nesta ordem, o conteúdo de
   `supabase/migrations/20260929000000_airos_schema.sql`,
   `supabase/migrations/20260930000000_meetings_logo_agent.sql`,
   `supabase/migrations/20261004000000_module_permissions.sql`,
   `supabase/migrations/20261005000000_whatsapp_alerts.sql`,
   `supabase/migrations/20261006000000_finance.sql`,
   `supabase/migrations/20261007000000_finance_import_files.sql`,
   `supabase/migrations/20261008000000_task_templates_details.sql`,
   `supabase/migrations/20261009000000_lead_payment_plan.sql`,
   `supabase/migrations/20261010000000_arq_int_templates.sql` e
   `supabase/migrations/20261011000000_crm_defaults.sql`
   (ou use `supabase db push` com a CLI). Quem já usa o sistema executa só os arquivos novos
   (podem rodar mais de uma vez sem problema).
3. **Função de administração da equipe** (permite ao admin cadastrar membros):
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase functions deploy admin-users
   ```
4. **Autenticação:** em *Authentication → Providers → Email*, desative **“Confirm email”**
   (os membros são criados pelo administrador) e, depois de criar o admin, você pode desativar
   **“Allow new users to sign up”**. Mesmo se ficar ligado, cadastros públicos entram
   desativados e não enxergam nenhum dado.
5. **Variáveis de ambiente:** copie `.env.example` para `.env` e preencha com
   *Project Settings → API* (`Project URL` e `anon public key`).
6. **Hospedagem:** publique na Vercel ou Netlify (build `npm run build`, pasta `dist`), definindo as
   mesmas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Os arquivos `vercel.json` e
   `public/_redirects` já tratam as rotas.
7. Abra o sistema: a primeira conta criada vira **administrador**. Em seguida, cadastre a equipe em
   **Equipe → Novo membro** e revise **Configurações → Tipos de projeto e tarefas**.

### Assistente no WhatsApp
O passo a passo completo está no próprio sistema, em **Configurações → Assistente**. Resumo:

1. Crie uma chave em [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. No [Meta for Developers](https://developers.facebook.com/apps), crie um app *Business* com o produto
   **WhatsApp**, cadastre o número do escritório, gere um token permanente e copie o *App secret*.
3. Guarde os segredos e publique as funções:
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=... WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
     WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=uma-frase-secreta APP_URL=https://seu-sistema.vercel.app
   npx supabase functions deploy whatsapp-agent --no-verify-jwt
   npx supabase functions deploy agent-chat
   npx supabase functions deploy calendar-sync
   ```
4. No painel da Meta, configure o webhook para
   `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-agent` com o mesmo token de verificação e assine
   o campo **messages**.
5. Cadastre o telefone (WhatsApp) de cada membro em **Equipe**.

Observações:
- O custo é por uso: a API da Anthropic cobra por mensagem processada e a Meta cobra pelas conversas do
  WhatsApp Business conforme a tabela dela.
- Avisos enviados pelo assistente a outra pessoa (“o Bruno recebeu uma tarefa”) só chegam pelo WhatsApp se
  essa pessoa tiver falado com o número do escritório nas últimas 24 h (regra da Meta); a notificação dentro
  do sistema sempre é criada.
- Variáveis opcionais: `AGENT_TIMEZONE` (padrão `America/Sao_Paulo`) e `AGENT_EFFORT` (`low`, padrão;
  `medium` ou `high` para raciocínio mais cuidadoso, com respostas mais lentas).

**Google Agenda automático (opcional):** crie uma conta de serviço no Google Cloud com a Google Calendar API
ativada, compartilhe a agenda do escritório com o e-mail da conta de serviço (“Fazer alterações nos eventos”)
e guarde `GOOGLE_SERVICE_ACCOUNT_JSON` (o JSON da chave) e `GOOGLE_CALENDAR_ID` como segredos. Reuniões
criadas no sistema ou pelo assistente passam a aparecer no Google Agenda do escritório.

### Google Agenda
Em **Configurações → Google Agenda**, cole o *código de incorporação* da agenda do escritório
(Google Agenda → Configurações → sua agenda → Integrar agenda). Para que os eventos apareçam,
compartilhe essa agenda com as contas Google da equipe. Cada membro também pode exibir a própria
agenda em **Meu perfil**.

### Segurança
- Todas as tabelas usam *Row Level Security*: só membros ativos acessam dados; oportunidades,
  clientes, edição de projetos, configurações e todo o Financeiro seguem os módulos de cada pessoa; somente
  administradores excluem leads/clientes/projetos e gerenciam a equipe e os acessos.
- A chave de serviço do Supabase fica apenas na Edge Function, nunca no navegador.

## Design system
Tokens de cor (claro e escuro), tipografia, raios e sombras ficam em `src/styles/tokens.css`,
`src/styles/theme.css` e `tailwind.config.js`; o mapa semântico de status (atrasado, a vencer, em
andamento, concluído, funil, prioridade e avatares) fica em `src/lib/status.ts`. A especificação
original está em `design_handoff_airos_inicio/`. Regra-mãe: só ganha cor o que pede ação.

## Tecnologias

React 18 + TypeScript + Vite, Tailwind CSS, lucide-react, React Router e Supabase
(Postgres, Auth, Realtime e Edge Functions em Deno). O assistente usa a API do Claude (Anthropic) e a
WhatsApp Business Cloud API (Meta).

```bash
npm run typecheck   # checagem de tipos
npm run lint        # lint
npm run build       # build de produção
cd supabase/functions && deno test --allow-env   # testes do assistente (requer Deno)
```
