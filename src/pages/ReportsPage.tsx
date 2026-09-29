import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Clock, Download, Hourglass, Target, Timer, TrendingUp, Trophy } from 'lucide-react';
import { useData } from '../context/DataContext';
import { entryMinutes } from '../lib/domain';
import { addDays, cn, diffDays, downloadFile, formatDate, formatMinutes, formatNumber, MONTHS_FULL, toCsv, toDateKey, today } from '../lib/utils';
import { Avatar, BarRow, Button, Card, CardHeader, PageHeader, Select } from '../components/ui';

const PERIODS = [
  { id: '30', label: 'Últimos 30 dias' },
  { id: '90', label: 'Últimos 90 dias' },
  { id: '180', label: 'Últimos 6 meses' },
  { id: '365', label: 'Últimos 12 meses' },
];

export default function ReportsPage() {
  const { db, maps } = useData();
  const [period, setPeriod] = useState('90');
  const t = today();
  const since = addDays(t, -Number(period));
  const dateOf = (iso: string) => toDateKey(new Date(iso));

  const r = useMemo(() => {
    const kind = (id: string) => maps.stages[id]?.kind;
    const leadsIn = db.leads.filter((l) => dateOf(l.created_at) >= since);
    const decided = db.leads.filter((l) => l.closed_at && dateOf(l.closed_at) >= since);
    const won = decided.filter((l) => kind(l.stage_id) === 'won');
    const lost = decided.filter((l) => kind(l.stage_id) === 'lost');
    const avgClose = won.length ? Math.round(won.reduce((a, l) => a + diffDays(dateOf(l.created_at), dateOf(l.closed_at!)), 0) / won.length) : null;

    const bySource: Record<string, { name: string; total: number; won: number; lost: number }> = {};
    leadsIn.forEach((l) => {
      const k = l.source_id ?? 'none';
      bySource[k] ||= { name: k === 'none' ? 'Não informado' : maps.sources[k]?.name ?? '—', total: 0, won: 0, lost: 0 };
      bySource[k].total++;
      if (kind(l.stage_id) === 'won') bySource[k].won++;
      if (kind(l.stage_id) === 'lost') bySource[k].lost++;
    });

    const lostReasons: Record<string, number> = {};
    lost.forEach((l) => {
      const reason = (l.lost_reason ?? 'Não informado').split(' — ')[0];
      lostReasons[reason] = (lostReasons[reason] ?? 0) + 1;
    });

    const byCity: Record<string, number> = {};
    leadsIn.forEach((l) => (byCity[l.city] = (byCity[l.city] ?? 0) + 1));

    // Leads por mês (últimos 12 meses)
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: MONTHS_FULL[d.getMonth()].slice(0, 3),
        leads: db.leads.filter((l) => l.created_at.slice(0, 7) === key).length,
        won: db.leads.filter((l) => l.closed_at?.slice(0, 7) === key && kind(l.stage_id) === 'won').length,
        delivered: db.projects.filter((p) => p.completed_at?.slice(0, 7) === key).length,
      };
    });

    // Produção
    const completed = db.projects.filter((p) => p.status === 'concluido' && p.completed_at && dateOf(p.completed_at) >= since);
    const onTime = completed.filter((p) => !p.due_date || dateOf(p.completed_at!) <= p.due_date).length;
    const avgDuration = completed.length ? Math.round(completed.reduce((a, p) => a + diffDays(p.start_date, dateOf(p.completed_at!)), 0) / completed.length) : null;
    const tasksDone = db.tasks.filter((x) => x.status === 'done' && x.completed_at && dateOf(x.completed_at) >= since);
    const tasksOnTime = tasksDone.filter((x) => !x.due_date || dateOf(x.completed_at!) <= x.due_date).length;

    const entries = db.time_entries.filter((e) => dateOf(e.started_at) >= since);
    const totalMin = entries.reduce((a, e) => a + entryMinutes(e), 0);
    const byMember: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const byType: Record<string, number> = {};
    entries.forEach((e) => {
      const m = entryMinutes(e);
      byMember[e.user_id] = (byMember[e.user_id] ?? 0) + m;
      const task = maps.tasks[e.task_id];
      const project = task?.project_id ? maps.projects[task.project_id] : null;
      const pk = project?.id ?? 'avulsas';
      byProject[pk] = (byProject[pk] ?? 0) + m;
      const tk = project ? maps.types[project.project_type_id]?.name ?? '—' : 'Tarefas avulsas';
      byType[tk] = (byType[tk] ?? 0) + m;
    });

    // Horas por m² (produtividade por tipo) — projetos concluídos com área
    const perSqm = db.projects
      .filter((p) => p.status === 'concluido' && p.area_m2)
      .map((p) => {
        const ids = new Set(db.tasks.filter((x) => x.project_id === p.id).map((x) => x.id));
        const min = db.time_entries.filter((e) => ids.has(e.task_id)).reduce((a, e) => a + entryMinutes(e), 0);
        return { p, hoursPerSqm: min / 60 / (p.area_m2 ?? 1) };
      })
      .filter((x) => x.hoursPerSqm > 0);

    return {
      leadsIn, won, lost, avgClose, sources: Object.values(bySource).sort((a, b) => b.total - a.total),
      lostReasons: Object.entries(lostReasons).sort((a, b) => b[1] - a[1]),
      cities: Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 8),
      months, completed, onTime, avgDuration, tasksDone, tasksOnTime, entries, totalMin,
      byMember: Object.entries(byMember).sort((a, b) => b[1] - a[1]),
      byProject: Object.entries(byProject).sort((a, b) => b[1] - a[1]).slice(0, 10),
      byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      perSqm,
    };
   
  }, [db, maps, since]);

  const conv = r.won.length + r.lost.length ? Math.round((r.won.length / (r.won.length + r.lost.length)) * 100) : null;
  const maxMonth = Math.max(1, ...r.months.map((m) => Math.max(m.leads, m.won, m.delivered)));

  const exportTimesheet = () => {
    downloadFile(
      `horas-${since}-a-${t}.csv`,
      toCsv(
        r.entries
          .sort((a, b) => a.started_at.localeCompare(b.started_at))
          .map((e) => {
            const task = maps.tasks[e.task_id];
            const project = task?.project_id ? maps.projects[task.project_id] : null;
            return {
              Data: formatDate(dateOf(e.started_at)),
              Pessoa: maps.profiles[e.user_id]?.name ?? '',
              Projeto: project?.name ?? 'Avulsa',
              Etapa: task?.phase ?? '',
              Tarefa: task?.title ?? '(removida)',
              Horas: (entryMinutes(e) / 60).toFixed(2).replace('.', ','),
              Observação: e.note ?? '',
            };
          }),
      ),
      'text/csv',
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Indicadores"
        title="Relatórios"
        description="Desempenho comercial e produtividade da equipe (sem dados financeiros)."
        actions={
          <>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto">
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
            <Button icon={<Download className="h-4 w-4" />} onClick={exportTimesheet}>Exportar horas</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile icon={<Target className="h-4 w-4" />} label="Novos leads" value={r.leadsIn.length} />
        <Tile icon={<TrendingUp className="h-4 w-4" />} label="Taxa de conversão" value={conv === null ? '—' : `${conv}%`} sub={`${r.won.length} ganhos · ${r.lost.length} perdidos`} />
        <Tile icon={<Hourglass className="h-4 w-4" />} label="Tempo médio p/ fechar" value={r.avgClose === null ? '—' : `${r.avgClose} dias`} />
        <Tile icon={<Trophy className="h-4 w-4" />} label="Projetos entregues" value={r.completed.length} sub={r.completed.length ? `${Math.round((r.onTime / r.completed.length) * 100)}% no prazo` : undefined} />
        <Tile icon={<Timer className="h-4 w-4" />} label="Tarefas no prazo" value={r.tasksDone.length ? `${Math.round((r.tasksOnTime / r.tasksDone.length) * 100)}%` : '—'} sub={`${r.tasksDone.length} concluídas`} />
        <Tile icon={<Clock className="h-4 w-4" />} label="Horas registradas" value={formatMinutes(r.totalMin)} sub={r.avgDuration ? `duração média ${r.avgDuration} dias/projeto` : undefined} />
      </div>

      <Card>
        <CardHeader icon={<BarChart3 className="h-4 w-4" />} title="Últimos 12 meses" subtitle="Leads recebidos, fechamentos e entregas por mês" />
        <div className="px-5 pb-5">
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-stone-600">
            <Legend color="#2a78d6" label="Leads recebidos" />
            <Legend color="#eb6834" label="Fechados" />
            <Legend color="#1baf7a" label="Projetos entregues" />
          </div>
          <div className="flex h-56 items-end gap-2 border-b border-stone-200">
            {r.months.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col justify-end" title={`${m.label}: ${m.leads} leads, ${m.won} fechados, ${m.delivered} entregues`}>
                <div className="flex h-full items-end justify-center gap-[2px]">
                  {[['#2a78d6', m.leads], ['#eb6834', m.won], ['#1baf7a', m.delivered]].map(([c, v]) => (
                    <div key={c as string} className="w-full max-w-[14px] rounded-t-[4px]" style={{ height: `${((v as number) / maxMonth) * 100}%`, minHeight: (v as number) > 0 ? 3 : 0, backgroundColor: c as string }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {r.months.map((m) => <div key={m.key} className="flex-1 text-center text-[11px] text-stone-500">{m.label}</div>)}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Conversão por origem" subtitle="Leads que entraram no período" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Ganhos</th>
                  <th className="px-3 py-2 text-right font-medium">Perdidos</th>
                  <th className="px-5 py-2 text-right font-medium">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular">
                {r.sources.map((s) => {
                  const c = s.won + s.lost ? Math.round((s.won / (s.won + s.lost)) * 100) : null;
                  return (
                    <tr key={s.name}>
                      <td className="px-5 py-2.5">{s.name}</td>
                      <td className="px-3 py-2.5 text-right">{s.total}</td>
                      <td className="px-3 py-2.5 text-right">{s.won}</td>
                      <td className="px-3 py-2.5 text-right">{s.lost}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{c === null ? '—' : `${c}%`}</td>
                    </tr>
                  );
                })}
                {r.sources.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-stone-500">Sem leads no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Card>
            <CardHeader title="Motivos de perda" />
            <div className="space-y-3 px-5 pb-5">
              {r.lostReasons.length === 0 && <p className="text-sm text-stone-500">Nenhuma perda no período. 🎉</p>}
              {r.lostReasons.map(([reason, n]) => <BarRow key={reason} label={reason} value={n} max={r.lostReasons[0][1]} color="#e34948" />)}
            </div>
          </Card>
          <Card>
            <CardHeader title="Leads por cidade" />
            <div className="space-y-3 px-5 pb-5">
              {r.cities.length === 0 && <p className="text-sm text-stone-500">Sem dados.</p>}
              {r.cities.map(([city, n]) => <BarRow key={city} label={city} value={n} max={r.cities[0][1]} color="#2a78d6" />)}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Horas por pessoa" subtitle="No período" />
          <div className="space-y-3 px-5 pb-5">
            {r.byMember.length === 0 && <p className="text-sm text-stone-500">Nenhuma hora registrada.</p>}
            {r.byMember.map(([uid, min]) => {
              const u = maps.profiles[uid];
              return (
                <BarRow
                  key={uid}
                  label={<span className="inline-flex items-center gap-2"><Avatar user={u} size="xs" />{u?.name ?? '—'}</span>}
                  value={Math.round(min / 60)}
                  suffix="h"
                  max={Math.round(r.byMember[0][1] / 60) || 1}
                  color={u?.color}
                  title={formatMinutes(min)}
                />
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader title="Horas por projeto" subtitle="Top 10 no período" />
          <div className="space-y-3 px-5 pb-5">
            {r.byProject.length === 0 && <p className="text-sm text-stone-500">Nenhuma hora registrada.</p>}
            {r.byProject.map(([pid, min]) => (
              <BarRow key={pid} label={pid === 'avulsas' ? 'Tarefas avulsas' : maps.projects[pid]?.name ?? '—'} value={Math.round(min / 60)} suffix="h" max={Math.round(r.byProject[0][1] / 60) || 1} title={formatMinutes(min)} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Horas por tipo de projeto" />
          <div className="space-y-3 px-5 pb-5">
            {r.byType.length === 0 && <p className="text-sm text-stone-500">Nenhuma hora registrada.</p>}
            {r.byType.map(([name, min]) => (
              <BarRow key={name} label={name} value={Math.round(min / 60)} suffix="h" max={Math.round(r.byType[0][1] / 60) || 1} color="#1baf7a" title={formatMinutes(min)} />
            ))}
          </div>
          {r.perSqm.length > 0 && (
            <div className="border-t border-stone-100 px-5 py-3 text-xs text-stone-600">
              Média em projetos concluídos: <b>{formatNumber(r.perSqm.reduce((a, x) => a + x.hoursPerSqm, 0) / r.perSqm.length, 2)} h/m²</b> — útil para estimar prazos de novas propostas.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs text-stone-500"><span className="text-stone-400">{icon}</span>{label}</div>
      <div className="mt-1.5 font-display text-2xl font-bold leading-none">{value}</div>
      {sub && <div className={cn('mt-1 text-[11px] text-stone-500')}>{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
