# AIROS · Gestão de Leads e Projetos

Sistema interno da **AIROS Arquitetura** para controlar tudo o que entra e sai do escritório:
oportunidades (leads), clientes, projetos, prazos, tarefas da equipe e horas trabalhadas, com
uma **visão 360°** no painel inicial. Não possui módulo financeiro.

## Funcionalidades

**Acesso e equipe**
- Login com e-mail e senha. No primeiro acesso, cria-se a conta de **administrador**.
- O administrador cadastra os membros (nome, cargo, cor, nível de acesso), redefine senhas e
  desativa quem sai do escritório. Cada membro pode editar o próprio perfil e trocar a senha.
- Membros veem tudo do escritório; configurações e exclusões críticas são exclusivas do admin.

**Oportunidades (funil comercial)**
- Cadastro do lead: nome, telefone, e-mail, cidade/UF do projeto, tamanho (m²), categoria,
  tipo de projeto, origem (tráfego pago, indicação, Instagram…), quem indicou, valor da proposta,
  responsável, próximo contato e previsão de fechamento.
- **Kanban com arrastar e soltar** entre as etapas (configuráveis), e visão em lista.
- Histórico de contatos (ligação, WhatsApp, reunião, visita…), lembrete de retorno, alerta de
  lead parado, motivo de perda, atalhos para WhatsApp/e-mail e exportação CSV.
- **Virar cliente**: disponível quando o lead está “Fechado”, e só conclui com **todos os dados do
  cliente** (CPF/CNPJ validado, e-mail, telefone, endereço completo — CEP preenche o endereço).

**Projetos**
- A conversão cria o cliente e o projeto (ex.: `CASA J.D.`) do tipo escolhido — Arquitetura,
  Interiores, Arquitetura e Interiores… — já com **todas as tarefas do modelo** daquele tipo,
  agendadas em sequência (dias úteis) a partir da data de início.
- Lista de projetos com status, cliente, pessoas à frente, etapa atual, progresso e prazo
  (vencidos / a vencer), em cards ou tabela, com filtros e exportação.
- Tela do projeto: tarefas agrupadas por etapa, **cronograma (Gantt)**, equipe e horas por pessoa,
  dados do cliente, links (Drive, pranchas…), anotações e histórico de atividades.

**Tarefas**
- Cada tarefa tem responsável, data de início e fim, status, prioridade, estimativa, checklist e
  comentários.
- **Cronômetro** (iniciar/parar) e lançamento manual de horas: o tempo que cada pessoa está à frente
  da tarefa fica registrado.
- Qualquer usuário pode **designar uma tarefa** a outro (avulsa ou dentro de um projeto) — ela
  aparece em “Minhas tarefas” da pessoa e gera notificação.
- “Minhas tarefas” agrupa atrasadas, hoje, próximos 7 dias…; também em quadro kanban.

**Painel inicial (visão 360°)**
- Projetos ativos, vencidos e a vencer; tarefas atrasadas; oportunidades abertas; conversão.
- Projetos por etapa, prazos críticos, **Google Agenda espelhado**, minhas tarefas, próximos
  14 dias, funil, origem dos clientes, carga da equipe e atividade recente.

**Mais**
- Agenda mensal com entregas, inícios, prazos de tarefas e retornos de leads + Google Agenda.
- Relatórios: conversão por origem, motivos de perda, tempo médio de fechamento, entregas no
  prazo, horas por pessoa/projeto/tipo, horas por m² e exportação de horas (timesheet).
- Busca global (**Ctrl + K**), notificações, atualização em tempo real entre usuários,
  backup em JSON, layout responsivo (celular).

**Configurações (administrador)**
- Tipos de projeto e suas **tarefas-modelo** (etapa, nome, duração em dias), etapas do funil,
  origens de leads, Google Agenda do escritório, dias de alerta de prazo e prefixo dos códigos.

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
2. **Banco de dados:** abra *SQL Editor*, cole o conteúdo de
   `supabase/migrations/20260929000000_airos_schema.sql` e execute
   (ou use `supabase db push` com a CLI).
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

### Google Agenda
Em **Configurações → Google Agenda**, cole o *código de incorporação* da agenda do escritório
(Google Agenda → Configurações → sua agenda → Integrar agenda). Para que os eventos apareçam,
compartilhe essa agenda com as contas Google da equipe. Cada membro também pode exibir a própria
agenda em **Meu perfil**.

### Segurança
- Todas as tabelas usam *Row Level Security*: só membros ativos acessam dados; somente
  administradores alteram configurações, excluem leads/clientes/projetos e gerenciam a equipe.
- A chave de serviço do Supabase fica apenas na Edge Function, nunca no navegador.

## Tecnologias

React 18 + TypeScript + Vite, Tailwind CSS, lucide-react, React Router e Supabase
(Postgres, Auth, Realtime e Edge Functions).

```bash
npm run typecheck   # checagem de tipos
npm run lint        # lint
npm run build       # build de produção
```
