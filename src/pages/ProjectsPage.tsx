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

type Scope = 'ativos' | 'concluidos' | 'todos';
type DeadlineFilter = '' | 'overdue' | 'soon';

/** Mais urgente primeiro: prazo vencido ou tarefas atrasadas, depois o prazo mais próximo. */
function byUrgency(a: ProjectSummary, b: ProjectSummary) {
  const u = (s: ProjectSummary) => (isProjectActive(s.project) ? (s.deadline === 'overdue' || s.overdueTasks > 0 ? 0 : 1) : 2);
  return u(a) - u(b) || (a.project.due_date ?? '9999').localeCompare(b.project.due_date ?? '9999');
}

export default function ProjectsPage() {
  const { db, settings } = useData();
  const summaries = useProjectSummaries();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('ativos');
  const [type, setType] = useState('');
  const [person, setPerson] = useState('');
  const [deadline, setDeadline] = useState<DeadlineFilter>('');
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

  const filtered = useMemo(() => {
    return summaries
      .filter((s) => {
        const p = s.project;
        if (scope === 'ativos' && !isProjectActive(p)) return false;
        if (scope === 'concluidos' && p.status !== 'concluido') return false;
        if (type && p.project_type_id !== type) return false;
        if (person && !s.people.some((x) => x.id === person)) return false;
        if (deadline === 'overdue' && s.deadline !== 'overdue') return false;
        if (deadline === 'soon' && !['soon', 'today'].includes(s.deadline)) return false;
        return matches(query, p.name, p.code, s.client?.name, p.site_city, s.type?.name);
      })
      .sort(byUrgency);
  }, [summaries, scope, type, person, deadline, query]);

  const kpis = useMemo(() => {
    const active = summaries.filter((s) => isProjectActive(s.project));
    const year = String(new Date().getFullYear());
    return {
      overdue: active.filter((s) => s.deadline === 'overdue').length,
      soon: active.filter((s) => s.deadline === 'soon' || s.deadline === 'today').length,
      lateTasks: active.reduce((acc, s) => acc + s.overdueTasks, 0),
      doneYear: summaries.filter((s) => s.project.status === 'concluido' && (s.project.completed_at ?? '').startsWith(year)).length,
    };
  }, [summaries]);

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
            {kpis.lateTasks > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">
                  {kpis.lateTasks} {kpis.lateTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
                </span>
              </>
            )}
            {' · '}
            {kpis.doneYear} {kpis.doneYear === 1 ? 'concluído' : 'concluídos'} no ano
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
                { value: 'soon', label: `Vencem em ${settings.due_soon_days} dias` },
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
              { id: 'concluidos', label: 'Concluídos', count: counts.concluidos },
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
              <span>Etapa</span>
              <span className="text-right">%</span>
              <span>Prazo</span>
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
                            <div className="mt-2 flex min-w-0 items-baseline gap-2 text-[12.5px]">
                              <span className="truncate text-muted">{current >= 0 && current < phases.length ? phases[current] : s.phase}</span>
                              {current >= 0 && current < phases.length && (
                                <span className="shrink-0 tabular text-muted">
                                  · {current + 1}/{phases.length}
                                </span>
                              )}
                              {p.status === 'pausado' && <span className="shrink-0 text-faint">· pausado</span>}
                              {s.overdueTasks > 0 && (
                                <span className="shrink-0 text-danger-fg">
                                  · {s.overdueTasks} {s.overdueTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
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
