// Gestão → Precificação: custos fixos puxados do Financeiro (despesas mensais), preço pelos dias
// (custo do dia do escritório + custo/hora de quem faz cada etapa), adicionais, indiretos em % e
// lucro; R$/m² e comparação com o m²; valor arredondado; salvar na lista e na oportunidade.
import { BASE, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('precificacao');
  const { ctx, page } = await openApp(browser);
  let id;

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'menu Gestão → Precificação e lista vazia',
    async () => {
      await page.locator('nav[aria-label="Navegação principal"]').getByTitle('Precificação').click();
      await page.getByRole('heading', { level: 1, name: 'Precificação' }).waitFor();
      await page.getByText('Nenhuma precificação ainda').waitFor();
    },
    page,
  );

  await s.step(
    'custos fixos vêm do Financeiro: despesas mensais, salários fora do custo do dia (sem duplicidade) e sem impostos',
    async () => {
      await page.getByRole('button', { name: 'Nova precificação' }).click();
      const fixed = page.getByRole('region', { name: /Custos fixos/ });
      await fixed.locator('[data-fixed-source]').getByText(/repetem todo mês/).waitFor();
      const labels = await fixed.getByLabel('Nome do custo fixo').evaluateAll((els) => els.map((e) => e.value));
      for (const l of ['Aluguel da sala', 'Softwares (Revit, SketchUp, Adobe)', 'Honorários do contador', 'Energia e internet']) ok(labels.includes(l), `faltou ${l}: ${labels.join(', ')}`);
      // Salário aparece marcado e fora do custo do dia: já está no custo de quem faz cada etapa
      ok(labels.includes('Folha de pagamento'), 'folha de pagamento listada');
      const folha = fixed.locator('li', { has: page.locator('input[value="Folha de pagamento"]') });
      eq(await folha.locator('[data-labor]').getAttribute('data-labor'), 'fora', 'folha fora do custo do dia');
      ok((await fixed.locator('[data-fixed-excluded]').innerText()).replace(/\s/g, ' ').includes('R$ 18.500,00'), 'salários fora sem duplicidade');
      ok(!labels.includes('Simples Nacional'), 'impostos entram em % sobre o preço');
      eq(await fixed.getByLabel('Valor por mês de Aluguel da sala').inputValue(), '3.800,00', 'valor do aluguel');
      // 3.800 + 1.290 + 650 + 480 = 6.220 ÷ 21 dias
      await fixed.locator('[data-day-cost]').getByText('R$ 296,19 por dia').waitFor();
    },
    page,
  );

  await s.step(
    'precificar pelos dias com quem faz cada etapa e comparar com o m²',
    async () => {
      await page.getByRole('textbox', { name: /^Nome/ }).first().fill('casa teste');
      await page.getByLabel('Área da casa (m²)').fill('185');
      await page.getByRole('combobox', { name: 'Tipo de projeto' }).click();
      await page.getByRole('option', { name: 'Interiores', exact: true }).click();
      // Custos fixos: um só, R$ 21.000 por mês ÷ 21 dias = R$ 1.000 por dia
      const fixed = page.getByRole('region', { name: /Custos fixos/ });
      while (await fixed.getByRole('button', { name: /^Remover/ }).count()) await fixed.getByRole('button', { name: /^Remover/ }).first().click();
      await fixed.getByRole('button', { name: 'Custo fixo' }).click();
      await fixed.getByLabel('Nome do custo fixo').fill('Escritório');
      await fixed.getByLabel('Valor por mês de Escritório').fill('2100000');
      await fixed.locator('[data-day-cost]').getByText('R$ 1.000,00 por dia').waitFor();
      // 30 dias: Ana (R$ 85/h) 10 dias, Bruno (R$ 70/h) 8 dias, Carla (R$ 60/h) 12 dias, 8 h por dia
      const stages = page.getByRole('region', { name: /Etapas e dias/ });
      const days = stages.getByLabel(/^Dias de /);
      const n = await days.count();
      for (let i = 0; i < n; i++) await days.nth(i).fill(['10', '8', '12'][i] ?? '0');
      // Custo de cada pessoa por dia (custo/hora × 8 h)
      await stages.getByRole('combobox', { name: /^Quem faz / }).first().click();
      await page.getByRole('option', { name: /^Ana Ribeiro · R\$\s680,00\/dia$/ }).waitFor();
      await page.keyboard.press('Escape');
      for (const [i, who] of [[0, /^Ana Ribeiro/], [1, /^Bruno Carvalho/], [2, /^Carla Menezes/]]) {
        await stages.getByRole('combobox', { name: /^Quem faz / }).nth(i).click();
        await page.getByRole('option', { name: who }).click();
      }
      await stages.getByText('30 dias').waitFor();
      // Custo da Ana por mês (R$ 85/h × 8 h × 21 dias) e total da etapa: 10 × R$ 680 (pessoa) + 10 × R$ 1.000 (escritório)
      eq(await stages.getByLabel(/^Custo por mês de quem faz /).first().inputValue(), '14.280,00', 'custo por mês da Ana');
      eq((await stages.locator('[data-stage-cost]').first().innerText()).replace(/\s/g, ' '), 'R$ 16.800,00', 'total da etapa da Ana');
      eq((await stages.locator('[data-stage-split]').first().innerText()).replace(/\s/g, ' '), 'Pessoa: 10 × R$ 680,00/dia = R$ 6.800,00 · Escritório: 10 × R$ 1.000,00/dia = R$ 10.000,00', 'pessoa e escritório separados');
      // 6.800 + 4.480 + 5.760
      await stages.locator('[data-labor]').getByText('R$ 17.040,00').waitFor();
      // Adicionais: 4 visitas de R$ 150 e terceirização de R$ 5.000
      await page.getByLabel('Quantidade de Visitas técnicas').fill('4');
      await page.getByLabel('Quantidade de Terceirização (projetos complementares)').fill('1');
      await page.getByLabel('Valor unitário de Terceirização (projetos complementares)').fill('500000');
      await page.getByLabel('Referência por m²').fill('25000');
      // (30.000 + 17.040 + 5.600) ÷ (1 − 6% − 5% − 20%) = 76.289,86 · 412,38/m² · acima de 250/m²
      const summary = page.getByRole('complementary', { name: 'Resumo da precificação' });
      await summary.locator('[data-suggested]').getByText('R$ 76.289,86').waitFor();
      await summary.getByText('R$ 412,38').waitFor();
      await summary.locator('[data-m2-compare]').getByText(/acima do m²/).waitFor();
      await summary.getByRole('button', { name: /^Arredondar/ }).click();
      eq(await summary.getByLabel('Valor da proposta').inputValue(), '76.300,00', 'proposta arredondada');
    },
    page,
  );

  await s.step(
    'salvar volta para a lista e leva o valor para a oportunidade',
    async () => {
      const lead = (await ls(page, 'leads')).find((l) => l.name === 'Felipe Andrade');
      await page.getByRole('combobox', { name: 'Oportunidade' }).click();
      await page.getByRole('option', { name: lead.name, exact: true }).click();
      await page.locator('[data-lead-sync]').getByText(/Felipe Andrade/).waitFor();
      await page.getByRole('button', { name: 'Salvar precificação' }).click();
      await page.waitForURL(/\/precificacao$/);
      const saved = (await ls(page, 'pricings')).find((p) => p.name === 'CASA TESTE');
      id = saved.id;
      eq([saved.area_m2, saved.total, saved.lead_id], [185, 76300, lead.id], 'precificação salva');
      eq(saved.data.stages.slice(0, 3).map((x) => x.rate), [85, 70, 60], 'custo/hora de cada etapa');
      eq((await ls(page, 'leads')).find((l) => l.id === lead.id).proposal_value, 76300, 'proposta da oportunidade');
      const row = page.locator('[data-pricing-row]', { hasText: 'CASA TESTE' });
      await row.getByText('R$ 76.300').waitFor();
      await row.getByText('30 dias').waitFor();
      await row.getByText(/valor na proposta/).waitFor();
      await row.click();
      await page.waitForURL(new RegExp(`precificacao/${id}$`));
      eq(await page.getByLabel('Área da casa (m²)').inputValue(), '185', 'reabre com os dados');
    },
    page,
  );

  await s.step(
    'oportunidade mostra a precificação e "Precificar" já vincula',
    async () => {
      await page.goto(BASE + '/oportunidades');
      await page.locator('[data-lead-card]', { hasText: 'Felipe Andrade' }).first().click();
      const dlg = page.getByRole('dialog');
      await dlg.getByText('R$ 76.300').first().waitFor();
      await dlg.locator('[data-lead-pricing]').getByRole('link', { name: 'Precificação CASA TESTE' }).click();
      await page.waitForURL(new RegExp(`precificacao/${id}$`));
      // Outra oportunidade: "Precificar" abre uma nova já com cliente, área e tipo
      await page.goto(BASE + '/oportunidades');
      await page.locator('[data-lead-card]', { hasText: 'Rodrigo Tavares' }).first().click();
      await page.getByRole('dialog').locator('[data-lead-pricing]').getByRole('link', { name: 'Precificar' }).click();
      await page.waitForURL(/precificacao\/nova\?oportunidade=/);
      eq(await page.getByLabel('Área da casa (m²)').inputValue(), '250', 'área da oportunidade');
      eq(await page.getByRole('textbox', { name: /^Cliente/ }).inputValue(), 'Rodrigo Tavares', 'cliente da oportunidade');
      ok((await page.getByRole('combobox', { name: 'Oportunidade' }).innerText()).includes('Rodrigo Tavares'), 'oportunidade vinculada');
    },
    page,
  );

  await s.step(
    'sem custo cadastrado: digitar o custo por mês na etapa (R$ 500 ÷ 21 dias = R$ 23,81 por dia) e ele vai para o cadastro da pessoa',
    async () => {
      await patchTable(page, 'finance_member_costs', 'return [];');
      await patchTable(page, 'finance_entries', 'return [];');
      // Primeira precificação do escritório: nada para copiar de uma anterior
      await patchTable(page, 'pricings', 'return [];');
      await page.goto(BASE + '/precificacao/nova');
      await page.getByRole('textbox', { name: /^Nome/ }).first().fill('casa custo');
      const stages = page.getByRole('region', { name: /Etapas e dias/ });
      await stages.getByLabel(/^Dias de /).first().fill('1');
      // Sem custo nenhum: aviso na etapa e no resumo, em vez de valores em branco
      await stages.locator('[data-stage-cost-missing]').waitFor();
      await page.locator('[data-price-zero]').getByText(/Falta custo/).waitFor();
      await stages.getByRole('combobox', { name: /^Quem faz / }).first().click();
      await page.getByRole('option', { name: /^Bruno Carvalho · sem custo cadastrado$/ }).click();
      // Estagiário que custa R$ 500 por mês, 1 dia na etapa: R$ 500 ÷ 21 dias = R$ 23,81
      await stages.getByLabel(/^Custo por mês de quem faz /).first().fill('50000');
      eq((await stages.locator('[data-stage-cost]').first().innerText()).replace(/\s/g, ' '), 'R$ 23,81', '1 dia de quem ganha R$ 500 por mês');
      eq((await stages.locator('[data-stage-split]').first().innerText()).replace(/\s/g, ' '), 'Pessoa: 1 × R$ 23,81/dia = R$ 23,81 · Escritório: 1 × R$ 0,00/dia = R$ 0,00', 'só a pessoa');
      ok(!(await page.locator('[data-price-zero]').count()), 'preço continua zerado');
      await page.getByRole('button', { name: 'Salvar precificação' }).click();
      await page.waitForURL(/\/precificacao$/);
      const bruno = (await ls(page, 'profiles')).find((p) => p.name === 'Bruno Carvalho');
      const hourly = (await ls(page, 'finance_member_costs')).find((c) => c.user_id === bruno.id)?.hourly_cost;
      eq(Math.round(hourly * 21 * 8 * 100) / 100, 500, 'custo do Bruno salvo: R$ 500 por mês');
      // Rentabilidade mostra o custo por mês e o do dia
      await page.goto(BASE + '/financeiro?aba=rentabilidade');
      const row = page.locator(`[data-member-cost="${bruno.id}"]`);
      eq(await row.getByLabel('Custo por mês de Bruno Carvalho').inputValue(), '500,00', 'custo por mês na Rentabilidade');
      ok((await row.locator('[data-member-day]').innerText()).replace(/\s/g, ' ').startsWith('R$ 23,81 por dia'), 'custo do dia na Rentabilidade');
    },
    page,
  );

  await ctx.close();
  return s;
}
