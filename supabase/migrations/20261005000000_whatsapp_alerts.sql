-- AIROS · Resumo diário no WhatsApp
-- Uma vez por dia, no horário escolhido em Configurações → Resumo diário, cada membro
-- com telefone recebe no WhatsApp: tarefas atrasadas, que vencem hoje e amanhã, prazos dos
-- projetos em que está e retornos de leads do dia. Quem não quiser desliga em Meu perfil.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.app_settings
  add column if not exists wa_alerts_enabled boolean not null default false,
  add column if not exists wa_alerts_hour smallint not null default 8,
  add column if not exists wa_alerts_tasks boolean not null default true,
  add column if not exists wa_alerts_projects boolean not null default true,
  add column if not exists wa_alerts_leads boolean not null default true,
  add column if not exists wa_alerts_weekends boolean not null default false;

alter table public.app_settings drop constraint if exists app_settings_wa_alerts_hour_check;
alter table public.app_settings add constraint app_settings_wa_alerts_hour_check
  check (wa_alerts_hour between 0 and 23);

-- Cada pessoa pode deixar de receber (Meu perfil).
alter table public.profiles
  add column if not exists wa_alerts boolean not null default true;

-- Um envio por pessoa por dia (evita mensagens repetidas se o agendamento rodar duas vezes).
create table if not exists public.whatsapp_alert_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'modelo', 'sem_novidades', 'erro')),
  detail text,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.whatsapp_alert_log enable row level security;

-- Leitura: o administrador vê todos; cada pessoa, os próprios. Só a função (chave de serviço) grava.
drop policy if exists airos_whatsapp_alert_log_select on public.whatsapp_alert_log;
create policy airos_whatsapp_alert_log_select on public.whatsapp_alert_log for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
