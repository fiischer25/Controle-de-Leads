import type { AppSettings, FinanceAccount, FinanceCategory, LeadSource, LeadStage, ProjectType, TaskPriority, TaskTemplate } from './types';
import { nowIso, uid } from './utils';

/**
 * Configuração inicial do escritório. É gravada automaticamente no primeiro acesso
 * de um administrador quando as tabelas de configuração estão vazias, e pode ser
 * totalmente editada depois em Configurações.
 */

export function defaultStages(): LeadStage[] {
  const stages: Array<[string, LeadStage['kind'], string]> = [
    ['Novo lead', 'open', '#e0d7ca'],
    ['Primeiro contato', 'open', '#c9baa4'],
    ['Reunião agendada', 'open', '#ad9a7e'],
    ['Proposta enviada', 'open', '#8f7c61'],
    ['Negociação', 'open', '#76654e'],
    ['Fechado', 'won', '#5d8263'],
    ['Perdido', 'lost', '#b3aca2'],
  ];
  return stages.map(([name, kind, color], position) => ({ id: uid(), name, kind, color, position }));
}

export function defaultSources(): LeadSource[] {
  return [
    'Tráfego pago (Meta Ads)',
    'Tráfego pago (Google Ads)',
    'Instagram orgânico',
    'Indicação',
    'Site',
    'WhatsApp',
    'Cliente recorrente',
    'Parceiro (construtora / corretor)',
    'Outros',
  ].map((name, position) => ({ id: uid(), name, active: true, position }));
}

type PhaseSpec = [phase: string, tasks: Array<[title: string, days: number]>];

/** Checklists iniciais das tarefas-modelo (editáveis em Configurações → Tipos de projeto e tarefas). */
const CHECKLISTS: Record<string, string[]> = {
  'Briefing com o cliente': ['Enviar questionário de briefing', 'Reunião de briefing', 'Registrar programa de necessidades', 'Confirmar orçamento e prazo esperados'],
  'Levantamento métrico e cadastral': ['Agendar visita técnica', 'Medir ambientes e níveis', 'Registrar instalações existentes', 'Desenhar o levantamento no CAD/Revit'],
  'Levantamento fotográfico e legislação': ['Fotos do terreno/imóvel e entorno', 'Consultar zoneamento e recuos', 'Levantar matrícula e documentos do imóvel'],
  'Programa de necessidades': ['Listar ambientes e áreas', 'Validar com o cliente'],
  'Apresentação do estudo preliminar': ['Preparar prancha/apresentação', 'Reunião com o cliente', 'Registrar ajustes pedidos'],
  'Apresentação do anteprojeto': ['Preparar imagens e plantas', 'Reunião com o cliente', 'Registrar aprovação ou ajustes'],
  'Projeto legal para aprovação': ['Plantas no padrão da prefeitura', 'Memorial e quadro de áreas', 'ART/RRT emitida', 'Documentos do proprietário'],
  'Compatibilização com projetos complementares': ['Estrutural', 'Elétrico', 'Hidrossanitário', 'Ar-condicionado', 'Registrar interferências resolvidas'],
  'Revisão final e conferência': ['Conferir cotas e níveis', 'Conferir carimbos e revisões', 'Gerar PDFs e DWGs finais'],
  'Entrega do projeto ao cliente': ['Enviar arquivos finais', 'Reunião de entrega', 'Termo de entrega assinado'],
  'Briefing e referências do cliente': ['Questionário de briefing', 'Pasta de referências', 'Validar orçamento previsto'],
  'Levantamento do espaço': ['Medição dos ambientes', 'Fotos', 'Pontos elétricos e hidráulicos existentes'],
  'Detalhamento de marcenaria': ['Plantas e vistas de cada móvel', 'Especificar ferragens e acabamentos', 'Revisar com o marceneiro'],
  'Especificações e lista de compras': ['Revestimentos', 'Louças e metais', 'Iluminação', 'Mobiliário e decoração'],
};

