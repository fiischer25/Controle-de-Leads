-- AIROS · Custo da equipe com mais casas decimais
-- O custo de cada pessoa é digitado por mês (salário + encargos) e guardado por hora. Com só 2
-- casas, R$ 500 por mês viravam R$ 2,98 por hora e voltavam como R$ 500,64. Com 6 casas a conta
-- fecha (R$ 500 ÷ 21 dias = R$ 23,81 por dia).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

alter table public.finance_member_costs alter column hourly_cost type numeric(14, 6);

-- Marca para o diagnóstico do banco (Configurações → Banco de dados) saber que esta migração foi aplicada.
create or replace function public.airos_member_cost_precision()
returns integer
language sql
stable
as $$ select 6 $$;

grant execute on function public.airos_member_cost_precision() to authenticated;

notify pgrst, 'reload schema';
