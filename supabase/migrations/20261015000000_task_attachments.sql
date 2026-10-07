-- AIROS · Arquivos nas tarefas
-- - attachments: PDFs e outros arquivos anexados a cada tarefa (contrato, planta, orçamento...);
-- - bucket privado "task-files" no Storage, acessível a quem é membro ativo da equipe.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Arquivos (até 15 MB cada)
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists airos_task_files_select on storage.objects;
drop policy if exists airos_task_files_insert on storage.objects;
drop policy if exists airos_task_files_update on storage.objects;
drop policy if exists airos_task_files_delete on storage.objects;
create policy airos_task_files_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.is_member());
create policy airos_task_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_member());
create policy airos_task_files_update on storage.objects for update to authenticated
  using (bucket_id = 'task-files' and public.is_member())
  with check (bucket_id = 'task-files' and public.is_member());
create policy airos_task_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and public.is_member());

notify pgrst, 'reload schema';