const ARQ: PhaseSpec[] = [
  ['Levantamento', [
    ['Briefing com o cliente', 2],
    ['Levantamento métrico e cadastral', 3],
    ['Levantamento fotográfico e legislação', 2],
  ]],
  ['Estudo Preliminar', [
    ['Programa de necessidades', 2],
    ['Estudo de implantação e volumetria', 5],
    ['Apresentação do estudo preliminar', 1],
    ['Ajustes do estudo preliminar', 3],
  ]],
  ['Anteprojeto', [
    ['Desenvolvimento do anteprojeto', 8],
    ['Modelagem 3D e imagens', 5],
    ['Apresentação do anteprojeto', 1],
    ['Ajustes do anteprojeto', 3],
  ]],
  ['Projeto Legal', [
    ['Projeto legal para aprovação', 5],
    ['Protocolo e acompanhamento na prefeitura', 10],
  ]],
  ['Projeto Executivo', [
    ['Plantas executivas', 8],
    ['Cortes, fachadas e detalhes construtivos', 6],
    ['Compatibilização com projetos complementares', 5],
    ['Memorial descritivo e especificações', 3],
  ]],
  ['Entrega', [
    ['Revisão final e conferência', 2],
    ['Entrega do projeto ao cliente', 1],
  ]],
];

const INT: PhaseSpec[] = [
  ['Briefing', [
    ['Briefing e referências do cliente', 2],
    ['Levantamento do espaço', 2],
  ]],
  ['Conceito', [
    ['Moodboard e conceito', 3],
    ['Estudo de layout', 4],
    ['Apresentação do conceito', 1],
  ]],
  ['Projeto 3D', [
    ['Modelagem 3D', 5],
    ['Renderizações', 4],
    ['Apresentação e ajustes do 3D', 3],
  ]],
  ['Executivo de Interiores', [
    ['Paginação de piso e revestimentos', 3],
    ['Projeto luminotécnico', 3],
    ['Detalhamento de marcenaria', 7],
    ['Pontos elétricos e hidráulicos', 3],
    ['Especificações e lista de compras', 3],
  ]],
  ['Entrega', [
    ['Caderno de projeto', 2],
    ['Entrega do projeto ao cliente', 1],
  ]],
];

/** Tarefa-modelo com prioridade, checklist e execução em paralelo com a anterior. */
type RichTask = { title: string; days: number; priority?: TaskPriority; checklist?: string[]; parallel?: boolean };
type RichPhaseSpec = [phase: string, tasks: RichTask[]];

/**
 * Arquitetura e Interiores: etapas e tarefas do escritório (mesmas da migração
 * 20261010000000_arq_int_templates.sql). Durações em dias úteis.
 */
