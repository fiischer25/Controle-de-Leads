-- AIROS · Reparo das permissões do Financeiro
-- O administrador tem acesso a tudo. Recria a função de acesso por módulo e as regras (RLS) das
-- tabelas do Financeiro, e cria airos_my_access(), que mostra o que o banco enxerga do usuário
-- logado (usada em Configurações → Banco de dados). Não apaga dados. Pode rodar mais de uma vez.
-- Cole tudo até "FIM" no SQL Editor do Supabase → Run (se perguntar sobre RLS: Run without RLS).

create or replace function public.has_module(module text)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and coalesce(active, true)
      and (lower(role) = 'admin' or module = any(coalesce(permissions, '{}'::text[])))
  );
$fn$;
grant execute on function public.has_module(text) to authenticated;

alter table public.finance_accounts enable row level security;
drop policy if exists airos_finance_accounts_select on public.finance_accounts;
drop policy if exists airos_finance_accounts_insert on public.finance_accounts;
drop policy if exists airos_finance_accounts_update on public.finance_accounts;
drop policy if exists airos_finance_accounts_delete on public.finance_accounts;
create policy airos_finance_accounts_select on public.finance_accounts for select to authenticated using (public.has_module('financeiro'));
create policy airos_finance_accounts_insert on public.finance_accounts for insert to authenticated with check (public.has_module('financeiro'));
create policy airos_finance_accounts_update on public.finance_accounts for update to authenticated using (public.has_module('financeiro')) with check (public.has_module('financeiro'));
create policy airos_finance_accounts_delete on public.finance_accounts for delete to authenticated using (public.has_module('financeiro'));

alter table public.finance_categories enable row level security;
drop policy if exists airos_finance_categories_select on public.finance_categories;
drop policy if exists airos_finance_categories_insert on public.finance_categories;
drop policy if exists airos_finance_categories_update on public.finance_categories;
drop policy if exists airos_finance_categories_delete on public.finance_categories;
create policy airos_finance_categories_select on public.finance_categories for select to authenticated using (public.has_module('financeiro'));
create policy airos_finance_categories_insert on public.finance_categories for insert to authenticated with check (public.has_module('financeiro'));
create policy airos_finance_categories_update on public.finance_categories for update to authenticated using (public.has_module('financeiro')) with check (public.has_module('financeiro'));
create policy airos_finance_categories_delete on public.finance_categories for delete to authenticated using (public.has_module('financeiro'));

alter table public.finance_entries enable row level security;
drop policy if exists airos_finance_entries_select on public.finance_entries;
drop policy if exists airos_finance_entries_insert on public.finance_entries;
drop policy if exists airos_finance_entries_update on public.finance_entries;
drop policy if exists airos_finance_entries_delete on public.finance_entries;
create policy airos_finance_entries_select on public.finance_entries for select to authenticated using (public.has_module('financeiro'));
create policy airos_finance_entries_insert on public.finance_entries for insert to authenticated with check (public.has_module('financeiro'));
create policy airos_finance_entries_update on public.finance_entries for update to authenticated using (public.has_module('financeiro')) with check (public.has_module('financeiro'));
create policy airos_finance_entries_delete on public.finance_entries for delete to authenticated using (public.has_module('financeiro'));

alter table public.finance_member_costs enable row level security;
drop policy if exists airos_finance_member_costs_select on public.finance_member_costs;
drop policy if exists airos_finance_member_costs_insert on public.finance_member_costs;
drop policy if exists airos_finance_member_costs_update on public.finance_member_costs;
drop policy if exists airos_finance_member_costs_delete on public.finance_member_costs;
create policy airos_finance_member_costs_select on public.finance_member_costs for select to authenticated using (public.has_module('financeiro'));
create policy airos_finance_member_costs_insert on public.finance_member_costs for insert to authenticated with check (public.has_module('financeiro'));
create policy airos_finance_member_costs_update on public.finance_member_costs for update to authenticated using (public.has_module('financeiro')) with check (public.has_module('financeiro'));
create policy airos_finance_member_costs_delete on public.finance_member_costs for delete to authenticated using (public.has_module('financeiro'));

create or replace function public.airos_my_access()
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', p.role,
    'active', p.active,
    'permissions', p.permissions,
    'financeiro', public.has_module('financeiro'),
    'comercial', public.has_module('comercial'),
    'finance_policies', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'finance_entries')
  )
  from (select 1) x
  left join public.profiles p on p.id = auth.uid();
$fn$;
grant execute on function public.airos_my_access() to authenticated;

-- Conferência (no SQL Editor não há usuário logado; veja no sistema em Configurações → Banco de dados)
select tablename, count(*) as regras from pg_policies
where schemaname = 'public' and tablename like 'finance_%' group by tablename order by tablename;

-- FIM
