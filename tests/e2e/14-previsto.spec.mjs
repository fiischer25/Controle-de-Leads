// Previsto × realizado: a precificação do projeto (dias por etapa) contra as horas lançadas,
// vincular uma precificação ao projeto e o histórico de dias por m² na Precificação.
import { BASE, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('previsto');
  const { ctx, page } = await openApp(browser);
  let project;
  let firstPhase;

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'projeto com precificação: horas previstas × lançadas por etapa',
    async () => {
      const tasks = await ls(page, 'tasks');
      const entries = await ls(page, 'time_entries');
      const projects = await ls(page, 'projects');
      // Projeto com horas lançadas
      const withHours = projects.find((p) => tasks.some((t) => t.project_id === p.id && entries.some((e) => e.task_id === t.id)));
      ok(withHours, 'projeto com horas na demonstração');
      project = withHours;
      const mine = tasks.filter((t) => t.project_id === project.id);
      const phases = [...new Set(mine.map((t) => t.phase || 'Geral'))];
      firstPhase = mine.find((t) => entries.some((e) => e.task_id === t.id)).phase || 'Geral';
      const minutes = entries.filter((e) => mine.some((t) => t.id === e.task_id && (t.phase || 'Geral') === firstPhase)).reduce((a, e) => a + e.minutes, 0);
      const now = new Date().toISOString();
      await patchTable(
        page,
        'pricings',
        'rows.push(arg); return rows;',
        {
          id: 'pr-e2e', name: 'PRECIFICAÇÃO TESTE', client_name: null, lead_id: null, project_type_id: project.project_type_id, area_m2: 100, total: 30000,
          created_by: null, created_at: now, updated_at: now,
          data: {
            stages: phases.map((label, i) => ({ id: `s${i}`, label, days: 2, assignee_id: null, rate: 50 })),
            fixed: [{ id: 'f', label: 'Aluguel', value: 4200 }], work_days: 21, hours_per_day: 8,
            indirect: [], extras: [], margin: 20, ref_m2: null, final_price: 30000, notes: '', project_id: project.id,
          },
        },
      );
      await page.goto(`${BASE}/projetos/${project.id}?aba=previsto`);
      await page.getByRole('tab', { name: 'Previsto × realizado', selected: true }).waitFor();
      await page.getByRole('link', { name: 'PRECIFICAÇÃO TESTE' }).waitFor();
      const row = page.locator(`[data-stage="${firstPhase}"]`);
      await row.waitFor();
      const text = (await row.innerText()).replace(/\s+/g, ' ');
      ok(text.includes('2 dias'), `dias previstos: ${text}`);
      ok(text.includes('16 h'), `16 h previstas: ${text}`);
      const h = minutes / 60;
      const shown = `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: h > 0 && h < 10 ? 1 : 0, minimumFractionDigits: h > 0 && h < 10 ? 1 : 0 }).format(h)} h`;
      ok(text.includes(shown), `horas lançadas ${shown}: ${text}`);
      eq(await page.locator('[data-stage]').count() >= phases.length, true, 'uma linha por etapa');
      await page.locator('[data-planned-summary]').waitFor();
    },
    page,
  );

  await s.step(
    'projeto sem precificação: escolher a precificação vincula ao projeto',
    async () => {
      const projects = await ls(page, 'projects');
      const other = projects.find((p) => p.id !== project.id);
      await page.goto(`${BASE}/projetos/${other.id}?aba=previsto`);
      await page.getByText('Este projeto ainda não tem precificação').waitFor();
      await page.getByRole('combobox', { name: 'Precificação do projeto' }).click();
      await page.getByRole('option', { name: /^PRECIFICAÇÃO TESTE/ }).click();
      await page.getByText(/Comparando com a precificação/).waitFor();
      eq((await ls(page, 'pricings')).find((p) => p.id === 'pr-e2e').data.project_id, other.id, 'precificação vinculada ao outro projeto');
    },
    page,
  );

  await s.step(
    'histórico: etapas concluídas sugerem os dias na Precificação',
    async () => {
      // Conclui todas as tarefas do projeto com horas e dá uma área a ele
      await patchTable(page, 'tasks', `rows.forEach((t) => { if (t.project_id === '${project.id}') t.status = 'done'; });`);
      await patchTable(page, 'projects', `rows.forEach((p) => { if (p.id === '${project.id}') p.area_m2 = 100; });`);
      const types = await ls(page, 'project_types');
      const type = types.find((t) => t.id === project.project_type_id);
      await page.goto(`${BASE}/precificacao/nova`);
      await page.getByLabel('Área da casa (m²)').fill('200');
      await page.getByRole('combobox', { name: 'Tipo de projeto' }).click();
      await page.getByRole('option', { name: type.name, exact: true }).click();
      const hint = page.locator('[data-stage-history]');
      await hint.getByText(/Histórico de 1 projeto/).waitFor();
      await hint.getByRole('button', { name: 'Usar os dias do histórico' }).click();
      const days = await page.getByLabel(/^Dias de /).evaluateAll((els) => els.map((e) => Number(e.value)));
      ok(days.some((d) => d > 0), `dias preenchidos pelo histórico: ${days.join(', ')}`);
    },
    page,
  );

  await ctx.close();
  return s;
}
