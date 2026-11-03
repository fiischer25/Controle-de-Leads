// Aguardando retorno do cliente: cada vez que o projeto fica com o cliente analisando, guarda o
// período (início, fim) e a etapa em análise. Mostra há quantos dias está com o cliente e quanto
// tempo cada etapa ficou parada esperando o retorno. Funções puras.

import type { ClientWait } from './types';
import { diffDays } from './utils';

/** Etapa da lista de projetos: o projeto está com o cliente, analisando. */
export const CLIENT_WAIT_STAGE = 'Aguardando retorno cliente';

/** Período em aberto (o cliente ainda está analisando). */
export function openWait(waits: ClientWait[] | null | undefined): ClientWait | null {
  return [...(waits ?? [])].reverse().find((w) => !w.ended_at) ?? null;
}

/** Dias corridos do período (até hoje, se ainda em aberto). */
export function waitDays(w: Pick<ClientWait, 'started_at' | 'ended_at'>, today: string): number {
  return Math.max(0, diffDays(w.started_at, w.ended_at ?? today));
}

/** Começa um período de espera na etapa (fecha antes um que tenha ficado aberto). */
export function startWait(waits: ClientWait[] | null | undefined, phase: string, today: string): ClientWait[] {
  return [...endWaits(waits, today), { phase, started_at: today, ended_at: null }];
}

/** O cliente retornou: fecha o período em aberto. */
export function endWaits(waits: ClientWait[] | null | undefined, today: string): ClientWait[] {
  return (waits ?? []).map((w) => (w.ended_at ? w : { ...w, ended_at: today < w.started_at ? w.started_at : today }));
}

export interface PhaseWait {
  /** Dias com o cliente nesta etapa (somando todas as vezes). */
  days: number;
  /** Quantas vezes a etapa ficou com o cliente. */
  times: number;
  /** Ainda está com o cliente? */
  open: boolean;
  /** Dias do período em aberto. */
  openDays: number;
}

/** Tempo com o cliente por etapa. */
export function waitsByPhase(waits: ClientWait[] | null | undefined, today: string): Record<string, PhaseWait> {
  const out: Record<string, PhaseWait> = {};
  for (const w of waits ?? []) {
    const p = (out[w.phase] ||= { days: 0, times: 0, open: false, openDays: 0 });
    const d = waitDays(w, today);
    p.days += d;
    p.times += 1;
    if (!w.ended_at) {
      p.open = true;
      p.openDays = d;
    }
  }
  return out;
}

/** Total de dias com o cliente no projeto. */
export const totalWaitDays = (waits: ClientWait[] | null | undefined, today: string) =>
  (waits ?? []).reduce((a, w) => a + waitDays(w, today), 0);

/** "desde hoje", "há 1 dia", "há 12 dias". */
export const sinceLabel = (days: number) => (days <= 0 ? 'desde hoje' : `há ${days} ${days === 1 ? 'dia' : 'dias'}`);

/** "menos de 1 dia", "1 dia", "12 dias". */
export const daysLabel = (days: number) => (days <= 0 ? 'menos de 1 dia' : `${days} ${days === 1 ? 'dia' : 'dias'}`);
