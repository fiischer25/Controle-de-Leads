-- AIROS · Tarefas-modelo do tipo "Arquitetura e Interiores"
-- Etapas e tarefas do escritório: LD - Levantamento de Dados, EP - Estudo Preliminar,
-- C3D - Concepção 3D, PI - Projeto de Interiores, PL - Projeto Legal, PCE - Projetos
-- Complementares Engenharia, CO - Compatibilização, PE - Projeto Executivo,
-- PEI - Projeto Executivo de Interiores e VL - Visita em Lojas (23 tarefas, com checklist).
--
-- ATENÇÃO: substitui as tarefas-modelo atuais desse tipo (não mexe nos projetos já criados
-- nem nos outros tipos). Rodar de novo desfaz ajustes feitos depois em Configurações.
-- Requer a migração 20261008000000_task_templates_details.sql.
--
-- As tarefas-modelo não têm datas nem duração: ao entrar num projeto, início e fim são
-- definidos por quem cuida dele e a duração sai dessas datas. Por isso a duração passa a
-- aceitar 0 (todas as tarefas-modelo ficam com 0).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.

-- Duração 0 permitida nas tarefas-modelo (todas ficam sem duração)
alter table public.task_templates drop constraint if exists task_templates_duration_days_check;
alter table public.task_templates add constraint task_templates_duration_days_check check (duration_days >= 0);
update public.task_templates set duration_days = 0, start_with_previous = false
  where duration_days <> 0 or start_with_previous;

-- Cria o tipo, se ainda não existir
insert into public.project_types (name, description, color, active, position)
select 'Arquitetura e Interiores', 'Projeto completo de arquitetura com interiores.', '#5d8263', true,
       coalesce((select max(position) + 1 from public.project_types), 0)
where not exists (select 1 from public.project_types where name = 'Arquitetura e Interiores');

-- Remove as tarefas-modelo antigas do tipo
delete from public.task_templates
where project_type_id = (
  select id from public.project_types where name = 'Arquitetura e Interiores' order by position limit 1
);

-- Cadastra as novas (sem datas nem duração; o responsável é o do projeto)
insert into public.task_templates (
  project_type_id, phase, title, description, duration_days, position, checklist, priority, start_with_previous
)
select
  (select id from public.project_types where name = 'Arquitetura e Interiores' order by position limit 1),
  v.phase, v.title, null, v.days, v.pos, v.checklist::jsonb, v.priority, v.parallel
from (values
  ('LD - Levantamento de Dados', 'Coleta de Documentos', 0, 0, '["Matrícula atualizada do imóvel","IPTU / inscrição imobiliária","Guia amarela (consulta de zoneamento)","Levantamento topográfico","Documentos pessoais do proprietário"]', 'alta', false),
  ('LD - Levantamento de Dados', 'Levantamento do Programa de Necessidades (Briefing)', 0, 1, '["Aplicar questionário de briefing","Registrar o programa de necessidades"]', 'alta', false),
  ('LD - Levantamento de Dados', 'Reunião com o Cliente', 0, 2, '["Agendar a reunião","Apresentar etapas, prazos e forma de trabalho","Registrar as decisões da reunião"]', 'media', false),
  ('LD - Levantamento de Dados', 'Visita ao Terreno', 0, 3, '["Fotos do terreno e do entorno","Conferir medidas, níveis e orientação solar"]', 'media', false),
  ('EP - Estudo Preliminar', 'Estudo de Planta Layout', 0, 4, '["Implantação no terreno","Setorização e fluxos","Planta layout do térreo","Planta layout do pavimento superior","Pré-dimensionamento dos ambientes","Verificar recuos, taxa de ocupação e coeficiente","Quadro de áreas","Estudo de cobertura","Apresentação ao cliente"]', 'media', false),
  ('EP - Estudo Preliminar', 'Revisões do Estudo Preliminar', 0, 5, '["Aprovação do estudo preliminar pelo cliente"]', 'baixa', false),
  ('C3D - Concepção 3D', 'Modelagem 3D da volumetria', 0, 6, '["Modelar a volumetria a partir do layout aprovado","Definir cobertura e aberturas"]', 'media', false),
  ('C3D - Concepção 3D', 'Estudo de fachadas e materiais', 0, 7, '["Fachadas principais","Materiais e cores","Paisagismo básico"]', 'media', false),
  ('C3D - Concepção 3D', 'Apresentação e aprovação do 3D', 0, 8, '["Gerar imagens","Reunião de apresentação","Registrar ajustes ou aprovação"]', 'media', false),
  ('PI - Projeto de Interiores', 'Briefing de interiores e referências', 0, 9, '["Questionário de interiores","Pasta de referências","Validar orçamento previsto"]', 'media', false),
  ('PI - Projeto de Interiores', 'Layout e mobiliário', 0, 10, '["Layout de todos os ambientes","Mobiliário existente e novo"]', 'media', false),
  ('PI - Projeto de Interiores', 'Moodboard e conceito', 0, 11, '["Moodboard por ambiente","Paleta de cores e materiais"]', 'media', false),
  ('PI - Projeto de Interiores', 'Modelagem 3D e imagens dos ambientes', 0, 12, '["Modelar os ambientes","Renderizar as imagens"]', 'media', false),
  ('PI - Projeto de Interiores', 'Apresentação e ajustes de interiores', 0, 13, '["Reunião de apresentação","Ajustes pedidos","Aprovação do cliente"]', 'media', false),
  ('PL - Projeto Legal', 'Projeto legal e aprovação na prefeitura', 0, 14, '["Plantas no padrão da prefeitura","Memorial e quadro de áreas","ART/RRT emitida","Documentos do proprietário","Protocolo e acompanhamento na prefeitura"]', 'alta', false),
  ('PCE - Projetos Complementares Engenharia', 'Projeto estrutural', 0, 15, '["Enviar arquitetura ao engenheiro","Receber e revisar o projeto"]', 'media', false),
  ('PCE - Projetos Complementares Engenharia', 'Projeto elétrico', 0, 16, '["Enviar layout e pontos","Receber e revisar o projeto"]', 'media', false),
  ('PCE - Projetos Complementares Engenharia', 'Projeto hidrossanitário', 0, 17, '["Enviar layout e pontos","Receber e revisar o projeto"]', 'media', false),
  ('CO - Compatibilização', 'Compatibilização dos projetos', 0, 18, '["Estrutural","Elétrico","Hidrossanitário","Ar-condicionado","Registrar interferências resolvidas"]', 'media', false),
  ('PE - Projeto Executivo', 'Projeto executivo de arquitetura', 0, 19, '["Plantas executivas","Cortes e fachadas","Detalhes construtivos","Esquadrias","Memorial descritivo e especificações","Revisão final e conferência"]', 'media', false),
  ('PEI - Projeto Executivo de Interiores', 'Detalhamento de marcenaria', 0, 20, '["Plantas e vistas de cada móvel","Especificar ferragens e acabamentos","Revisar com o marceneiro"]', 'media', false),
  ('PEI - Projeto Executivo de Interiores', 'Paginações, luminotécnico e especificações', 0, 21, '["Paginação de piso e revestimentos","Projeto luminotécnico","Pontos elétricos e hidráulicos","Especificações e lista de compras"]', 'media', false),
  ('VL - Visita em Lojas', 'Visita às lojas com o cliente', 0, 22, '["Agendar com as lojas","Revestimentos, louças e metais","Iluminação e mobiliário","Registrar escolhas e orçamentos"]', 'media', false)
) as v (phase, title, days, pos, checklist, priority, parallel);
