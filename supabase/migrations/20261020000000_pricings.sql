-- AIROS · Precificação de projetos (Gestão → Precificação)
-- Cada precificação guarda a área, as etapas com os dias de trabalho, os custos fixos do
-- escritório, os custos indiretos, os adicionais (visitas, presentes, terceirização) e o lucro,
-- em `data` (jsonb). `total` é o valor da proposta, para listar e ordenar.
-- Acesso: só quem tem o módulo Financeiro (administradores sempre têm).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

create table if not exists public.pricings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  lead_id uuid references public.leads (id) on delete set null,
  project_type_id uuid references public.project_types (id) on delete set null,
  area_m2 numeric(12, 2),
  data jsonb not null default '{}'::jsonb,
  total numeric(14, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricings_updated_idx on public.pricings (updated_at desc);

alter table public.pricings enable row level security;
drop policy if exists airos_pricings_select on public.pricings;
drop policy if exists airos_pricings_insert on public.pricings;
drop policy if exists airos_pricings_update on public.pricings;
drop policy if exists airos_pricings_delete on public.pricings;
create policy airos_pricings_select on public.pricings for select to authenticated using (public.has_module('financeiro'));
create policy airos_pricings_insert on public.pricings for insert to authenticated with check (public.has_module('financeiro'));
create policy airos_pricings_update on public.pricings for update to authenticated using (public.has_module('financeiro')) with check (public.has_module('financeiro'));
create policy airos_pricings_delete on public.pricings for delete to authenticated using (public.has_module('financeiro'));

-- Tempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pricings') then
    alter publication supabase_realtime add table public.pricings;
  end if;
end $$;

notify pgrst, 'reload schema';
