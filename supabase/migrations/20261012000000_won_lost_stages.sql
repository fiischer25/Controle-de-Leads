-- AIROS · Etapas fixas "Ganho" e "Não ganho" no funil de oportunidades
-- Renomeia "Fechado" → "Ganho" e "Perdido" → "Não ganho" (os leads continuam nelas) e cria
-- as duas, se faltarem, no fim do funil. Pode rodar mais de uma vez.
-- Como aplicar: Supabase → SQL Editor → cole tudo até "FIM" → Run.

update public.lead_stages set name = 'Ganho', kind = 'won' where name = 'Fechado'
  and not exists (select 1 from public.lead_stages where name = 'Ganho');
update public.lead_stages set name = 'Não ganho', kind = 'lost' where name = 'Perdido'
  and not exists (select 1 from public.lead_stages where name = 'Não ganho');
update public.lead_stages set kind = 'won' where name = 'Ganho';
update public.lead_stages set kind = 'lost' where name = 'Não ganho';

insert into public.lead_stages (name, kind, color, position)
select 'Ganho', 'won', '#5d8263', coalesce((select max(position) from public.lead_stages), 0) + 1
where not exists (select 1 from public.lead_stages where kind = 'won');

insert into public.lead_stages (name, kind, color, position)
select 'Não ganho', 'lost', '#b3aca2', coalesce((select max(position) from public.lead_stages), 0) + 1
where not exists (select 1 from public.lead_stages where kind = 'lost');

-- Conferência: deve listar "Ganho | won" e "Não ganho | lost"
select name, kind from public.lead_stages where kind <> 'open' order by kind desc;

-- FIM
