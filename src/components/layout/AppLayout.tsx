import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Settings,
  Square,
  UserCircle,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { cn, formatClock, formatRelative, today } from '../../lib/utils';
import { Avatar, Badge, IconButton, MenuItem, Popover } from '../ui';
import { TaskDrawer } from '../tasks/TaskDrawer';
import { AssistantPanel } from './AssistantPanel';
import { CommandPalette } from './CommandPalette';
import { BrandMark } from './Logo';
import { useBranding } from '../../context/BrandingContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  adminOnly?: boolean;
  end?: boolean;
}

export function AppLayout() {
  const { db, me, isAdmin, settings } = useData();
  const { mode } = useAuth();
  const { setBranding } = useBranding();
  useEffect(() => {
    setBranding({ office_name: settings.office_name, logo_url: settings.logo_url ?? null });
  }, [settings.office_name, settings.logo_url, setBranding]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('tarefa');
  const closeTask = () => {
    const next = new URLSearchParams(params);
    next.delete('tarefa');
    setParams(next, { replace: true });
  };

  useEffect(() => setMobileOpen(false), [location.pathname]);

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

  const myOverdue = useMemo(() => {
    const t = today();
    return db.tasks.filter((x) => x.assignee_id === me.id && x.status !== 'done' && x.due_date && x.due_date <= t).length;
  }, [db.tasks, me.id]);

  const followUps = useMemo(() => {
    const t = today();
    const openStages = new Set(db.lead_stages.filter((s) => s.kind === 'open').map((s) => s.id));
    return db.leads.filter((l) => openStages.has(l.stage_id) && l.next_contact_date && l.next_contact_date <= t).length;
  }, [db.leads, db.lead_stages]);

  const nav: NavItem[] = [
    { to: '/', label: 'Início', icon: <LayoutDashboard className="h-[17px] w-[17px]" strokeWidth={1.6} />, end: true },
    { to: '/oportunidades', label: 'Oportunidades', icon: <FolderKanban className="h-[17px] w-[17px]" strokeWidth={1.6} />, badge: followUps },
    { to: '/clientes', label: 'Clientes', icon: <UsersRound className="h-[17px] w-[17px]" strokeWidth={1.6} /> },
    { to: '/projetos', label: 'Projetos', icon: <Briefcase className="h-[17px] w-[17px]" strokeWidth={1.6} /> },
    { to: '/tarefas', label: 'Minhas tarefas', icon: <ListChecks className="h-[17px] w-[17px]" strokeWidth={1.6} />, badge: myOverdue },
    { to: '/agenda', label: 'Agenda', icon: <CalendarDays className="h-[17px] w-[17px]" strokeWidth={1.6} /> },
    { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-[17px] w-[17px]" strokeWidth={1.6} /> },
    { to: '/equipe', label: 'Equipe', icon: <Users className="h-[17px] w-[17px]" strokeWidth={1.6} /> },
    { to: '/configuracoes', label: 'Configurações', icon: <Settings className="h-[17px] w-[17px]" strokeWidth={1.6} />, adminOnly: true },
  ];

  const sidebar = (
    <div className="flex h-full flex-col border-r border-line bg-white">
      <div className="flex h-20 items-center px-6">
        <BrandMark />
      </div>
      <button
        onClick={() => setPaletteOpen(true)}
        className="mx-4 mb-4 flex items-center gap-2.5 rounded-lg border border-line bg-canvas/60 px-3 py-2 text-left text-[13px] text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-600"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1">Buscar</span>
        <kbd className="font-sans text-[10px] text-stone-400">⌘K</kbd>
      </button>
      <nav className="scrollbar-thin flex-1 space-y-px overflow-y-auto px-3">
        {nav
          .filter((n) => !n.adminOnly || isAdmin)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-[9px] text-[13.5px] transition-colors',
                  isActive ? 'bg-canvas font-medium text-ink-900' : 'text-stone-500 hover:bg-canvas/70 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn(isActive ? 'text-ink-900' : 'text-stone-400 group-hover:text-stone-600')}>{n.icon}</span>
                  <span className="flex-1">{n.label}</span>
                  {!!n.badge && (
                    <span className="min-w-[20px] rounded-full bg-ink-900 px-1.5 py-px text-center text-[10.5px] font-medium text-white tabular">{n.badge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
      </nav>
      <div className="p-4">
        {mode === 'local' && (
          <div className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[11px] leading-snug text-stone-400">
            Modo demonstração · dados salvos apenas neste navegador
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/25 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72 animate-slide-in">{sidebar}</div>
          <button
            className="absolute right-4 top-4 rounded-full bg-white p-2 text-ink-900 shadow-pop"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-canvas/80 px-4 backdrop-blur-md sm:px-8">
          <IconButton label="Abrir menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="lg:hidden">
            <BrandMark size="sm" />
          </div>
          <div className="flex-1" />
          <IconButton label="Buscar" className="lg:hidden" onClick={() => setPaletteOpen(true)}>
            <Search className="h-5 w-5" />
          </IconButton>
          <RunningTimer />
          <button
            onClick={() => setAssistantOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-medium text-ink-900 transition-colors hover:border-stone-300"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.6} />
            <span className="hidden sm:inline">Assistente</span>
          </button>
          <NotificationsMenu />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-4 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {assistantOpen && <AssistantPanel onClose={() => setAssistantOpen(false)} />}
      {openTaskId && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
      <span className="sr-only">{me.name}</span>
    </div>
  );
}

function RunningTimer() {
  const { runningEntry, maps, stopTimer } = useData();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!runningEntry) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [runningEntry]);
  if (!runningEntry) return null;
  const task = maps.tasks[runningEntry.task_id];
  const seconds = (Date.now() - new Date(runningEntry.started_at).getTime()) / 1000;
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-sm">
      <button
        className="flex min-w-0 items-center gap-2 text-ink-900"
        onClick={() => navigate(`/tarefas?tarefa=${runningEntry.task_id}`)}
        title={task?.title}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
        <span className="hidden max-w-[180px] truncate md:inline">{task?.title ?? 'Tarefa'}</span>
        <span className="font-semibold tabular">{formatClock(seconds)}</span>
      </button>
      <IconButton label="Parar cronômetro" onClick={() => stopTimer()} className="h-7 w-7 text-ink-900 hover:bg-canvas">
        <Square className="h-3.5 w-3.5 fill-current" />
      </IconButton>
    </div>
  );
}

function NotificationsMenu() {
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
          onClick={toggle}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-white hover:text-ink-900"
          aria-label="Notificações"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-900 px-1 text-[9.5px] font-medium text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <span className="font-display text-sm font-semibold">Notificações</span>
            {unread.length > 0 && (
              <button
                className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-ink-900"
                onClick={() => markNotificationsRead(unread.map((n) => n.id))}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-[420px] overflow-y-auto p-1">
            {mine.length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhuma notificação por aqui.</p>}
            {mine.slice(0, 40).map((n) => (
              <button
                key={n.id}
                className={cn('flex w-full gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-stone-50', !n.read && 'bg-canvas/70')}
                onClick={() => {
                  if (!n.read) markNotificationsRead([n.id]);
                  if (n.link) navigate(n.link);
                  close();
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-ink-900')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                  {n.body && <span className="block text-xs text-stone-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-stone-400">{formatRelative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { me, isAdmin } = useData();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Popover
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white">
          <Avatar user={me} size="md" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-medium text-ink-900">{me.name.split(' ')[0]}</span>
            <span className="block text-[11px] text-stone-500">{isAdmin ? 'Administrador' : me.job_title || 'Membro'}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </button>
      )}
    >
      {(close) => (
        <div className="w-56">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold">{me.name}</div>
            <div className="truncate text-xs text-stone-500">{me.email}</div>
            {isAdmin && <Badge className="mt-1.5 bg-canvas text-stone-600">Administrador</Badge>}
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem icon={<UserCircle className="h-4 w-4" />} onClick={() => { close(); navigate('/perfil'); }}>
            Meu perfil
          </MenuItem>
          {isAdmin && (
            <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => { close(); navigate('/configuracoes'); }}>
              Configurações
            </MenuItem>
          )}
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={() => signOut()} danger>
            Sair
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}
