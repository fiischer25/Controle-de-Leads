-- AIROS · Status de tarefa "Reunião agendada"
-- Para marcar que a tarefa do projeto já tem reunião marcada com o cliente (apresentação,
-- aprovação…). Conta como tarefa em andamento.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'doing', 'meeting', 'review', 'paused', 'done'));

-- Marca para o diagnóstico do banco (Configurações → Banco de dados).
create or replace function public.airos_task_status_meeting()
returns integer
language sql
stable
as $$ select 1 $$;

grant execute on function public.airos_task_status_meeting() to authenticated;

notify pgrst, 'reload schema';
