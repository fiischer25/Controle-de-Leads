-- =============================================================================
-- AIROS · Sistema de gestão de leads e projetos
-- Esquema completo + segurança (RLS). Rode uma vez no SQL Editor do Supabase
-- ou com `supabase db push`.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  job_title text,
  phone text,
  color text not null default '#57534e',
  active boolean not null default true,
  calendar_embed_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key default 'office',
  office_name text not null default 'AIROS Arquitetura',
  calendar_embed_url text,
  due_soon_days integer not null default 7,
  lead_stale_days integer not null default 7,
  project_code_prefix text not null default 'AIR',
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  color text not null default '#7c6f64',
  position double precision not null default 0
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  position double precision not null default 0
);

create table if not exists public.project_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default '#9a5b3f',
  active boolean not null default true,
  position double precision not null default 0
);

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  project_type_id uuid not null references public.project_types (id) on delete cascade,
  phase text not null,
  title text not null,
  description text,
  duration_days integer not null default 1 check (duration_days > 0),
  position double precision not null default 0
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null,
  rg text,
  birth_date date,
  email text not null,
  phone text not null,
  profession text,
  cep text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  notes text,
  lead_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  city text not null,
  state text,
  area_m2 numeric,
  category text,
  project_type_id uuid references public.project_types (id) on delete set null,
  source_id uuid references public.lead_sources (id) on delete set null,
  referred_by text,
  proposal_value numeric,
  stage_id uuid not null references public.lead_stages (id),
  owner_id uuid references public.profiles (id) on delete set null,
  position double precision not null default 0,
  next_contact_date date,
  expected_close_date date,
  lost_reason text,
  notes text,
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  client_id uuid references public.clients (id) on delete set null,
  converted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients
  drop constraint if exists clients_lead_id_fkey,
  add constraint clients_lead_id_fkey foreign key (lead_id) references public.leads (id) on delete set null;

create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  type text not null default 'nota',
  description text not null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  client_id uuid not null references public.clients (id),
  project_type_id uuid not null references public.project_types (id),
  status text not null default 'nao_iniciado'
    check (status in ('nao_iniciado', 'em_andamento', 'pausado', 'concluido', 'cancelado')),
  manager_id uuid references public.profiles (id) on delete set null,
  member_ids uuid[] not null default '{}',
  start_date date not null,
  due_date date,
  area_m2 numeric,
  site_address text,
  site_city text,
  description text,
  notes text,
  links jsonb not null default '[]'::jsonb,
  lead_id uuid references public.leads (id) on delete set null,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  phase text,
  title text not null,
  description text,
  assignee_id uuid references public.profiles (id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'review', 'paused', 'done')),
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  start_date date,
  due_date date,
  estimated_hours numeric,
  position double precision not null default 0,
  checklist jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- Índices para as consultas mais comuns
create index if not exists leads_stage_idx on public.leads (stage_id);
create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists lead_interactions_lead_idx on public.lead_interactions (lead_id);
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists time_entries_task_idx on public.time_entries (task_id);
create index if not exists time_entries_user_idx on public.time_entries (user_id);
create index if not exists task_comments_task_idx on public.task_comments (task_id);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

-- -----------------------------------------------------------------------------
-- Funções auxiliares de permissão
-- -----------------------------------------------------------------------------

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- Tela de "primeiro acesso": só existe enquanto não há nenhum usuário.
create or replace function public.office_needs_setup()
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.profiles);
$$;
grant execute on function public.office_needs_setup() to anon, authenticated;

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
--  * o primeiro usuário do sistema vira administrador;
--  * usuários criados pelo administrador (Edge Function) chegam com
--    app_metadata.provisioned = true (só o service role consegue definir isso);
--  * qualquer outro cadastro público fica DESATIVADO até um admin liberar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  is_first boolean;
  provisioned boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  provisioned := coalesce((new.raw_app_meta_data ->> 'provisioned')::boolean, false);

  insert into public.profiles (id, name, email, role, job_title, phone, color, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case
      when is_first then 'admin'
      when provisioned and new.raw_app_meta_data ->> 'role' = 'admin' then 'admin'
      else 'member'
    end,
    new.raw_user_meta_data ->> 'job_title',
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'color', '#57534e'),
    is_first or provisioned
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Membros comuns podem editar o próprio perfil, mas não o nível de acesso,
-- o e-mail de login nem o status ativo.
-- Atenção: SECURITY INVOKER de propósito, para que current_user seja o papel de quem
-- fez a requisição (authenticated / service_role), e não o dono da função.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.active is distinct from old.active
     or new.email is distinct from old.email then
    raise exception 'Apenas administradores podem alterar nível de acesso, e-mail ou status.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.lead_stages enable row level security;
alter table public.lead_sources enable row level security;
alter table public.project_types enable row level security;
alter table public.task_templates enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.lead_interactions enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.task_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_log enable row level security;

-- Recria as políticas de forma idempotente
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' and policyname like 'airos_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Perfis
create policy airos_profiles_select on public.profiles for select to authenticated
  using (public.is_member() or id = auth.uid());
create policy airos_profiles_update on public.profiles for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or id = auth.uid());

-- Configurações: todos leem, só administradores alteram
do $$
declare t text;
begin
  foreach t in array array['app_settings', 'lead_stages', 'lead_sources', 'project_types', 'task_templates'] loop
    execute format('create policy airos_%1$s_select on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy airos_%1$s_insert on public.%1$s for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy airos_%1$s_update on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy airos_%1$s_delete on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Dados operacionais: toda a equipe lê e edita (visão 360°); exclusões críticas só admin
do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_interactions', 'clients', 'projects', 'tasks', 'time_entries', 'task_comments'] loop
    execute format('create policy airos_%1$s_select on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy airos_%1$s_insert on public.%1$s for insert to authenticated with check (public.is_member())', t);
  end loop;
  foreach t in array array['leads', 'lead_interactions', 'clients', 'projects', 'tasks'] loop
    execute format('create policy airos_%1$s_update on public.%1$s for update to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
  foreach t in array array['leads', 'lead_interactions', 'clients', 'projects'] loop
    execute format('create policy airos_%1$s_delete on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

create policy airos_tasks_delete on public.tasks for delete to authenticated
  using (public.is_admin() or (public.is_member() and created_by = auth.uid()));

-- Horas: cada um edita/exclui os próprios lançamentos (admin pode tudo)
create policy airos_time_entries_update on public.time_entries for update to authenticated
  using (public.is_admin() or (public.is_member() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and user_id = auth.uid()));
create policy airos_time_entries_delete on public.time_entries for delete to authenticated
  using (public.is_admin() or (public.is_member() and user_id = auth.uid()));

create policy airos_task_comments_delete on public.task_comments for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- Notificações: cada um vê as suas; qualquer membro pode notificar outro
create policy airos_notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy airos_notifications_insert on public.notifications for insert to authenticated
  with check (public.is_member());
create policy airos_notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy airos_notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Histórico de atividades: somente leitura e inclusão (auditoria)
create policy airos_activity_log_select on public.activity_log for select to authenticated
  using (public.is_member());
create policy airos_activity_log_insert on public.activity_log for insert to authenticated
  with check (public.is_member() and user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Tempo real: a interface atualiza sozinha quando outro membro altera algo
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'profiles', 'app_settings', 'lead_stages', 'lead_sources', 'project_types', 'task_templates',
      'clients', 'leads', 'lead_interactions', 'projects', 'tasks', 'time_entries', 'task_comments',
      'notifications', 'activity_log'
    ] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
