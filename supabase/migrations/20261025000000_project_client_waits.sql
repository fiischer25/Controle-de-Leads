-- AIROS · Aguardando retorno do cliente
-- Cada vez que o projeto fica com o cliente analisando ("Aguardando retorno cliente" na lista de
-- projetos), guarda o período e a etapa em análise: [{ phase, started_at, ended_at }].
-- Mostra há quantos dias está com o cliente e quanto tempo cada etapa ficou esperando o retorno.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.projects add column if not exists client_waits jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
