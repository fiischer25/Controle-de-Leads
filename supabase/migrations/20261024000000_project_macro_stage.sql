-- AIROS · Etapa macro na lista de projetos
-- A coluna Status da lista de projetos mostra a etapa macro (ex.: "LD - Levantamento de Dados"
-- ou "Reunião com cliente"), escolhida à mão na própria lista. Vazio = automático: a etapa
-- atual pelas tarefas. O status interno do projeto (Em andamento, Pausado, Obra...) não muda.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.projects add column if not exists macro_stage text;

notify pgrst, 'reload schema';
