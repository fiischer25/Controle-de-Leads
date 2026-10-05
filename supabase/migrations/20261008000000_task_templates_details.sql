-- AIROS · Tarefas-modelo completas
-- Cada tarefa-modelo (Configurações → Tipos de projeto e tarefas) passa a ter:
--   checklist             itens copiados para a tarefa de cada novo projeto
--   assignee_id           quem fica à frente (vazio = responsável do projeto)
--   priority              prioridade inicial
--   estimated_hours       horas estimadas
--   start_with_previous   começa no mesmo dia da tarefa anterior (tarefas em paralelo)
-- As observações continuam na coluna description.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.task_templates add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.task_templates add column if not exists assignee_id uuid references public.profiles (id) on delete set null;
alter table public.task_templates add column if not exists priority text not null default 'media';
alter table public.task_templates add column if not exists estimated_hours numeric(6, 1);
alter table public.task_templates add column if not exists start_with_previous boolean not null default false;

alter table public.task_templates drop constraint if exists task_templates_priority_check;
alter table public.task_templates add constraint task_templates_priority_check
  check (priority in ('baixa', 'media', 'alta', 'urgente'));

alter table public.task_templates drop constraint if exists task_templates_estimated_hours_check;
alter table public.task_templates add constraint task_templates_estimated_hours_check
  check (estimated_hours is null or estimated_hours >= 0);
