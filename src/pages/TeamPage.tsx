import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound, Pencil, Plus, ShieldCheck, UserX, UserCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { SWATCHES } from '../lib/constants';
import { isProjectActive, totalMinutes } from '../lib/domain';
import type { Profile, Role } from '../lib/types';
import { cn, formatMinutes, isValidEmail, maskPhone, startOfWeek, today, toDateKey } from '../lib/utils';
import { ActionLink, Avatar, Button, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader, SectionHeader, Select } from '../components/ui';
import { TaskRow } from '../components/tasks/TaskRow';
import { useOpenTask } from '../components/tasks/useOpenTask';

export default function TeamPage() {
  const { db, isAdmin, me } = useData();
  const [params, setParams] = useSearchParams();
  const openTask = useOpenTask();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [toggling, setToggling] = useState<Profile | null>(null);
  const { updateUser } = useData();
  const toast = useToast();
  const selectedId = params.get('membro');

  const stats = useMemo(() => {
    const t = today();
    const ws = startOfWeek(t);
    const out: Record<string, { open: number; overdue: number; projects: number; week: number; month: number }> = {};
    const monthStart = t.slice(0, 7);
    for (const p of db.profiles) {
      const tasks = db.tasks.filter((x) => x.assignee_id === p.id && x.status !== 'done');
      const entries = db.time_entries.filter((e) => e.user_id === p.id);
      out[p.id] = {
        open: tasks.length,
        overdue: tasks.filter((x) => x.due_date && x.due_date < t).length,
        projects: db.projects.filter((pr) => isProjectActive(pr) && (pr.manager_id === p.id || pr.member_ids.includes(p.id))).length,
        week: totalMinutes(entries.filter((e) => toDateKey(new Date(e.started_at)) >= ws)),
        month: totalMinutes(entries.filter((e) => e.started_at.slice(0, 7) === monthStart)),
      };
    }
    return out;
  }, [db]);

  const members = [...db.profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const selected = selectedId ? db.profiles.find((p) => p.id === selectedId) : null;
  const selectedTasks = selected
    ? db.tasks.filter((x) => x.assignee_id === selected.id && x.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    : [];
  const active = members.filter((p) => p.active);
  const totalOpen = active.reduce((acc, p) => acc + (stats[p.id]?.open ?? 0), 0);
  const totalOverdue = active.reduce((acc, p) => acc + (stats[p.id]?.overdue ?? 0), 0);
  const cols = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_110px_72px_minmax(0,1fr)_64px]';

  return (
    <div>
      <PageHeader
        title="Equipe"
        description={
          <>
            {active.length} {active.length === 1 ? 'pessoa ativa' : 'pessoas ativas'} · {totalOpen} {totalOpen === 1 ? 'tarefa aberta' : 'tarefas abertas'}
            {totalOverdue > 0 && (
              <>
                {' · '}
                <span className="text-danger-fg">
                  {totalOverdue} {totalOverdue === 1 ? 'atrasada' : 'atrasadas'}
                </span>
              </>
            )}
          </>
        }
        actions={
          isAdmin && (
            <Button variant="primary" icon={<Plus className="h-4 w-4" strokeWidth={1.6} />} onClick={() => setCreating(true)}>
              Membro
            </Button>
          )
        }
      />

      <div className={`hidden gap-6 border-b border-hairline pb-2.5 text-[12.5px] text-faint md:grid ${cols}`}>
        <span>Pessoa</span>
        <span>Contato</span>
        <span>Tarefas</span>
        <span>Projetos</span>
        <span>Horas na semana</span>
        <span className="sr-only">Ações</span>
      </div>
      <ul>
        {members.map((p) => {
          const st = stats[p.id];
          const isSel = selectedId === p.id;
          return (
            <li key={p.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                onClick={() => setParams(isSel ? {} : { membro: p.id }, { replace: true })}
                onKeyDown={(e) => e.key === 'Enter' && setParams(isSel ? {} : { membro: p.id }, { replace: true })}
                className={cn(
                  'group grid cursor-pointer items-center gap-x-6 gap-y-1 border-b border-hairline py-3.5 transition-colors md:px-2',
                  cols,
                  isSel ? 'bg-brand-50 shadow-[inset_2px_0_0_rgb(var(--accent))]' : 'hover:bg-ink/[0.025]',
                  !p.active && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={p} size="md" me={p.id === me.id} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-ink">{p.name}</span>
                      {p.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-fg" strokeWidth={1.8} aria-label="Administrador" />}
                    </div>
                    <div className="truncate text-[12.5px] text-faint">
                      {p.job_title || (p.role === 'admin' ? 'Administrador' : 'Membro')}
                      {!p.active && ' · desativado'}
                    </div>
                  </div>
                </div>
                <div className="hidden min-w-0 md:block">
                  <div className="truncate text-[13px] text-stone-700">{p.email}</div>
                  <div className="truncate text-[12.5px] text-faint">{p.phone || 'sem telefone'}</div>
                </div>
                <div className="text-right text-[13px] md:text-left">
                  <span className="tabular text-ink">{st?.open ?? 0}</span> <span className="text-faint">{st?.open === 1 ? 'aberta' : 'abertas'}</span>
                  {st?.overdue ? (
                    <div className="text-[12.5px] text-danger-fg">
                      {st.overdue} {st.overdue === 1 ? 'atrasada' : 'atrasadas'}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-faint">em dia</div>
                  )}
                </div>
                <div className="hidden text-[13px] tabular text-muted md:block">{st?.projects ?? 0}</div>
                <div className="hidden min-w-0 md:block">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="tabular text-ink">{formatMinutes(st?.week ?? 0)}</span>
                    <span className="text-[12px] text-faint">{formatMinutes(st?.month ?? 0)} no mês</span>
                  </div>
                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-hairline">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, ((st?.week ?? 0) / 60 / 40) * 100)}%` }} />
                  </div>
                </div>
                <div className="hidden justify-end md:flex" onClick={(e) => e.stopPropagation()}>
                  {isAdmin && (
                    <div className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <IconButton label={`Editar ${p.name}`} size="xs" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      {p.id !== me.id && (
                        <IconButton label={p.active ? `Desativar ${p.name}` : `Reativar ${p.name}`} size="xs" onClick={() => setToggling(p)}>
                          {p.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </IconButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {selected && (
        <section aria-labelledby="tarefas-membro" className="mt-12">
          <SectionHeader
            id="tarefas-membro"
            title={`Tarefas abertas de ${selected.name.split(' ')[0]}`}
            aside={
              <span className="flex items-center gap-4">
                {isAdmin && (
                  <ActionLink onClick={() => setEditing(selected)} muted>
                    Editar cadastro
                  </ActionLink>
                )}
                <span className="text-[13px] tabular text-faint">{selectedTasks.length}</span>
              </span>
            }
          />
          {selectedTasks.length === 0 ? (
            <p className="border-t border-hairline py-4 text-[13px] text-faint">Nenhuma tarefa aberta.</p>
          ) : (
            <div className="overflow-hidden rounded-[16px] bg-surface shadow-surface">
              <div className="divide-y divide-hairline-surface md:[&>div]:px-6">
                {selectedTasks.map((x) => (
                  <TaskRow key={x.id} task={x} onOpen={() => openTask(x.id)} showProject />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {creating && <MemberModal onClose={() => setCreating(false)} />}
      {editing && <MemberModal member={editing} onClose={() => setEditing(null)} />}
      {toggling && (
        <ConfirmDialog
          title={toggling.active ? 'Desativar membro' : 'Reativar membro'}
          danger={toggling.active}
          confirmLabel={toggling.active ? 'Desativar' : 'Reativar'}
          message={
            toggling.active
              ? <>{toggling.name} não conseguirá mais entrar no sistema. Tarefas e histórico são mantidos.</>
              : <>{toggling.name} voltará a ter acesso ao sistema.</>
          }
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            try {
              await updateUser(toggling.id, { active: !toggling.active });
              toast.success(toggling.active ? 'Membro desativado.' : 'Membro reativado.');
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </div>
  );
}

function MemberModal({ member, onClose }: { member?: Profile; onClose: () => void }) {
  const { createUser, updateUser, me, db } = useData();
  const toast = useToast();
  const used = new Set(db.profiles.map((p) => p.color));
  const [v, setV] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    password: '',
    role: member?.role ?? ('member' as Role),
    job_title: member?.job_title ?? '',
    phone: member?.phone ?? '',
    color: member?.color ?? SWATCHES.find((c) => !used.has(c)) ?? SWATCHES[1],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Informe o nome';
    if (!isValidEmail(v.email)) e.email = 'E-mail inválido';
    if (!member && v.password.length < 6) e.password = 'Mínimo de 6 caracteres';
    if (member && v.password && v.password.length < 6) e.password = 'Mínimo de 6 caracteres';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (member) {
        await updateUser(
          member.id,
          { name: v.name.trim(), role: member.id === me.id ? member.role : v.role, job_title: v.job_title || null, phone: v.phone || null, color: v.color },
          { email: v.email.trim().toLowerCase(), password: v.password || undefined },
        );
        toast.success('Membro atualizado.');
      } else {
        await createUser({ name: v.name.trim(), email: v.email.trim(), password: v.password, role: v.role, job_title: v.job_title || null, phone: v.phone || null, color: v.color });
        toast.success(`${v.name.split(' ')[0]} foi cadastrado(a). Envie o e-mail e a senha para o primeiro acesso.`);
      }
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={member ? 'Editar membro' : 'Novo membro da equipe'}
      subtitle={member ? undefined : 'O membro entra com este e-mail e senha e pode trocá-la em Meu perfil.'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>{member ? 'Salvar' : 'Cadastrar membro'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" required error={errors.name} className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
        <Field label="E-mail de acesso" required error={errors.email}><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label={member ? 'Nova senha (opcional)' : 'Senha inicial'} required={!member} error={errors.password}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input type="text" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="pl-9" placeholder={member ? 'Deixe em branco para manter' : ''} autoComplete="new-password" />
          </div>
        </Field>
        <Field label="Cargo / função"><Input value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} placeholder="Ex.: Arquiteta, Estagiário, Comercial" /></Field>
        <Field label="Telefone / WhatsApp" hint="Usado para falar com o assistente pelo WhatsApp."><Input value={v.phone} onChange={(e) => setV({ ...v, phone: maskPhone(e.target.value) })} /></Field>
        <Field label="Nível de acesso" hint={member?.id === me.id ? 'Você não pode alterar o próprio nível.' : 'Administradores gerenciam equipe e configurações.'}>
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} disabled={member?.id === me.id}>
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
