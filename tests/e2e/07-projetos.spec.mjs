// Projetos e tarefas: tarefas-modelo sem datas/duração, tarefas geradas sem data, início/
// duração/fim definidos no projeto, duração na gaveta, cronograma, cronômetro e comentário,
// "Usar como modelo" (tipo novo e substituir) e reuniões.
import { BASE, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('projetos');
  const { ctx, page } = await openApp(browser);
  let pid;
  let task;

  await s.step('setup', async () => {
    await setupAdmin(page);
    const ai = (await ls(page, 'project_types')).find((t) => t.name === 'Arquitetura e Interiores');
    pid = (await ls(page, 'projects')).find((p) => p.project_type_id === ai.id).id;
  }, page);

  await s.step(
    'tarefas-modelo sem datas e sem duração',
    async () => {
      await page.goto(BASE + '/configuracoes?aba=tipos');
      await page.getByText('Arquitetura e Interiores').first().click();
      await page.getByRole('button', { name: 'Coleta de Documentos', exact: true }).first().click();
      const d = page.getByRole('dialog');
      await d.waitFor();
      ok(!(await d.getByText(/Duração|em paralelo/).count()), 'o modelo ainda tem duração/paralelo');
      await d.getByRole('button', { name: /Salvar/ }).last().click();
      await d.waitFor({ state: 'detached' });
      const tpls = (await ls(page, 'task_templates')).filter((t) => t.title === 'Coleta de Documentos');
      ok(tpls.every((t) => t.duration_days === 0), 'duração do modelo');
    },
    page,
  );

  await s.step(
    'gerar tarefas do modelo: chegam sem data',
    async () => {
      await patchTable(page, 'tasks', 'return rows.filter((t) => t.project_id !== arg);', pid);
      await page.goto(`${BASE}/projetos/${pid}`);
      await page.getByRole('button', { name: /Gerar tarefas do modelo/ }).click();
      await page.getByText('LD - Levantamento de Dados').first().waitFor();
      const tasks = (await ls(page, 'tasks')).filter((t) => t.project_id === pid);
      ok(tasks.length >= 20, `poucas tarefas geradas: ${tasks.length}`);
      ok(tasks.every((t) => !t.start_date && !t.due_date), 'tarefas com data');
      task = tasks.find((t) => t.title === 'Coleta de Documentos');
    },
    page,
  );

  await s.step(
    'definir início e duração na tabela calcula o fim',
    async () => {
      await page.getByRole('button', { name: `Definir início de ${task.title}` }).click();
      await page.getByLabel(`Início de ${task.title}`).fill('2026-10-05');
      await page.getByRole('button', { name: `Definir duração de ${task.title}` }).click();
      await page.getByLabel(`Duração de ${task.title}`).fill('12');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const t2 = (await ls(page, 'tasks')).find((t) => t.id === task.id);
      ok(t2.start_date === '2026-10-05' && t2.due_date > '2026-10-16', `datas ${t2.start_date} → ${t2.due_date}`);
      await page.getByRole('button', { name: `Duração de ${task.title}: 12 dias` }).waitFor();
    },
    page,
  );

  await s.step(
    'mudar o fim recalcula a duração',
    async () => {
      await page.getByRole('button', { name: new RegExp(`^Fim de ${task.title}`) }).click();
      await page.getByLabel(`Fim de ${task.title}`).fill('2026-10-09');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: `Duração de ${task.title}: 5 dias` }).waitFor();
    },
    page,
  );

  await s.step(
    'duração na gaveta da tarefa',
    async () => {
      await page.getByRole('button', { name: task.title, exact: true }).first().click();
      const f = page.getByRole('dialog').getByLabel('Duração (dias úteis)');
      eq(await f.inputValue(), '5', 'duração na gaveta');
      await f.fill('3');
      await f.blur();
      await page.waitForTimeout(300);
      eq((await ls(page, 'tasks')).find((t) => t.id === task.id).due_date, '2026-10-07', 'fim após 3 dias');
    },
    page,
  );

  await s.step(
    'cronômetro e comentário na tarefa',
    async () => {
      const dr = page.getByRole('dialog');
      await dr.getByRole('button', { name: 'Iniciar cronômetro' }).click();
      await dr.getByRole('button', { name: /^Parar/ }).click();
      ok((await ls(page, 'time_entries')).some((e) => e.task_id === task.id), 'horas não lançadas');
      await dr.getByLabel('Novo comentário').fill('Documentos recebidos do cliente.');
      await page.keyboard.press('Enter');
      await dr.getByText('Documentos recebidos do cliente.').waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'cronograma do projeto',
    async () => {
      await page.getByRole('tab', { name: /^Cronograma/ }).click();
      await page.getByText('Coleta de Documentos').first().waitFor();
      await page.getByRole('tab', { name: /^Tarefas/ }).first().click();
    },
    page,
  );

  await s.step(
    'usar o projeto como modelo de um tipo novo',
    async () => {
      await page.getByRole('button', { name: 'Usar como modelo' }).click();
      const d = page.getByRole('dialog', { name: /Usar como modelo/ });
      await d.getByRole('radio', { name: 'Criar um tipo novo' }).click();
      await d.getByLabel('Nome do novo tipo').fill('Residencial completo');
      await d.getByRole('button', { name: 'Salvar modelo' }).click();
      await page.waitForURL(/configuracoes\?aba=tipos&tipo=/);
      const nt = (await ls(page, 'project_types')).find((t) => t.name === 'Residencial completo');
      const tpl = (await ls(page, 'task_templates')).filter((t) => t.project_type_id === nt.id);
      const tasks = (await ls(page, 'tasks')).filter((t) => t.project_id === pid);
      eq(tpl.length, tasks.length, 'modelos criados');
      ok(tpl.every((t) => t.duration_days === 0), 'modelo novo com duração');
    },
    page,
  );

  await s.step(
    'usar como modelo substituindo o tipo atual',
    async () => {
      await page.goto(`${BASE}/projetos/${pid}`);
      await page.getByRole('button', { name: 'Usar como modelo' }).click();
      const d = page.getByRole('dialog', { name: /Usar como modelo/ });
      await d.getByText(/serão substituídas/).waitFor();
      const ai = (await ls(page, 'project_types')).find((t) => t.name === 'Arquitetura e Interiores');
      const before = (await ls(page, 'task_templates')).filter((t) => t.project_type_id === ai.id).map((t) => t.id);
      await d.getByRole('button', { name: 'Salvar modelo' }).click();
      await page.waitForURL(/configuracoes/);
      const after = (await ls(page, 'task_templates')).filter((t) => t.project_type_id === ai.id);
      eq(after.length, before.length, 'quantidade de modelos');
      ok(!after.some((t) => before.includes(t.id)), 'modelos antigos ficaram');
    },
    page,
  );

  await s.step(
    'agendar reunião pelo Escritório',
    async () => {
      await page.goto(BASE + '/');
      await page.getByRole('button', { name: 'Reunião', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Assunto').fill('Apresentação do estudo preliminar');
      await d.getByRole('button', { name: 'Agendar' }).click();
      await d.waitFor({ state: 'detached' });
      ok((await ls(page, 'events')).some((e) => e.title === 'Apresentação do estudo preliminar'), 'reunião não salva');
    },
    page,
  );

  await ctx.close();
  return s;
}
