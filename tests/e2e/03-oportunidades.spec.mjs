// Oportunidades: funil padrão (Ganho / Não ganho no fim), filtros, arrastar entre etapas,
// anotações, Ganhou/Não ganhou/Reabrir, fechamento com valores em R$, edição sem duplicar,
// Virar cliente com parcelas ligadas ao projeto, lista e celular.
import { BASE, eq, fillClient, finishConvert, ls, ok, openApp, openWon, setupAdmin, spec } from './lib.mjs';

const stageOf = async (page, name) => {
  const l = (await ls(page, 'leads')).find((x) => x.name === name);
  return (await ls(page, 'lead_stages')).find((s) => s.id === l.stage_id);
};
const entriesOf = async (page, name) => {
  const l = (await ls(page, 'leads')).find((x) => x.name === name);
  return (await ls(page, 'finance_entries')).filter((e) => e.lead_id === l.id).sort((a, b) => a.due_date.localeCompare(b.due_date));
};

export default async function ({ browser }) {
  const s = spec('oportunidades');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'funil padrão de CRM com Ganho e Não ganho no fim',
    async () => {
      const stages = (await ls(page, 'lead_stages')).sort((a, b) => a.position - b.position);
      eq(stages.slice(-2).map((x) => [x.name, x.kind]), [['Ganho', 'won'], ['Não ganho', 'lost']], 'últimas etapas');
      ok((await ls(page, 'lead_sources')).length >= 10, 'origens padrão');
      await page.goto(BASE + '/oportunidades');
      await page.locator('[data-lead-card]').first().waitFor();
      const cols = await page.locator('section[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      eq(cols.slice(-2), ['Ganho', 'Não ganho'], 'colunas do quadro');
    },
    page,
  );

  await s.step(
    'filtro por origem e busca',
    async () => {
      const total = await page.locator('[data-lead-card]').count();
      await page.getByRole('combobox', { name: 'Origem' }).click();
      await page.getByRole('option', { name: 'Indicação de cliente', exact: true }).click();
      await page.waitForTimeout(200);
      const filtered = await page.locator('[data-lead-card]').count();
      ok(filtered > 0 && filtered < total, `filtro de origem: ${filtered} de ${total}`);
      await page.getByRole('button', { name: 'Limpar', exact: true }).click();
      await page.getByLabel('Buscar oportunidades').fill('curitiba');
      await page.waitForTimeout(200);
      ok((await page.locator('[data-lead-card]').count()) < total, 'busca não filtrou');
      await page.getByLabel('Limpar busca').click();
    },
    page,
  );

  await s.step(
    'arrastar o card muda a etapa',
    async () => {
      const card = page.locator('[data-lead-card]', { hasText: 'Mariana Duarte' });
      const col = page.locator('section[aria-label="Reunião agendada"]');
      const b1 = await card.boundingBox();
      const b2 = await col.boundingBox();
      await page.mouse.move(b1.x + 40, b1.y + 20);
      await page.mouse.down();
      await page.mouse.move(b1.x + 60, b1.y + 40, { steps: 5 });
      await page.mouse.move(b2.x + 100, Math.min(b2.y + b2.height - 40, 900), { steps: 10 });
      await page.mouse.up();
      await col.locator('[data-lead-card]', { hasText: 'Mariana Duarte' }).waitFor();
      eq((await stageOf(page, 'Mariana Duarte')).name, 'Reunião agendada', 'etapa salva');
    },
    page,
  );

  await s.step(
    'gaveta: registrar anotação no histórico',
    async () => {
      await page.locator('[data-lead-card]', { hasText: 'Thiago Moreira' }).click();
      const dr = page.getByRole('dialog');
      await dr.getByText('Próximo retorno').waitFor();
      await dr.getByPlaceholder('Registrar uma conversa ou anotação…').fill('Ligou pedindo revisão do valor.');
      await dr.getByRole('button', { name: 'Registrar', exact: true }).click();
      await dr.getByText('Ligou pedindo revisão do valor.').waitFor();
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'atalho "Ganhou" no card abre o fechamento e depois o Virar cliente',
    async () => {
      const card = page.locator('[data-lead-card]', { hasText: 'Escritório Vieira' });
      await card.hover();
      await card.getByRole('button', { name: 'Ganhou', exact: true }).click();
      const d = page.getByRole('dialog', { name: /Oportunidade ganha/ });
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await c.waitFor();
      eq((await stageOf(page, 'Escritório Vieira Advogados')).kind, 'won', 'etapa');
      eq((await entriesOf(page, 'Escritório Vieira Advogados')).length, 3, 'parcelas 30/40/30 no Financeiro');
      await c.getByRole('button', { name: 'Cancelar' }).click();
    },
    page,
  );

  await s.step(
    'Não ganhou com motivo e reabrir',
    async () => {
      await page.locator('[data-lead-card]', { hasText: 'Mariana Duarte' }).click();
      const dr = page.getByRole('dialog');
      await dr.getByText('Fechou negócio?').waitFor();
      await dr.getByRole('button', { name: 'Não ganhou', exact: true }).click();
      const m = page.getByRole('dialog', { name: 'Não ganhou' });
      await m.getByRole('button', { name: 'Confirmar não ganho' }).click();
      await m.waitFor({ state: 'detached' });
      eq((await stageOf(page, 'Mariana Duarte')).kind, 'lost', 'após não ganho');
      await page.getByRole('button', { name: 'Reabrir oportunidade' }).click();
      await page.waitForTimeout(300);
      eq((await stageOf(page, 'Mariana Duarte')).kind, 'open', 'após reabrir');
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'fechamento com valores em R$ calcula o percentual',
    async () => {
      const d = await openWon(page, 'Thiago Moreira');
      await d.getByLabel('Valor fechado').fill('4500000');
      await d.getByLabel('Valor da parcela 1').fill('1000000');
      eq(await d.getByLabel('Percentual da parcela 1').inputValue(), '22.22', '% da parcela 1');
      await d.getByLabel('Valor da parcela 3').fill('1700000');
      await d.getByText(/Soma: R\$\s45\.000,00 · 100%/).waitFor();
      await d.getByRole('button', { name: 'Salvar e marcar como ganho' }).click();
      await page.getByRole('dialog', { name: /Virar cliente/ }).waitFor();
      eq((await entriesOf(page, 'Thiago Moreira')).map((e) => e.amount), [10000, 18000, 17000], 'parcelas');
    },
    page,
  );

  await s.step(
    'Virar cliente: cliente, projeto e parcelas ligadas',
    async () => {
      const c = page.getByRole('dialog', { name: /Virar cliente/ });
      await fillClient(c, { document: '529.982.247-25', email: 'thiago@email.com', cep: '80010-000', street: 'Rua XV', number: '100', neighborhood: 'Centro', city: 'Curitiba' });
      await finishConvert(page, c);
      const lead = (await ls(page, 'leads')).find((l) => l.name === 'Thiago Moreira');
      const proj = (await ls(page, 'projects')).find((p) => p.lead_id === lead.id);
      ok(lead.client_id && proj, 'cliente/projeto não criados');
      const entries = await entriesOf(page, 'Thiago Moreira');
      ok(entries.every((e) => e.project_id === proj.id && e.client_id === lead.client_id), 'parcelas sem projeto/cliente');
    },
    page,
  );

  await s.step(
    'editar a forma de pagamento não duplica as parcelas',
    async () => {
      await page.goto(BASE + '/oportunidades');
      await page.locator('[data-lead-card]', { hasText: 'Thiago Moreira' }).click();
      await page.getByRole('dialog').getByText('Editar', { exact: true }).click();
      const m = page.getByRole('dialog', { name: /Forma de pagamento/ });
      await m.getByLabel('Valor da parcela 2').fill('2000000');
      await m.getByLabel('Valor fechado').fill('4700000');
      await m.getByRole('button', { name: 'Salvar forma de pagamento' }).click();
      await m.waitFor({ state: 'detached' });
      eq((await entriesOf(page, 'Thiago Moreira')).map((e) => e.amount), [10000, 20000, 17000], 'parcelas após editar');
      await page.keyboard.press('Escape');
    },
    page,
  );

  await s.step(
    'parcelas aparecem no A receber por mês do Financeiro',
    async () => {
      await page.goto(BASE + '/financeiro');
      const sec = page.locator('section[aria-labelledby="a-receber-mes"]');
      await sec.scrollIntoViewIfNeeded();
      await sec.getByText(/Thiago Moreira|Vieira/).first().waitFor({ state: 'attached' });
      await sec.getByText('Ver mês').first().click();
      await page.waitForURL(/mes=\d{4}-\d{2}/);
    },
    page,
  );

  await s.step(
    'configurações: Ganho e Não ganho fixos',
    async () => {
      await page.goto(BASE + '/configuracoes?aba=funil');
      await page.getByText('Fixa · Ganho').waitFor();
      await page.getByText('Fixa · Não ganho').waitFor();
    },
    page,
  );

  await s.step(
    'visão em lista',
    async () => {
      await page.goto(BASE + '/oportunidades');
      await page.getByRole('tab', { name: 'Lista' }).click();
      await page.getByText('Mariana Duarte').first().waitFor();
      await page.getByRole('tab', { name: 'Quadro' }).click();
    },
    page,
  );

  await s.step(
    'celular: etapas em abas e gaveta',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      const errs = [];
      mp.on('pageerror', (e) => errs.push(e.message));
      await mp.goto(BASE + '/oportunidades');
      await mp.getByRole('tab', { name: /Reunião agendada/ }).click();
      await mp.locator('[data-lead-card]:visible').first().click();
      await mp.getByRole('dialog').waitFor();
      await m.close();
      ok(!errs.length, errs.join(' | '));
    },
    page,
  );

  await ctx.close();
  return s;
}
