// Orçamentos e Obras: orçamento por partes (material + mão de obra, BDI, desconto) → link para o
// cliente aprovar sem login → obra com as etapas do orçamento → visita com foto e avanço →
// pagamento com aprovação do cliente → marcar como pago → pendência → relatório e proposta.
import { BASE, DEMO_MEMBER, FIXTURES, eq, ls, navLabels, ok, openApp, patchTable, setupAdmin, signIn, signOut, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('obras');
  const { ctx, page } = await openApp(browser);
  let budgetId;
  let obraId;

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'menu Obras com Orçamentos e Obras; dados de exemplo',
    async () => {
      const nav = page.locator('nav[aria-label="Navegação principal"]');
      await nav.getByTitle('Orçamentos').click();
      await page.getByRole('heading', { level: 1, name: 'Orçamentos' }).waitFor();
      eq(await page.locator('[data-budget-row]').count(), 3, 'orçamentos de exemplo');
      await nav.getByTitle('Obras').click();
      await page.locator('[data-obra-card]', { hasText: 'REFORMA APTO B.F.' }).waitFor();
    },
    page,
  );

  await s.step(
    'novo orçamento por partes: itens, BDI e desconto calculam o total',
    async () => {
      await page.goto(BASE + '/orcamentos/novo');
      await page.getByRole('textbox', { name: /^Nome do orçamento/ }).fill('reforma teste');
      await page.getByRole('textbox', { name: 'Nome do cliente' }).fill('Cliente Teste');
      await page.getByRole('textbox', { name: 'WhatsApp do cliente' }).fill('(41) 99999-1234');
      await page.getByLabel('Área (m²)').fill('50');
      // Pintura: sem itens de partida, um item de 100 m² × (8 + 12) = R$ 2.000
      await page.getByRole('textbox', { name: 'Nome de outra parte' }).fill('Pintura geral');
      await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
      const pintura = page.locator('[data-section="Pintura geral"]');
      await pintura.getByLabel('Descrição do item').fill('Pintura de paredes');
      await pintura.getByLabel(/^Quantidade de/).fill('100');
      await pintura.getByLabel(/^Material por unidade/).fill('8');
      await pintura.getByLabel(/^Mão de obra por unidade/).fill('12');
      await pintura.getByLabel(/^Prazo de/).fill('5');
      // Elétrica (preset com itens): zera e usa um item de 10 × (50 + 50) = R$ 1.000
      await page.getByRole('button', { name: 'Elétrica', exact: true }).click();
      const eletrica = page.locator('[data-section="Elétrica"]');
      while ((await eletrica.locator('[data-item]').count()) > 1) await eletrica.locator('[data-item]').last().getByRole('button', { name: /^Remover/ }).click();
      await eletrica.getByLabel('Descrição do item').fill('Ponto de tomada');
      await eletrica.getByLabel(/^Quantidade de/).fill('10');
      await eletrica.getByLabel(/^Material por unidade/).fill('50');
      await eletrica.getByLabel(/^Mão de obra por unidade/).fill('50');
      await eletrica.getByLabel(/^Prazo de/).fill('3');
      // Custo 3.000 + BDI 10% = 3.300 − 300 de desconto = 3.000
      await page.getByLabel('BDI (%)').fill('10');
      await page.getByRole('textbox', { name: 'Desconto' }).fill('30000');
      await page.getByRole('complementary', { name: 'Resumo do orçamento' }).getByText('R$ 3.000,00').first().waitFor();
      eq((await page.locator('[data-budget-total]').innerText()).replace(/\s/g, ' '), 'R$ 3.000', 'total em destaque');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await page.waitForURL(/orcamentos\/(?!novo)[\w-]+$/);
      budgetId = page.url().split('/').pop();
      const saved = (await ls(page, 'budgets')).find((b) => b.id === budgetId);
      eq(saved.name, 'REFORMA TESTE', 'nome em maiúsculas');
      eq(saved.total, 3000, 'total salvo');
      eq(saved.data.sections.map((x) => x.name), ['Pintura geral', 'Elétrica'], 'partes');
    },
    page,
  );

  await s.step(
    'proposta para imprimir com as partes e o total',
    async () => {
      await page.getByRole('button', { name: 'Proposta' }).click();
      await page.getByRole('heading', { name: 'Proposta de orçamento' }).waitFor();
      await page.getByText('Pintura de paredes').waitFor();
      await page.getByText('R$ 3.000,00').first().waitFor();
      await page.getByRole('link', { name: 'Orçamento' }).click();
    },
    page,
  );

  let token;
  await s.step(
    'enviar ao cliente: gera o link e o orçamento fica aguardando',
    async () => {
      await page.getByRole('button', { name: 'Enviar ao cliente' }).click();
      const d = page.getByRole('dialog', { name: 'Enviar orçamento ao cliente' });
      await d.getByRole('button', { name: 'Gerar link de aprovação' }).click();
      const url = await d.locator('[data-approval-url]').innerText();
      ok(/\/aprovacao\/\w{20,}$/.test(url), `link: ${url}`);
      token = url.split('/').pop();
      await d.getByRole('button', { name: 'Pronto' }).click();
      eq((await ls(page, 'budgets')).find((b) => b.id === budgetId).status, 'enviado', 'status enviado');
    },
    page,
  );

  await s.step(
    'cliente abre o link sem login e aprova',
    async () => {
      const client = await ctx.newPage();
      client.errors = [];
      await client.goto(BASE + '/aprovacao/' + token);
      await client.getByRole('heading', { name: /REFORMA TESTE/ }).waitFor();
      await client.getByText('Pintura geral').first().waitFor();
      await client.getByText('R$ 3.000,00').first().waitFor();
      await client.getByLabel(/Comentário/).fill('Pode começar');
      await client.getByRole('button', { name: 'Aprovo', exact: true }).click();
      await client.locator('[data-answer="aprovado"]').waitFor();
      await client.close();
      const b = (await ls(page, 'budgets')).find((x) => x.id === budgetId);
      eq(b.status, 'aprovado', 'orçamento aprovado pelo link');
      const n = (await ls(page, 'notifications')).find((x) => /Cliente aprovou/.test(x.title) && /REFORMA TESTE/.test(x.title));
      ok(n, 'notificação de aprovação para quem enviou');
    },
    page,
  );

  await s.step(
    'transformar em obra: etapas do orçamento com valores e datas',
    async () => {
      await page.reload();
      await page.getByRole('button', { name: 'Transformar em obra' }).click();
      const d = page.getByRole('dialog', { name: 'Transformar orçamento em obra' });
      await d.getByRole('button', { name: 'Criar obra' }).click();
      await page.waitForURL(/obras\/[\w-]+$/);
      obraId = page.url().split('/').pop();
      const stages = (await ls(page, 'obra_stages')).filter((x) => x.obra_id === obraId).sort((a, b) => a.position - b.position);
      eq(stages.map((x) => x.name), ['Pintura geral', 'Elétrica'], 'etapas');
      // 2.200 e 1.100 com BDI, menos o desconto proporcional (200 e 100)
      eq(stages.map((x) => x.budget), [2000, 1000], 'valor previsto das etapas soma o total');
      ok(stages.every((x) => x.start_date && x.due_date), 'datas pelos prazos');
      const obra = (await ls(page, 'obras')).find((o) => o.id === obraId);
      eq(obra.contract_value, 3000, 'valor contratado');
      eq((await ls(page, 'budgets')).find((x) => x.id === budgetId).obra_id, obraId, 'orçamento ligado à obra');
    },
    page,
  );

  await s.step(
    'registrar visita com foto e avanço da etapa',
    async () => {
      await page.getByRole('button', { name: 'Registrar visita' }).click();
      const d = page.getByRole('dialog', { name: 'Registrar visita' });
      await d.getByLabel('O que foi feito / observado').fill('Pintura começou pela sala.');
      await d.getByLabel('Escolher fotos').setInputFiles(FIXTURES + 'foto.jpg');
      await d.locator('[data-photo]').first().waitFor({ timeout: 15000 });
      await d.getByLabel(/^Legenda de/).fill('Massa corrida na sala');
      await d.getByLabel('Avanço de Pintura geral nesta visita').fill('40');
      await d.getByRole('button', { name: 'Salvar visita' }).click();
      await d.waitFor({ state: 'detached' });
      const v = (await ls(page, 'obra_visits')).find((x) => x.obra_id === obraId);
      eq(v.photos.length, 1, 'foto na visita');
      eq(v.photos[0].caption, 'Massa corrida na sala', 'legenda');
      const st = (await ls(page, 'obra_stages')).find((x) => x.obra_id === obraId && x.name === 'Pintura geral');
      eq(st.progress, 40, 'avanço aplicado à etapa');
      eq((await ls(page, 'obras')).find((o) => o.id === obraId).status, 'em_andamento', 'obra começou');
      await page.getByRole('tab', { name: /^Fotos/ }).click();
      await page.locator('[data-photo]').first().click();
      await page.getByRole('dialog', { name: 'Foto' }).getByText('Massa corrida na sala').waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  let payToken;
  await s.step(
    'pagamento com pedido de aprovação do cliente',
    async () => {
      await page.getByRole('tab', { name: /^Pagamentos/ }).click();
      await page.getByRole('button', { name: 'Pagamento', exact: true }).click();
      const d = page.getByRole('dialog', { name: 'Novo pagamento' });
      await d.getByLabel('Descrição').fill('Tinta e massa');
      await d.getByRole('textbox', { name: 'Valor' }).fill('85000');
      await d.getByRole('combobox', { name: 'Etapa' }).click();
      await page.getByRole('option', { name: 'Pintura geral' }).click();
      await d.getByRole('button', { name: 'Salvar' }).click();
      await d.waitFor({ state: 'detached' });
      const p = (await ls(page, 'obra_payments')).find((x) => x.obra_id === obraId);
      eq([p.amount, p.approval], [850, 'pendente'], 'pagamento aguardando aprovação');
      payToken = (await ls(page, 'obra_approvals')).find((a) => a.payment_id === p.id).token;
      await page.locator('[data-payment]', { hasText: 'Tinta e massa' }).getByText('Aguardando aprovação').waitFor();
    },
    page,
  );

  await s.step(
    'cliente aprova o pagamento pelo link e a equipe marca como pago',
    async () => {
      const client = await ctx.newPage();
      await client.goto(BASE + '/aprovacao/' + payToken);
      await client.getByRole('heading', { name: /Tinta e massa/ }).waitFor();
      await client.getByRole('button', { name: 'Aprovo', exact: true }).click();
      await client.locator('[data-answer="aprovado"]').waitFor();
      await client.close();
      await page.reload();
      await page.getByRole('tab', { name: /^Pagamentos/ }).click();
      const row = page.locator('[data-payment]', { hasText: 'Tinta e massa' });
      await row.getByText('aprovado pelo cliente').waitFor();
      await row.getByRole('button', { name: /como pago/ }).click();
      await page.getByRole('dialog', { name: 'Marcar como pago' }).getByRole('button', { name: 'Confirmar pagamento' }).click();
      await row.getByText('Pago', { exact: true }).waitFor();
      const p = (await ls(page, 'obra_payments')).find((x) => x.obra_id === obraId);
      ok(p.paid_at, 'pago');
    },
    page,
  );

  await s.step(
    'aditivo aprovado soma ao contratado',
    async () => {
      await page.getByRole('tab', { name: /^Aprovações/ }).click();
      await page.getByRole('button', { name: 'Pedir aprovação' }).click();
      const d = page.getByRole('dialog', { name: 'Pedir aprovação do cliente' });
      await d.getByLabel('O que precisa ser aprovado').fill('Textura na parede da varanda');
      await d.getByRole('textbox', { name: 'Valor do aditivo' }).fill('50000');
      await d.getByRole('button', { name: 'Criar pedido' }).click();
      await page.locator('[data-approval="pendente"]', { hasText: 'Textura na parede' }).getByRole('button', { name: 'Registrar resposta' }).click();
      const a = page.getByRole('dialog', { name: 'Registrar resposta do cliente' });
      await a.getByRole('button', { name: 'Registrar' }).click();
      await page.locator('[data-approval="aprovado"]', { hasText: 'Textura na parede' }).waitFor();
      await page.getByRole('tab', { name: 'Visão geral' }).click();
      await page.getByText('R$ 3.500,00').first().waitFor();
    },
    page,
  );

  await s.step(
    'pendência aberta e resolvida',
    async () => {
      await page.getByRole('tab', { name: /^Pendências/ }).click();
      await page.getByRole('button', { name: 'Pendência', exact: true }).click();
      const d = page.getByRole('dialog', { name: 'Nova pendência' });
      await d.getByLabel('O que precisa ser feito').fill('Retocar rodapé do quarto');
      await d.getByRole('button', { name: 'Salvar' }).click();
      const row = page.locator('[data-issue]', { hasText: 'Retocar rodapé' });
      await row.waitFor();
      await row.getByRole('button').first().click();
      await row.waitFor({ state: 'detached' });
      eq((await ls(page, 'obra_issues')).find((x) => x.title === 'Retocar rodapé do quarto').status, 'resolvida', 'resolvida');
    },
    page,
  );

  await s.step(
    'relatório da obra para o cliente',
    async () => {
      await page.getByRole('button', { name: 'Relatório' }).click();
      await page.getByRole('heading', { name: 'Relatório da obra' }).waitFor();
      await page.getByText('Pintura começou pela sala.').waitFor();
      await page.getByText('Tinta e massa').first().waitFor();
    },
    page,
  );

  await s.step(
    'acesso por módulo: sem "Orçamentos e obras" o menu e as telas somem',
    async () => {
      await page.goto(BASE + '/');
      await patchTable(page, 'profiles', "return rows.map((p) => p.email === arg ? { ...p, permissions: ['projetos'] } : p)", DEMO_MEMBER.email);
      await signOut(page);
      await signIn(page, DEMO_MEMBER);
      const labels = await navLabels(page);
      ok(!labels.includes('Obras') && !labels.includes('Orçamentos'), `menu sem obras: ${labels.join(', ')}`);
      await page.goto(BASE + '/obras');
      await page.waitForURL((u) => !u.pathname.startsWith('/obras'));
    },
    page,
  );

  await ctx.close();
  return s;
}
