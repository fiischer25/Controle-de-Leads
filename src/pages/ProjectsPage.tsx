import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { PROJECT_STATUS } from '../lib/constants';
import { isProjectActive } from '../lib/domain';
import { byPosition, cn, downloadFile, formatDate, formatNumber, matches, toCsv, today } from '../lib/utils';
import { ActionLink, Avatar, AvatarStack, Button, EmptyState, FilterPick, PageHeader, SearchField, StatusBadge, Tabs, Toolbar } from '../components/ui';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { useProjectSummaries, type ProjectSummary } from '../components/projects/useProjectSummaries';
import { projectRail, templatePhasesByType } from '../components/projects/rail';
import { ProjectDeadline, StageRail } from '../components/projects/StageRail';
import { ProjectFacts } from '../components/projects/ProjectFacts';
import { projectDeadlineAlert, projectFacts, TASK_ALERT_DAYS, type ProjectFactsData } from '../components/projects/facts';

type Scope = 'ativos' | 'concluidos' | 'todos';
type DeadlineFilter = '' | 'overdue' | 'soon' | 'alerta';
type Sort = '' | 'prazo' | 'nome' | 'progresso' | 'recentes';

export default function ProjectsPage() {
  const { db, maps, settings } = useData();
  const summaries = useProjectSummaries();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('ativos');
  const [type, setType] = useState('');
  const [person, setPerson] = useState('');
  const [deadline, setDeadline] = useState<DeadlineFilter>('');
  const [sort, setSort] = useState<Sort>('');
  const [creating, setCreating] = useState(false);
  const templates = useMemo(() => templatePhasesByType(db.task_templates), [db.task_templates]);

  const counts = useMemo(
    () => ({
      ativos: summaries.filter((s) => isProjectActive(s.project)).length,
      concluidos: summaries.filter((s) => s.project.status === 'concluido').length,
      todos: summaries.length,
    }),
    [summaries],
  );

  // Responsável, próxima tarefa e alertas de prazo de cada projeto
  const facts = useMemo(() => {
    const t = today();
    return Object.fromEntries(summaries.map((s) => [s.project.id, projectFacts(s, maps.profiles, t, isProjectActive(s.project))])) as Record<string, ProjectFactsData>;
  }, [summaries, maps.profiles]);

  const filtered = useMemo(() => {
    /** Mais urgente primeiro: atrasos (projeto ou tarefas), depois prazos perto, depois o prazo de entrega. */
    const urgency = (s: ProjectSummary) => {
      if (!isProjectActive(s.project)) return 3;
      const alerts = facts[s.project.id]?.alerts ?? [];
      if (s.deadline === 'overdue' || s.overdueTasks > 0 || alerts.some((x) => x.days < 0)) return 0;
      if (alerts.length || s.deadline === 'soon' || s.deadline === 'today') return 1;
      return 2;
    };
    return summaries
      .filter((s) => {
        const p = s.project;
        if (scope === 'ativos' && !isProjectActive(p)) return false;
        if (scope === 'concluidos' && p.status !== 'concluido') return false;
        if (type && p.project_type_id !== type) return false;
        if (person && !s.people.some((x) => x.id === person)) return false;
        if (deadline === 'overdue' && s.deadline !== 'overdue') return false;
        if (deadline === 'soon' && !['soon', 'today'].includes(s.deadline)) return false;
        if (deadline === 'alerta' && !facts[p.id]?.alerts.length) return false;
        return matches(query, p.name, p.code, s.client?.name, p.site_city, s.type?.name);
      })
      .sort((a, b) => {
        if (sort === 'prazo') return (a.project.due_date ?? '9999').localeCompare(b.project.due_date ?? '9999');
        if (sort === 'nome') return a.project.name.localeCompare(b.project.name);
        if (sort === 'progresso') return b.progress - a.progress;
        if (sort === 'recentes') return b.project.created_at.localeCompare(a.project.created_at);
        return urgency(a) - urgency(b) || (a.project.due_date ?? '9999').localeCompare(b.project.due_date ?? '9999');
      });
  }, [summaries, scope, type, person, deadline, query, sort, facts]);


  const kpis = useMemo(() => {
    const active = summaries.filter((s) => isProjectActive(s.project));
    const year = String(new Date().getFullYear());
    return {
      overdue: active.filter((s) => s.deadline === 'overdue').length,
      soon: active.filter((s) => s.deadline === 'soon' || s.deadline === 'today').length,
      lateTasks: active.reduce((acc, s) => acc + s.overdueTasks, 0),
      alerts: active.reduce((acc, s) => acc + (facts[s.project.id]?.alerts.filter((a) => a.days >= 0).length ?? 0), 0),
      doneYear: summaries.filter((s) => s.project.status === 'concluido' && (s.project.completed_at ?? '').startsWith(year)).length,
    };
  }, [summaries, facts]);

  const exportCsv = () => {
    downloadFile(
      `projetos-${today()}.csv`,
      toCsv(
        filtered.map((s) => ({
          Código: s.project.code,
          Projeto: s.project.name,
          Cliente: s.client?.name ?? '',
          Tipo: s.type?.name ?? '',
          Status: PROJECT_STATUS[s.project.status].label,
          'Etapa atual': s.phase,
          'Progresso (%)': s.progress,
          Início: formatDate(s.project.start_date),
          Prazo: formatDate(s.project.due_date),
          'Tarefas abertas': s.openTasks,
          'Tarefas atrasadas': s.overdueTasks,
          'Horas registradas': (s.minutes / 60).toFixed(1).replace('.', ','),
          Responsável: facts[s.project.id]?.manager?.name ?? '',
          'Próxima tarefa': facts[s.project.id]?.next?.task.title ?? '',
          'Prazo da próxima tarefa': formatDate(facts[s.project.id]?.next?.task.due_date ?? null),
          'Alerta de prazo': facts[s.project.id]?.alerts.map((a) => `${a.task.title} (${a.days < 0 ? 'atrasada' : a.days === 0 ? 'vence hoje' : `vence em ${a.days} d`})`).join('; ') ?? '',
          'Área (m²)': s.project.area_m2 ?? '',
          Equipe: s.people.map((p) => p.name).join(', '),
          Cidade: s.project.site_city ?? '',
        })),
      ),
      'text/csv',
    );
  };

  const activeFilters = [type, person, deadline].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Projetos"
        description={
          <>
            {counts.ativos} em andamento
            {kpis.overdue > 0 && (
              <>
                {' · '}
                <button type="button" className="text-danger-fg hover:underline" onClick={() => { setScope('ativos'); setDeadline('overdue'); }}>
                  {kpis.overdue} com prazo vencido
                </button>
              </>
            )}
            {kpis.soon > 0 && (
              <>
                {' · '}
                <button type="button" className="text-warning-fg hover:underline" onClick={() => { setScope('ativos'); setDeadline('soon'); }}>
                  {kpis.soon} {kpis.soon === 1 ? 'vence' : 'vencem'} em {settings.due_soon_days} dias
                </button>
              </>
            )}
            {kpis.alerts > 0 && (
              <>
                {' · '}
                <button type="button" className="text-warning-fg hover:underline" onClick={() => { setScope('ativos'); setDeadline('alerta'); }}>
                  {kpis.alerts} {kpis.alerts === 1 ? 'tarefa em andamento vence' : 'tarefas em andamento vencem'} em até {TASK_ALERT_DAYS} dias
                </button>
              </>
            )}
            {kpis.lateTasks > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">
                  {kpis.lateTasks} {kpis.lateTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
                </span>
              </>
            )}
            {' · '}
            {kpis.doneYear} {kpis.doneYear === 1 ? 'finalizado' : 'finalizados'} no ano
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<Download className="h-4 w-4" strokeWidth={1.6} />} onClick={exportCsv} className="max-sm:hidden">
              Exportar
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
              Projeto
            </Button>
          </>
        }
      />

      <Toolbar
        search={<SearchField value={query} onChange={setQuery} placeholder="Buscar projeto, código, cliente…" label="Buscar projetos" />}
        filters={
          <>
            <FilterPick label="Tipo" value={type} onChange={setType} options={[...db.project_types].sort(byPosition).map((t) => ({ value: t.id, label: t.name }))} />
            <FilterPick
              label="Equipe"
              value={person}
              onChange={setPerson}
              options={db.profiles.filter((p) => p.active || p.id === person).map((p) => ({ value: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> }))}
            />
            <FilterPick
              label="Prazo"
              allLabel="Qualquer prazo"
              value={deadline}
              onChange={(v) => setDeadline(v as DeadlineFilter)}
              options={[
                { value: 'overdue', label: 'Vencidos' },
                { value: 'soon', label: `Entrega em ${settings.due_soon_days} dias` },
                { value: 'alerta', label: 'Tarefa em andamento com prazo perto' },
              ]}
            />
            <FilterPick
              label="Ordenar"
              allLabel="Mais urgentes primeiro"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              options={[
                { value: 'prazo', label: 'Prazo de entrega' },
                { value: 'nome', label: 'Nome' },
                { value: 'progresso', label: 'Mais adiantados' },
                { value: 'recentes', label: 'Mais recentes' },
              ]}
            />
            {activeFilters > 0 && (
              <button type="button" onClick={() => { setType(''); setPerson(''); setDeadline(''); }} className="ml-1 shrink-0 text-[13px] text-faint hover:text-ink">
                Limpar
              </button>
            )}
          </>
        }
        aside={
          <Tabs<Scope>
            tabs={[
              { id: 'ativos', label: 'Ativos', count: counts.ativos },
              { id: 'concluidos', label: 'Finalizados', count: counts.concluidos },
              { id: 'todos', label: 'Todos', count: counts.todos },
            ]}
            value={scope}
            onChange={setScope}
            size="sm"
            underline={1}
            bordered={false}
          />
        }
      />

      <div className="mt-6 md:mt-8">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhum projeto encontrado"
            description="Projetos são criados ao converter uma oportunidade em cliente, ou manualmente."
            action={<ActionLink onClick={() => setCreating(true)}>Novo projeto</ActionLink>}
            className="py-16"
          />
        ) : (
          <>
            <ul className="space-y-3">
              {filtered.map((s) => {
                const p = s.project;
                const { phases, current } = projectRail(s, templates[p.project_type_id]);
                const active = isProjectActive(p);
                const delivery = projectDeadlineAlert(p, settings.due_soon_days);
                const stage = current >= 0 && current < phases.length ? phases[current] : s.phase;
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projetos/${p.id}`}
                      className={cn(
                        'block rounded-[16px] border bg-surface px-4 py-4 shadow-card transition-colors hover:border-stone-300 md:px-6',
                        delivery?.late ? 'border-danger-fg/40' : delivery ? 'border-warning-fg/40' : 'border-line',
                      )}
                    >
                      <div className="grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_200px] md:items-center">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="min-w-0 truncate font-display text-[16px] font-semibold tracking-[0.01em] text-ink">{p.name}</span>
                            <StatusBadge kind="project" value={p.status} />
                          </div>
                          <div className="mt-0.5 truncate text-[12.5px] text-faint">
                            {s.client?.name ?? 'Cliente removido'}
                            {s.type && <> · {s.type.name}</>}
                            {p.area_m2 ? <> · {formatNumber(p.area_m2)} m²</> : null}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                            <span className="min-w-0 truncate text-muted">
                              {active && phases.length > 0 && current >= 0 && current < phases.length ? (
                                <>
                                  Etapa {current + 1} de {phases.length}: <span className="text-ink">{stage}</span>
                                </>
                              ) : (
                                stage
                              )}
                            </span>
                            <span className="shrink-0 text-[13px] font-semibold tabular text-ink">{s.progress}%</span>
                          </div>
                          <StageRail phases={phases} current={p.status === 'concluido' ? phases.length : current} thick className="mt-2" />
                        </div>
                        <div className="flex items-center justify-between gap-5 md:justify-end">
                          {p.due_date ? (
                            <div className="md:text-right">
                              <div className="text-[11.5px] text-faint">Entrega</div>
                              <ProjectDeadline due={p.due_date} soonDays={settings.due_soon_days} done={p.status === 'concluido'} />
                            </div>
                          ) : (
                            <span />
                          )}
                          <AvatarStack users={s.people} max={3} size={24} ring="ring-surface" />
                        </div>
                      </div>
                      {facts[p.id] && (
                        <ProjectFacts project={p} facts={facts[p.id]} overdueTasks={s.overdueTasks} minutes={s.minutes} soonDays={settings.due_soon_days} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] text-faint">
              {filtered.length} {filtered.length === 1 ? 'projeto' : 'projetos'}
            </p>
          </>
        )}
      </div>

      {creating && <ProjectFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
