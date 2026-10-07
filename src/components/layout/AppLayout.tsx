import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCheck,
  Clock,
  Contact,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Square,
  Sun,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useBranding } from '../../context/BrandingContext';
import { useToast } from '../../context/ToastContext';
import { isProjectActive } from '../../lib/domain';
import { useTheme, type ThemePref } from '../../lib/theme';
import { cn, formatRelative, today } from '../../lib/utils';
import { Avatar, IconButton, MenuItem, Popover, Segmented, Sheet } from '../ui';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { LogTimeModal } from '../tasks/LogTimeModal';
import { LeadFormModal } from '../leads/LeadFormModal';
import { EventFormModal } from '../events/EventFormModal';
import { AssistantPanel } from './AssistantPanel';
import { CommandPalette } from './CommandPalette';
import { BrandMark } from './Logo';
import { useRunningTimer } from './useRunningTimer';
import type { CreateKind } from '../../lib/create';
import type { ModuleKey } from '../../lib/types';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import { SchemaBanner } from './SchemaBanner';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  /** Módulo exigido para ver o item; sem módulo, todos veem. */
  module?: ModuleKey;
  /** Indicador discreto: ponto (retornos pendentes) ou contador. */
  dot?: boolean;
  count?: number;
}

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Painel'],
  [/^\/meu-painel/, 'Meu painel'],
  [/^\/oportunidades/, 'Oportunidades'],
  [/^\/clientes/, 'Clientes'],
  [/^\/projetos/, 'Projetos'],
  [/^\/tarefas/, 'Minhas tarefas'],
  [/^\/financeiro/, 'Financeiro'],
  [/^\/relatorios/, 'Relatórios'],
  [/^\/equipe/, 'Equipe'],
  [/^\/configuracoes/, 'Configurações'],
  [/^\/perfil/, 'Meu perfil'],
];

const ICON = 'h-4 w-4';

