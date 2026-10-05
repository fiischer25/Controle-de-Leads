-- AIROS · Etapas do funil e origens de lead no padrão de CRM
-- Não apaga nada: renomeia as antigas equivalentes (os leads continuam nelas), cria as que
-- faltam e reordena; as criadas por você ficam no fim. Pode rodar mais de uma vez.
-- Como aplicar: Supabase → SQL Editor → cole tudo até "FIM" → Run.

create temp table airos_st (name text, kind text, color text, pos int);
insert into airos_st values
  ('Novo lead', 'open', '#e0d7ca', 0),
  ('Em contato', 'open', '#d2c5b1', 1),
  ('Qualificado', 'open', '#c0ae94', 2),
  ('Reunião agendada', 'open', '#ab977a', 3),
  ('Proposta em elaboração', 'open', '#968064', 4),
  ('Proposta enviada', 'open', '#806c52', 5),
  ('Negociação', 'open', '#6b5a44', 6),
  ('Ganho', 'won', '#5d8263', 7),
  ('Não ganho', 'lost', '#b3aca2', 8);

create temp table airos_so (name text, pos int);
insert into airos_so values
  ('Instagram (orgânico)', 0),
  ('Facebook (orgânico)', 1),
  ('Meta Ads (Instagram/Facebook pago)', 2),
  ('Google Ads', 3),
  ('Google (busca orgânica)', 4),
  ('Google Meu Negócio', 5),
  ('Site / formulário', 6),
  ('WhatsApp', 7),
  ('Indicação de cliente', 8),
  ('Indicação de parceiro (construtora, corretor, engenheiro)', 9),
  ('Cliente recorrente', 10),
  ('Prospecção ativa', 11),
  ('Eventos e feiras', 12),
  ('Portais e marketplaces', 13),
  ('Outros', 14);

-- Nomes antigos equivalentes
update public.lead_stages set name = 'Em contato' where name = 'Primeiro contato'
  and not exists (select 1 from public.lead_stages where name = 'Em contato');
update public.lead_stages set name = 'Ganho' where name = 'Fechado'
  and not exists (select 1 from public.lead_stages where name = 'Ganho');
update public.lead_stages set name = 'Não ganho' where name = 'Perdido'
  and not exists (select 1 from public.lead_stages where name = 'Não ganho');
update public.lead_sources o set name = r.novo from (values
  ('Tráfego pago (Meta Ads)', 'Meta Ads (Instagram/Facebook pago)'),
  ('Tráfego pago (Google Ads)', 'Google Ads'),
  ('Instagram orgânico', 'Instagram (orgânico)'),
  ('Site', 'Site / formulário'),
  ('Indicação', 'Indicação de cliente'),
  ('Parceiro (construtora / corretor)', 'Indicação de parceiro (construtora, corretor, engenheiro)')
) as r (antigo, novo)
where o.name = r.antigo and not exists (select 1 from public.lead_sources x where x.name = r.novo);

-- Cria as que faltam
insert into public.lead_stages (name, kind, color, position)
select name, kind, color, pos from airos_st t
where not exists (select 1 from public.lead_stages s where s.name = t.name);
insert into public.lead_sources (name, active, position)
select name, true, pos from airos_so t
where not exists (select 1 from public.lead_sources s where s.name = t.name);

-- Ordem (e cores das etapas); as personalizadas vão para o fim
update public.lead_stages set position = position + 100 where position < 100;
update public.lead_stages s set position = t.pos, kind = t.kind, color = t.color from airos_st t where s.name = t.name;
update public.lead_sources set position = position + 100 where position < 100;
update public.lead_sources s set position = t.pos, active = true from airos_so t where s.name = t.name;

drop table airos_st;
drop table airos_so;

-- FIM
