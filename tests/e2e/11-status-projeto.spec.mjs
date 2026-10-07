// Status do projeto: automático pelas tarefas, definido à mão (Obra) fica, volta ao automático,
// aviso ao concluir todas as tarefas (Finalizado ou Obra), status na lista de projetos e menu de
// status das últimas tarefas da tabela por etapas sem cortar; detalhes e ordenação da lista.
import { BASE, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('status-projeto');
  const { ctx, page } = await openApp(browser);
  let pid;

  const project = async () => (await ls(page, 'projects')).find((p) => p.id === pid);
  const statusBox = () => page.getByRole('combobox', { name: 'Status do projeto' });
  const pickStatus = async (label) => {
    await statusBox().click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.waitForTimeout(200);
  };

  await s.step('setup', async () => {
    await setupAdmin(page);
    const types = await ls(page, 'project_types');
    const interiores = types.find((t) => t.name === 'Interiores');
    pid = (await ls(page, 'projects')).find((p) => p.project_type_id === interiores.id && p.status === 'em_andamento').id;
  }, page);

  await s.step(
    'lista de projetos mostra o status de cada projeto',
    async () => {
      await page.goto(BASE + '/projetos');
      const row = page.locator(`a[href="/projetos/${pid}"]`);
      await row.getByText('Em andamento', { exact: true }).waitFor();
      // Detalhes sem abrir o projeto: responsável, tarefas, próxima tarefa, horas e honorários
      const facts = await row.locator('[data-project-facts]').innerText();
      for (const t of ['Responsável:', 'tarefas', 'Próxima:', 'registradas', 'Honorários:', 'recebidos']) ok(facts.includes(t), `faltou "${t}" em: ${facts}`);
      await page.getByRole('combobox', { name: 'Ordenar' }).click();
      await page.getByRole('option', { name: 'Nome', exact: true }).click();
      const names = await page.locator('ul > li a[href^="/projetos/"] .font-display').allInnerTexts();
      eq(names, [...names].sort((a, b) => a.localeCompare(b)), 'ordem por nome');
      await page.getByRole('tab', { name: /^Finalizados/ }).waitFor();
    },
    page,
  );

  await s.step(
    'status automático: segue as tarefas',
    async () => {
      await patchTable(page, 'tasks', "rows.forEach((t) => { if (t.project_id === arg) t.status = 'todo'; });", pid);
      await patchTable(page, 'projects', "rows.forEach((p) => { if (p.id === arg) { p.status = 'nao_iniciado'; p.status_manual = false; } });", pid);
      await page.goto(`${BASE}/projetos/${pid}`);
      const first = page.getByRole('button', { name: /^Status de / }).first();
      await first.click();
      await page.getByRole('button', { name: 'Em andamento', exact: true }).click();
      await page.waitForTimeout(300);
      eq((await project()).status, 'em_andamento', 'status depois da primeira tarefa');
    },
    page,
  );

  await s.step(
    'Obra definida à mão fica, mesmo com as tarefas mudando; "Automático" volta a seguir as tarefas',
    async () => {
      await pickStatus('Obra');
      eq([(await project()).status, (await project()).status_manual], ['obra', true], 'obra à mão');
      await page.getByRole('button', { name: /^Status de / }).first().click();
      await page.getByRole('button', { name: 'A fazer', exact: true }).click();
      await page.waitForTimeout(300);
      eq((await project()).status, 'obra', 'as tarefas mudaram o status manual');
      await page.goto(BASE + '/projetos');
      await page.locator(`a[href="/projetos/${pid}"]`).getByText('Obra', { exact: true }).waitFor();
      await page.goto(`${BASE}/projetos/${pid}`);
      await pickStatus('Automático (pelas tarefas)');
      eq([(await project()).status, (await project()).status_manual], ['nao_iniciado', false], 'de volta ao automático');
    },
    page,
  );

  await s.step(
    'menu de status da última tarefa aparece inteiro e funciona',
    async () => {
      await page.setViewportSize({ width: 1440, height: 700 });
      await patchTable(page, 'tasks', "const last = rows.filter((t) => t.project_id === arg).length; let i = 0; rows.forEach((t) => { if (t.project_id === arg) t.status = ++i < last ? 'done' : 'todo'; });", pid);
      await page.reload();
      const last = page.getByRole('button', { name: /^Status de .*: A fazer$/ });
      await last.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await last.click();
      const options = ['A fazer', 'Em andamento', 'Em revisão', 'Pausada', 'Concluída'];
      for (const o of options) {
        const b = await page.getByRole('button', { name: o, exact: true }).last().boundingBox();
        ok(b && b.y >= 0 && b.y + b.height <= 700, `opção "${o}" fora da tela (${b && Math.round(b.y)})`);
      }
      await page.getByRole('button', { name: 'Concluída', exact: true }).last().click();
      await page.waitForTimeout(300);
      ok((await ls(page, 'tasks')).filter((t) => t.project_id === pid).every((t) => t.status === 'done'), 'tarefa não concluída');
      await page.setViewportSize({ width: 1440, height: 950 });
    },
    page,
  );

  await s.step(
    'todas as tarefas concluídas: escolher Finalizado',
    async () => {
      const banner = page.getByRole('region', { name: 'Todas as tarefas concluídas' });
      await banner.waitFor();
      eq((await project()).status, 'em_andamento', 'status automático com tudo concluído');
      await banner.getByRole('button', { name: 'Finalizado' }).click();
      await banner.waitFor({ state: 'detached' });
      const p = await project();
      eq([p.status, p.status_manual, !!p.completed_at], ['concluido', true, true], 'finalizado');
      ok((await statusBox().innerText()).includes('Finalizado'), 'status no cabeçalho');
    },
    page,
  );

  await ctx.close();
  return s;
}
