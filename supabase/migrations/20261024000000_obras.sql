-- AIROS · Orçamentos e Obras
-- - budgets: orçamento prévio da obra por partes (Pintura, Elétrica…), com itens, BDI e desconto;
--   aprovado, vira obra;
-- - obras, obra_stages: obra com cronograma físico-financeiro (etapas com datas, avanço e valor previsto);
-- - obra_visits: visitas (diário de obra) com fotos e avanço das etapas;
-- - obra_payments: pagamentos da obra (fornecedores, mão de obra, material) com aprovação do cliente;
-- - obra_approvals: pedidos de aprovação do cliente, respondidos por um link sem login;
-- - obra_issues: pendências (punch list); obra_suppliers: fornecedores e prestadores.
-- Acesso: módulo "Orçamentos e obras" (administradores sempre têm). Quem já tinha Projetos ganha o
-- módulo novo na primeira execução. Fotos e documentos ficam no bucket "task-files" (pasta obras/).
-- Depois de aplicar, publique de novo a função admin-users (ela conhece o módulo novo).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

-- Primeira execução: libera o módulo para quem já trabalha nos projetos
do $$
begin
  if to_regclass('public.budgets') is null then
    alter table public.profiles drop constraint if exists profiles_permissions_check;
    update public.profiles set permissions = array_append(permissions, 'obras')
      where 'projetos' = any(permissions) and not ('obras' = any(permissions));
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_permissions_check;
alter table public.profiles add constraint profiles_permissions_check
  check (permissions <@ array['projetos', 'comercial', 'obras', 'relatorios', 'equipe', 'configuracoes', 'financeiro']::text[]);

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table if not exists public.obra_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade text,
  contact text,
  phone text,
  email text,
  document text,
  pix text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  client_id uuid references public.clients (id) on delete set null,
  client_name text,
  client_phone text,
  client_email text,
  lead_id uuid references public.leads (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  address text,
  city text,
  area_m2 numeric(12, 2),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  data jsonb not null default '{}'::jsonb,
  total numeric(14, 2) not null default 0,
  obra_id uuid,
  sent_at timestamptz,
  answered_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  client_id uuid references public.clients (id) on delete set null,
  client_name text,
  client_phone text,
  client_email text,
  budget_id uuid references public.budgets (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  manager_id uuid references public.profiles (id) on delete set null,
  member_ids uuid[] not null default '{}',
  status text not null default 'planejamento' check (status in ('planejamento', 'em_andamento', 'pausada', 'concluida', 'cancelada')),
  address text,
  city text,
  area_m2 numeric(12, 2),
  start_date date,
  due_date date,
  contract_value numeric(14, 2),
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'budgets_obra_id_fkey') then
    alter table public.budgets add constraint budgets_obra_id_fkey foreign key (obra_id) references public.obras (id) on delete set null;
  end if;
end $$;

create table if not exists public.obra_stages (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  name text not null,
  position numeric not null default 0,
  start_date date,
  due_date date,
  progress numeric(5, 2) not null default 0 check (progress >= 0 and progress <= 100),
  budget numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_visits (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  date date not null,
  kind text not null default 'visita' check (kind in ('visita', 'vistoria', 'reuniao', 'medicao', 'entrega')),
  author_id uuid references public.profiles (id) on delete set null,
  summary text not null default '',
  weather text,
  workers text,
  notes text,
  photos jsonb not null default '[]'::jsonb,
  progress jsonb not null default '[]'::jsonb,
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_approvals (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references public.obras (id) on delete cascade,
  budget_id uuid references public.budgets (id) on delete cascade,
  payment_id uuid,
  kind text not null check (kind in ('orcamento', 'pagamento', 'aditivo', 'material', 'projeto', 'medicao', 'outro')),
  title text not null,
  description text,
  amount numeric(14, 2),
  snapshot jsonb,
  token text not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  due_date date,
  client_name text,
  client_phone text,
  requested_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_name text,
  answer_comment text,
  answered_via text check (answered_via in ('link', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_payments (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  stage_id uuid references public.obra_stages (id) on delete set null,
  supplier_id uuid references public.obra_suppliers (id) on delete set null,
  supplier_name text,
  description text not null,
  category text not null default 'material' check (category in ('material', 'mao_de_obra', 'servico', 'equipamento', 'taxa', 'outro')),
  amount numeric(14, 2) not null check (amount >= 0),
  due_date date not null,
  paid_at date,
  method text check (method in ('pix', 'boleto', 'transferencia', 'cartao', 'dinheiro', 'outro')),
  payer text not null default 'cliente' check (payer in ('cliente', 'escritorio')),
  approval text not null default 'nao_requer' check (approval in ('nao_requer', 'pendente', 'aprovado', 'recusado')),
  approval_id uuid references public.obra_approvals (id) on delete set null,
  document text,
  attachments jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obra_issues (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  stage_id uuid references public.obra_stages (id) on delete set null,
  title text not null,
  description text,
  responsible text,
  due_date date,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  status text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  photos jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budgets_updated_idx on public.budgets (updated_at desc);
create index if not exists obra_stages_obra_idx on public.obra_stages (obra_id, position);
create index if not exists obra_visits_obra_idx on public.obra_visits (obra_id, date desc);
create index if not exists obra_payments_obra_idx on public.obra_payments (obra_id, due_date);
create index if not exists obra_approvals_obra_idx on public.obra_approvals (obra_id);
create index if not exists obra_issues_obra_idx on public.obra_issues (obra_id, status);

-- -----------------------------------------------------------------------------
-- Acesso: módulo "obras"
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['budgets', 'obras', 'obra_stages', 'obra_visits', 'obra_payments', 'obra_approvals', 'obra_issues', 'obra_suppliers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists airos_%1$s_select on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_insert on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_update on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_delete on public.%1$s', t);
    execute format('create policy airos_%1$s_select on public.%1$s for select to authenticated using (public.has_module(''obras''))', t);
    execute format('create policy airos_%1$s_insert on public.%1$s for insert to authenticated with check (public.has_module(''obras''))', t);
    execute format('create policy airos_%1$s_update on public.%1$s for update to authenticated using (public.has_module(''obras'')) with check (public.has_module(''obras''))', t);
    execute format('create policy airos_%1$s_delete on public.%1$s for delete to authenticated using (public.has_module(''obras''))', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Aprovação pelo link (sem login): o cliente só enxerga o pedido do token.
-- -----------------------------------------------------------------------------
create or replace function public.obra_approval_public(p_token text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'id', a.id,
    'kind', a.kind,
    'title', a.title,
    'description', a.description,
    'amount', a.amount,
    'snapshot', a.snapshot,
    'status', a.status,
    'due_date', a.due_date,
    'client_name', a.client_name,
    'requested_at', a.requested_at,
    'requested_by_name', (select p.name from public.profiles p where p.id = a.requested_by),
    'answered_at', a.answered_at,
    'answered_name', a.answered_name,
    'answer_comment', a.answer_comment,
    'obra_name', coalesce(o.name, b.name),
    'office_name', s.office_name,
    'logo_url', s.logo_url
  )
  from public.obra_approvals a
  left join public.obras o on o.id = a.obra_id
  left join public.budgets b on b.id = a.budget_id
  left join public.app_settings s on s.id = 'office'
  where a.token = p_token and length(p_token) >= 20
  limit 1;
$$;
grant execute on function public.obra_approval_public(text) to anon, authenticated;

create or replace function public.obra_approval_answer(p_token text, p_status text, p_name text, p_comment text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  a public.obra_approvals;
begin
  if p_status not in ('aprovado', 'recusado') then
    raise exception 'Resposta inválida.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Informe seu nome.';
  end if;
  select * into a from public.obra_approvals where token = p_token and length(p_token) >= 20 for update;
  if not found then
    raise exception 'Pedido de aprovação não encontrado.';
  end if;
  if a.status <> 'pendente' then
    raise exception 'Este pedido já foi respondido.';
  end if;

  update public.obra_approvals
     set status = p_status, answered_at = now(), answered_name = left(trim(p_name), 120),
         answer_comment = nullif(left(trim(coalesce(p_comment, '')), 2000), ''), answered_via = 'link', updated_at = now()
   where id = a.id;

  if a.kind = 'orcamento' and a.budget_id is not null then
    update public.budgets set status = p_status, answered_at = now(), updated_at = now() where id = a.budget_id;
  end if;
  if a.payment_id is not null then
    update public.obra_payments set approval = p_status, updated_at = now() where id = a.payment_id;
  end if;

  if a.requested_by is not null then
    insert into public.notifications (user_id, title, body, link)
    values (
      a.requested_by,
      case when p_status = 'aprovado' then 'Cliente aprovou: ' else 'Cliente recusou: ' end || a.title,
      left(trim(p_name), 120) || coalesce(' — ' || nullif(trim(coalesce(p_comment, '')), ''), ''),
      case when a.obra_id is not null then '/obras/' || a.obra_id || '?aba=aprovacoes' else '/orcamentos/' || a.budget_id end
    );
  end if;
  return json_build_object('status', p_status);
end;
$$;
grant execute on function public.obra_approval_answer(text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tempo real
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['budgets', 'obras', 'obra_stages', 'obra_visits', 'obra_payments', 'obra_approvals', 'obra_issues', 'obra_suppliers'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
