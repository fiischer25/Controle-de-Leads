-- =============================================================================
-- AIROS · Logo do escritório, reuniões na agenda e assistente (WhatsApp / app)
-- Rode depois de 20260929000000_airos_schema.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Logo do escritório (exibido também na tela de login, antes da autenticação)
-- -----------------------------------------------------------------------------
alter table public.app_settings add column if not exists logo_url text;

create or replace function public.office_branding()
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('office_name', office_name, 'logo_url', logo_url)
  from public.app_settings
  where id = 'office';
$$;
grant execute on function public.office_branding() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reuniões / compromissos
-- -----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text,
  participant_ids uuid[] not null default '{}',
  project_id uuid references public.projects (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  google_event_id text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);

alter table public.events enable row level security;
drop policy if exists airos_events_select on public.events;
drop policy if exists airos_events_insert on public.events;
drop policy if exists airos_events_update on public.events;
drop policy if exists airos_events_delete on public.events;
create policy airos_events_select on public.events for select to authenticated using (public.is_member());
create policy airos_events_insert on public.events for insert to authenticated with check (public.is_member());
create policy airos_events_update on public.events for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy airos_events_delete on public.events for delete to authenticated
  using (public.is_admin() or (public.is_member() and created_by = auth.uid()));

-- -----------------------------------------------------------------------------
-- Histórico de conversa com o assistente (WhatsApp e chat do sistema).
-- Gravado apenas pelas Edge Functions (service role); cada usuário lê o próprio.
-- -----------------------------------------------------------------------------
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'app')),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  wa_message_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_user_idx on public.agent_messages (user_id, created_at desc);

alter table public.agent_messages enable row level security;
drop policy if exists airos_agent_messages_select on public.agent_messages;
create policy airos_agent_messages_select on public.agent_messages for select to authenticated
  using (user_id = auth.uid());

-- Tempo real para reuniões (o chat do assistente é consultado sob demanda)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
     ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;