export const ARQ_INT: RichPhaseSpec[] = [
  ['LD - Levantamento de Dados', [
    { title: 'Coleta de Documentos', days: 12, priority: 'alta', checklist: ['Matrícula atualizada do imóvel', 'IPTU / inscrição imobiliária', 'Guia amarela (consulta de zoneamento)', 'Levantamento topográfico', 'Documentos pessoais do proprietário'] },
    { title: 'Levantamento do Programa de Necessidades (Briefing)', days: 2, priority: 'alta', checklist: ['Aplicar questionário de briefing', 'Registrar o programa de necessidades'] },
    { title: 'Reunião com o Cliente', days: 0, checklist: ['Agendar a reunião', 'Apresentar etapas, prazos e forma de trabalho', 'Registrar as decisões da reunião'] },
    { title: 'Visita ao Terreno', days: 0, checklist: ['Fotos do terreno e do entorno', 'Conferir medidas, níveis e orientação solar'] },
  ]],
  ['EP - Estudo Preliminar', [
    { title: 'Estudo de Planta Layout', days: 30, checklist: ['Implantação no terreno', 'Setorização e fluxos', 'Planta layout do térreo', 'Planta layout do pavimento superior', 'Pré-dimensionamento dos ambientes', 'Verificar recuos, taxa de ocupação e coeficiente', 'Quadro de áreas', 'Estudo de cobertura', 'Apresentação ao cliente'] },
    { title: 'Revisões do Estudo Preliminar', days: 20, priority: 'baixa', checklist: ['Aprovação do estudo preliminar pelo cliente'] },
  ]],
  ['C3D - Concepção 3D', [
    { title: 'Modelagem 3D da volumetria', days: 10, checklist: ['Modelar a volumetria a partir do layout aprovado', 'Definir cobertura e aberturas'] },
    { title: 'Estudo de fachadas e materiais', days: 7, checklist: ['Fachadas principais', 'Materiais e cores', 'Paisagismo básico'] },
    { title: 'Apresentação e aprovação do 3D', days: 3, checklist: ['Gerar imagens', 'Reunião de apresentação', 'Registrar ajustes ou aprovação'] },
  ]],
  ['PI - Projeto de Interiores', [
    { title: 'Briefing de interiores e referências', days: 2, checklist: ['Questionário de interiores', 'Pasta de referências', 'Validar orçamento previsto'] },
    { title: 'Layout e mobiliário', days: 5, checklist: ['Layout de todos os ambientes', 'Mobiliário existente e novo'] },
    { title: 'Moodboard e conceito', days: 3, checklist: ['Moodboard por ambiente', 'Paleta de cores e materiais'] },
    { title: 'Modelagem 3D e imagens dos ambientes', days: 10, checklist: ['Modelar os ambientes', 'Renderizar as imagens'] },
    { title: 'Apresentação e ajustes de interiores', days: 5, checklist: ['Reunião de apresentação', 'Ajustes pedidos', 'Aprovação do cliente'] },
  ]],
  ['PL - Projeto Legal', [
    { title: 'Projeto legal e aprovação na prefeitura', days: 15, priority: 'alta', checklist: ['Plantas no padrão da prefeitura', 'Memorial e quadro de áreas', 'ART/RRT emitida', 'Documentos do proprietário', 'Protocolo e acompanhamento na prefeitura'] },
  ]],
  ['PCE - Projetos Complementares Engenharia', [
    { title: 'Projeto estrutural', days: 15, checklist: ['Enviar arquitetura ao engenheiro', 'Receber e revisar o projeto'] },
    { title: 'Projeto elétrico', days: 10, parallel: true, checklist: ['Enviar layout e pontos', 'Receber e revisar o projeto'] },
    { title: 'Projeto hidrossanitário', days: 10, parallel: true, checklist: ['Enviar layout e pontos', 'Receber e revisar o projeto'] },
  ]],
  ['CO - Compatibilização', [
    { title: 'Compatibilização dos projetos', days: 5, checklist: ['Estrutural', 'Elétrico', 'Hidrossanitário', 'Ar-condicionado', 'Registrar interferências resolvidas'] },
  ]],
  ['PE - Projeto Executivo', [
    { title: 'Projeto executivo de arquitetura', days: 20, checklist: ['Plantas executivas', 'Cortes e fachadas', 'Detalhes construtivos', 'Esquadrias', 'Memorial descritivo e especificações', 'Revisão final e conferência'] },
  ]],
  ['PEI - Projeto Executivo de Interiores', [
    { title: 'Detalhamento de marcenaria', days: 10, checklist: CHECKLISTS['Detalhamento de marcenaria'] },
    { title: 'Paginações, luminotécnico e especificações', days: 7, checklist: ['Paginação de piso e revestimentos', 'Projeto luminotécnico', 'Pontos elétricos e hidráulicos', 'Especificações e lista de compras'] },
  ]],
  ['VL - Visita em Lojas', [
    { title: 'Visita às lojas com o cliente', days: 2, checklist: ['Agendar com as lojas', 'Revestimentos, louças e metais', 'Iluminação e mobiliário', 'Registrar escolhas e orçamentos'] },
  ]],
];

