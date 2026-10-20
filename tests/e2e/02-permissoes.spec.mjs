// Acessos por módulo: cadastro de membro, menu, rotas bloqueadas, tarefas próprias, busca
// e o que cada pessoa vê no Meu painel (Comercial e Financeiro só com o módulo).
import { BASE, DEMO_MEMBER, eq, navLabels, ok, openApp, patchTable, setupAdmin, signIn, signOut, spec } from './lib.mjs';

const PAULA = { name: 'Paula Souza', email: 'paula@airos.com.br', password: 'segredo123' };

export default async function ({ browser }) {
  const s = spec('permissoes');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'cadastrar membro só com Relatórios',
    async () => {
      await page.goto(BASE + '/equipe');
      await page.getByRole('button', { name: /Membro/ }).first().click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Nome completo').fill(PAULA.name);
      await d.getByLabel('E-mail de acesso').fill(PAULA.email);
      await d.getByLabel('Senha inicial').fill(PAULA.password);
      // Padrão: Projetos, Comercial, Relatórios e Equipe; desmarca os que não terá
      for (const m of ['Projetos e tarefas', 'Oportunidades e clientes', 'Equipe']) await d.getByText(m, { exact: true }).click();
      await d.getByRole('button', { name: 'Cadastrar membro' }).click();
      await d.waitFor({ state: 'detached' });
      const p = (await page.evaluate(() => JSON.parse(localStorage.getItem('airos:v1:profiles')))).find((x) => x.email === PAULA.email);
      eq(p.permissions, ['relatorios'], 'acessos salvos');
    },
    page,
  );

  await s.step(
    'membro restrito: menu só com o que pode',
    async () => {
      await signOut(page);
      await signIn(page, PAULA);
      const nav = await navLabels(page);
      for (const hidden of ['Escritório', 'Projetos', 'Oportunidades', 'Clientes', 'Financeiro', 'Equipe', 'Configurações']) ok(!nav.includes(hidden), `menu mostra ${hidden}: ${nav.join(', ')}`);
      ok(nav.includes('Relatórios') && nav.includes('Meu painel'), 'menu sem Relatórios/Meu painel: ' + nav.join(', '));
    },
    page,
  );

  await s.step(
    'rotas bloqueadas voltam para o Meu painel',
    async () => {
      for (const r of ['/oportunidades', '/clientes', '/projetos', '/financeiro', '/equipe', '/configuracoes']) {
        await page.goto(BASE + r);
        await page.waitForURL((u) => !u.pathname.startsWith(r), { timeout: 5000 });
        await page.getByRole('heading', { level: 1, name: /, Paula$/ }).waitFor();
      }
    },
    page,
  );

  await s.step(
    'relatórios sem a parte comercial',
    async () => {
      await page.goto(BASE + '/relatorios');
      await page.getByRole('heading', { level: 1, name: 'Relatórios' }).waitFor();
      ok(!(await page.getByText('Como os clientes chegam').count()), 'seção comercial visível');
    },
    page,
  );

  await s.step(
    'tarefas: só as próprias, sem filtro de pessoa',
    async () => {
      await page.goto(BASE + '/tarefas');
      await page.getByRole('heading', { level: 1, name: 'Minhas tarefas' }).waitFor();
      ok(!(await page.getByRole('combobox', { name: 'Pessoa' }).count()), 'filtro de pessoa visível');
    },
    page,
  );

  await s.step(
    'busca rápida sem oportunidades e clientes',
    async () => {
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox', { name: 'Busca rápida' }).waitFor();
      ok((await page.getByRole('combobox', { name: 'Busca rápida' }).getAttribute('placeholder')) === 'Buscar nas minhas tarefas…', 'busca oferece outras áreas');
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'Meu painel sem Comercial e sem Financeiro',
    async () => {
      await page.goto(BASE + '/meu-painel');
      await page.getByRole('heading', { name: 'Minhas tarefas' }).waitFor();
      ok(!(await page.getByRole('heading', { name: 'Meu comercial' }).count()), 'Meu comercial visível');
      ok(!(await page.getByText(/^Financeiro · /).count()), 'Financeiro visível');
    },
    page,
  );

  await s.step(
    'celular: barra inferior e menu Mais',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', storageState: await ctx.storageState() });
      const mp = await m.newPage();
      await mp.goto(BASE + '/');
      await mp.getByRole('heading', { level: 1, name: /, Paula$/ }).waitFor();
      await mp.getByRole('button', { name: 'Mais' }).click();
      await mp.getByRole('dialog').waitFor();
      ok(!(await mp.getByRole('dialog').getByText('Financeiro').count()), 'Financeiro no menu do celular');
      await m.close();
    },
    page,
  );

  await s.step(
    'membro padrão: Meu comercial sim, Financeiro não',
    async () => {
      await signOut(page, PAULA.name);
      await signIn(page, DEMO_MEMBER);
      await page.goto(BASE + '/meu-painel');
      await page.getByRole('heading', { name: 'Meu comercial' }).waitFor();
      ok(!(await page.getByText(/^Financeiro · /).count()), 'Financeiro visível');
      const p = (await page.evaluate(() => JSON.parse(localStorage.getItem('airos:v1:projects'))))[0];
      await page.goto(`${BASE}/projetos/${p.id}`);
      await page.getByRole('tab', { name: /^Tarefas/ }).first().waitFor();
      ok(!(await page.getByRole('tab', { name: 'Financeiro' }).count()), 'aba Financeiro do projeto visível');
    },
    page,
  );

  await s.step(
    'membro com Financeiro vê o bloco no Meu painel e a tela Financeiro',
    async () => {
      await patchTable(page, 'profiles', "rows.find((p) => p.email === arg).permissions = ['projetos', 'financeiro'];", DEMO_MEMBER.email);
      await page.goto(BASE + '/meu-painel');
      await page.getByText(/^Financeiro · /).waitFor();
      ok(!(await page.getByRole('heading', { name: 'Meu comercial' }).count()), 'Meu comercial sem o módulo');
      await page.goto(BASE + '/financeiro');
      await page.getByRole('heading', { level: 1, name: 'Financeiro' }).waitFor();
    },
    page,
  );

  await ctx.close();
  return s;
}
