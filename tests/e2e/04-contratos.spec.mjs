// Leitura de contrato (gratuita, no navegador): PDF com texto e Word preenchem fechamento,
// cliente, projeto e parcelas (o PDF fica nos documentos do projeto); foto sugere o Claude.ai e a resposta colada preenche tudo.
// Arquivos em fixtures/ são fictícios.
import { BASE, FIXTURES, eq, finishConvert, ls, ok, openApp, openWon, setupAdmin, spec } from './lib.mjs';

const values = (dialog) => dialog.locator('input:not([type=checkbox]):not([type=file])').evaluateAll((els) => els.map((e) => e.value));
const expectValues = async (dialog, list) => {
  const v = await values(dialog);
  for (const x of list) ok(v.includes(x), `faltou "${x}" em ${v.filter(Boolean).join(' | ')}`);
};

export default async function ({ browser }) {
  const s = spec('contratos');
  const { ctx, page } = await openApp(browser);
  let others = [];
  let clientId;

  await s.step('setup', async () => {
    await setupAdmin(page);
    const stages = await ls(page, 'lead_stages');
    others = (await ls(page, 'leads')).filter((l) => stages.find((x) => x.id === l.stage_id)?.kind === 'open' && !l.client_id && l.name !== 'Thiago Moreira').map((l) => l.name);
  }, page);

  await s.step(
    'arquivo .doc antigo dá erro claro',
    async () => {
      const d = await openWon(page, 'Thiago Moreira');
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'antigo.doc');
      await d.getByText(/\.doc antigos não são lidos/).waitFor();
    },
    page,
  );

  await s.step(
    'PDF com texto preenche valor, parcelas, cliente e projeto',
    async () => {
      const d = page.getByRole('dialog', { name: /Oportunidade ganha/ });
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-a.pdf');
      await d.getByText('Preenchido com contrato-a.pdf').waitFor({ timeout: 20000 });
      eq(await d.getByLabel('Valor fechado').inputValue(), '30.000,00', 'valor');
      await d.getByText(/Leitura automática gratuita/).waitFor();
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await c.getByText('Preenchido com contrato-a.pdf').waitFor();
      await expectValues(c, ['Thiago Moreira dos Santos', '529.982.247-25', '12.345.678-9', 'thiago.moreira@gmail.com', '(41) 99876-5432', 'Engenheiro civil', '80020-310', 'Rua XV de Novembro', '1500', 'apto 802', 'Centro', 'Curitiba']);
      await finishConvert(page, c);
      const lead = (await ls(page, 'leads')).find((l) => l.name === 'Thiago Moreira');
      const fin = (await ls(page, 'finance_entries')).filter((e) => e.lead_id === lead.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
      eq(fin.map((e) => [e.amount, e.due_date]), [[9000, '2026-10-10'], [12000, '2026-11-10'], [9000, '2026-12-10']], 'parcelas');
      const proj = (await ls(page, 'projects')).find((p) => p.client_id === lead.client_id);
      eq([proj.area_m2, proj.site_address], [185, 'Rua das Araucárias, nº 45, Batel, Curitiba/PR'], 'projeto');
      eq((proj.attachments ?? []).map((a) => a.name), ['contrato-a.pdf'], 'PDF nos documentos do projeto');
    },
    page,
  );

  await s.step(
    'Word com 10 parcelas mensais',
    async () => {
      const d = await openWon(page, others[0]);
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-b.docx');
      await d.getByText('Preenchido com contrato-b.docx').waitFor({ timeout: 20000 });
      eq(await d.getByLabel('Valor fechado').inputValue(), '10.000,00', 'valor');
      await d.getByText(/Soma: R\$\s10\.000,00/).waitFor();
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await c.waitFor();
      await expectValues(c, ['Mariana Duarte Lima', '111.444.777-35', 'Advogada', '1988-04-12', '80250-210', 'Água Verde']);
      // O contrato não traz e-mail: obrigatório, a pessoa completa
      await c.getByLabel('E-mail').fill('mariana@exemplo.com');
      await finishConvert(page, c);
      const lead = (await ls(page, 'leads')).find((l) => l.name === others[0]);
      const fin = (await ls(page, 'finance_entries')).filter((e) => e.lead_id === lead.id);
      eq([fin.length, fin.reduce((a, e) => a + e.amount, 0)], [10, 10000], 'parcelas mensais');
    },
    page,
  );

  await s.step(
    'foto: sugere o Claude.ai e a resposta colada preenche',
    async () => {
      const d = await openWon(page, others[1]);
      await d.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'foto.jpg');
      await d.getByText(/Fotos não são lidas pela leitura gratuita/).waitFor();
      await d.getByRole('button', { name: 'Copiar instrução' }).click();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      ok(/CONTRATANTE/.test(clip) && /"installments"/.test(clip), 'instrução copiada');
      const answer =
        'Aqui está:\n```json\n' +
        JSON.stringify({
          client: { name: 'Paula Reis', document: '390.533.447-05', rg: '', birth_date: '', email: 'paula@exemplo.com', phone: '41988887777', profession: 'Médica', cep: '80030000', street: 'Rua Ubaldino do Amaral', number: '900', complement: '', neighborhood: 'Alto da XV', city: 'Curitiba', state: 'PR' },
          contract: { total: 24000, signed_date: '2026-10-20', installments: [{ label: 'Assinatura', amount: 12000, percent: 50, due_date: '2026-10-20' }, { label: 'Entrega', amount: 12000, percent: 50, due_date: '' }] },
          project: { site_address: '', site_city: '', area_m2: 120, scope: '' },
          notes: '',
          warnings: [],
        }) +
        '\n```';
      await d.getByLabel('Resposta do Claude').fill(answer);
      await d.getByRole('button', { name: 'Preencher' }).click();
      await d.getByText('Preenchido com resposta do Claude.ai').waitFor();
      eq(await d.getByLabel('Valor fechado').inputValue(), '24.000,00', 'valor');
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await c.waitFor();
      await expectValues(c, ['Paula Reis', '390.533.447-05', '(41) 98888-7777', '80030-000']);
      await c.getByRole('button', { name: 'Cancelar' }).click();
    },
    page,
  );

  await s.step(
    'Virar cliente direto com PDF oferece salvar as parcelas',
    async () => {
      const d = await openWon(page, others[2]);
      await d.getByRole('button', { name: 'Marcar como ganho sem forma de pagamento' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await c.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-a.pdf');
      await c.getByText(/Salvar também a forma de pagamento do contrato: R\$\s30\.000,00/).waitFor({ timeout: 20000 });
      await finishConvert(page, c);
      const lead = (await ls(page, 'leads')).find((l) => l.name === others[2]);
      eq((await ls(page, 'finance_entries')).filter((e) => e.lead_id === lead.id).length, 3, 'parcelas');
      clientId = lead.client_id;
    },
    page,
  );

  await s.step(
    'Editar cliente com Word troca dados e parcelas',
    async () => {
      await page.goto(`${BASE}/clientes/${clientId}`);
      await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
      const m = page.getByRole('dialog', { name: /Editar cliente/ });
      await m.getByLabel('Arquivo do contrato').setInputFiles(FIXTURES + 'contrato-b.docx');
      await m.getByText('Preenchido com contrato-b.docx').waitFor({ timeout: 20000 });
      await m.getByRole('tab', { name: 'Contrato e pagamento' }).click();
      eq(await m.getByLabel('Valor fechado').inputValue(), '10.000,00', 'valor');
      await m.getByRole('button', { name: 'Salvar', exact: true }).click();
      await m.waitFor({ state: 'detached' });
      const client = (await ls(page, 'clients')).find((c) => c.id === clientId);
      eq([client.phone, client.profession], ['(41) 3333-2222', 'Advogada'], 'cliente');
      const lead = (await ls(page, 'leads')).find((l) => l.client_id === clientId);
      const fin = (await ls(page, 'finance_entries')).filter((e) => e.lead_id === lead.id);
      eq([fin.length, fin.reduce((a, e) => a + e.amount, 0)], [10, 10000], 'parcelas substituídas');
    },
    page,
  );

  await s.step(
    'sem a opção paga em Configurações',
    async () => {
      await page.goto(BASE + '/configuracoes');
      await page.getByRole('tab', { name: 'Backup' }).waitFor();
      ok(!(await page.getByRole('tab', { name: /Leitura de contratos/ }).count()), 'aba paga ainda existe');
    },
    page,
  );

  await ctx.close();
  return s;
}
