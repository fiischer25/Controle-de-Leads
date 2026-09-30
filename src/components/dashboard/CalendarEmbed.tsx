import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { toCalendarEmbedUrl } from '../../lib/utils';
import { Card, CardHeader, EmptyState, Segmented } from '../ui';

/** Espelho do Google Agenda (iframe oficial de incorporação do Google). */
export function CalendarEmbed({ height = 560 }: { height?: number }) {
  const { settings, me, isAdmin } = useData();
  const office = toCalendarEmbedUrl(settings.calendar_embed_url);
  const mine = toCalendarEmbedUrl(me.calendar_embed_url);
  const [which, setWhich] = useState<'office' | 'mine'>(mine && !office ? 'mine' : 'office');
  const url = which === 'mine' ? mine ?? office : office ?? mine;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        icon={<CalendarDays className="h-4 w-4" />}
        title="Google Agenda"
        subtitle={which === 'mine' && mine ? 'Minha agenda' : 'Agenda do escritório'}
        action={
          <div className="flex items-center gap-2">
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
            <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800">
              Abrir <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        }
      />
      {url ? (
        <iframe
          title="Google Agenda"
          src={url}
          className="w-full flex-1 border-t border-line/70"
          style={{ minHeight: height }}
          frameBorder={0}
          scrolling="no"
        />
      ) : (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Conecte o Google Agenda"
          description={
            <>
              Cole o link de incorporação da agenda em{' '}
              {isAdmin ? <Link className="font-medium text-brand-700 hover:underline" to="/configuracoes?aba=agenda">Configurações → Google Agenda</Link> : 'Configurações (administrador)'}{' '}
              ou a sua agenda pessoal em <Link className="font-medium text-brand-700 hover:underline" to="/perfil">Meu perfil</Link>.
            </>
          }
        />
      )}
    </Card>
  );
}
