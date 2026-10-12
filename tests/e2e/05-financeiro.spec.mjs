// Financeiro: visão geral, lançamento mensal (12x), baixa, filtros, contas, rentabilidade,
// categorias, plano de honorários do projeto, importação de extrato OFX (sem duplicar),
// anexos, relatório em PDF e celular.
import { BASE, FIXTURES, eq, ls, ok, openApp, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('financeiro');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'visão geral com indicadores, fluxo e vencimentos',
    async () => {
      await page.locator('nav[aria-label="Navegação principal"]').getByTitle('Financeiro').click();
      await page.getByRole('heading', { level: 1, name: 'Financeiro' }).waitFor();
      await page.getByText('Saldo em contas', { exact: true }).first().waitFor();
      await page.getByRole('heading', { name: 'Fluxo de caixa' }).waitFor();
      await page.getByRole('heading', { name: 'Vencidos e próximos 30 dias' }).waitFor();
    },
    page,
  );

  await s.step(
    'caixa do mês seguinte: o recebido no mês anterior paga as contas deste mês',
    async () => {
      const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const now = new Date();
      const key = (d) => d.toISOString().slice(0, 7);
      const cur = key(new Date(now.getFullYear(), now.getMonth(), 15));
      const prev = key(new Date(now.getFullYear(), now.getMonth() - 1, 15));
      const curName = MONTHS[now.getMonth()];
      const prevName = MONTHS[(now.getMonth() + 11) % 12];
      const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
      const entries = await ls(page, 'finance_entries');
      const received = entries.filter((e) => e.kind === 'receita' && e.paid_at?.startsWith(prev)).reduce((a, e) => a + e.amount, 0);
      const bills = entries.filter((e) => e.kind === 'despesa' && e.due_date.startsWith(cur)).reduce((a, e) => a + e.amount, 0);
      const card = (label) => page.locator('.metric-tile').filter({ has: page.getByText(label, { exact: true }) }).first();
      ok((await card(`Recebido em ${prevName}`).innerText()).replace(/\s/g, ' ').includes(brl(received).replace(/\s/g, ' ')), `recebido em ${prevName}: ${brl(received)}`);
      ok((await card(`Contas de ${curName}`).innerText()).replace(/\s/g, ' ').includes(brl(bills).replace(/\s/g, ' ')), `contas de ${curName}: ${brl(bills)}`);
      const leftover = received - bills;
      ok((await card(`Sobra de ${curName}`).innerText()).replace(/\s/g, ' ').includes(brl(Math.abs(leftover)).replace(/\s/g, ' ')), `sobra: ${brl(leftover)}`);
      await page.locator('[data-next-cycle]').getByText(/contas de /).waitFor();
      await page.getByText(/o que entrou no mês anterior × as contas do mês/).waitFor();
      // Volta para o mesmo mês e de novo para o seguinte (fica lembrado)
      await page.getByRole('button', { name: 'Mesmo mês' }).click();
      for (const t of ['Entradas do mês', 'Saídas do mês', 'Resultado do mês']) await page.getByText(t, { exact: true }).first().waitFor();
      await page.reload();
      await page.getByText('Entradas do mês', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Entradas pagam o mês seguinte' }).click();
      await card(`Sobra de ${curName}`).waitFor();
    },
    page,
  );

  await s.step(
    'categorias do escritório cadastradas sozinhas: projeto, acompanhamento, consultoria',
    async () => {
      // Banco só com as categorias iniciais (sem Consultoria) e navegador que ainda não aplicou as sugeridas
      const INITIAL = ['Honorários de projeto', 'Reserva técnica (RT)', 'Acompanhamento de obra', 'Outras receitas', 'Salários e pró-labore', 'Aluguel e condomínio', 'Impostos', 'Contabilidade'];
      await page.evaluate((keep) => {
        const rows = JSON.parse(localStorage.getItem('airos:v1:finance_categories'));
        localStorage.setItem('airos:v1:finance_categories', JSON.stringify(rows.filter((c) => keep.includes(c.name))));
        localStorage.removeItem('airos:finance-presets');
      }, INITIAL);
      await page.goto(BASE + '/financeiro');
      await page.getByRole('heading', { level: 1, name: 'Financeiro' }).waitFor();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('airos:v1:finance_categories')).some((c) => c.name === 'Consultoria e laudos'));
      await page.getByRole('button', { name: 'Receita', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByRole('combobox', { name: 'Categoria' }).click();
      const options = await page.getByRole('option').allInnerTexts();
      const names = options.map((o) => o.trim()).filter((o) => o && !/^Sem categoria/.test(o));
      for (const n of ['Honorários de projeto', 'Acompanhamento de obra', 'Consultoria e laudos']) ok(names.includes(n), `faltou ${n}: ${names.join(', ')}`);
      eq(names.slice(0, 3), ['Honorários de projeto', 'Acompanhamento de obra', 'Consultoria e laudos'], 'mais usadas primeiro');
      eq(names[names.length - 1], 'Outras receitas', '"Outras" no fim');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await d.waitFor({ state: 'detached' });
      const cats = await ls(page, 'finance_categories');
      eq(cats.filter((c) => c.name === 'Honorários de projeto').length, 1, 'sem repetir as que existiam');
      ok(cats.some((c) => c.name === 'Seguros' && c.kind === 'despesa'), 'despesas sugeridas também');
    },
    page,
  );

  await s.step(
    'categorias sugeridas para o escritório: adiciona as que faltam',
    async () => {
      await page.evaluate(() => {
        const rows = JSON.parse(localStorage.getItem('airos:v1:finance_categories'));
        localStorage.setItem('airos:v1:finance_categories', JSON.stringify(rows.filter((c) => !['Seguros', 'Consultoria e laudos'].includes(c.name))));
      });
      await page.goto(BASE + '/financeiro?aba=categorias');
      const box = page.getByRole('region', { name: 'Categorias sugeridas' });
      await box.getByText('Seguros').waitFor();
      await box.getByRole('button', { name: 'Adicionar as 2 categorias' }).click();
      await box.waitFor({ state: 'detached' });
      const cats = await ls(page, 'finance_categories');
      ok(cats.some((c) => c.name === 'Seguros' && c.kind === 'despesa') && cats.some((c) => c.name === 'Consultoria e laudos' && c.kind === 'receita'), 'categorias não adicionadas');
      await page.goto(BASE + '/financeiro');
    },
    page,
  );

  await s.step(
    'despesa mensal gera 12 lançamentos da mesma série',
    async () => {
      await page.getByRole('button', { name: 'Despesa', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByPlaceholder(/Aluguel da sala/).fill('Assinatura Autodesk');
      await d.getByLabel('Valor').fill('45990');
      await d.getByRole('radio', { name: 'Todo mês' }).click();
      await d.getByLabel('Número de meses').fill('12');
      await d.getByRole('button', { name: 'Lançar' }).click();
      await d.waitFor({ state: 'detached' });
      const mine = (await ls(page, 'finance_entries')).filter((e) => e.description === 'Assinatura Autodesk');
      eq([mine.length, mine[0]?.amount, new Set(mine.map((e) => e.series_id)).size], [12, 459.9, 1], 'série');
    },
    page,
  );

  await s.step(
    'pagar direto na linha dos lançamentos',
    async () => {
      await page.getByRole('tab', { name: 'Lançamentos' }).click();
      const row = page.locator('li', { hasText: 'Assinatura Autodesk' }).first();
      await row.getByRole('button', { name: 'Pagar' }).click();
      await page.waitForTimeout(300);
      const first = (await ls(page, 'finance_entries')).filter((x) => x.description === 'Assinatura Autodesk').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      ok(first.paid_at, 'baixa não registrada');
    },
    page,
  );

  await s.step(
    'filtro de vencidos (todos os meses)',
    async () => {
      await page.getByRole('combobox', { name: 'Situação' }).click();
      await page.getByRole('option', { name: /Vencidos/ }).click();
      await page.waitForTimeout(300);
      ok((await page.locator('main ul > li').count()) > 0, 'nenhum vencido listado');
    },
    page,
  );

  await s.step(
    'abas Contas, Rentabilidade e Categorias',
    async () => {
      await page.getByRole('tab', { name: /Contas/ }).click();
      await page.getByText('Itaú PJ').first().waitFor();
      await page.getByRole('tab', { name: 'Rentabilidade' }).click();
      await page.getByText('Resultado por projeto').waitFor();
      await page.getByRole('tab', { name: 'Categorias' }).click();
      await page.getByText('Honorários de projeto').first().waitFor();
    },
    page,
  );

  await s.step(
    'projeto: plano de honorários lança as parcelas',
    async () => {
      await page.goto(BASE + '/projetos');
      await page.getByText('CASA S.A.').first().click();
      await page.getByRole('tab', { name: 'Financeiro' }).click();
      await page.getByRole('heading', { name: 'Honorários' }).waitFor();
      await page.getByRole('button', { name: 'Plano de honorários' }).click();
      const d = page.getByRole('dialog');
      await d.getByText('Valor do contrato').waitFor();
      const before = (await ls(page, 'finance_entries')).length;
      await d.getByRole('button', { name: 'Lançar parcelas' }).click();
      await d.waitFor({ state: 'detached' });
      ok((await ls(page, 'finance_entries')).length > before, 'parcelas não lançadas');
    },
    page,
  );

  await s.step(
    'importar extrato OFX: revisão e baixa automática',
    async () => {
      await page.goto(BASE + '/financeiro?aba=lancamentos');
      await page.getByRole('button', { name: 'Importar extrato' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Arquivo do extrato').setInputFiles(FIXTURES + 'extrato.ofx');
      await d.getByText('Prévia · 3 transações').waitFor();
      await d.getByRole('button', { name: /Revisar 3 transações/ }).click();
      await d.getByText(/baixas? em lançamentos existentes/).waitFor();
      await d.getByRole('button', { name: /^Importar \d+/ }).click();
      await d.waitFor({ state: 'detached' });
      ok((await ls(page, 'finance_entries')).filter((e) => e.bank_ref).length >= 3, 'transações sem referência do banco');
    },
    page,
  );

  await s.step(
    'importar o mesmo extrato de novo não duplica',
    async () => {
      await page.getByRole('button', { name: 'Importar extrato' }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Arquivo do extrato').setInputFiles(FIXTURES + 'extrato.ofx');
      await d.getByRole('button', { name: /Revisar 3 transações/ }).click();
      await d.getByText('3 já importadas').waitFor();
      ok(await d.getByRole('button', { name: /^Importar 0/ }).isDisabled(), 'importar deveria ficar desativado');
      await d.getByRole('button', { name: 'Cancelar' }).click();
    },
    page,
  );

  await s.step(
    'anexar comprovante a um lançamento',
    async () => {
      await page.getByText('Folha de pagamento').first().click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Anexar arquivo').setInputFiles(FIXTURES + 'nota.pdf');
      await d.getByText('nota.pdf').waitFor();
      await d.getByRole('button', { name: 'Cancelar' }).click();
      const e = (await ls(page, 'finance_entries')).find((x) => x.attachments?.length);
      eq(e?.attachments?.[0]?.name, 'nota.pdf', 'anexo salvo');
      await page.locator('li', { hasText: 'Folha de pagamento' }).first().locator('svg[aria-label*="anexo"]').waitFor();
    },
    page,
  );

  await s.step(
    'novo lançamento com anexo enviado ao salvar',
    async () => {
      await page.getByRole('button', { name: 'Despesa', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByPlaceholder(/Aluguel da sala/).fill('Plotagem prancha A1');
      await d.getByLabel('Valor').fill('8500');
      await d.getByLabel('Anexar arquivo').setInputFiles(FIXTURES + 'nota.pdf');
      await d.getByText('enviado ao salvar', { exact: false }).waitFor();
      await d.getByRole('button', { name: 'Lançar' }).click();
      await d.waitFor({ state: 'detached' });
      eq((await ls(page, 'finance_entries')).find((x) => x.description === 'Plotagem prancha A1')?.attachments?.length, 1, 'anexo do novo lançamento');
    },
    page,
  );

  await s.step(
    'relatório mensal gera PDF',
    async () => {
      await page.goto(BASE + '/financeiro');
      await page.getByRole('button', { name: 'Relatório' }).click();
      await page.getByRole('heading', { name: 'Relatório financeiro' }).waitFor();
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format: 'A4' });
      await page.emulateMedia({ media: 'screen' });
      ok(pdf.length > 5000, 'PDF vazio');
    },
    page,
  );

  await s.step(
    'celular: lançamentos',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', storageState: await ctx.storageState() });
      const mp = await m.newPage();
      const errs = [];
      mp.on('pageerror', (e) => errs.push(e.message));
      await mp.goto(BASE + '/financeiro?aba=lancamentos');
      await mp.getByRole('heading', { level: 1, name: 'Financeiro' }).waitFor();
      await mp.getByText('Assinatura Autodesk').first().waitFor();
      ok((await mp.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'página rola para o lado');
      await m.close();
      ok(!errs.length, errs.join(' | '));
    },
    page,
  );

  await s.step(
    'Receber parcela vencida grava a data do pagamento combinada, não a de hoje',
    async () => {
      const day = (n) => new Date(Date.now() + n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const due = day(-40);
      await page.evaluate((d) => {
        const rows = JSON.parse(localStorage.getItem('airos:v1:finance_entries'));
        const base = rows.find((r) => r.kind === 'receita');
        rows.push({ ...base, id: 'e2e-receber', description: 'Honorários teste · parcela antiga', amount: 1234, due_date: d, paid_at: null, series_id: null, installment: null, installments: null, bank_ref: null });
        localStorage.setItem('airos:v1:finance_entries', JSON.stringify(rows));
      }, due);
      await page.goto(BASE + '/financeiro?aba=lancamentos');
      // Parcela de 40 dias atrás: aparece no filtro de vencidos (todos os meses)
      await page.getByRole('combobox', { name: 'Situação' }).click();
      await page.getByRole('option', { name: /Vencidos/ }).click();
      await page.getByText('Honorários teste · parcela antiga').first().waitFor();
      await page.locator('li', { hasText: 'Honorários teste · parcela antiga' }).getByRole('button', { name: 'Receber' }).click();
      await page.waitForTimeout(300);
      eq((await ls(page, 'finance_entries')).find((e) => e.id === 'e2e-receber').paid_at, due, 'data do recebimento');
    },
    page,
  );

  await s.step(
    'acertar parcelas de meses passados: recebidas com a data do dia e ainda em aberto',
    async () => {
      const day = (n) => new Date(Date.now() + n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const now = new Date().toISOString();
      // Como um projeto em andamento cadastrado hoje: parcelas de meses passados
      await page.evaluate(({ rows: extra }) => {
        const rows = JSON.parse(localStorage.getItem('airos:v1:finance_entries'));
        const base = rows.find((r) => r.kind === 'receita');
        for (const x of extra) rows.push({ ...base, series_id: null, installment: null, installments: null, bank_ref: null, ...x });
        localStorage.setItem('airos:v1:finance_entries', JSON.stringify(rows));
      }, {
        rows: [
          { id: 'e2e-old-1', description: 'Honorários CASA NOVA · Entrada', amount: 5000, due_date: day(-90), paid_at: day(0), created_at: now },
          { id: 'e2e-old-2', description: 'Honorários CASA NOVA · Parcela 1', amount: 3000, due_date: day(-60), paid_at: null, created_at: now },
          { id: 'e2e-old-3', description: 'Honorários CASA NOVA · Parcela 2', amount: 3000, due_date: day(-30), paid_at: null, created_at: now },
        ],
      });
      await page.goto(BASE + '/financeiro');
      const notice = page.getByRole('region', { name: 'Parcelas de meses passados para acertar' });
      await notice.getByText(/3 parcelas de meses passados estão contando em/).waitFor();
      await notice.getByRole('button', { name: 'Revisar e acertar' }).click();
      const d = page.getByRole('dialog', { name: /Acertar parcelas de meses passados/ });
      await d.getByText('Ainda como "a receber"').waitFor();
      await d.getByText('Recebidas com a data de hoje').waitFor();
      // A Parcela 2 ainda não foi paga: desmarca
      await d.getByLabel('Acertar Honorários CASA NOVA · Parcela 2').click();
      await d.getByRole('button', { name: 'Acertar 2 parcelas' }).click();
      await d.waitFor({ state: 'detached' });
      const rows = await ls(page, 'finance_entries');
      const paid = (id) => rows.find((e) => e.id === id).paid_at;
      eq([paid('e2e-old-1'), paid('e2e-old-2'), paid('e2e-old-3')], [day(-90), day(-60), null], 'parcelas acertadas');
      ok(!(await notice.count()), 'aviso continuou');
    },
    page,
  );

  await ctx.close();
  return s;
}
