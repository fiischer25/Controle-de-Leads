import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarClock, CheckCircle2, Download, LayoutGrid, List, MapPin, Plus, Search } from 'lucide-react';
import { useData } from '../context/DataContext';
import { PROJECT_STATUS, PROJECT_STATUS_ORDER } from '../lib/constants';
import type { ProjectStatus } from '../lib/types';
import { byPosition, cn, downloadFile, formatDate, formatMinutes, matches, toCsv, today } from '../lib/utils';
import { CSS_COLOR } from '../lib/status';
import { AvatarStack, Button, DueBadge, EmptyState, Input, PageHeader, ProgressBar, Segmented, Select, StatusBadge } from '../components/ui';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { useProjectSummaries, type ProjectSummary } from '../components/projects/useProjectSummaries';

type View = 'cards' | 'table';
type StatusFilter = 'ativos' | 'todos' | ProjectStatus;
type DeadlineFilter = '' | 'overdue' | 'soon';

export default function ProjectsPage() {
  const { db, settings } = useData();
  const summaries = useProjectSummaries();
  const [view, setView] = useState<View>(() => (localStorage.getItem('airos:projectsView') as View) || 'cards');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ativos');
  const [type, setType] = useState('');
  const [person, setPerson] = useState('');
  const [deadline, setDeadline] = useState<DeadlineFilter>('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return summaries
      .filter((s) => {
        const p = s.project;
        if (status === 'ativos' && !['nao_iniciado', 'em_andamento', 'pausado'].includes(p.status)) return false;
        if (status !== 'ativos' && status !== 'todos' && p.status !== status) return false;
        if (type && p.project_type_id !== type) return false;
        if (person && !s.people.some((x) => x.id === person)) return false;
        if (deadline === 'overdue' && s.deadline !== 'overdue') return false;
        if (deadline === 'soon' && !['soon', 'today'].includes(s.deadline)) return false;
        return matches(query, p.name, p.code, s.client?.name, p.site_city, s.type?.name);
      })
      .sort((a, b) => (a.project.due_date ?? '9999').localeCompare(b.project.due_date ?? '9999'));
  }, [summaries, status, type, person, deadline, query]);

  const kpis = useMemo(() => {
    const active = summaries.filter((s) => ['nao_iniciado', 'em_andamento', 'pausado'].includes(s.project.status));
    const year = String(new Date().getFullYear());
    return {
      active: active.length,
      overdue: active.filter((s) => s.deadline === 'overdue').length,
      soon: active.filter((s) => s.deadline === 'soon' || s.deadline === 'today').length,
      done: summaries.filter((s) => s.project.status === 'concluido' && (s.project.completed_at ?? '').startsWith(year)).length,
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

  return (
    <div>
      <PageHeader
        eyebrow="Produção"
        title="Projetos"
        description="Todos os projetos do escritório, com etapa atual, prazos e equipe."
        actions={
          <>
            <Segmented<View>
              value={view}
              onChange={(v) => { setView(v); localStorage.setItem('airos:projectsView', v); }}
              options={[
                { id: 'cards', label: 'Cards', icon: <LayoutGrid className="h-4 w-4" /> },
                { id: 'table', label: 'Lista', icon: <List className="h-4 w-4" /> },
              ]}
            />
            <Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exportar</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Novo projeto</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiButton icon={<Briefcase className="h-4 w-4" />} label="Projetos ativos" value={kpis.active} onClick={() => { setStatus('ativos'); setDeadline(''); }} active={status === 'ativos' && !deadline} />
        <KpiButton icon={<AlertTriangle className="h-4 w-4" />} label="Prazo vencido" value={kpis.overdue} tone="bad" onClick={() => { setStatus('ativos'); setDeadline('overdue'); }} active={deadline === 'overdue'} />
        <KpiButton icon={<CalendarClock className="h-4 w-4" />} label={`Vencem em ${settings.due_soon_days} dias`} value={kpis.soon} tone="warn" onClick={() => { setStatus('ativos'); setDeadline('soon'); }} active={deadline === 'soon'} />
        <KpiButton icon={<CheckCircle2 className="h-4 w-4" />} label="Concluídos no ano" value={kpis.done} tone="good" onClick={() => { setStatus('concluido'); setDeadline(''); }} active={status === 'concluido'} />
      </div>

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar projeto, código, cliente, cidade…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="ativos">Ativos</option>
          <option value="todos">Todos os status</option>
          {PROJECT_STATUS_ORDER.map((s) => <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>)}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos os tipos</option>
          {[...db.project_types].sort(byPosition).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Toda a equipe</option>
          {db.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={deadline} onChange={(e) => setDeadline(e.target.value as DeadlineFilter)}>
          <option value="">Qualquer prazo</option>
          <option value="overdue">Vencidos</option>
          <option value="soon">A vencer</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="Nenhum projeto encontrado"
            description="Projetos são criados ao converter uma oportunidade em cliente, ou manualmente."
            action={<Button variant="primary" onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" />}>Novo projeto</Button>}
          />
        </div>
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((s) => <ProjectCard key={s.project.id} s={s} soonDays={settings.due_soon_days} />)}
        </div>
      ) : (
        <ProjectTable items={filtered} soonDays={settings.due_soon_days} />
      )}

      {creating && <ProjectFormModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function KpiButton({ icon, label, value, tone, onClick, active }: { icon: ReactNode; label: string; value: number; tone?: 'bad' | 'warn' | 'good'; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={cn('card px-4 py-3 text-left transition-all hover:border-stone-300', active && 'ring-2 ring-brand-400/50')}>
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <span className="text-stone-300">{icon}</span>
        {label}
      </div>
      <div className={cn('mt-1 font-display text-2xl font-bold', tone === 'bad' && value > 0 ? 'text-danger-fg' : 'text-ink')}>{value}</div>
    </button>
  );
}

function ProjectCard({ s, soonDays }: { s: ProjectSummary; soonDays: number }) {
  const p = s.project;
  const finished = p.status === 'concluido' || p.status === 'cancelado';
  return (
    <Link
      to={`/projetos/${p.id}`}
      className={cn(
        'card group relative flex flex-col overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md',
        s.deadline === 'overdue' && 'border-danger-line',
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: s.type?.color ?? CSS_COLOR.stone(300) }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{p.code}</div>
          <h3 className="mt-0.5 truncate font-display text-lg font-semibold text-ink group-hover:text-stone-600 tracking-tight">{p.name}</h3>
          <div className="truncate text-sm text-stone-500">{s.client?.name ?? 'Cliente removido'}</div>
        </div>
        <StatusBadge kind="project" value={p.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        {s.type && <span className="font-medium" style={{ color: s.type.color }}>{s.type.name}</span>}
        {p.site_city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.site_city}</span>}
        {s.minutes > 0 && <span>{formatMinutes(s.minutes)} registradas</span>}
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-medium text-stone-700">Etapa: <span className="text-ink">{s.phase}</span></span>
          <span className="font-semibold text-ink tabular">{s.progress}%</span>
        </div>
        <ProgressBar value={s.progress} color={p.status === 'concluido' ? CSS_COLOR.success : undefined} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
        <div className="flex items-center gap-2">
          <DueBadge due={p.due_date} done={finished} soonDays={soonDays} />
          {s.overdueTasks > 0 && !finished && (
            <span className="text-xs font-medium text-danger-fg">{s.overdueTasks} tarefa{s.overdueTasks > 1 ? 's' : ''} atrasada{s.overdueTasks > 1 ? 's' : ''}</span>
          )}
        </div>
        <AvatarStack users={s.people} />
      </div>
    </Link>
  );
}

function ProjectTable({ items, soonDays }: { items: ProjectSummary[]; soonDays: number }) {
  const navigate = useNavigate();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-stone-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Projeto</th>
            <th className="px-4 py-2.5 font-medium">Cliente</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Etapa atual</th>
            <th className="w-40 px-4 py-2.5 font-medium">Progresso</th>
            <th className="px-4 py-2.5 font-medium">Prazo</th>
            <th className="px-4 py-2.5 font-medium">Equipe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {items.map((s) => {
            const p = s.project;
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-stone-50" onClick={() => navigate(`/projetos/${p.id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-1 rounded-full" style={{ backgroundColor: s.type?.color ?? CSS_COLOR.stone(300) }} />
                    <div>
                      <div className="font-semibold text-ink">{p.name}</div>
                      <div className="text-xs text-stone-500">{p.code} · {s.type?.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-stone-700">{s.client?.name}</td>
                <td className="px-4 py-3"><StatusBadge kind="project" value={p.status} /></td>
                <td className="px-4 py-3 text-stone-700">{s.phase}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={s.progress} className="flex-1" />
                    <span className="w-9 text-right text-xs tabular">{s.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3"><DueBadge due={p.due_date} done={p.status === 'concluido' || p.status === 'cancelado'} soonDays={soonDays} compact /></td>
                <td className="px-4 py-3"><AvatarStack users={s.people} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
