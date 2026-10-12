// Saúde do escritório: indicadores de Financeiro, Comercial, Produção e Equipe, cada um com
// situação (bom / atenção / crítico), o que fazer e onde analisar. Funções puras (sem React nem banco).
//
// Pontuação: bom 100, atenção 60, crítico 20; a área é a média dos seus indicadores e a nota
// geral, a média das áreas (75+ saudável, 50+ atenção). Com algum crítico, a situação não passa
// de atenção. Indicador sem dados suficientes fica de fora da conta.

import { entryMinutes, isProjectActive } from './domain';
import { accountBalances, addMonthsKey, monthKey, monthTotals, projectFinance, sum } from './finance';
import type {
  Client,
  FinanceAccount,
  FinanceCategory,
  FinanceEntry,
  FinanceMemberCost,
  Lead,
  LeadStage,
  Profile,
  Project,
  Task,
  TimeEntry,
} from './types';
import { addDays, formatMoney, formatNumber, MONTHS_FULL } from './utils';

export type HealthStatus = 'bom' | 'atencao' | 'critico' | 'sem_dados';
export type HealthAreaId = 'financeiro' | 'comercial' | 'producao' | 'equipe';

export interface HealthIndicator {
  id: string;
  area: HealthAreaId;
  label: string;
  /** Número principal (ex.: "18%", "2,4 meses"). */
  value: string;
  /** De onde sai o número. */
  detail: string;
  status: HealthStatus;
  /** O que fazer (ou por que está bom). */
  advice: string;
  /** Onde analisar. */
  link: { to: string; label: string };
}

export interface HealthArea {
  id: HealthAreaId;
  label: string;
  score: number | null;
  status: HealthStatus;
  indicators: HealthIndicator[];
}

export interface OfficeHealth {
  score: number | null;
  status: HealthStatus;
  areas: HealthArea[];
  /** O que melhorar primeiro: críticos, depois atenção (na ordem das áreas). */
  priorities: HealthIndicator[];
  /** Pontos fortes. */
  strengths: HealthIndicator[];
}

export interface HealthInput {
  today: string;
  finance: boolean;
  commercial: boolean;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  entries: FinanceEntry[];
  memberCosts: FinanceMemberCost[];
  clients: Pick<Client, 'id' | 'name'>[];
  leads: Lead[];
  stages: LeadStage[];
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  profiles: Profile[];
}

const SCORE: Record<Exclude<HealthStatus, 'sem_dados'>, number> = { bom: 100, atencao: 60, critico: 20 };
export const AREA_LABEL: Record<HealthAreaId, string> = { financeiro: 'Financeiro', comercial: 'Comercial', producao: 'Prazos e entregas', equipe: 'Equipe' };

/** Com algum indicador crítico, a situação não fica "bom" mesmo com nota alta. */
const capped = (status: HealthStatus, indicators: HealthIndicator[]): HealthStatus =>
  status === 'bom' && indicators.some((i) => i.status === 'critico') ? 'atencao' : status;

export function statusFromScore(score: number | null): HealthStatus {
  if (score == null) return 'sem_dados';
  return score >= 75 ? 'bom' : score >= 50 ? 'atencao' : 'critico';
}

/** Situação por faixas: `good` e `warn` são os limites (maior é melhor, ou menor com `lowerIsBetter`). */
function grade(v: number, good: number, warn: number, lowerIsBetter = false): Exclude<HealthStatus, 'sem_dados'> {
  if (lowerIsBetter) return v <= good ? 'bom' : v <= warn ? 'atencao' : 'critico';
  return v >= good ? 'bom' : v >= warn ? 'atencao' : 'critico';
}

const pct = (v: number) => `${formatNumber(Math.round(v * 100))}%`;
const dateOf = (iso: string) => iso.slice(0, 10);
/** Despesas que não são custo da operação (retirada de lucro, reserva, investimento). */
const NOT_COST = /distribui|reserva|investiment/i;
const monthName = (key: string) => MONTHS_FULL[Number(key.slice(5, 7)) - 1].slice(0, 3);
const list = (names: string[], max = 3) => (names.length > max ? `${names.slice(0, max).join(', ')} e mais ${names.length - max}` : names.join(', '));

