-- AIROS · Forma de pagamento com valores em R$ e edição depois de lançada
-- Parcelas podem ter valor fixo em R$ (o percentual é calculado). Editar a forma de pagamento
-- depois de lançada substitui as parcelas no Financeiro, desde que nenhuma tenha sido recebida.
-- Pode rodar mais de uma vez. Cole tudo até "FIM" no SQL Editor do Supabase → Run.

alter table public.leads add column if not exists payment_plan jsonb;
alter table public.finance_entries add column if not exists lead_id uuid references public.leads (id) on delete set null;
create index if not exists finance_entries_lead_idx on public.finance_entries (lead_id);

drop function if exists public.create_lead_receivables(uuid);

create or replace function public.create_lead_receivables(p_lead uuid, p_replace boolean default false)
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
    if not p_replace then
      return 0;
    end if;
    if exists (select 1 from public.finance_entries where lead_id = p_lead and paid_at is not null) then
      raise exception 'A forma de pagamento foi salva, mas as parcelas no Financeiro não foram alteradas: já há parcela recebida desta oportunidade. Ajuste as demais no Financeiro.';
    end if;
    delete from public.finance_entries where lead_id = p_lead;
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
    if nullif(r ->> 'value', '') is not null then
      amt := (r ->> 'value')::numeric;
    elsif i = n then
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
        amt, (r ->> 'due_date')::date, acct, cat, l.client_id, proj, p_lead,
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

grant execute on function public.create_lead_receivables(uuid, boolean) to authenticated;

-- FIM
