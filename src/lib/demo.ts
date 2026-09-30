import type {
  ActivityLog,
  CalendarEvent,
  Client,
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
import { defaultProjectTypes, defaultSettings, defaultSources, defaultStages } from './defaults';
import { buildProjectTasks, templatesEndDate } from './domain';
import { addDays, nowIso, today, uid } from './utils';

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
    const projectTasks = buildProjectTasks({ templates: tpl, projectId, startDate: start, assigneeId: spec.manager.id, createdBy: admin.id });
    const doneCount = Math.round(projectTasks.length * spec.done);
    projectTasks.forEach((task, idx) => {
      task.assignee_id = spec.members[idx % spec.members.length].id;
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
    const due = templatesEndDate(tpl, start);
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

  return {
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