export function officeHealth(input: HealthInput): OfficeHealth {
  const t = input.today;
  const out: HealthIndicator[] = [];
  const add = (i: HealthIndicator) => out.push(i);

  // ------------------------------------------------------------ Financeiro
  if (input.finance) {
    const catName = new Map(input.categories.map((c) => [c.id, c.name]));
    const opEntries = input.entries.filter((e) => !(e.kind === 'despesa' && NOT_COST.test(catName.get(e.category_id ?? '') ?? '')));
    // Últimos 3 meses fechados
    const months = [3, 2, 1].map((n) => monthKey(addMonthsKey(`${t.slice(0, 7)}-01`, -n)));
    const totals = months.map((m) => monthTotals(opEntries, m));
    const received = sum(totals.map((x) => x.inPaid));
    const paid = sum(totals.map((x) => x.outPaid));
    const avgIn = received / 3;
    const avgOut = paid / 3;
    const period = `${monthName(months[0])}–${monthName(months[2])}`;

    if (received > 0 || paid > 0) {
      const margin = received > 0 ? (received - paid) / received : -1;
      const status = received > 0 ? grade(margin, 0.2, 0) : 'critico';
      add({
        id: 'margem',
        area: 'financeiro',
        label: 'Sobra depois das contas',
        value: received > 0 ? pct(margin) : 'sem receita',
        detail: `Recebido ${formatMoney(received)} · pago ${formatMoney(paid)} (${period})`,
        status,
        advice:
          status === 'bom'
            ? 'Margem saudável: sobra pelo menos 20% do que entra.'
            : status === 'atencao'
              ? 'Sobra pouco depois das contas. Revise os custos fixos e o preço dos projetos na Precificação.'
              : 'As despesas estão maiores que o que entra. Corte custos e revise os honorários.',
        link: { to: '/financeiro', label: 'Ver o Financeiro' },
      });
    }

    const balance = sum(Object.entries(accountBalances(input.accounts, input.entries)).filter(([id]) => input.accounts.find((a) => a.id === id)?.active !== false).map(([, v]) => v));
    if (avgOut > 0) {
      const months = balance / avgOut;
      const status = grade(months, 3, 1);
      add({
        id: 'folego',
        area: 'financeiro',
        label: 'Fôlego de caixa',
        value: `${formatNumber(Math.max(0, months), 1)} ${Math.abs(months - 1) < 0.05 ? 'mês' : 'meses'}`,
        detail: `${formatMoney(balance)} em contas ÷ ${formatMoney(avgOut)} de despesas por mês`,
        status,
        advice:
          status === 'bom'
            ? 'O caixa cobre 3 meses ou mais de despesas.'
            : 'Monte uma reserva de pelo menos 3 meses de custos para atravessar meses fracos.',
        link: { to: '/financeiro?aba=contas', label: 'Ver as contas' },
      });
    }

    const overdueRows = input.entries.filter((e) => e.kind === 'receita' && !e.paid_at && e.due_date < t);
    const overdue = sum(overdueRows.map((e) => e.amount));
    if (overdue > 0 || avgIn > 0) {
      const ratio = avgIn > 0 ? overdue / avgIn : 1;
      const status = overdue === 0 ? 'bom' : grade(ratio, 0.1, 0.3, true);
      add({
        id: 'atrasados',
        area: 'financeiro',
        label: 'Recebimentos atrasados',
        value: formatMoney(overdue),
        detail: overdue > 0 ? `${overdueRows.length} ${overdueRows.length === 1 ? 'parcela vencida' : 'parcelas vencidas'} · ${pct(ratio)} de um mês de receita` : 'Nenhuma parcela vencida',
        status,
        advice: status === 'bom' ? 'Os clientes estão pagando em dia.' : 'Cobre as parcelas vencidas e combine lembretes antes do vencimento.',
        link: { to: '/financeiro?aba=lancamentos', label: 'Ver os lançamentos' },
      });
    }

    const ahead = sum(input.entries.filter((e) => e.kind === 'receita' && !e.paid_at && e.due_date >= t && e.due_date <= addDays(t, 90)).map((e) => e.amount));
    if (avgOut > 0) {
      const ratio = ahead / (avgOut * 3);
      const status = grade(ratio, 1, 0.5);
      add({
        id: 'previsao',
        area: 'financeiro',
        label: 'Receita garantida (próximos 3 meses)',
        value: pct(ratio),
        detail: `${formatMoney(ahead)} a receber × ${formatMoney(avgOut * 3)} de despesas previstas`,
        status,
        advice:
          status === 'bom'
            ? 'As parcelas a receber cobrem as despesas dos próximos 3 meses.'
            : 'Pouca receita contratada à frente: acelere o fechamento das propostas em aberto.',
        link: { to: input.commercial ? '/oportunidades' : '/financeiro', label: input.commercial ? 'Ver as oportunidades' : 'Ver o Financeiro' },
      });
    }

    const yearIn = input.entries.filter((e) => e.kind === 'receita' && e.paid_at && e.paid_at > addDays(t, -365) && e.paid_at <= t);
    const total = sum(yearIn.map((e) => e.amount));
    const byClient = new Map<string, number>();
    for (const e of yearIn) if (e.client_id) byClient.set(e.client_id, (byClient.get(e.client_id) ?? 0) + e.amount);
    if (total > 0 && byClient.size > 0) {
      const [topId, topValue] = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
      const share = topValue / total;
      const status = grade(share, 0.35, 0.55, true);
      const name = input.clients.find((c) => c.id === topId)?.name ?? 'um cliente';
      add({
        id: 'concentracao',
        area: 'financeiro',
        label: 'Dependência do maior cliente',
        value: pct(share),
        detail: `${name}: ${formatMoney(topValue)} de ${formatMoney(total)} recebidos em 12 meses`,
        status,
        advice: status === 'bom' ? 'O faturamento está bem distribuído entre os clientes.' : 'Uma parte grande do faturamento vem de um só cliente. Busque novos contratos para diluir o risco.',
        link: { to: '/clientes', label: 'Ver os clientes' },
      });
    }

    // Rentabilidade: projetos ativos ou entregues no último ano, com honorários lançados
    const recent = input.projects.filter((p) => isProjectActive(p) || (p.completed_at && dateOf(p.completed_at) > addDays(t, -365)));
    const fin = recent
      .map((p) => ({ p, f: projectFinance({ projectId: p.id, entries: input.entries, tasks: input.tasks, timeEntries: input.timeEntries, costs: input.memberCosts, today: t }) }))
      .filter((x) => x.f.contracted > 0 && (x.f.minutes > 0 || x.f.expenses > 0));
    if (fin.length) {
      const low = fin.filter((x) => (x.f.margin ?? 0) < 0.15);
      const negative = low.filter((x) => x.f.result < 0);
      const share = low.length / fin.length;
      const status = low.length === 0 ? 'bom' : negative.length > 0 || share > 0.3 ? 'critico' : 'atencao';
      add({
        id: 'rentabilidade',
        area: 'financeiro',
        label: 'Projetos com margem baixa',
        value: `${low.length} de ${fin.length}`,
        detail: low.length ? `Abaixo de 15% de margem: ${list(low.map((x) => x.p.name))}` : 'Todos os projetos acima de 15% de margem',
        status,
        advice:
          status === 'bom'
            ? 'Honorários cobrem as horas e as despesas dos projetos.'
            : 'Compare horas gastas × honorários desses projetos e ajuste a Precificação dos próximos do mesmo tipo.',
        link: { to: '/financeiro?aba=rentabilidade', label: 'Ver a rentabilidade' },
      });
    }
  }

  // ------------------------------------------------------------ Comercial
  if (input.commercial) {
    const kind = new Map(input.stages.map((s) => [s.id, s.kind]));
    const since = addDays(t, -180);
    const decided = input.leads.filter((l) => l.closed_at && dateOf(l.closed_at) >= since);
    const won = decided.filter((l) => kind.get(l.stage_id) === 'won').length;
    const lost = decided.filter((l) => kind.get(l.stage_id) === 'lost').length;
    if (won + lost >= 3) {
      const rate = won / (won + lost);
      const status = grade(rate, 0.3, 0.15);
      add({
        id: 'conversao',
        area: 'comercial',
        label: 'Conversão de propostas',
        value: pct(rate),
        detail: `${won} ${won === 1 ? 'ganho' : 'ganhos'} de ${won + lost} decididos nos últimos 6 meses`,
        status,
        advice: status === 'bom' ? 'Boa taxa de fechamento.' : 'Veja os motivos de perda nos Relatórios e reforce o acompanhamento das propostas.',
        link: { to: '/relatorios', label: 'Ver motivos de perda' },
      });
    }

    const last30 = input.leads.filter((l) => dateOf(l.created_at) > addDays(t, -30)).length;
    const prev = input.leads.filter((l) => dateOf(l.created_at) <= addDays(t, -30) && dateOf(l.created_at) > addDays(t, -180)).length / 5;
    if (last30 > 0 || prev > 0) {
      const ratio = prev > 0 ? last30 / prev : 1;
      const status = grade(ratio, 0.9, 0.5);
      add({
        id: 'entrada',
        area: 'comercial',
        label: 'Entrada de novos contatos',
        value: `${last30} em 30 dias`,
        detail: prev > 0 ? `Média dos 5 meses anteriores: ${formatNumber(prev, 1)} por mês` : 'Sem histórico anterior para comparar',
        status,
        advice: status === 'bom' ? 'Os contatos estão chegando no ritmo de sempre.' : 'Chegam menos contatos que o normal: reforce Instagram, indicações e parceiros.',
        link: { to: '/relatorios', label: 'Ver a origem dos clientes' },
      });
    }

    const open = input.leads.filter((l) => kind.get(l.stage_id) === 'open');
    if (open.length) {
      const late = open.filter((l) => !l.next_contact_date || l.next_contact_date < t);
      const share = late.length / open.length;
      const status = grade(share, 0.1, 0.3, true);
      add({
        id: 'retornos',
        area: 'comercial',
        label: 'Retornos em dia',
        value: `${open.length - late.length} de ${open.length}`,
        detail: late.length ? `${late.length} sem retorno agendado ou com retorno atrasado` : 'Todas as oportunidades com próximo retorno agendado',
        status,
        advice: status === 'bom' ? 'O acompanhamento das oportunidades está em dia.' : 'Registre o contato e agende o próximo retorno em "Pede sua atenção".',
        link: { to: '/tarefas?aba=atencao', label: 'Abrir Pede sua atenção' },
      });
    }
  }

  // ------------------------------------------------------------ Prazos e entregas
  const active = input.projects.filter((p) => isProjectActive(p) && p.status !== 'obra');
  if (active.length) {
    const late = active.filter((p) => p.due_date && p.due_date < t);
    const share = late.length / active.length;
    const status = late.length === 0 ? 'bom' : grade(share, 0, 0.2, true);
    add({
      id: 'projetos_atrasados',
      area: 'producao',
      label: 'Projetos com entrega atrasada',
      value: `${late.length} de ${active.length}`,
      detail: late.length ? list(late.map((p) => p.name)) : 'Nenhum projeto ativo passou da data de entrega',
      status,
      advice: status === 'bom' ? 'As entregas estão dentro do prazo.' : 'Converse sobre os novos prazos com os clientes e priorize as etapas travadas.',
      link: { to: '/projetos', label: 'Ver os projetos' },
    });
  }

  const openTasks = input.tasks.filter((x) => x.status !== 'done' && x.due_date);
  if (openTasks.length) {
    const late = openTasks.filter((x) => x.due_date! < t);
    const share = late.length / openTasks.length;
    const status = grade(share, 0.1, 0.25, true);
    add({
      id: 'tarefas_atrasadas',
      area: 'producao',
      label: 'Tarefas atrasadas',
      value: pct(share),
      detail: `${late.length} de ${openTasks.length} tarefas em aberto com prazo vencido`,
      status,
      advice: status === 'bom' ? 'As tarefas estão andando no prazo.' : 'Revise as tarefas atrasadas: ajuste prazos ou redistribua entre a equipe.',
      link: { to: '/tarefas?aba=atencao', label: 'Abrir Pede sua atenção' },
    });
  }

  const delivered = input.projects.filter((p) => p.status === 'concluido' && p.completed_at && dateOf(p.completed_at) > addDays(t, -365) && p.due_date);
  if (delivered.length) {
    const onTime = delivered.filter((p) => dateOf(p.completed_at!) <= p.due_date!).length;
    const rate = onTime / delivered.length;
    const status = grade(rate, 0.8, 0.6);
    add({
      id: 'entregas_prazo',
      area: 'producao',
      label: 'Entregas no prazo',
      value: pct(rate),
      detail: `${onTime} de ${delivered.length} projetos entregues nos últimos 12 meses`,
      status,
      advice: status === 'bom' ? 'A maioria das entregas sai no prazo combinado.' : 'Os prazos estão curtos para o trabalho real: use as horas por m² e a Precificação para estimar melhor os dias.',
      link: { to: '/relatorios', label: 'Ver produtividade' },
    });
  }

  // ------------------------------------------------------------ Equipe
  const team = input.profiles.filter((p) => p.active);
  const open = input.tasks.filter((x) => x.status !== 'done');
  const workers = team.filter((p) => open.some((x) => x.assignee_id === p.id) || input.timeEntries.some((e) => e.user_id === p.id));
  if (workers.length) {
    const from = addDays(t, -28);
    const minutes = input.timeEntries.filter((e) => dateOf(e.started_at) > from && dateOf(e.started_at) <= t).reduce((a, e) => a + entryMinutes(e), 0);
    const expected = workers.length * 4 * 40 * 60;
    const ratio = minutes / expected;
    const status = grade(ratio, 0.6, 0.3);
    add({
      id: 'horas',
      area: 'equipe',
      label: 'Horas lançadas',
      value: `${formatNumber(minutes / 60)} h`,
      detail: `${pct(ratio)} das ${formatNumber(expected / 60)} h possíveis de ${workers.length} ${workers.length === 1 ? 'pessoa' : 'pessoas'} em 4 semanas`,
      status,
      advice:
        status === 'bom'
          ? 'A equipe registra as horas: a rentabilidade e a Precificação ficam confiáveis.'
          : 'Poucas horas lançadas deixam a rentabilidade e a Precificação imprecisas. Use o cronômetro nas tarefas.',
      link: { to: '/relatorios', label: 'Ver horas por pessoa' },
    });

    const counts = workers.map((p) => ({ p, n: open.filter((x) => x.assignee_id === p.id).length }));
    const avg = counts.reduce((a, c) => a + c.n, 0) / counts.length;
    const top = [...counts].sort((a, b) => b.n - a.n)[0];
    const unassigned = open.filter((x) => !x.assignee_id).length;
    if (open.length) {
      const ratio = avg > 0 ? top.n / avg : 0;
      const imbalance = counts.length > 1 && top.n >= 6 ? grade(ratio, 1.8, 2.5, true) : 'bom';
      const loose = grade(unassigned / open.length, 0.05, 0.2, true);
      const status = SCORE[imbalance] <= SCORE[loose] ? imbalance : loose;
      add({
        id: 'carga',
        area: 'equipe',
        label: 'Distribuição das tarefas',
        value: `${top.n} com ${top.p.name.split(' ')[0]}`,
        detail: `Média de ${formatNumber(avg, 1)} tarefas abertas por pessoa${unassigned ? ` · ${unassigned} sem responsável` : ''}`,
        status,
        advice:
          status === 'bom'
            ? 'O trabalho está bem dividido entre a equipe.'
            : unassigned && loose !== 'bom'
              ? 'Há tarefas sem responsável: defina quem faz cada etapa na tela do projeto.'
              : `${top.p.name.split(' ')[0]} está com bem mais tarefas que a média: redistribua as etapas na tela do projeto.`,
        link: { to: '/projetos', label: 'Ver os projetos' },
      });
    }

    if (input.finance) {
      const recent = new Set(input.timeEntries.filter((e) => dateOf(e.started_at) > addDays(t, -90)).map((e) => e.user_id));
      const people = team.filter((p) => recent.has(p.id));
      if (people.length) {
        const missing = people.filter((p) => !(input.memberCosts.find((c) => c.user_id === p.id)?.hourly_cost ?? 0));
        const status = missing.length === 0 ? 'bom' : missing.length === people.length ? 'critico' : 'atencao';
        add({
          id: 'custo_hora',
          area: 'equipe',
          label: 'Custo por hora cadastrado',
          value: `${people.length - missing.length} de ${people.length}`,
          detail: missing.length ? `Sem custo/hora: ${list(missing.map((p) => p.name))}` : 'Todas as pessoas que lançam horas têm custo/hora',
          status,
          advice:
            status === 'bom'
              ? 'O custo da equipe entra certo na rentabilidade e na Precificação.'
              : 'Sem custo/hora, as horas dessas pessoas ficam fora da rentabilidade e da Precificação.',
          link: { to: '/financeiro?aba=rentabilidade', label: 'Cadastrar custo/hora' },
        });
      }
    }
  }

  // ------------------------------------------------------------ Notas
  const order: HealthAreaId[] = ['financeiro', 'comercial', 'producao', 'equipe'];
  const areas: HealthArea[] = order
    .filter((id) => (id === 'financeiro' ? input.finance : id === 'comercial' ? input.commercial : true))
    .map((id) => {
      const indicators = out.filter((i) => i.area === id);
      const scored = indicators.filter((i) => i.status !== 'sem_dados');
      const score = scored.length ? Math.round(scored.reduce((a, i) => a + SCORE[i.status as keyof typeof SCORE], 0) / scored.length) : null;
      return { id, label: AREA_LABEL[id], score, status: capped(statusFromScore(score), indicators), indicators };
    });
  const scoredAreas = areas.filter((a) => a.score != null);
  const score = scoredAreas.length ? Math.round(scoredAreas.reduce((a, x) => a + x.score!, 0) / scoredAreas.length) : null;
  return {
    score,
    status: capped(statusFromScore(score), out),
    areas,
    priorities: [...out.filter((i) => i.status === 'critico'), ...out.filter((i) => i.status === 'atencao')],
    strengths: out.filter((i) => i.status === 'bom'),
  };
}
