import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { backend } from '../../lib/backend';
import { cn } from '../../lib/utils';
import { Drawer, IconButton } from '../ui';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const STORAGE_KEY = 'airos:assistant:chat';

const EXAMPLES = [
  'Quais são minhas tarefas de hoje?',
  'Agenda uma reunião amanhã às 14h com a Ana sobre a CASA J.D.',
  'Passa para o Bruno revisar o detalhamento da marcenaria até sexta',
  'Conclui a tarefa de levantamento métrico',
  'Lança 2h na tarefa de modelagem 3D',
];

/** Formatação estilo WhatsApp: *negrito*, _itálico_ e links clicáveis. */
function renderRich(text: string): ReactNode {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g).map((part, j) => {
        if (/^\*[^*]+\*$/.test(part)) return <strong key={j} className="font-semibold">{part.slice(1, -1)}</strong>;
        if (/^_[^_]+_$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
        if (/^https?:\/\//.test(part)) {
          const label = part.includes('calendar.google.com') ? 'Adicionar ao Google Agenda' : part;
          return (
            <a key={j} href={part} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
              {label}
            </a>
          );
        }
        return <Fragment key={j}>{part}</Fragment>;
      })}
    </Fragment>
  ));
}

function loadChat(): ChatMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { mode } = useAuth();
  const { me, refresh } = useData();
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* armazenamento indisponível */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => inputRef.current?.focus(), []);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const data = (await backend.invokeFunction('agent-chat', { message })) as { reply?: string; error?: string };
      setMessages((m) => [...m, { role: 'assistant', text: data?.reply || data?.error || 'Sem resposta.' }]);
      refresh().catch(() => undefined);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: e instanceof Error ? e.message : 'Não consegui responder agora.' }]);
    } finally {
      setBusy(false);
    }
  };

  const available = mode === 'supabase';

  return (
    <Drawer onClose={onClose} width="max-w-md">
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-surface">
            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight">Assistente</h2>
            <p className="text-xs text-stone-400">Também disponível pelo WhatsApp</p>
          </div>
        </div>
        <IconButton label="Fechar" onClick={onClose}>
          <X className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {!available && (
          <div className="rounded-xl border border-dashed border-line p-5 text-sm leading-relaxed text-stone-500">
            O assistente roda no servidor e fica disponível quando o sistema estiver conectado ao Supabase, com a chave da
            Anthropic configurada. Veja <b>Configurações → WhatsApp e assistente</b>.
          </div>
        )}
        {available && messages.length === 0 && (
          <div>
            <p className="text-sm text-stone-600">
              Olá, {me.name.split(' ')[0]}! Peça em linguagem natural — eu consulto e atualizo tarefas, agenda e oportunidades.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  className="rounded-lg border border-line px-3.5 py-2.5 text-left text-[13px] text-stone-600 transition-colors hover:border-stone-300 hover:bg-canvas"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed',
                m.role === 'user' ? 'rounded-br-xs bg-ink text-surface' : 'rounded-bl-xs bg-canvas text-ink',
              )}
            >
              {renderRich(m.text)}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-1 px-2 py-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line p-4"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-1.5 pl-3.5 focus-within:border-ink/30">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            disabled={!available}
            placeholder={available ? 'Escreva um pedido…' : 'Assistente indisponível no modo demonstração'}
            className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-stone-400"
          />
          <button
            type="submit"
            disabled={!available || busy || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-surface transition-opacity disabled:opacity-30"
            aria-label="Enviar"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </Drawer>
  );
}
