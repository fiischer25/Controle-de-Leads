-- AIROS · Folha de pagamento (salários pagos no mês seguinte)
-- - reference_month (AAAA-MM): mês a que o lançamento se refere. Ex.: salário de setembro pago
--   em 05/10 tem vencimento em outubro e referência em setembro.
-- - member_id: pessoa da equipe a quem o salário é pago (controle da folha por pessoa).
-- - app_settings.payroll_day: dia do mês seguinte em que a folha é paga (padrão: 5).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.finance_entries add column if not exists reference_month text;
alter table public.finance_entries drop constraint if exists finance_entries_reference_month_check;
alter table public.finance_entries add constraint finance_entries_reference_month_check
  check (reference_month is null or reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

alter table public.finance_entries add column if not exists member_id uuid references public.profiles(id) on delete set null;
create index if not exists finance_entries_member_idx on public.finance_entries (member_id, reference_month);

alter table public.app_settings add column if not exists payroll_day integer not null default 5;
alter table public.app_settings drop constraint if exists app_settings_payroll_day_check;
alter table public.app_settings add constraint app_settings_payroll_day_check check (payroll_day between 1 and 28);

notify pgrst, 'reload schema';
