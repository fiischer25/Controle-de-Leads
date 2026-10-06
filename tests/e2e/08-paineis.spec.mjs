// Escritório, Meu painel e "Pede sua atenção": blocos de cada painel (Financeiro, Comercial,
// próximas tarefas), filtros da fila, registrar contato (foco, lista, Tab preso no modal),
// camadas com Esc e ações do celular (criar, lançar horas, deslizar para concluir).
import { BASE, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('paineis');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'Escritório: projetos, financeiro, comercial e equipe',
    async () => {
      await page.goto(BASE + '/');
      for (const t of ['Em andamento', 'Horas da equipe']) await page.getByText(t, { exact: true }).first().waitFor();
      await page.getByText(/^Financeiro · /).waitFor();
      for (const t of ['Saldo em contas', 'Entradas do mês', 'Saídas do mês', 'Resultado do mês']) await page.getByText(t, { exact: true }).first().waitFor();
      await page.getByRole('heading', { name: 'Fluxo de caixa' }).waitFor();
      await page.getByRole('heading', { name: 'Vencidos e próximos 30 dias' }).waitFor();
      await page.getByText(/A receber em 30 dias:/).waitFor();
      for (const t of ['Oportunidades abertas', 'Valor no funil']) await page.getByText(t, { exact: true }).first().waitFor();
      await page.getByRole('heading', { name: 'Equipe esta semana' }).waitFor();
    },
    page,
  );

  await s.step(
    'Escritório: clicar num vencimento abre o lançamento',
    async () => {
      await page.locator('section[aria-labelledby="dash-venc-office"] li button').first().click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'Meu painel: tarefas, comercial e financeiro',
    async () => {
      await page.goto(BASE + '/meu-painel');
      await page.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
      await page.getByRole('heading', { name: 'Meu comercial' }).waitFor();
      for (const t of ['Em negociação', 'Em propostas', 'Ganhos no mês']) await page.getByText(t, { exact: true }).waitFor();
      await page.getByText(/^Financeiro · /).waitFor();
      await page.getByRole('heading', { name: 'Meus projetos' }).waitFor();
    },
    page,
  );

  await s.step(
    'Meu painel: sem nada urgente mostra as próximas tarefas',
    async () => {
      // Empurra os prazos das minhas tarefas para daqui a 30 dias
      await patchTable(
        page,
        'tasks',
        "const me = JSON.parse(localStorage.getItem('airos:v1:profiles')).find((p) => p.role === 'admin').id; const d = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10); rows.forEach((t) => { if (t.assignee_id === me && t.status !== 'done') { t.due_date = d; t.start_date = null; } });",
      );
      await page.reload();
      await page.getByText('Nada atrasado nem vencendo nos próximos 7 dias.').waitFor();
      await page.getByText('Mais adiante e sem prazo').waitFor();
    },
    page,
  );

  await s.step(
    'Pede sua atenção: filtro Comercial não mostra tarefas',
    async () => {
      await page.goto(BASE + '/tarefas?aba=atencao');
      await page.getByRole('heading', { level: 1, name: 'Pede sua atenção' }).waitFor();
      await page.getByRole('tab', { name: /^Comercial/ }).click();
      const rows = page.locator('[data-attention-item]');
      await rows.first().waitFor();
      const cats = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-category')));
      ok(cats.length > 0 && cats.every((c) => c === 'comercial'), 'categorias na aba Comercial: ' + cats.join(', '));
      await page.getByRole('tab', { name: /^Tudo/ }).click();
    },
    page,
  );

  await s.step(
    'registrar contato: foco, tipo de contato e Tab preso no modal',
    async () => {
      await page.getByRole('button', { name: 'Registrar contato' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.getByText('O que foi conversado?').waitFor();
      ok((await page.evaluate(() => document.activeElement?.tagName)) === 'TEXTAREA', 'foco inicial fora do texto');
      await dlg.getByRole('combobox', { name: 'Tipo de contato' }).click();
      await page.getByRole('option', { name: 'WhatsApp' }).click();
      ok((await dlg.getByRole('combobox', { name: 'Tipo de contato' }).innerText()).includes('WhatsApp'), 'tipo não escolhido');
      for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
      ok(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')), 'foco saiu do modal');
      await dlg.locator('textarea').fill('Conversamos sobre o ajuste da proposta.');
      await dlg.getByRole('button', { name: 'Registrar', exact: true }).click();
      await page.getByText('Contato registrado e retorno agendado.').waitFor();
    },
    page,
  );

  await s.step(
    'Esc fecha a lista aberta antes do modal',
    async () => {
      await page.goto(BASE + '/');
      await page.getByRole('button', { name: 'Tarefa', exact: true }).click();
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('combobox').first().click();
      await page.getByRole('listbox').waitFor();
      await page.keyboard.press('Escape');
      ok(!(await page.getByRole('listbox').count()), 'lista continuou aberta');
      ok(await dlg.count(), 'modal fechou junto');
      await page.keyboard.press('Escape');
      await dlg.waitFor({ state: 'detached' });
    },
    page,
  );

  await s.step(
    'celular: criar, lançar horas e deslizar para concluir',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      const errs = [];
      mp.on('pageerror', (e) => errs.push(e.message));
      await mp.goto(BASE + '/');
      await mp.getByRole('heading', { name: 'Dashboard do escritório' }).waitFor();
      await mp.getByRole('button', { name: 'Criar' }).click();
      await mp.getByRole('dialog').getByText('Lançar horas').click();
      await mp.getByRole('dialog').getByText('Registre o tempo trabalhado').waitFor();
      await mp.keyboard.press('Escape');
      await mp.goto(BASE + '/tarefas?aba=atencao');
      const row = mp.locator('[data-attention-item="task"]').first();
      const b = await row.boundingBox();
      const cdp = await m.newCDPSession(mp);
      const y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 300, y }] });
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 300 - i * 18, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await mp.waitForTimeout(400);
      ok(await mp.getByRole('button', { name: 'Concluir' }).first().isVisible(), 'ações do deslize não apareceram');
      await m.close();
      ok(!errs.length, errs.join(' | '));
    },
    page,
  );

  await ctx.close();
  return s;
}