export function AppLayout() {
  const { db, me, settings, can, isAdmin } = useData();
  const { setBranding } = useBranding();
  useEffect(() => {
    setBranding({ office_name: settings.office_name, logo_url: settings.logo_url ?? null });
  }, [settings.office_name, settings.logo_url, setBranding]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [creating, setCreating] = useState<CreateKind | null>(null);
  const [sheet, setSheet] = useState<'create' | 'more' | null>(null);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('tarefa');
  const closeTask = () => {
    const next = new URLSearchParams(params);
    next.delete('tarefa');
    setParams(next, { replace: true });
  };

  useEffect(() => setSheet(null), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Atalhos globais de criação (usados pelo Painel e pelo menu "+" do celular).
  useEffect(() => {
    const onCreate = (e: Event) => setCreating((e as CustomEvent<CreateKind>).detail);
    window.addEventListener('airos:create', onCreate);
    return () => window.removeEventListener('airos:create', onCreate);
  }, []);

  const myOpenTasks = useMemo(
    () =>
      db.tasks.filter((x) => {
        if (x.assignee_id !== me.id || x.status === 'done') return false;
        const p = x.project_id ? db.projects.find((pr) => pr.id === x.project_id) : null;
        return !p || isProjectActive(p);
      }).length,
    [db.tasks, db.projects, me.id],
  );

  const pendingFollowUps = useMemo(() => {
    if (!can('comercial')) return 0;
    const t = today();
    const openStages = new Set(db.lead_stages.filter((s) => s.kind === 'open').map((s) => s.id));
    return db.leads.filter((l) => openStages.has(l.stage_id) && l.next_contact_date && l.next_contact_date <= t).length;
  }, [db.leads, db.lead_stages, can]);

  // Grupos com rótulo (Trabalho, Comercial, Gestão). Trabalho: o que é da pessoa (painel,
  // projetos e tarefas). O dashboard do escritório é só do administrador e fica em Gestão,
  // separado do Meu painel; o administrador continua abrindo o sistema nele.
  const groups: NavItem[][] = [
    [
      isAdmin ? { to: '/meu-painel', label: 'Meu painel', icon: LayoutGrid } : { to: '/', label: 'Meu painel', icon: LayoutGrid, end: true },
      { to: '/projetos', label: 'Projetos', icon: Building2, module: 'projetos' },
      { to: '/tarefas', label: 'Minhas tarefas', icon: ListChecks, count: myOpenTasks },
    ],
    [
      { to: '/oportunidades', label: 'Oportunidades', icon: FolderKanban, dot: pendingFollowUps > 0, module: 'comercial' },
      { to: '/clientes', label: 'Clientes', icon: Contact, module: 'comercial' },
    ],
    [
      ...(isAdmin ? [{ to: '/', label: 'Escritório', icon: LayoutDashboard, end: true }] : []),
      { to: '/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro' },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, module: 'relatorios' },
      { to: '/equipe', label: 'Equipe', icon: Users, module: 'equipe' },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, module: 'configuracoes' },
    ],
  ];
  const visibleGroups = groups.map((g) => g.filter((n) => !n.module || can(n.module))).filter((g) => g.length > 0);
  const pageTitle = PAGE_TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? '';

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar: 232px no desktop, só ícones entre 768 e 1279px, oculta no celular. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] border-r border-line bg-surface md:block xl:w-sidebar">
        <Sidebar groups={visibleGroups} onSearch={() => setPaletteOpen(true)} />
      </aside>

      <div className="md:pl-[76px] xl:pl-[232px]">
        <MobileAppBar
          title={pageTitle}
          onSearch={() => setPaletteOpen(true)}
          isHome={location.pathname === '/'}
        />
        <header className="mx-auto hidden h-[68px] max-w-[1440px] items-center gap-2 px-8 md:flex xl:px-12">
          <TimerPill />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] px-3 text-body font-medium text-stone-800 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <Sparkles className={ICON} strokeWidth={1.6} />
            Assistente
          </button>
          <NotificationsMenu />
        </header>
        <main className="mx-auto max-w-[1440px] px-5 pb-[120px] pt-1 md:px-8 md:pb-16 xl:px-12 xl:pb-[72px]">
          <SchemaBanner />
          <Outlet />
        </main>
      </div>

      <BottomNav onCreate={() => setSheet('create')} onMore={() => setSheet('more')} />

      {sheet === 'create' && (
        <Sheet title="Criar" onClose={() => setSheet(null)}>
          <SheetItem icon={<ListChecks />} label="Tarefa" onClick={() => { setSheet(null); setCreating('task'); }} />
          <SheetItem icon={<CalendarDays />} label="Reunião" onClick={() => { setSheet(null); setCreating('event'); }} />
          {can('projetos') && <SheetItem icon={<Building2 />} label="Projeto" onClick={() => { setSheet(null); setCreating('project'); }} />}
          {can('comercial') && <SheetItem icon={<FolderKanban />} label="Oportunidade" onClick={() => { setSheet(null); setCreating('lead'); }} />}
          <SheetItem icon={<Clock />} label="Lançar horas" onClick={() => { setSheet(null); setCreating('time'); }} />
        </Sheet>
      )}
      {sheet === 'more' && (
        <MoreSheet
          onClose={() => setSheet(null)}
          onAssistant={() => {
            setSheet(null);
            setAssistantOpen(true);
          }}
        />
      )}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {assistantOpen && <AssistantPanel onClose={() => setAssistantOpen(false)} />}
      {openTaskId && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
      {creating === 'task' && <TaskFormModal onClose={() => setCreating(null)} />}
      {creating === 'lead' && can('comercial') && <LeadFormModal onClose={() => setCreating(null)} />}
      {creating === 'project' && can('projetos') && <ProjectFormModal onClose={() => setCreating(null)} />}
      {creating === 'event' && <EventFormModal defaults={{ date: today() }} onClose={() => setCreating(null)} />}
      {creating === 'time' && <LogTimeModal onClose={() => setCreating(null)} />}
      <span className="sr-only">{me.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Sidebar
/** Rótulo do grupo do menu pelo primeiro item dele. */
function groupLabel(g: NavItem[]): string {
  const has = (paths: string[]) => g.some((n) => paths.includes(n.to));
  if (has(['/oportunidades', '/clientes'])) return 'Comercial';
  if (has(['/financeiro', '/relatorios', '/equipe', '/configuracoes']) || g[0]?.label === 'Escritório') return 'Gestão';
  return 'Trabalho';
}

function Sidebar({ groups, onSearch }: { groups: NavItem[][]; onSearch: () => void }) {
  const { mode } = useAuth();
  const { office_name } = useBranding();
  return (
    <div className="flex h-full flex-col gap-8 px-3.5 pb-6 pt-8 xl:px-5">
      <div className="flex h-9 items-center px-1.5 xl:px-2.5">
        <BrandMark className="hidden xl:block" />
        <span className="font-display text-[15px] font-bold text-ink xl:hidden" aria-label={office_name}>
          {office_name.trim().charAt(0).toUpperCase()}
        </span>
      </div>

      <button
        type="button"
        onClick={onSearch}
        title="Buscar (⌘K)"
        className="flex h-[34px] items-center gap-2.5 rounded-[9px] bg-ink/[0.04] px-2.5 text-left text-[13px] text-faint transition-colors hover:bg-ink/[0.06] hover:text-muted max-xl:justify-center"
      >
        <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
        <span className="hidden flex-1 xl:inline">Buscar</span>
        <kbd className="hidden font-sans text-[11.5px] xl:inline">⌘K</kbd>
      </button>

      <nav className="scrollbar-none -mx-1 flex flex-1 flex-col gap-6 overflow-y-auto px-1" aria-label="Navegação principal">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <div className="mb-1 hidden px-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint xl:block">{groupLabel(g)}</div>
            {g.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={n.label}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-body transition-colors max-xl:justify-center',
                    isActive
                      ? 'bg-canvas font-medium text-ink shadow-[inset_0_0_0_1px_rgb(var(--line))]'
                      : 'text-muted hover:bg-canvas/70 hover:text-ink',
                  )
                }
              >
                <n.icon className={cn(ICON, 'shrink-0')} strokeWidth={1.6} />
                <span className="hidden flex-1 truncate xl:inline">{n.label}</span>
                {n.dot && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid max-xl:absolute max-xl:right-2 max-xl:top-2"
                    title="Há retornos pendentes"
                  />
                )}
                {!!n.count && (
                  <span className="hidden min-w-[20px] rounded-full bg-stone-100 px-1.5 text-center text-[11px] font-medium leading-5 tabular text-muted xl:inline">
                    {n.count}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {mode === 'local' && (
        <p className="hidden px-2.5 text-[11px] leading-snug text-faint xl:block">Modo demonstração · dados salvos apenas neste navegador</p>
      )}
      <UserMenu />
    </div>
  );
}

// ---------------------------------------------------------------- Cronômetro
/** Pílula do cronômetro no header: ponto pulsante, tempo, tarefa e parar. */
function TimerPill() {
  const timer = useRunningTimer();
  const { stopTimer } = useData();
  const toast = useToast();
  const [, setParams] = useSearchParams();
  if (!timer) return <StartTimerMenu />;
  return (
    <div className="flex h-[34px] min-w-0 items-center gap-2.5 rounded-full bg-surface pl-3 pr-1 shadow-[0_0_0_1px_rgb(var(--line))]">
      <span className="h-[7px] w-[7px] shrink-0 animate-timer-dot rounded-full bg-[#d07a62]" aria-hidden />
      <span className="font-mono text-[12.5px] tabular text-ink" aria-label="Tempo decorrido">{timer.elapsed}</span>
      <button
        type="button"
        onClick={() => setParams((p) => { const next = new URLSearchParams(p); next.set('tarefa', timer.entry.task_id); return next; })}
        className="min-w-0 max-w-[320px] truncate text-[13px] text-muted hover:text-ink"
        title={timer.label}
      >
        {timer.label}
      </button>
      <button
        type="button"
        onClick={() => stopTimer().then(() => toast.success('Tempo lançado na tarefa.')).catch(toast.error)}
        aria-label="Parar cronômetro"
        title="Parar cronômetro"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink transition-colors hover:bg-stone-200"
      >
        <Square className="h-[11px] w-[11px] fill-current" strokeWidth={0} />
      </button>
    </div>
  );
}

/** Cronômetro parado: escolhe uma das minhas tarefas abertas para iniciar. */
function StartTimerMenu() {
  const { db, maps, me, startTimer } = useData();
  const toast = useToast();
  const tasks = useMemo(
    () =>
      db.tasks
        .filter((x) => x.assignee_id === me.id && x.status !== 'done')
        .filter((x) => {
          const p = x.project_id ? maps.projects[x.project_id] : null;
          return !p || isProjectActive(p);
        })
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
        .slice(0, 8),
    [db.tasks, maps.projects, me.id],
  );
  return (
    <Popover
      align="left"
      className="w-[min(92vw,340px)]"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-[34px] items-center gap-2 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
          Iniciar cronômetro
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 pb-1 pt-1.5 text-xs text-faint">Minhas tarefas abertas</div>
          {tasks.length === 0 && <p className="px-2.5 py-3 text-sm text-muted">Nenhuma tarefa aberta com você.</p>}
          {tasks.map((x) => {
            const p = x.project_id ? maps.projects[x.project_id] : null;
            return (
              <MenuItem
                key={x.id}
                icon={<Play className="h-3.5 w-3.5" />}
                onClick={() => {
                  close();
                  startTimer(x.id).catch(toast.error);
                }}
              >
                <span className="block truncate">{x.title}</span>
                <span className="block truncate text-xs text-faint">{p ? p.name : 'Avulsa'}</span>
              </MenuItem>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------- Celular
function MobileAppBar({ title, onSearch, isHome }: { title: string; onSearch: () => void; isHome: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const timer = useRunningTimer();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 72);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // No Painel a barra do cronômetro fica na página; ao rolar, recolhe para texto aqui.
  const compact = scrolled || !isHome;
  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex items-center gap-1 border-b border-line bg-surface/[0.92] pl-5 pr-2 backdrop-blur-[12px] transition-[height] duration-200 md:hidden',
        scrolled ? 'h-12' : 'h-[56px]',
      )}
    >
      <div className="min-w-0 flex-1">
        {scrolled ? <span className="font-display text-[15px] font-semibold text-ink">{title}</span> : <BrandMark size="sm" />}
      </div>
      {compact && timer && (
        <span className="mr-1 inline-flex items-center gap-1.5 font-mono text-xs tabular text-ink">
          <span className="h-1.5 w-1.5 animate-timer-dot rounded-full bg-[#d07a62]" aria-hidden />
          {timer.elapsed}
        </span>
      )}
      <IconButton label="Buscar" size="touch" onClick={onSearch}>
        <Search className="h-5 w-5" strokeWidth={1.6} />
      </IconButton>
      <NotificationsMenu touch />
    </div>
  );
}

function BottomNav({ onCreate, onMore }: { onCreate: () => void; onMore: () => void }) {
  const location = useLocation();
  const { can } = useData();
  const second = can('projetos')
    ? { to: '/projetos', label: 'Projetos', icon: Building2 }
    : can('comercial')
      ? { to: '/oportunidades', label: 'Oportunidades', icon: FolderKanban }
      : null;
  const moreActive =
    /^\/(clientes|projetos|oportunidades|financeiro|relatorios|equipe|configuracoes|perfil)/.test(location.pathname) &&
    !(second && location.pathname.startsWith(second.to));
  const item = (active: boolean) =>
    cn('flex h-[52px] flex-col items-center justify-center gap-1 text-[10.5px] leading-none', active ? 'font-medium text-ink' : 'text-faint');
  return (
    <nav
      aria-label="Navegação"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-canvas/[0.94] px-2 pt-1.5 backdrop-blur-[12px] md:hidden"
    >
      <NavLink to="/" end className={({ isActive }) => item(isActive && !location.search.includes('aba=agenda'))}>
        <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={1.6} />
        Painel
      </NavLink>
      {second ? (
        <NavLink to={second.to} className={({ isActive }) => item(isActive)}>
          <second.icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
          {second.label}
        </NavLink>
      ) : (
        <NavLink to="/?aba=agenda" className={() => item(location.pathname === '/' && location.search.includes('aba=agenda'))}>
          <CalendarDays className="h-[22px] w-[22px]" strokeWidth={1.6} />
          Agenda
        </NavLink>
      )}
      <div className="flex h-[52px] items-center justify-center">
        <button
          type="button"
          onClick={onCreate}
          aria-label="Criar"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-surface shadow-md transition-transform active:scale-95"
        >
          <Plus className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </button>
      </div>
      <NavLink to="/tarefas" className={({ isActive }) => item(isActive)}>
        <ListChecks className="h-[22px] w-[22px]" strokeWidth={1.6} />
        Tarefas
      </NavLink>
      <button type="button" onClick={onMore} className={item(moreActive)}>
        <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.6} />
        Mais
      </button>
    </nav>
  );
}

function SheetItem({ icon, label, onClick, to }: { icon: ReactNode; label: string; onClick?: () => void; to?: string }) {
  const cls = 'flex h-12 w-full items-center gap-3.5 rounded-[12px] px-3 text-left text-[15px] text-ink transition-colors hover:bg-canvas [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-muted';
  if (to) {
    return (
      <NavLink to={to} className={cls}>
        {icon}
        {label}
      </NavLink>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function MoreSheet({ onClose, onAssistant }: { onClose: () => void; onAssistant: () => void }) {
  const { signOut } = useAuth();
  const { can, isAdmin } = useData();
  const comercialInBar = !can('projetos') && can('comercial');
  return (
    <Sheet title="Mais" onClose={onClose}>
      {isAdmin && <SheetItem to="/meu-painel" icon={<LayoutGrid strokeWidth={1.6} />} label="Meu painel" />}
      <SheetItem to="/?aba=agenda" icon={<CalendarDays strokeWidth={1.6} />} label="Agenda" />
      {can('comercial') && !comercialInBar && <SheetItem to="/oportunidades" icon={<FolderKanban strokeWidth={1.6} />} label="Oportunidades" />}
      {can('comercial') && <SheetItem to="/clientes" icon={<Contact strokeWidth={1.6} />} label="Clientes" />}
      {can('financeiro') && <SheetItem to="/financeiro" icon={<Wallet strokeWidth={1.6} />} label="Financeiro" />}
      {can('relatorios') && <SheetItem to="/relatorios" icon={<BarChart3 strokeWidth={1.6} />} label="Relatórios" />}
      {can('equipe') && <SheetItem to="/equipe" icon={<Users strokeWidth={1.6} />} label="Equipe" />}
      {can('configuracoes') && <SheetItem to="/configuracoes" icon={<Settings strokeWidth={1.6} />} label="Configurações" />}
      <div className="mx-3 my-2 border-t border-line" />
      <SheetItem icon={<Sparkles strokeWidth={1.6} />} label="Assistente" onClick={onAssistant} />
      <SheetItem to="/perfil" icon={<UserCircle strokeWidth={1.6} />} label="Meu perfil" />
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-[15px] text-ink">Tema</span>
        <ThemeSwitch />
      </div>
      <SheetItem icon={<LogOut strokeWidth={1.6} />} label="Sair" onClick={() => signOut()} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- Menus
function ThemeSwitch() {
  const [pref, setPref] = useTheme();
  return (
    <Segmented<ThemePref>
      value={pref}
      onChange={setPref}
      options={[
        { id: 'light', label: <span className="sr-only">Claro</span>, icon: <Sun /> },
        { id: 'dark', label: <span className="sr-only">Escuro</span>, icon: <Moon /> },
        { id: 'system', label: <span className="sr-only">Sistema</span>, icon: <Monitor /> },
      ]}
    />
  );
}

function NotificationsMenu({ touch }: { touch?: boolean }) {
  const { db, me, markNotificationsRead } = useData();
  const navigate = useNavigate();
  const mine = useMemo(
    () => db.notifications.filter((n) => n.user_id === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [db.notifications, me.id],
  );
  const unread = mine.filter((n) => !n.read);
  return (
    <Popover
      className="w-[min(92vw,380px)] p-0"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'relative inline-flex items-center justify-center text-stone-700 transition-colors hover:bg-ink/5 hover:text-ink',
            touch ? 'h-11 w-11 rounded-[12px]' : 'h-[34px] w-[34px] rounded-[9px]',
          )}
          aria-label={unread.length ? `Notificações (${unread.length} não lidas)` : 'Notificações'}
          title="Notificações"
        >
          <Bell className={touch ? 'h-5 w-5' : ICON} strokeWidth={1.6} />
          {unread.length > 0 && <span className={cn('absolute h-1.5 w-1.5 rounded-full bg-danger-solid', touch ? 'right-3 top-3' : 'right-2 top-2')} />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-[15px] font-semibold">Notificações</span>
            {unread.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
                onClick={() => markNotificationsRead(unread.map((n) => n.id))}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto p-1">
            {mine.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma notificação por aqui.</p>}
            {mine.slice(0, 40).map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn('flex w-full gap-3 rounded-sm px-3 py-2.5 text-left hover:bg-canvas', !n.read && 'bg-subtle')}
                onClick={() => {
                  if (!n.read) markNotificationsRead([n.id]);
                  if (n.link) navigate(n.link);
                  close();
                }}
              >
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-danger-solid')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-faint">{formatRelative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

/** Rodapé da sidebar: avatar + nome + papel, abre o menu da conta. */
function UserMenu() {
  const { me, isAdmin, can } = useData();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const role = isAdmin ? 'Administrador' : me.job_title || 'Membro';
  return (
    <Popover
      align="left"
      side="top"
      className="w-60"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-[9px] p-1 text-left transition-colors hover:bg-ink/5 max-xl:justify-center xl:px-1.5"
          title={me.name}
        >
          <Avatar user={me} size={28} />
          <span className="hidden min-w-0 leading-tight xl:block">
            <span className="block truncate text-[13px] font-medium text-ink">{me.name}</span>
            <span className="block truncate text-[11.5px] text-faint">{role}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 py-2">
            <div className="truncate text-body font-medium text-ink">{me.name}</div>
            <div className="truncate text-xs text-faint">{me.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<UserCircle className="h-4 w-4" />} onClick={() => { close(); navigate('/perfil'); }}>
            Meu perfil
          </MenuItem>
          {can('configuracoes') && (
            <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => { close(); navigate('/configuracoes'); }}>
              Configurações
            </MenuItem>
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13.5px] text-stone-800">
            Tema
            <ThemeSwitch />
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={() => signOut()} danger>
            Sair
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}
