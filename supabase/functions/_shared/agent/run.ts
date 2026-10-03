// Ciclo do assistente: monta o contexto, chama o Claude com as ferramentas do
// sistema e executa as ações pedidas até ter uma resposta final em texto.

import type Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import type { Store } from './store.ts';
import { addDaysKey, formatBr, todayIn, weekdayName, isoToZoned } from './time.ts';
import { executeTool, hasModule, toolsFor, type Profile, type ToolContext } from './tools.ts';

export const MODEL = 'claude-opus-5-5';

/** Instruções fixas (ficam em cache entre as mensagens). O contexto variável vai na mensagem do usuário. */
export function systemPrompt(officeName: string): string {
  return `Você é o assistente do escritório ${officeName}, um escritório de arquitetura. A equipe conversa com você pelo WhatsApp ou pelo chat do sistema de gestão para organizar o dia a dia.

O que você faz, sempre usando as ferramentas (nunca finja que fez algo sem chamar a ferramenta):
- consultar, criar e designar tarefas; concluir, reabrir, remarcar, trocar responsável e comentar tarefas;
- lançar horas trabalhadas em tarefas;
- mostrar a agenda (reuniões, prazos, entregas e retornos) e agendar, remarcar ou cancelar reuniões;
- buscar oportunidades, clientes, projetos, tarefas e reuniões;
- cadastrar oportunidades (leads) e registrar contatos no histórico delas.

Como agir:
- Resolva nomes de pessoas e projetos pelas listas do bloco <contexto>. Se um nome for ambíguo (duas pessoas parecidas) ou não existir, pergunte antes de agir.
- Converta datas relativas ("amanhã", "sexta", "semana que vem") usando a data de hoje do contexto, no fuso do escritório. Horários no formato 24h.
- Para concluir ou alterar uma tarefa que o usuário descreveu por nome, primeiro encontre o id com list_tasks ou search. Se houver mais de uma tarefa parecida, mostre as opções numeradas e pergunte qual.
- Quando faltar algo essencial (ex.: o dia da reunião), pergunte de forma direta, numa frase. Não pergunte o que dá para deduzir.
- Ações simples e claras você executa direto. Antes de cancelar uma reunião ou reatribuir várias tarefas de uma vez, confirme.
- Você age em nome de quem está falando: tarefas criadas sem responsável ficam com essa pessoa, e ela entra nas reuniões que agendar.
- Todo dia o sistema envia um resumo no WhatsApp. Se a pessoa responder a ele ("detalhes", "ver", "manda a lista"), mostre as tarefas dela atrasadas e de hoje (list_tasks com scope overdue e today), as entregas de projetos e retornos de leads dos próximos dias (list_agenda) e ofereça ajuda para concluir ou remarcar.

Como responder (a pessoa lê no celular):
- Português do Brasil, tom cordial e objetivo, frases curtas.
- Formatação do WhatsApp: *negrito* com um asterisco, listas com "• " ou números. Nada de títulos com #, tabelas ou blocos de código.
- Confirme o que foi feito com os dados principais (o quê, quem, quando). Datas em DD/MM.
- Listas longas: mostre os itens mais relevantes (até uns 8) e diga quantos há no total.
- Se uma ferramenta devolver erro, explique o problema em linguagem simples e diga o que a pessoa pode fazer.
- Para reuniões, se a ferramenta devolver link_adicionar_google_agenda e a reunião não tiver sido sincronizada automaticamente, ofereça o link para adicionar ao Google Agenda.`;
}

/** Bloco de contexto variável: data de hoje, quem fala, equipe e projetos ativos. */
export async function buildContext(store: Store, me: Profile, tz: string, now: Date): Promise<string> {
  const today = todayIn(tz, now);
  const [team, projects, clients] = await Promise.all([
    store.list<Profile>('profiles'),
    store.list<{ id: string; code: string; name: string; client_id: string; status: string }>('projects'),
    hasModule(me, 'comercial') || hasModule(me, 'projetos') ? store.list<{ id: string; name: string }>('clients') : Promise.resolve([]),
  ]);
  const active = projects.filter((p) => ['nao_iniciado', 'em_andamento', 'pausado'].includes(p.status));
  const time = isoToZoned(now.toISOString(), tz).time;
  const lines = [
    '<contexto>',
    `Hoje: ${weekdayName(today)}, ${formatBr(today)} (${today}), ${time} — fuso ${tz}. Amanhã: ${addDaysKey(today, 1)}.`,
    `Quem está falando: ${me.name} (id ${me.id}${me.role === 'admin' ? ', administrador' : ''}${me.job_title ? `, ${me.job_title}` : ''}).`,
    ...(hasModule(me, 'projetos') ? [] : ['Esta pessoa vê e altera apenas as próprias tarefas (sem acesso às tarefas da equipe).']),
    ...(hasModule(me, 'comercial') ? [] : ['Esta pessoa não tem acesso a oportunidades e clientes: não ofereça cadastrar ou consultar leads.']),
    'Equipe (id · nome · cargo):',
    ...team.filter((p) => p.active).map((p) => `- ${p.id} · ${p.name}${p.job_title ? ` · ${p.job_title}` : ''}`),
    'Projetos ativos (id · código · nome · cliente):',
    ...(active.length
      ? active.map((p) => `- ${p.id} · ${p.code} · ${p.name} · ${clients.find((c) => c.id === p.client_id)?.name ?? '—'}`)
      : ['- nenhum']),
    '</contexto>',
  ];
  return lines.join('\n');
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunOptions {
  anthropic: Pick<Anthropic, 'beta'>;
  ctx: ToolContext;
  officeName: string;
  history: HistoryTurn[];
  text: string;
  effort?: 'low' | 'medium' | 'high';
  maxSteps?: number;
}

export interface RunResult {
  reply: string;
  actions: Array<{ tool: string; ok: boolean }>;
}

/** Mantém o histórico válido para a API: começa com "user" e alterna papéis. */
function sanitizeHistory(history: HistoryTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const turn of history) {
    if (!turn.content.trim()) continue;
    if (out.length === 0 && turn.role !== 'user') continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content as string}\n\n${turn.content}`;
    } else {
      out.push({ role: turn.role, content: turn.content });
    }
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { anthropic, ctx } = opts;
  const context = await buildContext(ctx.store, ctx.me, ctx.tz, ctx.now);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...sanitizeHistory(opts.history),
    { role: 'user', content: `${context}\n\n${opts.text}` },
  ];
  const actions: RunResult['actions'] = [];
  const maxSteps = opts.maxSteps ?? 8;

  for (let step = 0; step < maxSteps; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: opts.effort ?? 'low' },
      system: [{ type: 'text', text: systemPrompt(opts.officeName), cache_control: { type: 'ephemeral' } }],
      tools: toolsFor(ctx.me),
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return { reply: 'Desculpe, não consigo ajudar com esse pedido.', actions };
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason === 'tool_use' && toolUses.length) {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of toolUses) {
        const { ok, result } = await executeTool(call.name, call.input, ctx);
        actions.push({ tool: call.name, ok });
        results.push({ type: 'tool_result', tool_use_id: call.id, content: result, is_error: !ok });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (response.stop_reason === 'max_tokens' && !text) {
      return { reply: 'A resposta ficou longa demais. Pode detalhar um pouco mais o pedido?', actions };
    }
    return { reply: text || 'Feito.', actions };
  }
  return { reply: 'Não consegui concluir o pedido agora. Pode tentar de novo, com mais detalhes?', actions };
}
