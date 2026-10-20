import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { photoUrl, uploadObraPhoto } from '../../lib/obraFiles';
import type { Tone } from '../../lib/status';
import type { ObraPhoto } from '../../lib/types';
import { cn, formatDate } from '../../lib/utils';
import { Badge, Button, Field, IconButton, Input, Select } from '../ui';

export function ToneBadge({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}

/** Seção com título e ações, no padrão das páginas (painel branco). */
export function Panel({ title, aside, children, className, id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn('panel', className)}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {title && (
            <h2 id={id} className="font-display text-[15.5px] font-semibold text-ink">
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Fotos
function usePhotoSrc(path: string) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    photoUrl(path)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);
  return { src, failed };
}

export function PhotoThumb({ photo, onClick, className, children }: { photo: ObraPhoto; onClick?: () => void; className?: string; children?: ReactNode }) {
  const { src, failed } = usePhotoSrc(photo.path);
  return (
    <button
      type="button"
      onClick={onClick}
      title={photo.caption || photo.name}
      className={cn('group relative block overflow-hidden rounded-[10px] bg-stone-100 outline-none ring-accent focus-visible:ring-2', className ?? 'aspect-square w-full')}
      data-photo
    >
      {src ? (
        <img src={src} alt={photo.caption || photo.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint">
          {failed ? <ImageOff className="h-5 w-5" strokeWidth={1.6} /> : <span className="spinner" />}
        </span>
      )}
      {children}
    </button>
  );
}

/** Foto ampliada com legenda e navegação (setas do teclado). */
export function Lightbox({ photos, index, onClose, meta }: { photos: ObraPhoto[]; index: number; onClose: () => void; meta?: (p: ObraPhoto) => ReactNode }) {
  const [i, setI] = useState(index);
  const photo = photos[i];
  const { src } = usePhotoSrc(photo?.path ?? '');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(photos.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);
  if (!photo) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label="Foto">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[13px] tabular text-white/70">
          {i + 1} de {photos.length}
        </span>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        {src ? <img src={src} alt={photo.caption || photo.name} className="max-h-full max-w-full object-contain" /> : <span className="spinner" />}
        {i > 0 && (
          <button type="button" aria-label="Anterior" onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {i < photos.length - 1 && (
          <button type="button" aria-label="Próxima" onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      <div className="px-5 pb-6 pt-3 text-center">
        {photo.caption && <p className="text-[15px]">{photo.caption}</p>}
        <p className="mt-1 text-[12.5px] text-white/60">{meta ? meta(photo) : formatDate(photo.uploaded_at.slice(0, 10))}</p>
      </div>
    </div>,
    document.body,
  );
}

/** Grade de fotos com ampliação. */
export function PhotoGrid({ photos, meta, className, max }: { photos: ObraPhoto[]; meta?: (p: ObraPhoto) => ReactNode; className?: string; max?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = max ? photos.slice(0, max) : photos;
  const more = max && photos.length > max ? photos.length - max : 0;
  return (
    <>
      <div className={cn('grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6', className)}>
        {shown.map((p, i) => (
          <PhotoThumb key={p.id} photo={p} onClick={() => setOpen(i)}>
            {more > 0 && i === shown.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-display text-[18px] font-semibold text-white">+{more}</span>
            )}
          </PhotoThumb>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} meta={meta} />}
    </>
  );
}

/**
 * Fotos de um formulário (visita, pendência): tirar/escolher várias, legenda e etapa em cada uma.
 * Envia na hora (reduzidas) para a pasta da obra.
 */
export function PhotoEditor({
  obraId,
  photos,
  onChange,
  stages,
  label = 'Fotos',
}: {
  obraId: string;
  photos: ObraPhoto[];
  onChange: (next: ObraPhoto[]) => void;
  stages?: Array<{ id: string; name: string }>;
  label?: string;
}) {
  const { me } = useData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const latest = useRef(photos);
  latest.current = photos;

  const add = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => /^image\//.test(f.type));
    if (input.current) input.current.value = '';
    if (!list.length) return;
    setBusy(list.length);
    try {
      for (const f of list) {
        const photo = await uploadObraPhoto(obraId, f, me.id);
        latest.current = [...latest.current, photo];
        onChange(latest.current);
        setBusy((n) => n - 1);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(0);
    }
  };

  const set = (id: string, changes: Partial<ObraPhoto>) => onChange(photos.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label mb-0">{label}</span>
        <Button size="sm" icon={<Camera className="h-4 w-4" strokeWidth={1.6} />} onClick={() => input.current?.click()} loading={busy > 0} loadingText={`Enviando ${busy}…`}>
          Adicionar fotos
        </Button>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Escolher fotos" onChange={(e) => add(e.target.files)} />
      </div>
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted hover:border-stone-400 hover:text-ink"
        >
          <Camera className="h-5 w-5" strokeWidth={1.6} />
          Tire ou escolha as fotos da obra (várias de uma vez)
        </button>
      ) : (
        <ul className="space-y-2">
          {photos.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-[12px] border border-line p-2">
              <PhotoThumb photo={p} className="h-[68px] w-[68px] shrink-0" />
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Input value={p.caption ?? ''} placeholder="Legenda (ex.: tubulação do banheiro)" aria-label={`Legenda de ${p.name}`} onChange={(e) => set(p.id, { caption: e.target.value || null })} />
                {stages && stages.length > 0 && (
                  <Select value={p.stage_id ?? ''} onChange={(e) => set(p.id, { stage_id: e.target.value || null })} aria-label={`Etapa de ${p.name}`}>
                    <option value="">Sem etapa</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              <IconButton label={`Remover ${p.name}`} size="sm" onClick={() => onChange(photos.filter((x) => x.id !== p.id))}>
                <X className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Cliente
export interface ClientValue {
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
}

/** Cliente cadastrado (se a pessoa vê os clientes) ou só nome e contato, para quem ainda não é cliente. */
export function ClientChooser({ value, onChange }: { value: ClientValue; onChange: (v: ClientValue) => void }) {
  const { db } = useData();
  const clients = [...db.clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      {clients.length > 0 && (
        <Field label="Cliente cadastrado" className="sm:col-span-6" hint="Opcional: escolha um cliente ou preencha só o nome e o contato.">
          <Select
            value={value.client_id ?? ''}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              onChange(c ? { client_id: c.id, client_name: c.name, client_phone: c.phone, client_email: c.email } : { ...value, client_id: null });
            }}
          >
            <option value="">Nenhum (só o nome)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Nome do cliente" className="sm:col-span-2">
        <Input value={value.client_name ?? ''} onChange={(e) => onChange({ ...value, client_name: e.target.value || null })} />
      </Field>
      <Field label="WhatsApp do cliente" className="sm:col-span-2">
        <Input inputMode="tel" value={value.client_phone ?? ''} onChange={(e) => onChange({ ...value, client_phone: e.target.value || null })} placeholder="(41) 99999-0000" />
      </Field>
      <Field label="E-mail do cliente" className="sm:col-span-2">
        <Input type="email" value={value.client_email ?? ''} onChange={(e) => onChange({ ...value, client_email: e.target.value || null })} />
      </Field>
    </div>
  );
}

/** Barra dupla: previsto (cinza) e realizado (cor) no mesmo trilho. */
export function DualBar({ actual, expected, className, color }: { actual: number; expected?: number | null; className?: string; color?: string }) {
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-stone-100', className)}>
      {expected != null && <div className="absolute inset-y-0 left-0 rounded-full bg-stone-300" style={{ width: `${Math.min(100, Math.max(0, expected))}%` }} />}
      <div className="absolute inset-y-0 left-0 rounded-full bg-ink transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, actual))}%`, backgroundColor: color }} />
    </div>
  );
}

const parseDecimal = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!t) return null;
  // "1.234,56" ou "1234,56" ou "1234.56"
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

const fmtDecimal = (v: number, digits: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits });

/** Número com vírgula (quantidades e preços nas tabelas): digita livre, formata ao sair do campo. */
export function DecimalInput({
  value,
  onChange,
  onCommit,
  digits = 2,
  className,
  'aria-label': ariaLabel,
  placeholder,
}: {
  value: number;
  onChange?: (v: number) => void;
  /** Grava só ao sair do campo (em vez de a cada tecla). */
  onCommit?: (v: number) => void;
  digits?: number;
  className?: string;
  'aria-label'?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder ?? '0'}
      className={cn('input h-8 px-2 text-right tabular', className)}
      value={text ?? (value ? fmtDecimal(value, digits) : '')}
      onFocus={(e) => {
        setText(value ? fmtDecimal(value, digits).replace(/\./g, '') : '');
        const el = e.target;
        // select() também dá foco: só seleciona se a pessoa ainda está neste campo
        requestAnimationFrame(() => document.activeElement === el && el.select());
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(parseDecimal(e.target.value) ?? 0);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={() => {
        const v = text == null ? value : (parseDecimal(text) ?? 0);
        if (onCommit && v !== value) onCommit(v);
        setText(null);
      }}
    />
  );
}
