// Dados de exemplo do módulo Orçamentos e Obras (modo demonstração).
import { approvalToken, budgetSnapshot, budgetTotals, newBudgetData, paymentSnapshot, stagesFromBudget } from './obras';
import type {
  Budget,
  BudgetSection,
  Client,
  Obra,
  ObraApproval,
  ObraIssue,
  ObraPayment,
  ObraPhoto,
  ObraSupplier,
  ObraVisit,
  Profile,
  Project,
} from './types';
import { addBusinessDays, addDays, uid } from './utils';

type Row = [string, string, number, number, number];

const section = (name: string, days: number, rows: Row[]): BudgetSection => ({
  id: uid(),
  name,
  days,
  items: rows.map(([description, unit, qty, material, labor]) => ({ id: uid(), description, unit, qty, material, labor, notes: null })),
});

/** Foto ilustrativa desenhada no navegador e guardada como o modo demonstração guarda os arquivos. */
function demoPhoto(obraId: string, label: string, hue: number, date: string, stageId: string | null, caption: string): ObraPhoto | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 480, 360);
    g.addColorStop(0, `hsl(${hue} 22% 72%)`);
    g.addColorStop(1, `hsl(${hue + 20} 18% 46%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 360);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let x = 40; x < 480; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 360);
      ctx.lineTo(x + 80, 120);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 240, 190);
    const path = `obras/${obraId}/fotos/${uid()}-demo.jpg`;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    localStorage.setItem(`airos:v1:file:task-files/${path}`, dataUrl);
    return { id: uid(), name: `${label}.jpg`, path, size: Math.round(dataUrl.length * 0.75), type: 'image/jpeg', uploaded_at: `${date}T15:00:00.000Z`, uploaded_by: null, caption, stage_id: stageId };
  } catch {
    return null;
  }
}

export function buildDemoObras(opts: { admin: Profile; ana: Profile; bruno: Profile; clients: Client[]; projects: Project[]; t: string; now: string }) {
  const { admin, ana, bruno, clients, projects, t, now } = opts;
  const year = new Date().getFullYear();
  const at = (d: number, h = 14) => `${addDays(t, d)}T${String(h).padStart(2, '0')}:00:00.000Z`;

  const suppliers: ObraSupplier[] = [
    ['Elétrica Luz Forte', 'Elétrica', 'Marcos', '(41) 99821-3300', 'eletrica@luzforte.com.br'],
    ['Gesso & Cia', 'Gesso e forro', 'Rui', '(41) 99710-4421', null],
    ['Pinturas Andrade', 'Pintura', 'Sérgio Andrade', '(41) 99633-1088', null],
    ['Hidro Serviços', 'Hidráulica', 'Paulo', '(41) 99540-2277', null],
    ['Casa do Porcelanato', 'Material de acabamento', 'Loja Batel', '(41) 3333-8899', 'vendas@casadoporcelanato.com.br'],
    ['Marcenaria Pinheiro', 'Marcenaria', 'Joel Pinheiro', '(41) 99412-6655', null],
  ].map(([name, trade, contact, phone, email]) => ({
    id: uid(), name: name!, trade, contact, phone, email, document: null, pix: phone, notes: null, active: true, created_at: now,
  }));
  const sup = (name: string) => suppliers.find((s) => s.name === name)!;

  const client = clients.find((c) => c.name === 'Beatriz Fontana') ?? clients[0];
  const project = projects.find((p) => p.client_id === client?.id) ?? null;

  // ---------------------------------------------------------- orçamentos
  const base = (o: Partial<Budget> & Pick<Budget, 'name' | 'data'>, n: number): Budget => ({
    id: uid(), code: `ORC-${year}-${String(n).padStart(3, '0')}`, client_id: null, client_name: null, client_phone: null, client_email: null,
    lead_id: null, project_id: null, address: null, city: 'Curitiba', area_m2: null, status: 'rascunho', total: 0, obra_id: null,
    sent_at: null, answered_at: null, created_by: admin.id, created_at: at(-40), updated_at: at(-40), ...o,
  });

  const reforma = base(
    {
      name: 'REFORMA APTO B.F.',
      client_id: client?.id ?? null, client_name: client?.name ?? 'Beatriz Fontana', client_phone: client?.phone ?? null, client_email: client?.email ?? null,
      project_id: project?.id ?? null, address: 'Rua Comendador Araújo, 510 · ap. 1202', area_m2: 120, status: 'aprovado',
      sent_at: at(-38), answered_at: at(-36), created_at: at(-42), updated_at: at(-36),
      data: newBudgetData({
        bdi: 12, discount: 1500, validity_days: 15, payment_terms: '20% na assinatura e o restante por medição quinzenal, direto aos fornecedores.',
        notes: 'Gerenciamento e execução conforme projeto executivo de interiores. Materiais de acabamento conforme memorial aprovado.',
        exclusions: 'Móveis soltos, eletrodomésticos, cortinas e taxas do condomínio.',
        sections: [
          section('Serviços preliminares', 3, [['Proteção de piso e esquadrias', 'm²', 120, 6, 4], ['Caçamba para entulho', 'un', 3, 0, 480]]),
          section('Demolição e retirada', 4, [['Retirada de revestimento cerâmico', 'm²', 38, 0, 35], ['Demolição de alvenaria', 'm²', 9, 0, 60]]),
          section('Elétrica', 8, [['Ponto de tomada', 'un', 28, 45, 70], ['Ponto de iluminação', 'un', 22, 38, 65], ['Quadro de distribuição', 'un', 1, 850, 600]]),
          section('Hidráulica', 5, [['Ponto de água fria/quente', 'un', 10, 90, 140], ['Ponto de esgoto', 'un', 6, 70, 120]]),
          section('Gesso e forro', 6, [['Forro de gesso', 'm²', 85, 38, 32], ['Sanca', 'm', 24, 25, 30]]),
          section('Pisos e revestimentos', 10, [['Assentamento de porcelanato', 'm²', 96, 140, 65], ['Revestimento de parede', 'm²', 38, 120, 70], ['Rodapé', 'm', 70, 22, 12]]),
          section('Pintura', 7, [['Massa corrida', 'm²', 260, 6, 12], ['Pintura látex paredes (2 demãos)', 'm²', 260, 9, 14], ['Pintura de teto', 'm²', 115, 8, 14]]),
          section('Marcenaria', 12, [['Armário de cozinha', 'm', 6, 2100, 0], ['Guarda-roupa', 'm', 5.5, 2300, 0], ['Painel ripado', 'm²', 9, 650, 0]]),
          section('Limpeza final', 2, [['Limpeza pós-obra', 'm²', 120, 2, 8]]),
        ],
      }),
    },
    1,
  );
  reforma.total = budgetTotals(reforma.data, reforma.area_m2).total;

  const sala = base(
    {
      name: 'SALA COMERCIAL VIEIRA', client_name: 'Escritório Vieira Advogados', client_phone: '(41) 99812-7766', address: 'Av. Sete de Setembro, 4200 · sala 805',
      area_m2: 200, status: 'enviado', sent_at: at(-3), created_at: at(-6), updated_at: at(-3),
      data: newBudgetData({
        bdi: 15, validity_days: 15, payment_terms: '30% na assinatura, 40% na metade da obra e 30% na entrega.',
        sections: [
          section('Alvenaria e drywall', 6, [['Parede em drywall', 'm²', 64, 75, 45]]),
          section('Elétrica', 7, [['Ponto de tomada', 'un', 40, 45, 70], ['Cabeamento', 'm', 380, 6, 4]]),
          section('Iluminação', 3, [['Luminária embutida', 'un', 46, 160, 35], ['Perfil de LED', 'm', 30, 95, 40]]),
          section('Pintura', 6, [['Pintura látex paredes (2 demãos)', 'm²', 420, 9, 14]]),
          section('Ar-condicionado', 4, [['Infraestrutura de ar-condicionado', 'un', 6, 650, 450]]),
        ],
      }),
    },
    2,
  );
  sala.total = budgetTotals(sala.data, sala.area_m2).total;

  const varanda = base(
    {
      name: 'VARANDA GOURMET R.T.', client_name: 'Rodrigo Tavares', client_phone: '(41) 99654-1200', area_m2: 32, created_at: at(-1), updated_at: at(-1),
      data: newBudgetData({
        bdi: 12,
        sections: [
          section('Marmoraria', 4, [['Bancada em granito/quartzo', 'm', 4.2, 1450, 0]]),
          section('Pisos e revestimentos', 5, [['Assentamento de porcelanato', 'm²', 32, 150, 65]]),
          section('Iluminação', 2, [['Pendente', 'un', 3, 420, 60]]),
        ],
      }),
    },
    3,
  );
  varanda.total = budgetTotals(varanda.data, varanda.area_m2).total;

  // ---------------------------------------------------------- obra
  const obraId = uid();
  const start = addBusinessDays(addDays(t, -30), 0);
  const stages = stagesFromBudget(reforma, obraId, start, now);
  const progress = [100, 100, 85, 70, 45, 20, 0, 10, 0];
  stages.forEach((s, i) => (s.progress = progress[i] ?? 0));
  const st = (name: string) => stages.find((s) => s.name === name)!;
  const obra: Obra = {
    id: obraId, code: `OB-${year}-001`, name: 'REFORMA APTO B.F.', client_id: reforma.client_id, client_name: reforma.client_name,
    client_phone: reforma.client_phone, client_email: reforma.client_email, budget_id: reforma.id, project_id: project?.id ?? null,
    manager_id: bruno.id, member_ids: [ana.id], status: 'em_andamento', address: reforma.address, city: 'Curitiba', area_m2: 120,
    start_date: start, due_date: stages[stages.length - 1].due_date, contract_value: reforma.total, notes: 'Portaria libera obra das 8h às 17h, de segunda a sexta. Elevador de serviço com reserva.',
    attachments: [], completed_at: null, created_by: admin.id, created_at: at(-35), updated_at: now,
  };
  reforma.obra_id = obraId;

  const approvals: ObraApproval[] = [];
  const approval = (o: Partial<ObraApproval> & Pick<ObraApproval, 'kind' | 'title'>): ObraApproval => {
    const a: ObraApproval = {
      id: uid(), obra_id: obraId, budget_id: null, payment_id: null, description: null, amount: null, snapshot: null, token: approvalToken(),
      status: 'pendente', due_date: null, client_name: obra.client_name, client_phone: obra.client_phone, requested_by: bruno.id,
      requested_at: at(-2), answered_at: null, answered_name: null, answer_comment: null, answered_via: null, created_at: at(-2), updated_at: at(-2), ...o,
    };
    approvals.push(a);
    return a;
  };
  approval({
    kind: 'orcamento', title: `Orçamento ${reforma.code} · ${reforma.name}`, budget_id: reforma.id, amount: reforma.total, snapshot: budgetSnapshot(reforma, true),
    status: 'aprovado', requested_by: admin.id, requested_at: at(-38), answered_at: at(-36, 20), answered_name: 'Beatriz Fontana', answer_comment: 'Pode seguir!', answered_via: 'link',
  });
  approval({
    kind: 'aditivo', title: 'Nicho iluminado no banheiro social', description: 'Nicho em porcelanato com fita de LED embutida, 90 × 30 cm. Acrescenta 2 dias na etapa de revestimentos.',
    amount: 1850, status: 'aprovado', requested_at: at(-12), answered_at: at(-11, 19), answered_name: 'Beatriz Fontana', answered_via: 'link',
  });
  approval({
    kind: 'material', title: 'Troca do porcelanato da sala por 120 × 120 acetinado', description: 'O modelo do memorial saiu de linha. Proposta: Portobello Cement Gray 120×120, mesmo valor por m².',
    due_date: addDays(t, 2),
  });
  approval({ obra_id: null, kind: 'orcamento', title: `Orçamento ${sala.code} · ${sala.name}`, budget_id: sala.id, amount: sala.total, snapshot: budgetSnapshot(sala, true), client_name: sala.client_name, client_phone: sala.client_phone, requested_by: admin.id, requested_at: at(-3) });

  // ---------------------------------------------------------- pagamentos
  const payments: ObraPayment[] = [];
  const pay = (o: Partial<ObraPayment> & Pick<ObraPayment, 'description' | 'amount' | 'due_date'>): ObraPayment => {
    const p: ObraPayment = {
      id: uid(), obra_id: obraId, stage_id: null, supplier_id: null, supplier_name: null, category: 'mao_de_obra', paid_at: null, method: 'pix', payer: 'cliente',
      approval: 'aprovado', approval_id: null, document: null, attachments: [], notes: null, created_by: bruno.id, created_at: at(-30), updated_at: at(-30), ...o,
    };
    payments.push(p);
    return p;
  };
  const s = (name: string) => ({ supplier_id: sup(name).id, supplier_name: name });
  pay({ description: 'Caçambas e proteção', amount: 2160, due_date: addDays(t, -28), paid_at: addDays(t, -28), stage_id: st('Serviços preliminares').id, category: 'servico', approval: 'nao_requer' });
  pay({ description: 'Demolição e retirada', amount: 1870, due_date: addDays(t, -22), paid_at: addDays(t, -21), stage_id: st('Demolição e retirada').id, approval: 'nao_requer' });
  pay({ description: 'Medição 1 — elétrica', amount: 3900, due_date: addDays(t, -14), paid_at: addDays(t, -13), stage_id: st('Elétrica').id, ...s('Elétrica Luz Forte'), document: 'NF 1182' });
  pay({ description: 'Material elétrico', amount: 2740, due_date: addDays(t, -15), paid_at: addDays(t, -15), stage_id: st('Elétrica').id, category: 'material', method: 'boleto', ...s('Elétrica Luz Forte') });
  pay({ description: 'Medição 1 — hidráulica', amount: 1650, due_date: addDays(t, -6), stage_id: st('Hidráulica').id, ...s('Hidro Serviços') });
  pay({ description: 'Gesso — 50% de entrada', amount: 2650, due_date: addDays(t, -9), paid_at: addDays(t, -9), stage_id: st('Gesso e forro').id, ...s('Gesso & Cia') });
  const porcelanato = pay({ description: 'Porcelanato e revestimentos', amount: 18900, due_date: addDays(t, 4), stage_id: st('Pisos e revestimentos').id, category: 'material', method: 'boleto', approval: 'pendente', ...s('Casa do Porcelanato'), document: 'Pedido 44871' });
  const a = approval({ kind: 'pagamento', title: 'Porcelanato e revestimentos · Casa do Porcelanato', amount: porcelanato.amount, payment_id: porcelanato.id, due_date: porcelanato.due_date, snapshot: paymentSnapshot(porcelanato, 'Pisos e revestimentos'), requested_at: at(-1) });
  porcelanato.approval_id = a.id;
  pay({ description: 'Marcenaria — sinal 40%', amount: 13900, due_date: addDays(t, 9), stage_id: st('Marcenaria').id, category: 'servico', ...s('Marcenaria Pinheiro'), approval: 'aprovado' });

  // ---------------------------------------------------------- visitas
  const visits: ObraVisit[] = [];
  const visit = (d: number, o: Partial<ObraVisit> & Pick<ObraVisit, 'summary'>, photos: Array<[string, number, string, string | null]> = []) => {
    const date = addDays(t, d);
    visits.push({
      id: uid(), obra_id: obraId, date, kind: 'visita', author_id: bruno.id, weather: 'Ensolarado', workers: null, notes: null, progress: [], shared: true,
      photos: photos.map(([label, hue, caption, stage]) => demoPhoto(obraId, label, hue, date, stage, caption)).filter(Boolean) as ObraPhoto[],
      created_at: `${date}T17:00:00.000Z`, updated_at: `${date}T17:00:00.000Z`, ...o,
    });
  };
  visit(-27, { summary: 'Início da obra. Proteções instaladas, caçamba posicionada. Demolição da parede da cozinha começou.', workers: 'Empreiteiro + 2 ajudantes', progress: [{ stage_id: st('Serviços preliminares').id, from: 0, to: 100 }] }, [
    ['Proteção de piso', 30, 'Proteção do piso de madeira dos quartos', st('Serviços preliminares').id],
    ['Demolição cozinha', 15, 'Parede entre cozinha e sala', st('Demolição e retirada').id],
  ]);
  visit(-15, { summary: 'Elétrica passou a fiação da sala e da cozinha. Hidráulica refez os pontos do banheiro social.', workers: 'Eletricista + ajudante, encanador', weather: 'Nublado', notes: 'Confirmar altura das tomadas da bancada (110 cm).', progress: [{ stage_id: st('Elétrica').id, from: 20, to: 60 }, { stage_id: st('Hidráulica').id, from: 0, to: 50 }] }, [
    ['Fiação sala', 200, 'Eletrodutos da sala', st('Elétrica').id],
    ['Pontos banheiro', 190, 'Pontos de água do banheiro social', st('Hidráulica').id],
    ['Quadro', 210, 'Quadro novo', st('Elétrica').id],
  ]);
  visit(-3, { kind: 'vistoria', summary: 'Gesso começou o forro dos quartos. Elétrica finalizando a iluminação. Visita com a cliente para ver o forro.', workers: 'Gesseiro + 2, eletricista', notes: 'Pedir aprovação da troca do porcelanato da sala.', progress: [{ stage_id: st('Elétrica').id, from: 60, to: 85 }, { stage_id: st('Hidráulica').id, from: 50, to: 70 }, { stage_id: st('Gesso e forro').id, from: 0, to: 45 }] }, [
    ['Forro quartos', 40, 'Forro do quarto de casal', st('Gesso e forro').id],
    ['Sanca sala', 45, 'Marcação da sanca da sala', st('Gesso e forro').id],
  ]);

  const issues: ObraIssue[] = [
    { title: 'Tomada da bancada fora de esquadro', responsible: 'Elétrica Luz Forte', due_date: addDays(t, 2), priority: 'alta', stage_id: st('Elétrica').id, status: 'aberta' as const, resolved_at: null },
    { title: 'Conferir caimento do box antes do revestimento', responsible: 'Hidro Serviços', due_date: addDays(t, 5), priority: 'media', stage_id: st('Hidráulica').id, status: 'aberta' as const, resolved_at: null },
    { title: 'Retirar entulho do hall do andar', responsible: 'Empreiteiro', due_date: addDays(t, -10), priority: 'media', stage_id: null, status: 'resolvida' as const, resolved_at: at(-9) },
  ].map((i) => ({ id: uid(), obra_id: obraId, description: null, photos: [], created_by: bruno.id, created_at: at(-12), updated_at: at(-9), ...i })) as ObraIssue[];

  return {
    obra_suppliers: suppliers,
    budgets: [reforma, sala, varanda],
    obras: [obra],
    obra_stages: stages,
    obra_visits: visits,
    obra_payments: payments,
    obra_approvals: approvals,
    obra_issues: issues,
  };
}
