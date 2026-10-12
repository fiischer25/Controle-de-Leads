// Gestão → Precificação: preço pelos dias (custo do dia do escritório × dias das etapas),
// adicionais, indiretos em % e lucro; R$/m² e comparação com o m² de referência; valor da
// proposta arredondado; salvar, listar e usar como proposta da oportunidade.
import { BASE, eq, ls, ok, openApp, setupAdmin, spec } from './lib.mjs';

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
    'precificar pelos dias e comparar com o m²',
    async () => {
      await page.getByRole('button', { name: 'Nova precificação' }).click();
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
      // 30 dias de trabalho
      const days = page.getByLabel(/^Dias de /);
      const n = await days.count();
      for (let i = 0; i < n; i++) await days.nth(i).fill(['10', '8', '12'][i] ?? '0');
      await page.getByRole('region', { name: /Etapas e dias/ }).getByText('30 dias').waitFor();
      // Adicionais: 4 visitas de R$ 150 e terceirização de R$ 5.000
      await page.getByLabel('Quantidade de Visitas técnicas').fill('4');
      await page.getByLabel('Quantidade de Terceirização (projetos complementares)').fill('1');
      await page.getByLabel('Valor unitário de Terceirização (projetos complementares)').fill('500000');
      await page.getByLabel('Referência por m²').fill('25000');
      // 35.600 ÷ (1 − 6% − 5% − 20%) = 51.594,20 · 278,89/m² · 11,6% acima de 250/m²
      const summary = page.getByRole('complementary', { name: 'Resumo da precificação' });
      await summary.locator('[data-suggested]').getByText('R$ 51.594,20').waitFor();
      await summary.getByText('R$ 278,89').waitFor();
      await summary.locator('[data-m2-compare]').getByText(/11,6% acima do m²/).waitFor();
      await summary.getByRole('button', { name: /^Arredondar/ }).click();
      eq(await summary.getByLabel('Valor da proposta').inputValue(), '51.600,00', 'proposta arredondada');
    },
    page,
  );

  await s.step(
    'salvar, aparecer na lista e usar na oportunidade',
    async () => {
      await page.getByRole('button', { name: 'Salvar precificação' }).click();
      await page.waitForURL(/precificacao\/[^/]+$/);
      id = new URL(page.url()).pathname.split('/').pop();
      const saved = (await ls(page, 'pricings')).find((p) => p.id === id);
      eq([saved.name, saved.area_m2, saved.total], ['CASA TESTE', 185, 51600], 'precificação salva');
      // Oportunidade: recebe o valor como proposta
      const lead = (await ls(page, 'leads')).find((l) => !l.client_id);
      await page.getByRole('combobox', { name: 'Oportunidade' }).click();
      await page.getByRole('option', { name: lead.name, exact: true }).click();
      await page.getByRole('button', { name: /^Usar como proposta de/ }).click();
      await page.waitForTimeout(300);
      eq((await ls(page, 'leads')).find((l) => l.id === lead.id).proposal_value, 51600, 'proposta da oportunidade');
      await page.getByRole('button', { name: 'Salvar precificação' }).click();
      await page.goto(BASE + '/precificacao');
      const card = page.locator('[data-pricing-card]', { hasText: 'CASA TESTE' });
      await card.getByText('R$ 51.600').waitFor();
      await card.getByText('30 dias').waitFor();
      await card.click();
      await page.waitForURL(new RegExp(`precificacao/${id}$`));
      eq(await page.getByLabel('Área da casa (m²)').inputValue(), '185', 'reabre com os dados');
    },
    page,
  );

  await ctx.close();
  return s;
}
