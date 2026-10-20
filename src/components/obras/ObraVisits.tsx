import { useMemo, useState } from 'react';
import { Camera, CloudRain, CloudSun, Pencil, Sun, Trash2, Users } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { VISIT_KIND, WEATHER } from '../../lib/obras';
import { removeTeamFiles } from '../../lib/teamFiles';
import type { ObraPhoto, ObraVisit, ObraVisitKind } from '../../lib/types';
import { cn, formatDate, nowIso, today, uid, weekdayDate } from '../../lib/utils';
import { Avatar, Button, Checkbox, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, Select, Textarea } from '../ui';
import { PhotoEditor, PhotoGrid } from './parts';
import { useObraActions } from './useObraActions';
import type { ObraSummary } from './useObraSummaries';

const weatherIcon = (w: string | null) =>
  !w ? null : /chuv/i.test(w) ? <CloudRain className="h-3.5 w-3.5" /> : /nublado/i.test(w) ? <CloudSun className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />;

/** Diário da obra: cada visita com o que foi feito, quem estava, clima, avanço e fotos. */
export function ObraVisits({ summary, onNew }: { summary: ObraSummary; onNew: () => void }) {
  const { maps } = useData();
  const { deleteVisit } = useObraActions();
  const toast = useToast();
  const [editing, setEditing] = useState<ObraVisit | null>(null);
  const [removing, setRemoving] = useState<ObraVisit | null>(null);
  const stageName = (id: string) => summary.stages.find((s) => s.id === id)?.name ?? 'Etapa removida';

  if (summary.visits.length === 0) {
    return (
      <div className="rounded-[16px] border border-line bg-surface shadow-card">
        <EmptyState
          icon={<Camera strokeWidth={1.6} />}
          title="Nenhuma visita registrada"
          description="Em cada ida à obra, registre o que foi feito, as fotos e o avanço das etapas. Tudo fica no histórico e no relatório do cliente."
          action={<Button variant="primary" onClick={onNew}>Registrar visita</Button>}
          className="py-14"
        />
      </div>
    );
  }

  return (
    <div>
      <ol className="relative space-y-6 border-l border-line pl-6 md:ml-2">
        {summary.visits.map((v) => {
          const author = v.author_id ? maps.profiles[v.author_id] : null;
          return (
            <li key={v.id} className="relative" data-visit>
              <span className="absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-stone-500 ring-1 ring-line" aria-hidden />
              <article className="rounded-[16px] border border-line bg-surface p-4 shadow-card md:p-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-medium uppercase tracking-[0.06em] text-faint">{VISIT_KIND[v.kind]}</div>
                    <h3 className="font-display text-[16px] font-semibold capitalize text-ink">{weekdayDate(v.date)}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                      {author && (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar user={author} size="xs" /> {author.name}
                        </span>
                      )}
                      {v.weather && (
                        <span className="inline-flex items-center gap-1">
                          {weatherIcon(v.weather)} {v.weather}
                        </span>
                      )}
                      {v.workers && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {v.workers}
                        </span>
                      )}
                      {!v.shared && <span className="text-faint">· interna (fora do relatório)</span>}
                    </div>
                  </div>
                  <span className="flex">
                    <IconButton label="Editar visita" onClick={() => setEditing(v)}>
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </IconButton>
                    <IconButton label="Excluir visita" onClick={() => setRemoving(v)} className="hover:text-danger-fg">
                      <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                    </IconButton>
                  </span>
                </header>
                {v.summary && <p className="mt-3 whitespace-pre-line text-[14px] text-ink">{v.summary}</p>}
                {v.notes && (
                  <p className="mt-2 whitespace-pre-line rounded-[10px] bg-subtle px-3 py-2 text-[13px] text-stone-700">
                    <b className="font-medium">Próximos passos:</b> {v.notes}
                  </p>
                )}
                {v.progress.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {v.progress.map((p) => (
                      <li key={p.stage_id} className="rounded-full bg-stone-100 px-2.5 py-1 text-[12px] tabular text-stone-700">
                        {stageName(p.stage_id)}: {Math.round(p.from)}% → <b className="font-semibold text-ink">{Math.round(p.to)}%</b>
                      </li>
                    ))}
                  </ul>
                )}
                {v.photos.length > 0 && (
                  <PhotoGrid
                    className="mt-4"
                    photos={v.photos}
                    meta={(p) => [formatDate(v.date), p.stage_id ? stageName(p.stage_id) : null].filter(Boolean).join(' · ')}
                  />
                )}
              </article>
            </li>
          );
        })}
      </ol>
      {editing && <VisitModal summary={summary} visit={editing} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmDialog
          title="Excluir visita?"
          message={`Visita de ${formatDate(removing.date)}${removing.photos.length ? ` e suas ${removing.photos.length} fotos` : ''}. O avanço das etapas não volta.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => deleteVisit(removing).catch(toast.error)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

/** Todas as fotos da obra, por data, com filtro por etapa. */
export function ObraPhotos({ summary, onNew }: { summary: ObraSummary; onNew: () => void }) {
  const [stage, setStage] = useState('');
  const groups = useMemo(
    () =>
      summary.visits
        .map((v) => ({ visit: v, photos: v.photos.filter((p) => !stage || p.stage_id === stage) }))
        .filter((g) => g.photos.length > 0),
    [summary.visits, stage],
  );
  const stageName = (id: string | null | undefined) => (id ? summary.stages.find((s) => s.id === id)?.name : null);
  if (summary.photos === 0) {
    return (
      <div className="rounded-[16px] border border-line bg-surface shadow-card">
        <EmptyState
          icon={<Camera strokeWidth={1.6} />}
          title="Nenhuma foto ainda"
          description="As fotos entram pelas visitas: tire pelo celular na obra e marque a etapa de cada uma."
          action={<Button variant="primary" onClick={onNew}>Registrar visita com fotos</Button>}
          className="py-14"
        />
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-60">
          <Select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filtrar por etapa">
            <option value="">Todas as etapas</option>
            {summary.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-[12.5px] text-muted">{groups.reduce((a, g) => a + g.photos.length, 0)} fotos</span>
      </div>
      {groups.length === 0 && <p className="text-center text-sm text-muted">Nenhuma foto desta etapa.</p>}
      {groups.map((g) => (
        <section key={g.visit.id} aria-label={formatDate(g.visit.date)}>
          <h3 className="mb-2 text-[13px] font-medium capitalize text-ink">
            {weekdayDate(g.visit.date)} <span className="font-normal normal-case text-faint">· {VISIT_KIND[g.visit.kind]}</span>
          </h3>
          <PhotoGrid photos={g.photos} meta={(p) => [formatDate(g.visit.date), stageName(p.stage_id)].filter(Boolean).join(' · ')} />
        </section>
      ))}
    </div>
  );
}

/** Registrar ou editar visita: resumo, clima, equipe no local, avanço das etapas e fotos. */
export function VisitModal({ summary, visit, onClose, onSaved }: { summary: ObraSummary; visit?: ObraVisit; onClose: () => void; onSaved?: () => void }) {
  const { me } = useData();
  const { saveVisit } = useObraActions();
  const toast = useToast();
  const { obra, stages } = summary;
  const [form, setForm] = useState<ObraVisit>(
    () =>
      visit ?? {
        id: uid(),
        obra_id: obra.id,
        date: today(),
        kind: 'visita',
        author_id: me.id,
        summary: '',
        weather: null,
        workers: null,
        notes: null,
        photos: [],
        progress: [],
        shared: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
  );
  // Avanço: parte do atual de cada etapa (ou do que já foi informado nesta visita)
  const [progress, setProgress] = useState<Record<string, number>>(() =>
    Object.fromEntries(stages.map((s) => [s.id, visit?.progress.find((p) => p.stage_id === s.id)?.to ?? s.progress])),
  );
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<ObraVisit>) => setForm((f) => ({ ...f, ...c }));
  const originalPhotos = visit?.photos ?? [];

  const close = () => {
    // Fotos enviadas e não salvas saem do armazenamento
    const kept = new Set(originalPhotos.map((p) => p.path));
    removeTeamFiles(form.photos.filter((p) => !kept.has(p.path)).map((p) => p.path));
    onClose();
  };

  const save = async () => {
    const changed = stages
      .map((s) => ({ stage_id: s.id, from: visit?.progress.find((p) => p.stage_id === s.id)?.from ?? s.progress, to: progress[s.id] }))
      .filter((p) => Math.round(p.from) !== Math.round(p.to));
    if (!form.summary.trim() && !form.photos.length && !changed.length) return toast.error('Conte o que viu na obra, adicione fotos ou atualize o avanço.');
    setBusy(true);
    try {
      await saveVisit(obra, { ...form, progress: changed }, !visit);
      // Fotos tiradas da visita saem do armazenamento
      const now = new Set(form.photos.map((p) => p.path));
      removeTeamFiles(originalPhotos.filter((p) => !now.has(p.path)).map((p) => p.path));
      toast.success(visit ? 'Visita atualizada.' : `Visita registrada${form.photos.length ? ` com ${form.photos.length} fotos` : ''}.`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={visit ? 'Editar visita' : 'Registrar visita'}
      subtitle={`${obra.code} · ${obra.name}`}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Salvar visita
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data">
            <Input type="date" value={form.date} max={today()} onChange={(e) => set({ date: e.target.value || today() })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.kind} onChange={(e) => set({ kind: e.target.value as ObraVisitKind })}>
              {(Object.keys(VISIT_KIND) as ObraVisitKind[]).map((k) => (
                <option key={k} value={k}>
                  {VISIT_KIND[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Clima">
            <Select value={form.weather ?? ''} onChange={(e) => set({ weather: e.target.value || null })}>
              <option value="">—</option>
              {WEATHER.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="O que foi feito / observado" className="sm:col-span-3">
            <Textarea rows={4} value={form.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Ex.: Elétrica passou a fiação da sala e cozinha; gesso começou o forro dos quartos." />
          </Field>
          <Field label="Quem estava trabalhando" className="sm:col-span-2">
            <Input value={form.workers ?? ''} onChange={(e) => set({ workers: e.target.value || null })} placeholder="Ex.: Eletricista + 2 ajudantes, gesseiro" />
          </Field>
          <Field label="Próximos passos / orientações" className="sm:col-span-3">
            <Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
          </Field>
        </div>

        <PhotoEditor obraId={obra.id} photos={form.photos} onChange={(photos: ObraPhoto[]) => set({ photos })} stages={stages} />

        {stages.length > 0 && (
          <div>
            <div className="label">Avanço das etapas</div>
            <ul className="divide-y divide-hairline-surface rounded-[12px] border border-line">
              {stages.map((s) => {
                const before = visit?.progress.find((p) => p.stage_id === s.id)?.from ?? s.progress;
                const v = progress[s.id];
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.name}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={v}
                      aria-label={`Avanço de ${s.name} nesta visita`}
                      onChange={(e) => setProgress((p) => ({ ...p, [s.id]: Number(e.target.value) }))}
                      className="w-32 accent-[rgb(var(--ink))] sm:w-48"
                    />
                    <span className={cn('w-20 text-right text-[12.5px] tabular', v !== before ? 'font-semibold text-ink' : 'text-faint')}>
                      {v !== before ? `${Math.round(before)}→${v}%` : `${Math.round(v)}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Checkbox checked={form.shared} onChange={(shared) => set({ shared })} label="Mostrar esta visita no relatório do cliente" />
      </div>
    </Modal>
  );
}
