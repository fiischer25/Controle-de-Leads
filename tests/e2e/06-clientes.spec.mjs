// Clientes e contrato: editar tudo do cliente (telefone, contrato, origem), contrato com valores
// por parcela, financeiro na página do cliente (receber, lançar valor), contrato editado pelo
// projeto, parcela recebida bloqueia a troca e valores nos relatórios.
import { BASE, eq, fillClient, finishConvert, ls, ok, openApp, openWon, patchTable, setupAdmin, spec } from './lib.mjs';

const entriesOfLead = async (page, leadId) =>
  (await ls(page, 'finance_entries')).filter((e) => e.lead_id === leadId).sort((a, b) => a.due_date.localeCompare(b.due_date));

export default async function ({ browser }) {
  const s = spec('clientes');
  const { ctx, page } = await openApp(browser);
  let cid;

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'cliente sem oportunidade: telefone, contrato 50/50 e origem',
    async () => {
      // Café Aroma passa a ser um cliente cadastrado direto (sem oportunidade)
      const c = (await ls(page, 'clients')).find((x) => x.name.startsWith('Café Aroma'));
      cid = c.id;
      await patchTable(page, 'leads', 'rows.forEach((l) => { if (l.client_id === arg || l.id === arg2) l.client_id = null; });'.replace('arg2', JSON.stringify(c.lead_id)), cid);
      await patchTable(page, 'clients', 'rows.find((x) => x.id === arg).lead_id = null;', cid);
      await page.goto(`${BASE}/clientes/${cid}`);
      await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
      const m = page.getByRole('dialog', { name: /Editar cliente/ });
      await m.getByLabel('Telefone').fill('(41) 99999-0000');
      await m.getByRole('tab', { name: 'Contrato e pagamento' }).click();
      await m.getByLabel('Valor fechado').fill('3000000');
      await m.getByRole('combobox', { name: 'Modelo de parcelas' }).click();
      await page.getByRole('option', { name: '50% · 50%' }).click();
      await m.getByRole('tab', { name: 'Origem comercial' }).click();
      await m.getByRole('combobox', { name: 'Origem' }).click();
      await page.getByRole('option', { name: 'Indicação de cliente', exact: true }).click();
      await m.getByRole('button', { name: 'Salvar', exact: true }).click();
      await m.waitFor({ state: 'detached' });
      const client = (await ls(page, 'clients')).find((x) => x.id === cid);
      const lead = (await ls(page, 'leads')).find((l) => l.id === client.lead_id);
      const stage = (await ls(page, 'lead_stages')).find((x) => x.id === lead?.stage_id);
      eq([client.phone, stage?.kind, lead?.payment_plan?.total, !!lead?.source_id], ['(41) 99999-0000', 'won', 30000, true], 'cliente/oportunidade');
      eq((await entriesOfLead(page, lead.id)).map((e) => e.amount), [15000, 15000], 'parcelas');
    },
    page,
  );

  await s.step(
    'contrato com valor em R$ por parcela',
    async () => {
      await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
      const m = page.getByRole('dialog', { name: /Editar cliente/ });
      await m.getByRole('tab', { name: 'Contrato e pagamento' }).click();
      await m.getByLabel('Valor fechado').fill('3200000');
      await m.getByLabel('Valor da parcela 1').fill('2000000');
      await m.getByLabel('Valor da parcela 2').fill('1200000');
      await m.getByRole('button', { name: 'Salvar', exact: true }).click();
      await m.waitFor({ state: 'detached' });
      const client = (await ls(page, 'clients')).find((x) => x.id === cid);
      eq((await entriesOfLead(page, client.lead_id)).map((e) => e.amount), [20000, 12000], 'parcelas');
    },
    page,
  );

  await s.step(
    'página do cliente: receber parcela e lançar valor',
    async () => {
      const sec = page.locator('section[aria-labelledby="cliente-financeiro"]');
      await sec.getByText('Contrato', { exact: true }).waitFor();
      const before = await sec.locator('li').count();
      await sec.getByRole('button', { name: /Marcar .* como recebido/ }).first().click();
      await page.waitForTimeout(300);
      ok((await ls(page, 'finance_entries')).some((e) => e.client_id === cid && e.paid_at && e.amount === 20000), 'parcela não recebida');
      await sec.getByText('Lançar valor').click();
      const m = page.getByRole('dialog');
      await m.getByLabel('Valor').fill('300000');
      await m.getByRole('button', { name: /^(Salvar|Lançar)$/ }).click();
      await m.waitFor({ state: 'detached' });
      eq(await sec.locator('li').count(), before + 1, 'linhas após lançar');
    },
    page,
  );

  let leadId;
  await s.step(
    'ganho com valores, Virar cliente e editar o contrato pelo projeto',
    async () => {
      const d = await openWon(page, 'Thiago Moreira');
      await d.getByLabel('Valor fechado').fill('4500000');
      await d.getByLabel('Valor da parcela 1').fill('1000000');
      await d.getByLabel('Valor da parcela 3').fill('1700000');
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await fillClient(c, { document: '529.982.247-25', email: 'thiago@email.com', cep: '80010-000', street: 'Rua XV', number: '100', neighborhood: 'Centro', city: 'Curitiba' });
      await finishConvert(page, c);
      leadId = (await ls(page, 'leads')).find((l) => l.name === 'Thiago Moreira').id;
      await page.getByRole('tab', { name: 'Informações' }).click();
      await page.locator('section[aria-labelledby="info-contrato"]').getByText('Editar').click();
      const m = page.getByRole('dialog', { name: /Forma de pagamento/ });
      await m.getByText(/Atualizar as 3 parcelas/).waitFor();
      await m.getByLabel('Valor fechado').fill('4700000');
      await m.getByLabel('Valor da parcela 1').fill('1200000');
      await m.getByLabel('Valor da parcela 3').fill('1620000');
      await m.getByRole('button', { name: 'Salvar forma de pagamento' }).click();
      await m.waitFor({ state: 'detached' });
      eq((await entriesOfLead(page, leadId)).map((e) => e.amount), [12000, 18800, 16200], 'parcelas após editar');
    },
    page,
  );

  await s.step(
    'parcela já recebida bloqueia a troca das parcelas',
    async () => {
      const first = (await entriesOfLead(page, leadId))[0];
      await patchTable(page, 'finance_entries', 'const e = rows.find((x) => x.id === arg); e.paid_at = e.due_date;', first.id);
      await page.reload();
      await page.getByRole('tab', { name: 'Informações' }).click();
      await page.locator('section[aria-labelledby="info-contrato"]').getByText('Editar').click();
      const m = page.getByRole('dialog', { name: /Forma de pagamento/ });
      await m.getByText(/já foram recebidas/).waitFor();
      await m.getByRole('button', { name: 'Cancelar' }).click();
    },
    page,
  );

  await s.step(
    'editar o cliente pelo projeto',
    async () => {
      await page.locator('section[aria-labelledby="info-cliente"]').getByText('Editar').click();
      await page.getByRole('dialog', { name: /Editar cliente/ }).waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'relatórios mostram os valores fechados e recebidos',
    async () => {
      await page.goto(BASE + '/relatorios');
      const sec = page.locator('section[aria-labelledby="valores"]');
      await sec.scrollIntoViewIfNeeded();
      for (const t of ['Contratos fechados', 'Recebido no período', 'A receber']) await sec.getByText(t, { exact: true }).waitFor();
    },
    page,
  );

  await ctx.close();
  return s;
}
