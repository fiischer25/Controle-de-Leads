-- AIROS · Lembretes de cobrança no WhatsApp (Financeiro → Cobrança)
-- O cliente recebe um lembrete da parcela alguns dias antes, no dia e alguns dias depois do
-- vencimento, enquanto ela estiver em aberto. A função whatsapp-alerts envia (no mesmo
-- agendamento de hora em hora do resumo diário) e registra cada envio para não repetir.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.app_settings
  add column if not exists billing_enabled boolean not null default false,
  add column if not exists billing_days_before smallint not null default 3,
  add column if not exists billing_on_due boolean not null default true,
  add column if not exists billing_days_after smallint not null default 3,
  add column if not exists billing_hour smallint not null default 9,
  add column if not exists billing_payment_info text;

alter table public.app_settings drop constraint if exists app_settings_billing_check;
alter table public.app_settings add constraint app_settings_billing_check
  check (billing_days_before between 0 and 30 and billing_days_after between 0 and 60 and billing_hour between 0 and 23);

-- Cliente que não deve receber lembretes automáticos (ex.: combinou outra forma de cobrança).
alter table public.clients
  add column if not exists billing_reminders boolean not null default true;

-- Um registro por lembrete enviado (parcela + tipo + vencimento): não repete e mostra o histórico.
create table if not exists public.billing_reminder_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.finance_entries (id) on delete cascade,
  kind text not null check (kind in ('antes', 'no_dia', 'depois', 'manual')),
  due_date date not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'manual')),
  detail text,
  phone text,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists billing_reminder_log_once on public.billing_reminder_log (entry_id, kind, due_date) where kind <> 'manual';
create index if not exists billing_reminder_log_created_idx on public.billing_reminder_log (created_at desc);

alter table public.billing_reminder_log enable row level security;
drop policy if exists airos_billing_reminder_log_select on public.billing_reminder_log;
drop policy if exists airos_billing_reminder_log_insert on public.billing_reminder_log;
drop policy if exists airos_billing_reminder_log_delete on public.billing_reminder_log;
-- Leitura e envio à mão: quem tem o Financeiro. Os automáticos são gravados pela função (chave de serviço).
create policy airos_billing_reminder_log_select on public.billing_reminder_log for select to authenticated using (public.has_module('financeiro'));
create policy airos_billing_reminder_log_insert on public.billing_reminder_log for insert to authenticated
  with check (public.has_module('financeiro') and kind = 'manual');
create policy airos_billing_reminder_log_delete on public.billing_reminder_log for delete to authenticated using (public.has_module('financeiro'));

-- Tempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'billing_reminder_log') then
    alter publication supabase_realtime add table public.billing_reminder_log;
  end if;
end $$;

notify pgrst, 'reload schema';
