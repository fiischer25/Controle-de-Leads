// Navegação: todas as telas abrem sem erro, abas, gavetas, busca (⌘K), camadas com Esc,
// modo escuro e menus do celular.
import { BASE, eq, ls, ok, openApp, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('navegacao');
  const { ctx, page } = await openApp(browser);

  await s.step('primeiro acesso cria o administrador e abre o Escritório', () => setupAdmin(page), page);

  const routes = [
    ['/', 'Dashboard do escritório'],
    ['/meu-painel', /^Boa (tarde|noite|dia|madrugada)|^Bom dia/],
    ['/projetos', 'Projetos'],
    ['/tarefas', 'Minhas tarefas'],
    ['/tarefas?aba=atencao', 'Pede sua atenção'],
    ['/oportunidades', 'Oportunidades'],
    ['/clientes', 'Clientes'],
    ['/financeiro', 'Financeiro'],
    ['/relatorios', 'Relatórios'],
    ['/equipe', 'Equipe'],
    ['/configuracoes', 'Configurações'],
    ['/perfil', 'Meu perfil'],
  ];
  for (const [path, heading] of routes) {
    await s.step(
      `tela ${path} abre`,
      async () => {
        await page.goto(BASE + path);
        await page.getByRole('heading', { level: 1, name: heading }).first().waitFor();
      },
      page,
    );
  }

  await s.step(
    'detalhe do projeto e todas as abas',
    async () => {
      const p = (await ls(page, 'projects'))[0];
      await page.goto(`${BASE}/projetos/${p.id}`);
      for (const tab of ['Cronograma', 'Equipe e horas', 'Informações', 'Financeiro', 'Atividade', 'Tarefas']) {
        await page.getByRole('tab', { name: new RegExp('^' + tab) }).first().click();
        await page.waitForTimeout(250);
      }
    },
    page,
  );

  await s.step(
    'detalhe do cliente',
    async () => {
      const c = (await ls(page, 'clients'))[0];
      await page.goto(`${BASE}/clientes/${c.id}`);
      await page.getByRole('heading', { name: 'Histórico comercial' }).waitFor();
      await page.getByRole('heading', { name: 'Financeiro' }).waitFor();
    },
    page,
  );

  await s.step(
    'gaveta da tarefa abre e fecha com Esc',
    async () => {
      await page.goto(BASE + '/tarefas');
      await page.locator('main [role=button], main button').filter({ hasText: /\S/ }).first().waitFor();
      const t = (await ls(page, 'tasks')).find((x) => x.status !== 'done' && x.assignee_id);
      await page.goto(`${BASE}/tarefas?tarefa=${t.id}`);
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    },
    page,
  );

  await s.step(
    'busca rápida (Ctrl+K) encontra um projeto',
    async () => {
      await page.goto(BASE + '/');
      await page.getByRole('heading', { name: 'Dashboard do escritório' }).waitFor();
      await page.keyboard.press('Control+k');
      const input = page.getByRole('combobox', { name: 'Busca rápida' });
      await input.waitFor();
      const p = (await ls(page, 'projects'))[0];
      await input.fill(p.name);
      await page.getByRole('option', { name: new RegExp(p.name.replace(/\./g, '\\.')) }).first().waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'Esc fecha só a camada de cima (lista dentro do modal)',
    async () => {
      await page.goto(BASE + '/oportunidades');
      await page.locator('[data-lead-card]').first().click();
      const drawer = page.getByRole('dialog');
      await drawer.getByRole('button', { name: 'Registrar contato' }).click();
      await page.getByText('O que foi conversado?').waitFor();
      await page.keyboard.press('Escape');
      await page.getByText('O que foi conversado?').waitFor({ state: 'detached' });
      ok(await page.getByRole('dialog').count(), 'a gaveta fechou junto com o modal');
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'modo escuro aplica o tema',
    async () => {
      await page.evaluate(() => localStorage.setItem('airos:theme', 'dark'));
      await page.goto(BASE + '/');
      await page.getByRole('heading', { name: 'Dashboard do escritório' }).waitFor();
      eq(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'classe dark');
      await page.evaluate(() => localStorage.setItem('airos:theme', 'light'));
    },
    page,
  );

  await s.step(
    'celular: menu "Mais" e lançar horas',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      const errs = [];
      mp.on('pageerror', (e) => errs.push(e.message));
      await mp.goto(BASE + '/');
      await mp.getByRole('heading', { name: 'Dashboard do escritório' }).waitFor();
      await mp.getByRole('button', { name: 'Mais' }).click();
      await mp.getByRole('dialog').getByText('Configurações').waitFor();
      await mp.keyboard.press('Escape');
      await mp.goto(BASE + '/oportunidades');
      await mp.locator('[data-lead-card]').first().waitFor({ state: 'attached' });
      await m.close();
      ok(!errs.length, 'erro no celular: ' + errs.join(' | '));
    },
    page,
  );

  await ctx.close();
  return s;
}
