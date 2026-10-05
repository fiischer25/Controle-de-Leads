-- AIROS · Forma de pagamento no fechamento da oportunidade
-- Ao marcar o lead como ganho, define-se o valor fechado e as parcelas (ex.: 30/40/30 com datas).
-- As parcelas entram sozinhas em contas a receber do Financeiro, mesmo quando quem fecha só tem
-- o módulo Comercial (a função abaixo cria apenas as parcelas daquela oportunidade). Quando o
-- lead vira cliente e projeto, as parcelas passam a apontar para o projeto.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

-- Plano combinado: { total, rows: [{label, percent, due_date}], account_id, preset, defined_at }
alter table public.leads add column if not exists payment_plan jsonb;

-- Parcela criada a partir de qual oportunidade
alter table public.finance_entries add column if not exists lead_id uuid references public.leads (id) on delete set null;
create index if not exists finance_entries_lead_idx on public.finance_entries (lead_id);

-- Cria as contas a receber do plano salvo no lead. Só roda uma vez por oportunidade
-- (se já houver parcelas dela, não cria de novo) e devolve quantas parcelas criou.
create or replace function public.create_lead_receivables(p_lead uuid)
returns integer
language plpgsql security definer set search_path = public
as $fn$
declare
  l public.leads%rowtype;
  plan jsonb;
  r jsonb;
  total numeric;
  n integer;
  i integer := 0;
  acc numeric := 0;
  amt numeric;
  cat uuid;
  acct uuid;
  proj uuid;
  series uuid := gen_random_uuid();
  created integer := 0;
begin
  if not (public.has_module('comercial') or public.has_module('financeiro')) then
    raise exception 'Sem permissão para lançar a forma de pagamento.';
  end if;
  select * into l from public.leads where id = p_lead;
  if not found then
    raise exception 'Oportunidade não encontrada.';
  end if;
  plan := l.payment_plan;
  if plan is null or jsonb_typeof(plan -> 'rows') <> 'array' or jsonb_array_length(plan -> 'rows') = 0 then
    return 0;
  end if;
  if exists (select 1 from public.finance_entries where lead_id = p_lead) then
    return 0;
  end if;
  total := nullif(plan ->> 'total', '')::numeric;
  if total is null or total <= 0 then
    raise exception 'Valor fechado inválido.';
  end if;
  n := jsonb_array_length(plan -> 'rows');
  select id into cat from public.finance_categories
    where kind = 'receita' and active and lower(name) like 'honor%'
    order by position limit 1;
  acct := nullif(plan ->> 'account_id', '')::uuid;
  if acct is not null and not exists (select 1 from public.finance_accounts where id = acct) then
    acct := null;
  end if;
  select id into proj from public.projects where lead_id = p_lead order by created_at limit 1;

  for r in select value from jsonb_array_elements(plan -> 'rows') loop
    i := i + 1;
    if i = n then
      amt := total - acc;
    else
      amt := round(total * coalesce(nullif(r ->> 'percent', '')::numeric, 0) / 100, 2);
    end if;
    acc := acc + amt;
    if amt > 0 then
      insert into public.finance_entries (
        kind, description, amount, due_date, account_id, category_id, client_id, project_id, lead_id,
        series_id, installment, installments, notes, created_by
      ) values (
        'receita',
        'Honorários ' || l.name || ' · ' || coalesce(nullif(r ->> 'label', ''), 'Parcela ' || i),
        amt,
        (r ->> 'due_date')::date,
        acct,
        cat,
        l.client_id,
        proj,
        p_lead,
        case when n > 1 then series end,
        case when n > 1 then i end,
        case when n > 1 then n end,
        'Forma de pagamento definida no fechamento da oportunidade',
        auth.uid()
      );
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$fn$;

grant execute on function public.create_lead_receivables(uuid) to authenticated;

-- Quando o lead vira projeto, as parcelas dele passam a apontar para o projeto e o cliente.
create or replace function public.link_lead_receivables()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.lead_id is not null then
    update public.finance_entries
      set project_id = new.id, client_id = coalesce(client_id, new.client_id), updated_at = now()
      where lead_id = new.lead_id and project_id is null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists link_lead_receivables on public.projects;
create trigger link_lead_receivables
  after insert on public.projects
  for each row execute function public.link_lead_receivables();
