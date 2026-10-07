// Novo projeto e Novo cliente com o contrato em PDF: cliente novo abre o cadastro já preenchido,
// cliente existente é achado pelo CPF, o projeto recebe área/endereço, as parcelas vão para o
// Financeiro ligadas ao projeto e o PDF fica nos documentos. Arquivos em fixtures/ são fictícios.
import { ADMIN, BASE, FIXTURES, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

const values = (dialog) => dialog.locator('input:not([type=checkbox]):not([type=file])').evaluateAll((els) => els.map((e) => e.value));
const expectValues = async (dialog, list) => {
  const v = await values(dialog);
  for (const x of list) ok(v.includes(x), `faltou "${x}" em ${v.filter(Boolean).join(' | ')}`);
};

async function openNewProject(page) {
  await page.goto(BASE + '/projetos');
  await page.getByRole('button', { name: 'Projeto', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Novo projeto' });
  await d.waitFor();
  return d;
}

/** Tipo e responsável (o resto veio do contrato) e cria. Devolve o projeto salvo. */
async function finishProject(page, d) {
  await d.getByRole('combobox', { name: 'Tipo de projeto' }).click();
  await page.getByRole('option', { name: 'Interiores', exact: true }).click();
  await d.getByText(/^Selecione/).first().click();
  await page.getByRole('option', { name: new RegExp(ADMIN.name.split(' ')[0]) }).first().click();
  await d.getByRole('button', { name: 'Criar projeto' }).click();
  await page.waitForURL(/projetos\/[^/?]+$/);
  const id = new URL(page.url()).pathname.split('/').pop();
  return (await ls(page, 'projects')).find((p) => p.id === id);
}

const entriesOf = async (page, projectId) =>
  (await ls(page, 'finance_entries')).filter((e) => e.project_id === projectId).sort((a, b) => a.due_date.localeCompare(b.due_date));

export default async function ({ browser }) {
  const s = spec('novo-projeto');
  const { ctx, page } = await openApp(browser);
  let first;

  await s.step('setup', async () => {
    await setupAdmin(page);
    // Nenhum cliente da demonstração com o CPF do contrato-a
    await patchTable(page, 'clients', "rows.forEach((c) => { if ((c.document || '').replace(/\\D/g, '') === '52998224725') c.document = ''; });");
    await page.reload();
  }, page);

  await s.step(
    'Novo projeto com contrato de quem não é cliente: cadastro preenchido, parcelas e PDF no projeto',
    async () => {
      const d = await openNewProject(page);
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-a.pdf');
      const c = page.getByRole('dialog', { name: 'Novo cliente' });
      await c.getByText('Preenchido com contrato-a.pdf').waitFor({ timeout: 20000 });
      await expectValues(c, ['Thiago Moreira dos Santos', '529.982.247-25', 'thiago.moreira@gmail.com', '80020-310', 'Rua XV de Novembro', '1500']);
      await c.getByRole('button', { name: 'Salvar cliente' }).click();
      await c.waitFor({ state: 'detached' });
      ok((await d.getByRole('combobox', { name: 'Cliente' }).innerText()).includes('Thiago Moreira dos Santos'), 'cliente não selecionado');
      // Honorários preenchidos com o contrato, lançados sem precisar marcar nada
      await d.getByRole('heading', { name: 'Honorários' }).waitFor();
      eq(await d.getByLabel('Valor fechado').inputValue(), '30.000,00', 'valor dos honorários');
      eq(await d.getByLabel('Área (m²)').inputValue(), '185', 'área');
      first = await finishProject(page, d);
      const client = (await ls(page, 'clients')).find((x) => x.name === 'Thiago Moreira dos Santos');
      eq([first.client_id, first.area_m2, first.site_address], [client.id, 185, 'Rua das Araucárias, nº 45, Batel, Curitiba/PR'], 'projeto');
      eq((await entriesOf(page, first.id)).map((e) => [e.amount, e.due_date]), [[9000, '2026-10-10'], [12000, '2026-11-10'], [9000, '2026-12-10']], 'parcelas do projeto');
      const lead = (await ls(page, 'leads')).find((l) => l.id === first.lead_id);
      eq(lead?.client_id, client.id, 'oportunidade do contrato');
      eq((first.attachments ?? []).map((a) => a.name), ['contrato-a.pdf'], 'PDF no projeto');
      ok(await page.evaluate((p) => !!localStorage.getItem('airos:v1:file:task-files/' + p), first.attachments[0].path), 'arquivo não guardado');
      await page.getByRole('tab', { name: 'Informações' }).click();
      await page.locator('section[aria-labelledby="info-documentos"]').getByText('contrato-a.pdf').waitFor();
    },
    page,
  );

  await s.step(
    'segundo projeto do mesmo cliente: o contrato acha o cliente pelo CPF',
    async () => {
      const d = await openNewProject(page);
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-a.pdf');
      await d.getByText(/já é cliente \(mesmo CPF\/CNPJ do contrato\)/).waitFor({ timeout: 20000 });
      eq(await d.getByLabel('Valor fechado').inputValue(), '30.000,00', 'valor dos honorários');
      ok(!(await page.getByRole('dialog', { name: 'Novo cliente' }).count()), 'abriu o Novo cliente');
      const second = await finishProject(page, d);
      eq(second.client_id, first.client_id, 'cliente');
      ok(second.lead_id && second.lead_id !== first.lead_id, 'contrato novo em outra oportunidade');
      eq((await entriesOf(page, second.id)).length, 3, 'parcelas do segundo projeto');
      eq((await entriesOf(page, first.id)).length, 3, 'parcelas do primeiro projeto continuam');
      const client = (await ls(page, 'clients')).find((x) => x.id === first.client_id);
      eq(client.lead_id, first.lead_id, 'cliente segue no primeiro contrato');
    },
    page,
  );

  await s.step(
    'cliente sem CPF com o mesmo nome: selecionado e o cadastro é completado com o contrato',
    async () => {
      // Como um cliente vindo de uma oportunidade só com nome e telefone
      await patchTable(page, 'clients', "rows.forEach((c) => { if (c.id === arg) { c.document = ''; c.cep = ''; c.street = ''; c.number = ''; c.profession = ''; } });", first.client_id);
      await page.reload();
      const d = await openNewProject(page);
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-a.pdf');
      await d.getByText(/já é cliente \(mesmo nome do contrato\)/).waitFor({ timeout: 20000 });
      await d.getByText(/o cadastro é completado com o que falta: CPF\/CNPJ, profissão, endereço/).waitFor();
      ok(!(await page.getByRole('dialog', { name: 'Novo cliente' }).count()), 'abriu o Novo cliente');
      const third = await finishProject(page, d);
      eq(third.client_id, first.client_id, 'cliente');
      const c = (await ls(page, 'clients')).find((x) => x.id === first.client_id);
      eq([c.document, c.cep, c.street, c.number, c.profession], ['529.982.247-25', '80020-310', 'Rua XV de Novembro', '1500', 'Engenheiro civil'], 'cadastro completado');
    },
    page,
  );

  await s.step(
    'Novo projeto sem contrato: honorários definidos na hora e conferidos antes de criar',
    async () => {
      const d = await openNewProject(page);
      await d.getByRole('combobox', { name: 'Cliente' }).click();
      await page.getByRole('option', { name: /^Beatriz Fontana/ }).click();
      await d.getByRole('button', { name: /Definir os honorários agora/ }).click();
      // Sem valor não cria: avisa na seção
      await d.getByRole('combobox', { name: 'Tipo de projeto' }).click();
      await page.getByRole('option', { name: 'Interiores', exact: true }).click();
      await d.getByText(/^Selecione/).first().click();
      await page.getByRole('option', { name: new RegExp(ADMIN.name.split(' ')[0]) }).first().click();
      await d.getByRole('button', { name: 'Criar projeto' }).click();
      await d.locator('#honorarios-do-projeto .text-danger-fg').first().waitFor();
      ok(await d.count(), 'criou sem o valor dos honorários');
      await d.getByLabel('Valor fechado').fill('20.000,00');
      await d.getByRole('button', { name: 'Criar projeto' }).click();
      await page.waitForURL(/projetos\/[^/?]+$/);
      const id = new URL(page.url()).pathname.split('/').pop();
      const fin = await entriesOf(page, id);
      eq([fin.length, fin.reduce((a, e) => a + e.amount, 0)], [3, 20000], 'honorários lançados');
      ok(fin.every((e) => e.kind === 'receita' && !e.paid_at), 'parcelas a receber');
    },
    page,
  );

  await s.step(
    'projeto já em andamento: parcelas com data passada entram recebidas no mês de cada uma',
    async () => {
      const day = (n) => new Date(Date.now() + n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const d = await openNewProject(page);
      await d.getByRole('combobox', { name: 'Cliente' }).click();
      await page.getByRole('option', { name: /^Sofia Almeida/ }).click();
      await d.getByRole('button', { name: /Definir os honorários agora/ }).click();
      await d.getByLabel('Valor fechado').fill('30.000,00');
      await d.getByLabel('Primeiro vencimento').fill(day(-75));
      await d.getByText(/parcelas com data já passada já foram recebidas/).waitFor();
      const p = await finishProject(page, d);
      const fin = await entriesOf(page, p.id);
      eq(fin.length, 3, 'parcelas');
      for (const e of fin) eq(e.paid_at, e.due_date < day(0) ? e.due_date : null, `parcela de ${e.due_date}`);
      ok(fin.some((e) => e.paid_at), 'nenhuma recebida');
    },
    page,
  );

  await s.step(
    'Novo cliente em Clientes com o contrato lança as parcelas',
    async () => {
      await page.goto(BASE + '/clientes');
      await page.getByRole('button', { name: 'Cliente', exact: true }).click();
      const c = page.getByRole('dialog', { name: 'Novo cliente' });
      await c.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-b.docx');
      await c.getByText('Preenchido com contrato-b.docx').waitFor({ timeout: 20000 });
      await c.getByText(/Salvar também a forma de pagamento do contrato: R\$\s10\.000,00/).waitFor();
      // O contrato não traz e-mail: obrigatório, a pessoa completa
      await c.getByLabel('E-mail').fill('mariana@exemplo.com');
      await c.getByRole('button', { name: 'Salvar cliente' }).click();
      await page.waitForURL(/clientes\/[^/?]+$/);
      const id = new URL(page.url()).pathname.split('/').pop();
      eq((await ls(page, 'clients')).find((x) => x.id === id)?.name, 'Mariana Duarte Lima', 'cliente');
      const fin = (await ls(page, 'finance_entries')).filter((e) => e.client_id === id);
      eq([fin.length, fin.reduce((a, e) => a + e.amount, 0)], [10, 10000], 'parcelas');
    },
    page,
  );

  await ctx.close();
  return s;
}