const rich = (phases: PhaseSpec[]): RichPhaseSpec[] =>
  phases.map(([phase, tasks]) => [phase, tasks.map(([title, days]) => ({ title, days, checklist: CHECKLISTS[title] }))]);

export function defaultProjectTypes(): { types: ProjectType[]; templates: TaskTemplate[] } {
  const specs: Array<[string, string, string, RichPhaseSpec[]]> = [
    ['Arquitetura', 'Projeto arquitetônico completo, do estudo ao executivo.', '#8f7c61', rich(ARQ)],
    ['Interiores', 'Projeto de interiores, do conceito ao detalhamento.', '#557589', rich(INT)],
    ['Arquitetura e Interiores', 'Projeto completo de arquitetura com interiores.', '#5d8263', ARQ_INT],
  ];
  const types: ProjectType[] = [];
  const templates: TaskTemplate[] = [];
  specs.forEach(([name, description, color, phases], position) => {
    const type: ProjectType = { id: uid(), name, description, color, active: true, position };
    types.push(type);
    let pos = 0;
    for (const [phase, tasks] of phases) {
      for (const task of tasks) {
        templates.push({
          id: uid(),
          project_type_id: type.id,
          phase,
          title: task.title,
          description: null,
          duration_days: task.days,
          position: pos++,
          checklist: task.checklist ?? [],
          assignee_id: null,
          priority: task.priority ?? 'media',
          estimated_hours: null,
          start_with_previous: !!task.parallel,
        });
      }
    }
  });
  return { types, templates };
}

export function defaultSettings(): AppSettings {
  return {
    id: 'office',
    office_name: 'AIROS Arquitetura',
    logo_url: null,
    calendar_embed_url: null,
    due_soon_days: 7,
    lead_stale_days: 7,
    project_code_prefix: 'AIR',
    wa_alerts_enabled: false,
    wa_alerts_hour: 8,
    wa_alerts_tasks: true,
    wa_alerts_projects: true,
    wa_alerts_leads: true,
    wa_alerts_weekends: false,
    updated_at: nowIso(),
  };
}

/** Categorias iniciais do Financeiro (mesmas da migração 20261006000000_finance.sql). */
export function defaultFinanceCategories(): FinanceCategory[] {
  const rows: Array<[string, FinanceCategory['kind'], string]> = [
    ['Honorários de projeto', 'receita', '#3f7d5a'],
    ['Reserva técnica (RT)', 'receita', '#5b8f6f'],
    ['Acompanhamento de obra', 'receita', '#7aa386'],
    ['Outras receitas', 'receita', '#9bb8a3'],
    ['Salários e pró-labore', 'despesa', '#8a4b3c'],
    ['Aluguel e condomínio', 'despesa', '#9c5a48'],
    ['Impostos', 'despesa', '#a86b56'],
    ['Contabilidade', 'despesa', '#b37c65'],
    ['Softwares e assinaturas', 'despesa', '#7c6f64'],
    ['Energia, internet e telefone', 'despesa', '#8c7f73'],
    ['Marketing', 'despesa', '#9c8f83'],
    ['Deslocamentos e visitas', 'despesa', '#a89c90'],
    ['Impressões e plotagens', 'despesa', '#b4a99e'],
    ['Material de escritório', 'despesa', '#c0b6ac'],
    ['Tarifas bancárias', 'despesa', '#ccc3ba'],
    ['Outras despesas', 'despesa', '#d6cec6'],
  ];
  const now = nowIso();
  const pos: Record<string, number> = { receita: 0, despesa: 0 };
  return rows.map(([name, kind, color]) => ({ id: uid(), name, kind, color, active: true, position: pos[kind]++, created_at: now }));
}

export function defaultFinanceAccount(): FinanceAccount {
  return { id: uid(), name: 'Conta principal', kind: 'banco', opening_balance: 0, color: '#57534e', active: true, position: 0, created_at: nowIso() };
}
