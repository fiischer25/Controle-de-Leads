-- AIROS · Acessos por módulo
-- O administrador escolhe, para cada membro, quais módulos ele pode ver e usar:
--   projetos       lista/detalhe de projetos e tarefas de toda a equipe
--   comercial      oportunidades e clientes
--   relatorios     relatórios
--   equipe         tela da equipe
--   configuracoes  configurações do escritório
-- O Painel de Projetos (com a agenda) e as próprias tarefas são de todos.
-- Administradores continuam com acesso a tudo.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.profiles
  add column if not exists permissions text[] not null
  default array['projetos', 'comercial', 'relatorios', 'equipe']::text[];

-- Só valores conhecidos
alter table public.profiles drop constraint if exists profiles_permissions_check;
alter table public.profiles add constraint profiles_permissions_check
  check (permissions <@ array['projetos', 'comercial', 'relatorios', 'equipe', 'configuracoes']::text[]);

-- O usuário atual (ativo) tem o módulo? Administradores: sempre.
create or replace function public.has_module(module text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and (role = 'admin' or module = any(permissions))
  );
$$;
grant execute on function public.has_module(text) to authenticated;

-- Membros comuns não podem alterar os próprios acessos.
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
     or new.email is distinct from old.email
     or new.permissions is distinct from old.permissions then
    raise exception 'Apenas administradores podem alterar nível de acesso, e-mail, status ou módulos.';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comercial: oportunidades e histórico de contatos
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_interactions'] loop
    execute format('drop policy if exists airos_%1$s_select on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_insert on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_update on public.%1$s', t);
    execute format('create policy airos_%1$s_select on public.%1$s for select to authenticated using (public.has_module(''comercial''))', t);
    execute format('create policy airos_%1$s_insert on public.%1$s for insert to authenticated with check (public.has_module(''comercial''))', t);
    execute format('create policy airos_%1$s_update on public.%1$s for update to authenticated using (public.has_module(''comercial'')) with check (public.has_module(''comercial''))', t);
  end loop;
end $$;

-- Clientes: o comercial cadastra; quem trabalha nos projetos também consulta.
drop policy if exists airos_clients_select on public.clients;
drop policy if exists airos_clients_insert on public.clients;
drop policy if exists airos_clients_update on public.clients;
create policy airos_clients_select on public.clients for select to authenticated
  using (public.has_module('comercial') or public.has_module('projetos'));
create policy airos_clients_insert on public.clients for insert to authenticated
  with check (public.has_module('comercial') or public.has_module('projetos'));
create policy airos_clients_update on public.clients for update to authenticated
  using (public.has_module('comercial') or public.has_module('projetos'))
  with check (public.has_module('comercial') or public.has_module('projetos'));

-- -----------------------------------------------------------------------------
-- Projetos: todos leem (Painel de Projetos); criar exige Projetos ou Comercial
-- (a conversão de uma oportunidade cria o projeto); editar exige Projetos.
-- -----------------------------------------------------------------------------
drop policy if exists airos_projects_insert on public.projects;
drop policy if exists airos_projects_update on public.projects;
create policy airos_projects_insert on public.projects for insert to authenticated
  with check (public.has_module('projetos') or public.has_module('comercial'));
create policy airos_projects_update on public.projects for update to authenticated
  using (public.has_module('projetos')) with check (public.has_module('projetos'));

-- Tarefas: quem não tem Projetos edita só as tarefas atribuídas a si ou criadas por si.
drop policy if exists airos_tasks_update on public.tasks;
create policy airos_tasks_update on public.tasks for update to authenticated
  using (public.has_module('projetos') or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.has_module('projetos') or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())));

-- -----------------------------------------------------------------------------
-- Configurações: além dos administradores, quem tem o módulo Configurações altera.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['app_settings', 'lead_stages', 'lead_sources', 'project_types', 'task_templates'] loop
    execute format('drop policy if exists airos_%1$s_insert on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_update on public.%1$s', t);
    execute format('drop policy if exists airos_%1$s_delete on public.%1$s', t);
    execute format('create policy airos_%1$s_insert on public.%1$s for insert to authenticated with check (public.has_module(''configuracoes''))', t);
    execute format('create policy airos_%1$s_update on public.%1$s for update to authenticated using (public.has_module(''configuracoes'')) with check (public.has_module(''configuracoes''))', t);
    execute format('create policy airos_%1$s_delete on public.%1$s for delete to authenticated using (public.has_module(''configuracoes''))', t);
  end loop;
end $$;
