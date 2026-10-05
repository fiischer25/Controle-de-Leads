import type {
  ActivityLog,
  CalendarEvent,
  Client,
  FinanceAccount,
  FinanceEntry,
  FinanceMemberCost,
  Lead,
  LeadInteraction,
  Profile,
  Project,
  TableName,
  Tables,
  Task,
  TimeEntry,
} from './types';
import type { NewUserInput } from './backend/types';
import { defaultFinanceAccount, defaultFinanceCategories, defaultProjectTypes, defaultSettings, defaultSources, defaultStages } from './defaults';
import { addMonthsKey, buildSeries, feePlan, splitByPercent, type EntryDraft } from './finance';
import { buildProjectTasks } from './domain';
import { addBusinessDays, addDays, nowIso, today, uid } from './utils';

type DemoData = { [K in TableName]?: Tables[K][] };

/** Dados de exemplo para o modo demonstração. */
export async function buildDemoData(
  admin: Profile,
  addUser: (u: NewUserInput) => Promise<Profile>,
): Promise<DemoData> {
  const t = today();
  const iso = (dayOffset: number, hour = 10) => {
    const d = new Date(`${addDays(t, dayOffset)}T00:00:00`);
    d.setHours(hour);
    return d.toISOString();
  };

  const ana = await addUser({ name: 'Ana Ribeiro', email: 'ana@airos.com.br', password: 'airos123', role: 'member', job_title: 'Arquiteta', phone: '(41) 98811-2201',  color: '#2a78d6' });
  const bruno = await addUser({ name: 'Bruno Carvalho', email: 'bruno@airos.com.br', password: 'airos123', role: 'member', job_title: 'Designer de Interiores', phone: '(41) 98811-2202',  color: '#1baf7a' });
  const carla = await addUser({ name: 'Carla Menezes', email: 'carla@airos.com.br', password: 'airos123', role: 'member', job_title: 'Comercial', phone: '(41) 98811-2203',  color: '#4a3aa7' });
  const team = [admin, ana, bruno, carla];

  const stages = defaultStages();
  const sources = defaultSources();
  const { types, templates } = defaultProjectTypes();
  const settings = defaultSettings();
  const stage = (name: string) => stages.find((s) => s.name === name)!.id;
  const source = (name: string) => sources.find((s) => s.name.startsWith(name))!.id;
  const type = (name: string) => types.find((x) => x.name === name)!.id;

  const leadRows: Array<Partial<Lead> & Pick<Lead, 'name' | 'city' | 'stage_id'>> = [
    { name: 'Mariana Duarte', city: 'Curitiba', stage_id: stage('Novo lead'), area_m2: 180, project_type_id: type('Arquitetura'), source_id: source('Tráfego pago (Meta'), proposal_value: null, owner_id: carla.id },
    { name: 'Felipe Andrade', city: 'São José dos Pinhais', stage_id: stage('Novo lead'), area_m2: 90, project_type_id: type('Interiores'), source_id: source('Instagram'), owner_id: carla.id },
    { name: 'Construtora Horizonte', city: 'Curitiba', stage_id: stage('Primeiro contato'), area_m2: 420, category: 'Comercial', project_type_id: type('Arquitetura'), source_id: source('Parceiro'), proposal_value: 68000, owner_id: admin.id },
    { name: 'Patrícia Lemos', city: 'Pinhais', stage_id: stage('Primeiro contato'), area_m2: 140, project_type_id: type('Arquitetura e Interiores'), source_id: source('Indicação'), referred_by: 'Juliana Dias', owner_id: carla.id, next_contact_date: addDays(t, -2) },
    { name: 'Rodrigo Tavares', city: 'Curitiba', stage_id: stage('Reunião agendada'), area_m2: 250, project_type_id: type('Arquitetura e Interiores'), source_id: source('Tráfego pago (Google'), proposal_value: 55000, owner_id: admin.id, next_contact_date: addDays(t, 1) },
    { name: 'Clínica Sorriso Pleno', city: 'Araucária', stage_id: stage('Reunião agendada'), area_m2: 160, category: 'Comercial', project_type_id: type('Interiores'), source_id: source('Site'), proposal_value: 32000, owner_id: carla.id, next_contact_date: t },
    { name: 'Luciana e Marcos Prado', city: 'Curitiba', stage_id: stage('Proposta enviada'), area_m2: 320, project_type_id: type('Arquitetura'), source_id: source('Indicação'), referred_by: 'Construtora Horizonte', proposal_value: 72000, owner_id: admin.id, next_contact_date: addDays(t, 3) },
    { name: 'Thiago Moreira', city: 'Campo Largo', stage_id: stage('Proposta enviada'), area_m2: 110, project_type_id: type('Interiores'), source_id: source('Tráfego pago (Meta'), proposal_value: 18500, owner_id: carla.id, next_contact_date: addDays(t, -1) },
    { name: 'Escritório Vieira Advogados', city: 'Curitiba', stage_id: stage('Negociação'), area_m2: 200, category: 'Corporativo', project_type_id: type('Interiores'), source_id: source('WhatsApp'), proposal_value: 41000, owner_id: admin.id, next_contact_date: addDays(t, 2) },
    { name: 'Gabriela Nunes', city: 'Curitiba', stage_id: stage('Fechado'), area_m2: 230, project_type_id: type('Arquitetura e Interiores'), source_id: source('Instagram'), proposal_value: 64000, owner_id: carla.id },
    { name: 'Henrique Batista', city: 'Colombo', stage_id: stage('Perdido'), area_m2: 95, project_type_id: type('Interiores'), source_id: source('Tráfego pago (Meta'), proposal_value: 15000, owner_id: carla.id, lost_reason: 'Preço / orçamento' },
    { name: 'Renata Coelho', city: 'Curitiba', stage_id: stage('Perdido'), area_m2: 300, project_type_id: type('Arquitetura'), source_id: source('Site'), proposal_value: 80000, owner_id: admin.id, lost_reason: 'Adiou o projeto' },
  ];

  // Clientes que já viraram projeto
  const clientSpecs = [
    { name: 'João Dias', document: '529.982.247-25', city: 'Curitiba', type: 'Arquitetura', project: 'CASA J.D.', startOffset: -60, area: 280, manager: ana, members: [ana, bruno], done: 0.7, source: 'Indicação' },
    { name: 'Beatriz Fontana', document: '111.444.777-35', city: 'Curitiba', type: 'Interiores', project: 'APTO B.F.', startOffset: -45, area: 120, manager: bruno, members: [bruno], done: 0.85, source: 'Instagram' },
    { name: 'Lucas Martins', document: '390.533.447-05', city: 'São José dos Pinhais', type: 'Arquitetura e Interiores', project: 'CASA L.M.', startOffset: -20, area: 350, manager: admin, members: [admin, ana, bruno], done: 0.25, source: 'Tráfego pago (Google' },
    { name: 'Café Aroma LTDA', document: '11.222.333/0001-81', city: 'Curitiba', type: 'Interiores', project: 'CAFÉ AROMA', startOffset: -120, area: 85, manager: bruno, members: [bruno, ana], done: 1, source: 'Site' },
    { name: 'Sofia Almeida', document: '153.509.460-56', city: 'Pinhais', type: 'Arquitetura', project: 'CASA S.A.', startOffset: -3, area: 210, manager: ana, members: [ana], done: 0, source: 'Indicação' },
  ];

  const now = nowIso();
  const leads: Lead[] = [];
  const interactions: LeadInteraction[] = [];
  const clients: Client[] = [];
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const timeEntries: TimeEntry[] = [];
  const activity: ActivityLog[] = [];
  const feeSpecs: Array<{ projectId: string; clientId: string; name: string; start: string; done: number; total: number }> = [];

  leadRows.forEach((row, i) => {
    const created = iso(-30 + i * 2);
    const stageKind = stages.find((s) => s.id === row.stage_id)!.kind;
    const lead: Lead = {
      id: uid(),
      phone: `(41) 9${String(8100 + i * 37).padStart(4, '0')}-${String(1000 + i * 211).slice(0, 4)}`,
      email: null,
      state: 'PR',
      area_m2: null,
      category: 'Residencial',
      project_type_id: null,
      source_id: null,
      referred_by: null,
      proposal_value: null,
      owner_id: null,
      position: i,
      next_contact_date: null,
      expected_close_date: null,
      lost_reason: null,
      notes: null,
      stage_changed_at: iso(-10 + (i % 8)),
      closed_at: stageKind === 'open' ? null : iso(-3),
      client_id: null,
      converted_at: null,
      created_by: admin.id,
      created_at: created,
      updated_at: created,
      ...row,
    };
    leads.push(lead);
    interactions.push({
      id: uid(), lead_id: lead.id, user_id: lead.owner_id, type: 'whatsapp',
      description: 'Primeiro contato pelo WhatsApp. Cliente pediu portfólio e valores.',
      happened_at: created, created_at: created,
    });
    if (row.proposal_value) {
      interactions.push({
        id: uid(), lead_id: lead.id, user_id: lead.owner_id, type: 'reuniao',
        description: 'Reunião de briefing realizada no escritório. Proposta em elaboração.',
        happened_at: iso(-12 + i), created_at: iso(-12 + i),
      });
    }
  });

  const convertedStage = stage('Fechado');
  clientSpecs.forEach((spec, i) => {
    const created = iso(spec.startOffset - 10);
    const lead: Lead = {
      id: uid(), name: spec.name, phone: `(41) 99${String(700 + i * 13)}-${String(4000 + i * 97)}`,
      email: `${spec.name.split(' ')[0].toLowerCase()}@email.com`, city: spec.city, state: 'PR',
      area_m2: spec.area, category: spec.name.includes('LTDA') ? 'Comercial' : 'Residencial',
      project_type_id: type(spec.type), source_id: source(spec.source), referred_by: null,
      proposal_value: 30000 + spec.area * 150, stage_id: convertedStage, owner_id: carla.id,
      position: 100 + i, next_contact_date: null, expected_close_date: null, lost_reason: null, notes: null,
      stage_changed_at: iso(spec.startOffset - 2), closed_at: iso(spec.startOffset - 2), client_id: null,
      converted_at: iso(spec.startOffset - 1), created_by: carla.id, created_at: created, updated_at: created,
    };
    const client: Client = {
      id: uid(), name: spec.name, document: spec.document, rg: null, birth_date: null,
      email: lead.email!, phone: lead.phone, profession: null, cep: '80010-000', street: 'Rua XV de Novembro',
      number: String(100 + i * 50), complement: null, neighborhood: 'Centro', city: spec.city, state: 'PR',
      notes: null, lead_id: lead.id, created_by: carla.id, created_at: lead.converted_at!, updated_at: lead.converted_at!,
    };
    lead.client_id = client.id;
    leads.push(lead);
    clients.push(client);

    const projectId = uid();
    const tpl = templates.filter((x) => x.project_type_id === type(spec.type));
    const start = addDays(t, spec.startOffset);
    const projectTasks = buildProjectTasks({ templates: tpl, projectId, assigneeId: spec.manager.id, createdBy: admin.id });
    const doneCount = Math.round(projectTasks.length * spec.done);
    // Datas de demonstração: em projetos reais, início e fim são definidos por quem cuida do projeto
    let cursor = start;
    projectTasks.forEach((task, idx) => {
      task.assignee_id = spec.members[idx % spec.members.length].id;
      task.start_date = addBusinessDays(cursor, 0);
      task.due_date = addBusinessDays(task.start_date, [3, 5, 2, 4, 6][idx % 5] - 1);
      cursor = addBusinessDays(task.due_date, 1);
      if (idx < doneCount) {
        task.status = 'done';
        task.completed_at = `${task.due_date}T18:00:00.000Z`;
      } else if (idx === doneCount && spec.done > 0) {
        task.status = 'doing';
      }
      if (idx === doneCount + 1 && i === 0) task.priority = 'alta';
      if (idx <= doneCount) {
        const minutes = 90 + ((idx * 37) % 240);
        timeEntries.push({
          id: uid(), task_id: task.id, user_id: task.assignee_id!, started_at: `${task.start_date}T13:00:00.000Z`,
          ended_at: `${task.start_date}T15:00:00.000Z`, minutes, note: null, created_at: now,
        });
      }
    });
    tasks.push(...projectTasks);
    const due = projectTasks[projectTasks.length - 1]?.due_date ?? null;
    projects.push({
      id: projectId, code: `${settings.project_code_prefix}-${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
      name: spec.project, client_id: client.id, project_type_id: type(spec.type),
      status: spec.done === 1 ? 'concluido' : spec.done === 0 ? 'nao_iniciado' : 'em_andamento',
      manager_id: spec.manager.id, member_ids: spec.members.map((m) => m.id), start_date: start,
      // CASA J.D. propositalmente com prazo curto para aparecer como "a vencer"
      due_date: i === 0 ? addDays(t, 5) : due,
      area_m2: spec.area, site_address: `Rua das Araucárias, ${200 + i * 15}`, site_city: spec.city,
      description: null, notes: null, links: [], lead_id: lead.id,
      completed_at: spec.done === 1 ? iso(-5) : null, created_by: admin.id, created_at: lead.converted_at!, updated_at: now,
    });
    feeSpecs.push({ projectId, clientId: client.id, name: spec.project, start, done: spec.done, total: lead.proposal_value ?? 0 });
    activity.push({
      id: uid(), user_id: carla.id, entity: 'project', entity_id: projectId, action: 'created',
      description: `converteu ${spec.name} em cliente e criou o projeto ${spec.project}`, created_at: lead.converted_at!,
    });
  });

  // Tarefas avulsas designadas entre a equipe
  const loose: Array<[string, Profile, Profile, number, Task['priority']]> = [
    ['Atualizar portfólio no site com o projeto Café Aroma', ana, admin, 4, 'media'],
    ['Enviar orçamento de marcenaria para Beatriz', bruno, ana, -1, 'alta'],
    ['Agendar visita técnica com Rodrigo Tavares', carla, admin, 1, 'alta'],
    ['Organizar biblioteca de blocos 3D', bruno, bruno, 12, 'baixa'],
  ];
  loose.forEach(([title, assignee, creator, dueOffset, priority], i) => {
    tasks.push({
      id: uid(), project_id: null, phase: null, title, description: null, assignee_id: assignee.id,
      status: 'todo', priority, start_date: t, due_date: addDays(t, dueOffset), estimated_hours: null,
      position: 1000 + i, checklist: [], completed_at: null, created_by: creator.id, created_at: now, updated_at: now,
    });
  });

  const at = (dayOffset: number, hh: number, mm = 0) => {
    const d = new Date(`${addDays(t, dayOffset)}T00:00:00`);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  const meeting = (title: string, day: number, hh: number, dur: number, people: Profile[], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id: uid(), title, description: null, starts_at: at(day, hh), ends_at: at(day, hh + dur), all_day: false,
    location: 'Escritório AIROS', participant_ids: people.map((p) => p.id), project_id: null, lead_id: null,
    google_event_id: null, created_by: admin.id, created_at: now, updated_at: now, ...extra,
  });
  const events: CalendarEvent[] = [
    meeting('Reunião semanal da equipe', 0, 9, 1, team),
    meeting('Apresentação do anteprojeto — CASA L.M.', 1, 14, 2, [admin, ana, bruno], { project_id: projects[2]?.id ?? null, location: 'Google Meet' }),
    meeting('Visita técnica com Rodrigo Tavares', 2, 10, 1, [carla, ana], { lead_id: leads.find((l) => l.name === 'Rodrigo Tavares')?.id ?? null, location: 'Obra — Curitiba' }),
    meeting('Aprovação de marcenaria — APTO B.F.', 4, 16, 1, [bruno], { project_id: projects[1]?.id ?? null }),
  ];

  // Financeiro: contas, despesas fixas, honorários em 30/40/30 e custo/hora da equipe
  const finCategories = defaultFinanceCategories();
  const cat = (name: string) => finCategories.find((c) => c.name === name)!.id;
  const bank: FinanceAccount = { ...defaultFinanceAccount(), name: 'Itaú PJ', opening_balance: 42000 };
  const cash: FinanceAccount = { ...defaultFinanceAccount(), name: 'Caixa do escritório', kind: 'caixa', opening_balance: 800, color: '#8a7a5c', position: 1 };
  const card: FinanceAccount = { ...defaultFinanceAccount(), name: 'Cartão Nubank PJ', kind: 'cartao', opening_balance: 0, color: '#6b4fa0', position: 2 };
  const finEntries: FinanceEntry[] = [];
  const draft = (o: Partial<EntryDraft>): EntryDraft => ({
    kind: 'despesa', description: '', amount: 0, due_date: t, paid_at: null, account_id: bank.id, to_account_id: null,
    category_id: null, client_id: null, project_id: null, document: null, notes: null, created_by: admin.id, ...o,
  });
  const monthStart = addMonthsKey(`${t.slice(0, 7)}-01`, -6);
  const fixed: Array<[string, string, number, number, FinanceAccount]> = [
    ['Aluguel da sala', 'Aluguel e condomínio', 3800, 5, bank],
    ['Folha de pagamento', 'Salários e pró-labore', 18500, 5, bank],
    ['Honorários do contador', 'Contabilidade', 650, 10, bank],
    ['Energia e internet', 'Energia, internet e telefone', 480, 12, bank],
    ['Softwares (Revit, SketchUp, Adobe)', 'Softwares e assinaturas', 1290, 15, card],
    ['Simples Nacional', 'Impostos', 2400, 20, bank],
  ];
  fixed.forEach(([description, category, amount, day, account]) => {
    const rows = buildSeries(draft({ description, amount, category_id: cat(category), account_id: account.id, due_date: `${monthStart.slice(0, 8)}${String(day).padStart(2, '0')}` }), 'mensal', 12, now);
    // O que venceu está pago, menos a energia do mês passado (aparece como vencida)
    const lastMonth = addMonthsKey(`${t.slice(0, 7)}-01`, -1).slice(0, 7);
    rows.forEach((r) => {
      if (r.due_date < t && !(category.startsWith('Energia') && r.due_date.startsWith(lastMonth))) r.paid_at = r.due_date;
    });
    finEntries.push(...rows);
  });
  feeSpecs.forEach((f) => {
    if (!f.total) return;
    const plan = feePlan('30-40-30', f.start);
    const amounts = splitByPercent(f.total, plan.map((r) => r.percent));
    // Recebidas conforme o andamento; a 2ª parcela do APTO B.F. ficou em aberto (vencida)
    const paidCount = f.done >= 1 ? 3 : f.done >= 0.6 ? 2 : 1;
    plan.forEach((row, i) => {
      const paid = i < paidCount && !(f.name === 'APTO B.F.' && i === 1) && row.due_date <= t;
      finEntries.push({
        ...draft({ kind: 'receita', description: `Honorários ${f.name} · ${row.label}`, amount: amounts[i], due_date: row.due_date,
          paid_at: paid ? row.due_date : null, category_id: cat('Honorários de projeto'), client_id: f.clientId, project_id: f.projectId }),
        id: uid(), series_id: null, installment: i + 1, installments: plan.length, created_at: now, updated_at: now,
      });
    });
  });
  const one = (o: Partial<EntryDraft>) => buildSeries(draft(o), 'unica', 1, now)[0];
  const fee = (name: string) => feeSpecs.find((f) => f.name === name);
  finEntries.push(
    one({ description: 'Plotagens do anteprojeto', amount: 380, due_date: addDays(t, -20), paid_at: addDays(t, -20), category_id: cat('Impressões e plotagens'), account_id: cash.id, project_id: fee('CASA J.D.')?.projectId ?? null, client_id: fee('CASA J.D.')?.clientId ?? null }),
    one({ description: 'Visita técnica — combustível e pedágio', amount: 220, due_date: addDays(t, -8), paid_at: addDays(t, -8), category_id: cat('Deslocamentos e visitas'), account_id: card.id, project_id: fee('CASA L.M.')?.projectId ?? null, client_id: fee('CASA L.M.')?.clientId ?? null }),
    one({ kind: 'receita', description: 'RT — marcenaria Café Aroma', amount: 2100, due_date: addDays(t, -25), paid_at: addDays(t, -25), category_id: cat('Reserva técnica (RT)'), project_id: fee('CAFÉ AROMA')?.projectId ?? null, client_id: fee('CAFÉ AROMA')?.clientId ?? null }),
    one({ description: 'Impulsionamento Instagram', amount: 600, due_date: addDays(t, 6), category_id: cat('Marketing'), account_id: card.id }),
    one({ kind: 'transferencia', description: 'Reforço do caixa', amount: 500, due_date: addDays(t, -12), paid_at: addDays(t, -12), account_id: bank.id, to_account_id: cash.id }),
  );
  const memberCosts: FinanceMemberCost[] = [[admin, 120], [ana, 85], [bruno, 70], [carla, 60]].map(([p, cost]) => ({
    id: uid(), user_id: (p as Profile).id, hourly_cost: cost as number, updated_at: now,
  }));

  return {
    finance_accounts: [bank, cash, card],
    finance_categories: finCategories,
    finance_entries: finEntries,
    finance_member_costs: memberCosts,
    events,
    lead_stages: stages,
    lead_sources: sources,
    project_types: types,
    task_templates: templates,
    app_settings: [settings],
    leads,
    lead_interactions: interactions,
    clients,
    projects,
    tasks,
    time_entries: timeEntries,
    activity_log: activity,
    notifications: team.slice(1).map((m) => ({
      id: uid(), user_id: m.id, title: 'Bem-vindo(a) ao sistema da AIROS!',
      body: 'Confira suas tarefas na aba Minhas tarefas.', link: '/tarefas', read: false, created_at: now,
    })),
  };
}
