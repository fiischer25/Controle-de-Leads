// Diagnóstico do banco (Supabase): confere se cada migração já foi aplicada, testando uma
// coluna ou função que só ela cria. Usado em Configurações → Banco de dados e no aviso ao
// administrador.

import { backend } from './backend';
import type { SupabaseBackend } from './backend/supabase';
import type { LeadStage, TaskTemplate } from './types';

type Db = { task_templates: TaskTemplate[]; lead_stages: LeadStage[] };

export interface SchemaItem {
  file: string;
  label: string;
  /** ok: aplicada · missing: falta (funções do sistema falham) · optional: recomendada */
  status: 'ok' | 'missing' | 'optional';
  detail?: string;
}

const NO_LEAD = '00000000-0000-0000-0000-000000000000';

const REQUIRED: Array<{ file: string; label: string; probe: (b: SupabaseBackend) => Promise<string | null> }> = [
  { file: '20260930000000_meetings_logo_agent.sql', label: 'Reuniões, logo e assistente', probe: (b) => b.probe('events', 'id') },
  { file: '20261004000000_module_permissions.sql', label: 'Acessos por módulo', probe: (b) => b.probe('profiles', 'permissions') },
  { file: '20261005000000_whatsapp_alerts.sql', label: 'Resumo diário no WhatsApp', probe: (b) => b.probe('app_settings', 'wa_alerts_enabled') },
  { file: '20261006000000_finance.sql', label: 'Financeiro (lançamentos, contas e categorias)', probe: (b) => b.probe('finance_entries', 'id,amount,paid_at') },
  { file: '20261007000000_finance_import_files.sql', label: 'Financeiro: extrato e comprovantes', probe: (b) => b.probe('finance_entries', 'bank_ref,attachments') },
  { file: '20261008000000_task_templates_details.sql', label: 'Tarefas-modelo com checklist e responsável', probe: (b) => b.probe('task_templates', 'checklist,start_with_previous') },
  {
    file: '20261009000000_lead_payment_plan.sql',
    label: 'Forma de pagamento no ganho (parcelas no Financeiro)',
    probe: async (b) => (await b.probe('leads', 'payment_plan')) ?? (await b.probe('finance_entries', 'lead_id')),
  },
  {
    file: '20261013000000_payment_plan_values.sql',
    label: 'Parcelas em R$ e edição do contrato depois do ganho',
    probe: (b) => b.probeRpc('create_lead_receivables', { p_lead: NO_LEAD, p_replace: false }),
  },
  { file: '20261015000000_task_attachments.sql', label: 'Arquivos (PDF) nas tarefas', probe: (b) => b.probe('tasks', 'attachments') },
  { file: '20261017000000_project_documents.sql', label: 'Documentos do projeto (contrato em PDF)', probe: (b) => b.probe('projects', 'attachments') },
  { file: '20261018000000_project_status_obra.sql', label: 'Status do projeto: Obra e status definido à mão', probe: (b) => b.probe('projects', 'status_manual') },
  {
    file: '20261014000000_finance_access_repair.sql',
    label: 'Permissões do Financeiro (administrador com acesso total)',
    probe: (b) => b.probeRpc('airos_my_access', {}),
  },
];

/** O que o banco enxerga do usuário logado (função airos_my_access, migração 20261014). */
export interface MyAccess {
  uid: string | null;
  role: string | null;
  active: boolean | null;
  permissions: string[] | null;
  financeiro: boolean;
  comercial: boolean;
  finance_policies: number;
}

export async function myAccess(): Promise<MyAccess | null> {
  if (backend.mode !== 'supabase') return null;
  const b = backend as unknown as SupabaseBackend;
  const { data, error } = await b.client.rpc('airos_my_access');
  return error ? null : (data as MyAccess);
}

/** Recomendadas: dependem dos dados (podem ter sido ajustadas à mão em Configurações). */
function optionalChecks(db: Db): SchemaItem[] {
  const out: SchemaItem[] = [];
  if (!db.task_templates.some((t) => t.phase.startsWith('LD - '))) {
    out.push({
      file: '20261010000000_arq_int_templates.sql',
      label: 'Modelo Arquitetura e Interiores do escritório (substitui as tarefas-modelo desse tipo)',
      status: 'optional',
    });
  }
  if (!db.lead_stages.some((s) => s.name === 'Qualificado')) {
    out.push({ file: '20261011000000_crm_defaults.sql', label: 'Etapas do funil e origens no padrão de CRM', status: 'optional' });
  }
  const execInt = db.task_templates.filter((t) => /executivo de interiores/i.test(t.phase));
  if (execInt.length && !execInt.some((t) => t.title.toLowerCase() === 'detalhamento de pontos de esgoto')) {
    out.push({
      file: '20261016000000_interiores_executivo.sql',
      label: 'Executivo de Interiores detalhado (15 tarefas em Interiores e Arquitetura e Interiores)',
      status: 'optional',
    });
  }
  if (!db.lead_stages.some((s) => s.name === 'Não ganho' && s.kind === 'lost')) {
    out.push({ file: '20261012000000_won_lost_stages.sql', label: 'Etapas fixas Ganho e Não ganho', status: 'optional' });
  }
  return out;
}

export async function checkSchema(db: Db): Promise<SchemaItem[]> {
  if (backend.mode !== 'supabase') return [];
  const b = backend as unknown as SupabaseBackend;
  const required = await Promise.all(
    REQUIRED.map(async (c) => {
      const error = await c.probe(b).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
      return { file: c.file, label: c.label, status: error ? 'missing' : 'ok', detail: error ?? undefined } satisfies SchemaItem;
    }),
  );
  return [...required, ...optionalChecks(db)];
}

/** Conteúdo de cada arquivo de migração (carregado só quando pedido). */
const SQL_FILES = import.meta.glob('/supabase/migrations/*.sql', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export async function migrationSql(file: string): Promise<string> {
  const load = SQL_FILES[`/supabase/migrations/${file}`];
  if (!load) throw new Error(`Arquivo ${file} não encontrado.`);
  return load();
}
