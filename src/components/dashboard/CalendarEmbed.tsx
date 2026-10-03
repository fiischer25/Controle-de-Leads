import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { toCalendarEmbedUrl } from '../../lib/utils';
import { Button, EmptyState, Segmented } from '../ui';

const GOOGLE_NEW_EVENT = 'https://calendar.google.com/calendar/r/eventedit';
const GOOGLE_CALENDAR = 'https://calendar.google.com/calendar/r';

/**
 * Espelho do Google Agenda (iframe oficial de incorporação do Google).
 * A incorporação do Google é somente leitura: criar ou editar eventos de lá
 * acontece no próprio Google Agenda, aberto em outra aba.
 */
export function CalendarEmbed({ height = 560 }: { height?: number }) {
  const { settings, me, can } = useData();
  const office = toCalendarEmbedUrl(settings.calendar_embed_url);
  const mine = toCalendarEmbedUrl(me.calendar_embed_url);
  const [which, setWhich] = useState<'office' | 'mine'>(mine && !office ? 'mine' : 'office');
  const url = which === 'mine' ? mine ?? office : office ?? mine;

  if (!url) {
    return (
      <EmptyState
        title="Conecte o Google Agenda"
        description={
          <>
            Cole o código de incorporação da agenda em{' '}
            {can('configuracoes') ? (
              <Link className="text-accent-fg hover:underline" to="/configuracoes?aba=agenda">
                Configurações → Google Agenda
              </Link>
            ) : (
              'Configurações (administrador)'
            )}{' '}
            ou a sua agenda pessoal em{' '}
            <Link className="text-accent-fg hover:underline" to="/perfil">
              Meu perfil
            </Link>
            .
          </>
        }
        className="py-16"
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {office && mine && (
            <Segmented
              value={which}
              onChange={setWhich}
              options={[
                { id: 'office', label: 'Escritório' },
                { id: 'mine', label: 'Minha' },
              ]}
            />
          )}
          <p className="text-[12.5px] text-faint">Somente visualização — para criar ou editar eventos do Google, use os botões ao lado.</p>
        </div>
        <div className="flex items-center gap-1">
          <a href={GOOGLE_CALENDAR} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" icon={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />}>
              Abrir no Google Agenda
            </Button>
          </a>
          <a href={GOOGLE_NEW_EVENT} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.8} />}>
              Evento no Google
            </Button>
          </a>
        </div>
      </div>
      <iframe
        title="Google Agenda"
        src={url}
        className="w-full flex-1 rounded-lg border border-line bg-surface"
        style={{ minHeight: height }}
        frameBorder={0}
        scrolling="no"
      />
    </div>
  );
}
