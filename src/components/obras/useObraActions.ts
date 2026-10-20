import { useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { removeTeamFiles } from '../../lib/teamFiles';
import {
  approvalToken,
  budgetSnapshot,
  budgetTotals,
  nextCode,
  paymentSnapshot,
  stagesFromBudget,
} from '../../lib/obras';
import type {
  ApprovalKind,
  ApprovalSnapshot,
  Budget,
  Obra,
  ObraApproval,
  ObraIssue,
  ObraPayment,
  ObraStage,
  ObraStatus,
  ObraVisit,
} from '../../lib/types';
import { formatMoney, nowIso, uid } from '../../lib/utils';

export type ObraInput = Pick<
  Obra,
  | 'name' | 'client_id' | 'client_name' | 'client_phone' | 'client_email' | 'project_id' | 'manager_id' | 'member_ids'
  | 'address' | 'city' | 'area_m2' | 'start_date' | 'due_date' | 'contract_value' | 'notes'
> & { budget_id?: string | null; status?: ObraStatus };

export interface ApprovalRequest {
  kind: ApprovalKind;
  title: string;
  description?: string | null;
  amount?: number | null;
  obra?: Obra | null;
  budget?: Budget | null;
  payment_id?: string | null;
  snapshot?: ApprovalSnapshot | null;
  due_date?: string | null;
}

const photoPaths = (rows: Array<{ photos?: { path: string }[]; attachments?: { path: string }[] }>) =>
  rows.flatMap((r) => [...(r.photos ?? []), ...(r.attachments ?? [])].map((p) => p.path));

/** Ações do módulo Orçamentos e Obras sobre a camada de dados genérica. */
export function useObraActions() {
  const { db, me, insertRows, patch, removeRows, log, notify, updateProject, can } = useData();

  const saveBudget = useCallback(
    async (b: Budget, isNew: boolean) => {
      const row: Budget = { ...b, name: b.name.trim(), total: budgetTotals(b.data, b.area_m2).total, updated_at: nowIso() };
      if (isNew) {
        const [saved] = await insertRows('budgets', [row]);
        await log('budget', saved.id, 'created', `criou o orçamento ${saved.code} · ${saved.name}`);
        return saved;
      }
      await patch('budgets', b.id, row);
      return row;
    },
    [insertRows, patch, log],
  );

  const deleteBudget = useCallback(
    async (b: Budget) => {
      await removeRows('obra_approvals', db.obra_approvals.filter((a) => a.budget_id === b.id && !a.obra_id).map((a) => a.id));
      await removeRows('budgets', [b.id]);
      await log('budget', b.id, 'deleted', `excluiu o orçamento ${b.code} · ${b.name}`);
    },
    [db.obra_approvals, removeRows, log],
  );

  const requestApproval = useCallback(
    async (r: ApprovalRequest): Promise<ObraApproval> => {
      const now = nowIso();
      const owner = r.obra ?? r.budget ?? null;
      const approval: ObraApproval = {
        id: uid(),
        obra_id: r.obra?.id ?? null,
        budget_id: r.budget?.id ?? null,
        payment_id: r.payment_id ?? null,
        kind: r.kind,
        title: r.title.trim(),
        description: r.description?.trim() || null,
        amount: r.amount ?? null,
        snapshot: r.snapshot ?? null,
        token: approvalToken(),
        status: 'pendente',
        due_date: r.due_date ?? null,
        client_name: owner?.client_name ?? null,
        client_phone: owner?.client_phone ?? null,
        requested_by: me.id,
        requested_at: now,
        answered_at: null,
        answered_name: null,
        answer_comment: null,
        answered_via: null,
        created_at: now,
        updated_at: now,
      };
      const [saved] = await insertRows('obra_approvals', [approval]);
      if (r.obra) await log('obra', r.obra.id, 'approval', `pediu a aprovação do cliente: ${saved.title}`);
      else if (r.budget) await log('budget', r.budget.id, 'approval', `enviou o orçamento ${r.budget.code} para aprovação`);
      return saved;
    },
    [insertRows, log, me.id],
  );

  /** Envia o orçamento ao cliente: cria o pedido de aprovação (com o resumo) e marca como enviado. */
  const sendBudget = useCallback(
    async (b: Budget, detailed: boolean) => {
      // Um pedido em aberto por orçamento: o anterior é cancelado (o valor pode ter mudado)
      for (const old of db.obra_approvals.filter((a) => a.budget_id === b.id && a.kind === 'orcamento' && a.status === 'pendente')) {
        await patch('obra_approvals', old.id, { status: 'cancelado' });
      }
      const t = budgetTotals(b.data, b.area_m2);
      const approval = await requestApproval({
        kind: 'orcamento',
        title: `Orçamento ${b.code} · ${b.name}`,
        amount: t.total,
        budget: b,
        snapshot: budgetSnapshot(b, detailed),
      });
      await patch('budgets', b.id, { status: 'enviado', sent_at: nowIso(), answered_at: null });
      return approval;
    },
    [db.obra_approvals, patch, requestApproval],
  );

  /** Resposta registrada pela equipe (cliente respondeu por WhatsApp, reunião…). */
  const answerApproval = useCallback(
    async (a: ObraApproval, status: 'aprovado' | 'recusado', name: string, comment: string | null) => {
      const now = nowIso();
      await patch('obra_approvals', a.id, { status, answered_at: now, answered_name: name.trim() || null, answer_comment: comment?.trim() || null, answered_via: 'manual' });
      if (a.kind === 'orcamento' && a.budget_id && db.budgets.some((b) => b.id === a.budget_id)) {
        await patch('budgets', a.budget_id, { status, answered_at: now });
      }
      if (a.payment_id && db.obra_payments.some((p) => p.id === a.payment_id)) await patch('obra_payments', a.payment_id, { approval: status });
      if (a.obra_id) await log('obra', a.obra_id, 'approval', `registrou que o cliente ${status === 'aprovado' ? 'aprovou' : 'recusou'}: ${a.title}`);
      if (a.requested_by && a.requested_by !== me.id) {
        await notify(a.requested_by, `${status === 'aprovado' ? 'Cliente aprovou' : 'Cliente recusou'}: ${a.title}`, `Registrado por ${me.name}.`, a.obra_id ? `/obras/${a.obra_id}?aba=aprovacoes` : `/orcamentos/${a.budget_id}`);
      }
    },
    [db.budgets, db.obra_payments, patch, log, notify, me.id, me.name],
  );

  const cancelApproval = useCallback(
    async (a: ObraApproval) => {
      await patch('obra_approvals', a.id, { status: 'cancelado' });
      if (a.payment_id && db.obra_payments.some((p) => p.id === a.payment_id && p.approval === 'pendente')) {
        await patch('obra_payments', a.payment_id, { approval: 'nao_requer', approval_id: null });
      }
      if (a.kind === 'orcamento' && a.budget_id && db.budgets.some((b) => b.id === a.budget_id && b.status === 'enviado')) {
        await patch('budgets', a.budget_id, { status: 'rascunho' });
      }
    },
    [db.obra_payments, db.budgets, patch],
  );

  const createObra = useCallback(
    async (input: ObraInput, stages: (obraId: string) => ObraStage[] = () => []) => {
      const now = nowIso();
      const obra: Obra = {
        ...input,
        id: uid(),
        code: nextCode('OB', db.obras.map((o) => o.code)),
        budget_id: input.budget_id ?? null,
        status: input.status ?? 'planejamento',
        attachments: [],
        completed_at: null,
        created_by: me.id,
        created_at: now,
        updated_at: now,
      };
      const [saved] = await insertRows('obras', [obra]);
      await insertRows('obra_stages', stages(saved.id));
      await log('obra', saved.id, 'created', `criou a obra ${saved.code} · ${saved.name}`);
      for (const person of new Set([saved.manager_id, ...saved.member_ids].filter(Boolean) as string[])) {
        await notify(person, 'Você está em uma nova obra', `${me.name} incluiu você na obra ${saved.name}.`, `/obras/${saved.id}`);
      }
      return saved;
    },
    [db.obras, insertRows, log, notify, me.id, me.name],
  );

  /** Orçamento aprovado → obra: etapas com valores, itens e datas; projeto vinculado vai para "Obra". */
  const convertBudget = useCallback(
    async (b: Budget, input: ObraInput, opts: { markProject: boolean }) => {
      const obra = await createObra({ ...input, budget_id: b.id }, (obraId) => stagesFromBudget(b, obraId, input.start_date, nowIso()));
      await patch('budgets', b.id, { obra_id: obra.id, status: b.status === 'recusado' || b.status === 'rascunho' || b.status === 'enviado' ? 'aprovado' : b.status });
      // Pedido de aprovação do orçamento passa a aparecer na obra
      for (const a of db.obra_approvals.filter((x) => x.budget_id === b.id)) await patch('obra_approvals', a.id, { obra_id: obra.id });
      const project = input.project_id ? db.projects.find((p) => p.id === input.project_id) : null;
      if (opts.markProject && project && project.status !== 'obra' && can('projetos')) {
        await updateProject(project.id, { status: 'obra', status_manual: true }).catch(() => undefined);
      }
      return obra;
    },
    [createObra, patch, db.obra_approvals, db.projects, updateProject, can],
  );

  const updateObra = useCallback(
    async (o: Obra, changes: Partial<Obra>) => {
      const next = { ...changes };
      if (changes.status === 'concluida' && o.status !== 'concluida') next.completed_at = nowIso();
      if (changes.status && changes.status !== 'concluida') next.completed_at = null;
      await patch('obras', o.id, next);
      if (changes.status && changes.status !== o.status) await log('obra', o.id, 'status', `alterou o status da obra ${o.name}`);
      if (changes.member_ids) {
        for (const m of changes.member_ids.filter((x) => !o.member_ids.includes(x))) {
          await notify(m, 'Você está em uma nova obra', `${me.name} incluiu você na obra ${o.name}.`, `/obras/${o.id}`);
        }
      }
    },
    [patch, log, notify, me.name],
  );

  const deleteObra = useCallback(
    async (o: Obra) => {
      const of = <T extends { obra_id: string | null }>(rows: T[]) => rows.filter((r) => r.obra_id === o.id);
      const paths = [
        ...o.attachments.map((a) => a.path),
        ...photoPaths(of(db.obra_visits)),
        ...photoPaths(of(db.obra_issues)),
        ...photoPaths(of(db.obra_payments)),
      ];
      // O banco apaga em cascata; aqui também para o modo demonstração
      await removeRows('obra_payments', of(db.obra_payments).map((r) => r.id));
      await removeRows('obra_approvals', of(db.obra_approvals).map((r) => r.id));
      await removeRows('obra_visits', of(db.obra_visits).map((r) => r.id));
      await removeRows('obra_issues', of(db.obra_issues).map((r) => r.id));
      await removeRows('obra_stages', of(db.obra_stages).map((r) => r.id));
      await removeRows('obras', [o.id]);
      for (const b of db.budgets.filter((x) => x.obra_id === o.id)) await patch('budgets', b.id, { obra_id: null }).catch(() => undefined);
      await removeTeamFiles(paths);
      await log('obra', o.id, 'deleted', `excluiu a obra ${o.code} · ${o.name}`);
    },
    [db, removeRows, patch, log],
  );

  // ------------------------------------------------------------ etapas
  const addStage = useCallback(
    async (obra: Obra, name: string) => {
      const list = db.obra_stages.filter((s) => s.obra_id === obra.id);
      const now = nowIso();
      const [saved] = await insertRows('obra_stages', [
        { id: uid(), obra_id: obra.id, name: name.trim(), position: list.length ? Math.max(...list.map((s) => s.position)) + 1 : 0, start_date: null, due_date: null, progress: 0, budget: 0, items: [], notes: null, created_at: now, updated_at: now },
      ]);
      return saved;
    },
    [db.obra_stages, insertRows],
  );

  const updateStage = useCallback((id: string, changes: Partial<ObraStage>) => patch('obra_stages', id, changes), [patch]);

  const deleteStage = useCallback(
    async (s: ObraStage) => {
      for (const p of db.obra_payments.filter((x) => x.stage_id === s.id)) await patch('obra_payments', p.id, { stage_id: null });
      for (const i of db.obra_issues.filter((x) => x.stage_id === s.id)) await patch('obra_issues', i.id, { stage_id: null });
      await removeRows('obra_stages', [s.id]);
    },
    [db.obra_payments, db.obra_issues, patch, removeRows],
  );

  // ------------------------------------------------------------ visitas
  /** Salva a visita e aplica o avanço informado às etapas. */
  const saveVisit = useCallback(
    async (obra: Obra, v: ObraVisit, isNew: boolean) => {
      const row = { ...v, summary: v.summary.trim(), updated_at: nowIso() };
      if (isNew) await insertRows('obra_visits', [row]);
      else await patch('obra_visits', v.id, row);
      for (const p of v.progress) {
        const st = db.obra_stages.find((s) => s.id === p.stage_id);
        if (st && st.progress !== p.to) await patch('obra_stages', st.id, { progress: p.to });
      }
      // Primeira visita com avanço: a obra começou
      if (obra.status === 'planejamento' && v.progress.some((p) => p.to > 0)) await updateObra(obra, { status: 'em_andamento' });
      if (isNew) await log('obra', obra.id, 'visit', `registrou uma visita na obra ${obra.name}${v.photos.length ? ` (${v.photos.length} fotos)` : ''}`);
      return row;
    },
    [db.obra_stages, insertRows, patch, updateObra, log],
  );

  const deleteVisit = useCallback(
    async (v: ObraVisit) => {
      await removeRows('obra_visits', [v.id]);
      await removeTeamFiles(v.photos.map((p) => p.path));
    },
    [removeRows],
  );

  // ------------------------------------------------------------ pagamentos
  const savePayment = useCallback(
    async (obra: Obra, p: ObraPayment, isNew: boolean, askApproval: boolean) => {
      let row: ObraPayment = { ...p, description: p.description.trim(), updated_at: nowIso() };
      if (isNew) [row] = await insertRows('obra_payments', [row]);
      else await patch('obra_payments', p.id, row);
      if (askApproval && !row.paid_at) {
        const stage = row.stage_id ? db.obra_stages.find((s) => s.id === row.stage_id) : null;
        const approval = await requestApproval({
          kind: 'pagamento',
          title: `${row.description}${row.supplier_name ? ` · ${row.supplier_name}` : ''}`,
          amount: row.amount,
          obra,
          payment_id: row.id,
          snapshot: paymentSnapshot(row, stage?.name ?? null),
          due_date: row.due_date,
        });
        await patch('obra_payments', row.id, { approval: 'pendente', approval_id: approval.id });
        row = { ...row, approval: 'pendente', approval_id: approval.id };
      }
      if (isNew) await log('obra', obra.id, 'payment', `lançou o pagamento ${row.description} (${formatMoney(row.amount)})`);
      return row;
    },
    [db.obra_stages, insertRows, patch, requestApproval, log],
  );

  const deletePayment = useCallback(
    async (p: ObraPayment) => {
      const pending = db.obra_approvals.filter((a) => a.payment_id === p.id && a.status === 'pendente');
      for (const a of pending) await patch('obra_approvals', a.id, { status: 'cancelado' });
      await removeRows('obra_payments', [p.id]);
      await removeTeamFiles(p.attachments.map((a) => a.path));
    },
    [db.obra_approvals, patch, removeRows],
  );

  // ------------------------------------------------------------ pendências
  const saveIssue = useCallback(
    async (i: ObraIssue, isNew: boolean) => {
      const row = { ...i, title: i.title.trim(), updated_at: nowIso() };
      if (isNew) await insertRows('obra_issues', [row]);
      else await patch('obra_issues', i.id, row);
    },
    [insertRows, patch],
  );

  const deleteIssue = useCallback(
    async (i: ObraIssue) => {
      await removeRows('obra_issues', [i.id]);
      await removeTeamFiles(i.photos.map((p) => p.path));
    },
    [removeRows],
  );

  return useMemo(
    () => ({
      saveBudget, deleteBudget, sendBudget, requestApproval, answerApproval, cancelApproval,
      createObra, convertBudget, updateObra, deleteObra,
      addStage, updateStage, deleteStage,
      saveVisit, deleteVisit, savePayment, deletePayment, saveIssue, deleteIssue,
    }),
    [saveBudget, deleteBudget, sendBudget, requestApproval, answerApproval, cancelApproval, createObra, convertBudget, updateObra, deleteObra, addStage, updateStage, deleteStage, saveVisit, deleteVisit, savePayment, deletePayment, saveIssue, deleteIssue],
  );
}
