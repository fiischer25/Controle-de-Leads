import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { PROJECT_STATUS } from '../lib/constants';
import { isProjectActive } from '../lib/domain';
import { byPosition, downloadFile, formatDate, matches, toCsv, today } from '../lib/utils';
import { ActionLink, Avatar, AvatarStack, Button, EmptyState, FilterPick, PageHeader, SearchField, StatusBadge, Tabs, Toolbar } from '../components/ui';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { useProjectSummaries, type ProjectSummary } from '../components/projects/useProjectSummaries';
import { projectRail, templatePhasesByType } from '../components/projects/rail';
import { ProjectDeadline, StageRail } from '../components/projects/StageRail';
import { ProjectFacts } from '../components/projects/ProjectFacts';
import { projectFacts, TASK_ALERT_DAYS, type ProjectFactsData } from '../components/projects/facts';

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
  const cols = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_minmax(0,1fr)_44px_130px_64px]';

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
          <div className="panel pb-2 pt-3">
            <div className={`hidden gap-6 border-b border-hairline pb-2.5 text-[12.5px] text-faint md:grid ${cols}`}>
              <span>Projeto</span>
              <span>Status e etapa atual</span>
              <span className="text-right">%</span>
              <span>Entrega</span>
              <span className="sr-only">Equipe</span>
            </div>
            <ul>
              {filtered.map((s) => {
                const p = s.project;
                const { phases, current } = projectRail(s, templates[p.project_type_id]);
                const active = isProjectActive(p);
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projetos/${p.id}`}
                      className={`grid items-center gap-x-6 gap-y-2.5 border-b border-hairline py-4 transition-colors hover:bg-ink/[0.025] ${cols}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-display text-[14.5px] font-semibold tracking-[0.01em] text-ink">{p.name}</div>
                        <div className="truncate text-[12.5px] text-faint">
                          {s.client?.name ?? 'Cliente removido'}
                          {s.type && <> · {s.type.name}</>}
                        </div>
                      </div>
                      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
                        {active ? (
                          <>
                            <StageRail phases={phases} current={current} />
                            <div className="mt-2 flex min-w-0 items-center gap-2 text-[12.5px]">
                              <StatusBadge kind="project" value={p.status} />
                              <span className="truncate text-muted">{current >= 0 && current < phases.length ? phases[current] : s.phase}</span>
                              {current >= 0 && current < phases.length && (
                                <span className="shrink-0 tabular text-muted">
                                  · {current + 1}/{phases.length}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <StatusBadge kind="project" value={p.status} />
                        )}
                      </div>
                      <div className="hidden text-right text-[13px] tabular text-muted md:block">{s.progress}%</div>
                      <div className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto md:text-left">
                        <ProjectDeadline due={p.due_date} soonDays={settings.due_soon_days} done={p.status === 'concluido'} />
                      </div>
                      <div className="hidden justify-end md:flex">
                        <AvatarStack users={s.people} max={3} size={22} ring="ring-canvas" />
                      </div>
                      {facts[p.id] && <ProjectFacts project={p} facts={facts[p.id]} overdueTasks={s.overdueTasks} minutes={s.minutes} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] text-faint">
              {filtered.length} {filtered.length === 1 ? 'projeto' : 'projetos'}
            </p>
          </div>
        )}
      </div>

      {creating && <ProjectFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}
