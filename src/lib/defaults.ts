import type { AppSettings, LeadSource, LeadStage, ProjectType, TaskTemplate } from './types';
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

const ARQ_INT: PhaseSpec[] = [
  ...ARQ.filter(([p]) => p !== 'Entrega'),
  ...INT.filter(([p]) => p !== 'Briefing' && p !== 'Entrega').map(
    ([p, t]) => [p.startsWith('Executivo') ? p : `Interiores · ${p}`, t] as PhaseSpec,
  ),
  ['Entrega', [
    ['Caderno de projeto completo', 3],
    ['Revisão final e conferência', 2],
    ['Entrega do projeto ao cliente', 1],
  ]],
];

export function defaultProjectTypes(): { types: ProjectType[]; templates: TaskTemplate[] } {
  const specs: Array<[string, string, string, PhaseSpec[]]> = [
    ['Arquitetura', 'Projeto arquitetônico completo, do estudo ao executivo.', '#8f7c61', ARQ],
    ['Interiores', 'Projeto de interiores, do conceito ao detalhamento.', '#557589', INT],
    ['Arquitetura e Interiores', 'Projeto completo de arquitetura com interiores.', '#5d8263', ARQ_INT],
  ];
  const types: ProjectType[] = [];
  const templates: TaskTemplate[] = [];
  specs.forEach(([name, description, color, phases], position) => {
    const type: ProjectType = { id: uid(), name, description, color, active: true, position };
    types.push(type);
    let pos = 0;
    for (const [phase, tasks] of phases) {
      for (const [title, duration_days] of tasks) {
        templates.push({
          id: uid(),
          project_type_id: type.id,
          phase,
          title,
          description: null,
          duration_days,
          position: pos++,
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
