-- AIROS · Financeiro
-- Contas (banco, caixa, cartão), categorias, lançamentos (contas a receber e a pagar,
-- transferências, parcelas e despesas que se repetem) e custo/hora da equipe para a
-- rentabilidade dos projetos. Só administradores e quem tiver o módulo "Financeiro".
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

-- Novo módulo liberável por pessoa (fora do padrão dos membros)
alter table public.profiles drop constraint if exists profiles_permissions_check;
alter table public.profiles add constraint profiles_permissions_check
  check (permissions <@ array['projetos', 'comercial', 'relatorios', 'equipe', 'configuracoes', 'financeiro']::text[]);

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'banco' check (kind in ('banco', 'caixa', 'cartao', 'investimento', 'outro')),
  opening_balance numeric(14, 2) not null default 0,
  color text not null default '#57534e',
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('receita', 'despesa')),
  color text not null default '#7c6f64',
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('receita', 'despesa', 'transferencia')),
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  due_date date not null,
  -- Data do pagamento/recebimento; vazio = pendente
  paid_at date,
  account_id uuid references public.finance_accounts (id) on delete set null,
  -- Transferências: conta de destino
  to_account_id uuid references public.finance_accounts (id) on delete set null,
  category_id uuid references public.finance_categories (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  -- Parcelas e repetições do mesmo lançamento compartilham a série
  series_id uuid,
  installment integer,
  installments integer,
  document text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_entries_transfer_check check (kind <> 'transferencia' or (account_id is not null and to_account_id is not null))
);

create index if not exists finance_entries_due_idx on public.finance_entries (due_date);
create index if not exists finance_entries_project_idx on public.finance_entries (project_id);
create index if not exists finance_entries_series_idx on public.finance_entries (series_id);

-- Custo por hora de cada pessoa (salário + encargos ÷ horas): fica fora de profiles para
-- que só o Financeiro enxergue.
create table if not exists public.finance_member_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  hourly_cost numeric(10, 2) not null default 0 check (hourly_cost >= 0),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Segurança: tudo exige o módulo Financeiro (administradores sempre têm).
-- Comandos escritos um a um para o SQL Editor do Supabase reconhecer o RLS.
-- -----------------------------------------------------------------------------
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

-- Tempo real
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['finance_accounts', 'finance_categories', 'finance_entries', 'finance_member_costs'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Cadastros iniciais (só na primeira vez)
-- -----------------------------------------------------------------------------
insert into public.finance_categories (name, kind, color, position)
select c.name, c.kind, c.color, c.position
from (values
  ('Honorários de projeto', 'receita', '#3f7d5a', 0),
  ('Reserva técnica (RT)', 'receita', '#5b8f6f', 1),
  ('Acompanhamento de obra', 'receita', '#7aa386', 2),
  ('Outras receitas', 'receita', '#9bb8a3', 3),
  ('Salários e pró-labore', 'despesa', '#8a4b3c', 0),
  ('Aluguel e condomínio', 'despesa', '#9c5a48', 1),
  ('Impostos', 'despesa', '#a86b56', 2),
  ('Contabilidade', 'despesa', '#b37c65', 3),
  ('Softwares e assinaturas', 'despesa', '#7c6f64', 4),
  ('Energia, internet e telefone', 'despesa', '#8c7f73', 5),
  ('Marketing', 'despesa', '#9c8f83', 6),
  ('Deslocamentos e visitas', 'despesa', '#a89c90', 7),
  ('Impressões e plotagens', 'despesa', '#b4a99e', 8),
  ('Material de escritório', 'despesa', '#c0b6ac', 9),
  ('Tarifas bancárias', 'despesa', '#ccc3ba', 10),
  ('Outras despesas', 'despesa', '#d6cec6', 11)
) as c (name, kind, color, position)
where not exists (select 1 from public.finance_categories);

insert into public.finance_accounts (name, kind, position)
select 'Conta principal', 'banco', 0
where not exists (select 1 from public.finance_accounts);
