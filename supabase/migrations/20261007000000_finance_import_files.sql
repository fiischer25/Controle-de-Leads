-- AIROS · Financeiro: importação de extrato e comprovantes
-- - bank_ref: identificador da transação no extrato do banco (OFX/CSV), para a mesma linha
--   nunca ser importada duas vezes na mesma conta;
-- - attachments: comprovantes, boletos e notas fiscais anexados a cada lançamento;
-- - bucket privado "finance-docs" no Storage, acessível só a quem tem o módulo Financeiro.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.finance_entries add column if not exists bank_ref text;
alter table public.finance_entries add column if not exists attachments jsonb not null default '[]'::jsonb;

create unique index if not exists finance_entries_bank_ref_idx
  on public.finance_entries (account_id, bank_ref)
  where bank_ref is not null;

-- Arquivos (até 10 MB cada)
insert into storage.buckets (id, name, public, file_size_limit)
values ('finance-docs', 'finance-docs', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists airos_finance_docs_select on storage.objects;
drop policy if exists airos_finance_docs_insert on storage.objects;
drop policy if exists airos_finance_docs_update on storage.objects;
drop policy if exists airos_finance_docs_delete on storage.objects;
create policy airos_finance_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and public.has_module('financeiro'));
create policy airos_finance_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and public.has_module('financeiro'));
create policy airos_finance_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'finance-docs' and public.has_module('financeiro'))
  with check (bucket_id = 'finance-docs' and public.has_module('financeiro'));
create policy airos_finance_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'finance-docs' and public.has_module('financeiro'));
