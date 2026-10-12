// Relatórios → Saúde do escritório: nota geral e por área, o que melhorar primeiro (com o link
// para analisar), indicadores por área e celular.
import { BASE, eq, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('saude');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'Escritório → Saúde do escritório: nota e áreas',
    async () => {
      await page.getByRole('button', { name: 'Saúde do escritório' }).click();
      await page.waitForURL(/relatorios\?aba=saude/);
      eq(await page.getByRole('tab', { selected: true }).innerText(), 'Saúde do escritório', 'aba ativa');
      const score = Number(await page.locator('[data-health-score]').getAttribute('data-health-score'));
      ok(score > 0 && score <= 100, `nota ${score}`);
      const status = await page.locator('[data-health-status]').innerText();
      ok(['Saudável', 'Pede atenção', 'Em risco'].includes(status), `situação ${status}`);
      const areas = await page.locator('[data-health-area]').evaluateAll((els) => els.map((e) => e.getAttribute('data-health-area')));
      eq(areas, ['financeiro', 'comercial', 'producao', 'equipe'], 'áreas');
      for (const t of ['Financeiro', 'Comercial', 'Prazos e entregas', 'Equipe']) await page.getByRole('heading', { name: t, exact: true }).waitFor();
      // Indicadores com situação
      const statuses = await page.locator('[data-health-indicator]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
      ok(statuses.length >= 8 && statuses.every((x) => ['bom', 'atencao', 'critico'].includes(x)), `indicadores: ${statuses.join(', ')}`);
    },
    page,
  );

  await s.step(
    'projetos atrasados viram prioridade, com o link para analisar',
    async () => {
      await patchTable(
        page,
        'projects',
        "rows.forEach((p) => { if (['em_andamento', 'nao_iniciado', 'pausado'].includes(p.status)) p.due_date = '2020-01-01'; });",
      );
      await page.reload();
      const item = page.locator('[data-health-priority="projetos_atrasados"]');
      await item.getByText('Crítico').waitFor();
      await item.getByText('Projetos com entrega atrasada').waitFor();
      eq(await page.locator('[data-health-indicator="projetos_atrasados"]').getAttribute('data-status'), 'critico', 'indicador na área');
      // Críticos vêm antes dos de atenção
      const ids = await page.locator('[data-health-priority]').evaluateAll((els) => els.map((e) => e.getAttribute('data-health-priority')));
      const level = await Promise.all(ids.map((id) => page.locator(`[data-health-indicator="${id}"]`).getAttribute('data-status')));
      eq(level, [...level].sort((a, b) => (a === 'critico' ? 0 : 1) - (b === 'critico' ? 0 : 1)), 'críticos primeiro');
      await item.getByRole('link', { name: /Ver os projetos/ }).click();
      await page.waitForURL(/\/projetos$/);
    },
    page,
  );

  await s.step(
    'clicar na área leva aos indicadores dela',
    async () => {
      await page.goto(BASE + '/relatorios?aba=saude');
      await page.locator('[data-health-area="equipe"]').click();
      await page.waitForURL(/#saude-equipe$/);
      await page.getByRole('heading', { name: 'Equipe', exact: true }).waitFor();
      // Volta para a visão geral dos relatórios
      await page.getByRole('tab', { name: 'Visão geral' }).click();
      await page.getByText('Horas registradas', { exact: true }).waitFor();
    },
    page,
  );

  await s.step(
    'celular: sem rolagem para o lado',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      await mp.goto(BASE + '/relatorios?aba=saude');
      await mp.locator('[data-health-score]').waitFor();
      await mp.locator('[data-health-priority]').first().waitFor();
      eq(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'rolagem horizontal');
      await m.close();
    },
    page,
  );

  await ctx.close();
  return s;
}
