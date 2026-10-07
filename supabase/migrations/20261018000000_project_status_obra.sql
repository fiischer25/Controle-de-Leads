-- AIROS · Status "Obra" e status definido à mão
-- - status 'obra': projeto entregue que segue acompanhando a obra (o "Finalizado" continua
--   sendo 'concluido');
-- - status_manual: o status foi escolhido à mão e as tarefas não o mudam mais; falso = o
--   sistema muda sozinho entre "Não iniciado" e "Em andamento" conforme as tarefas.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('nao_iniciado', 'em_andamento', 'obra', 'pausado', 'concluido', 'cancelado'));

alter table public.projects add column if not exists status_manual boolean not null default false;

notify pgrst, 'reload schema';
