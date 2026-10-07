-- AIROS · Executivo de Interiores com o detalhamento completo
-- Nos tipos "Arquitetura e Interiores" e "Interiores" (Arquitetura não muda), a etapa do
-- executivo de interiores passa a ter, nesta ordem:
--   Detalhamento de Pontos elétricos · hidráulicos · de Esgoto · de Ar-Condicionado,
--   Projeto Luminotécnico, Paginação de Piso e Parede, Detalhamento de Bancadas · de Marcenaria
--   · de Forro, Especificação de Revestimentos · de Mármores e Granitos · de Louças e Metais ·
--   de Iluminação, Paisagismo e Orçamentos.
-- Tarefas-modelo com o mesmo nome são mantidas (com o checklist); as antigas que agrupavam
-- esses itens ("Paginações, luminotécnico e especificações", "Pontos elétricos e hidráulicos",
-- "Especificações e lista de compras", "Paginação de piso e revestimentos") saem. Outras
-- tarefas que o escritório tenha criado na etapa continuam, logo depois. Projetos já criados
-- não mudam: o modelo vale para os próximos projetos.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode ser executado mais de uma vez sem problemas.

do $$
declare
  t record;
  ph text;
  base double precision;
  i int;
  existing uuid;
  titles text[] := array[
    'Detalhamento de Pontos elétricos',
    'Detalhamento de Pontos hidráulicos',
    'Detalhamento de Pontos de Esgoto',
    'Detalhamento de Pontos de Ar-Condicionado',
    'Projeto Luminotécnico',
    'Paginação de Piso e Parede',
    'Detalhamento de Bancadas',
    'Detalhamento de Marcenaria',
    'Detalhamento de Forro',
    'Especificação de Revestimentos',
    'Especificação de Mármores e Granitos',
    'Especificação de Louças e Metais',
    'Especificação de Iluminação',
    'Paisagismo',
    'Orçamentos'
  ];
  replaced text[] := array[
    'paginações, luminotécnico e especificações',
    'pontos elétricos e hidráulicos',
    'especificações e lista de compras',
    'paginação de piso e revestimentos'
  ];
begin
  for t in select id, name from public.project_types where name in ('Arquitetura e Interiores', 'Interiores') loop
    -- Etapa do executivo de interiores deste tipo (nome pode ter sido ajustado)
    select x.phase, min(x.position) into ph, base
    from public.task_templates x
    where x.project_type_id = t.id and x.phase ilike '%executivo de interiores%'
    group by x.phase
    order by min(x.position)
    limit 1;

    if ph is null then
      -- Etapa não existe: cria antes da entrega (ou no fim)
      ph := case when t.name = 'Interiores' then 'Executivo de Interiores' else 'PEI - Projeto Executivo de Interiores' end;
      select min(x.position) into base from public.task_templates x
      where x.project_type_id = t.id and (x.phase ilike '%entrega%' or x.phase ilike 'VL - %');
      if base is null then
        select coalesce(max(x.position) + 1, 0) into base from public.task_templates x where x.project_type_id = t.id;
      end if;
    end if;

    delete from public.task_templates
    where project_type_id = t.id and phase = ph and lower(title) = any (replaced);

    -- Abre espaço: o que vem depois (fora da etapa) vai para o fim; extras da etapa logo após as 15
    update public.task_templates set position = position + 1000
    where project_type_id = t.id and phase <> ph and position >= base;
    update public.task_templates set position = base + 500 + position
    where project_type_id = t.id and phase = ph
      and lower(title) <> all (select lower(unnest(titles)));

    for i in 1 .. array_length(titles, 1) loop
      select x.id into existing from public.task_templates x
      where x.project_type_id = t.id and x.phase = ph and lower(x.title) = lower(titles[i])
      limit 1;
      if existing is null then
        insert into public.task_templates (project_type_id, phase, title, description, duration_days, position, checklist, priority, start_with_previous)
        values (
          t.id, ph, titles[i], null, 0, base + i - 1,
          case when titles[i] = 'Detalhamento de Marcenaria'
            then '["Plantas e vistas de cada móvel","Especificar ferragens e acabamentos","Revisar com o marceneiro"]'::jsonb
            else '[]'::jsonb end,
          'media', false
        );
      else
        update public.task_templates set title = titles[i], position = base + i - 1 where id = existing;
      end if;
    end loop;

    -- Renumera o tipo inteiro (0, 1, 2…) mantendo a ordem
    with o as (
      select x.id, row_number() over (order by x.position, x.title) - 1 as rn
      from public.task_templates x where x.project_type_id = t.id
    )
    update public.task_templates x set position = o.rn from o where x.id = o.id;
  end loop;
end $$;
