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
      for (const t of ['Saldo em contas', 'Entradas do mês', 'Resultado do mês']) await page.getByText(t, { exact: true }).first().waitFor();
      await page.getByRole('heading', { name: 'Fluxo de caixa' }).waitFor();
      await page.getByRole('heading', { name: 'Vencidos e próximos 30 dias' }).waitFor();
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

  await ctx.close();
  return s;
}
