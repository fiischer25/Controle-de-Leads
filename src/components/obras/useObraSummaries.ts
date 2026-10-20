import { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { byPosition, today } from '../../lib/utils';
import { obraExpectedProgress, obraMoney, obraProgress, stageState, type ObraMoney } from '../../lib/obras';
import type { Obra, ObraApproval, ObraIssue, ObraPayment, ObraStage, ObraVisit } from '../../lib/types';

export interface ObraSummary {
  obra: Obra;
  stages: ObraStage[];
  visits: ObraVisit[];
  payments: ObraPayment[];
  approvals: ObraApproval[];
  issues: ObraIssue[];
  progress: number;
  /** Avanço previsto para hoje pelas datas das etapas. */
  expected: number | null;
  money: ObraMoney;
  lateStages: number;
  pendingApprovals: number;
  openIssues: number;
  lastVisit: ObraVisit | null;
  photos: number;
}

function groupByObra<T extends { obra_id: string | null }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.obra_id) continue;
    const list = m.get(r.obra_id);
    if (list) list.push(r);
    else m.set(r.obra_id, [r]);
  }
  return m;
}

/** Números de cada obra (avanço físico, financeiro, aprovações, pendências), para listas e painéis. */
export function useObraSummaries(): ObraSummary[] {
  const { db } = useData();
  return useMemo(() => {
    const t = today();
    const stages = groupByObra(db.obra_stages);
    const visits = groupByObra(db.obra_visits);
    const payments = groupByObra(db.obra_payments);
    const approvals = groupByObra(db.obra_approvals);
    const issues = groupByObra(db.obra_issues);
    return db.obras.map((obra) => {
      const st = [...(stages.get(obra.id) ?? [])].sort(byPosition);
      const vs = [...(visits.get(obra.id) ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      const ps = payments.get(obra.id) ?? [];
      const ap = approvals.get(obra.id) ?? [];
      const is = issues.get(obra.id) ?? [];
      return {
        obra,
        stages: st,
        visits: vs,
        payments: ps,
        approvals: ap,
        issues: is,
        progress: obraProgress(st),
        expected: obraExpectedProgress(st, t),
        money: obraMoney(obra, st, ps, ap, t),
        lateStages: st.filter((s) => stageState(s, t) === 'atrasada').length,
        pendingApprovals: ap.filter((a) => a.status === 'pendente').length,
        openIssues: is.filter((i) => i.status === 'aberta').length,
        lastVisit: vs[0] ?? null,
        photos: vs.reduce((a, v) => a + v.photos.length, 0),
      };
    });
  }, [db.obras, db.obra_stages, db.obra_visits, db.obra_payments, db.obra_approvals, db.obra_issues]);
}
