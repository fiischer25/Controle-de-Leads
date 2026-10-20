// Oportunidades → Painel: resultado, taxa de conversão, valores em aberto, fechados e não
// fechados, de onde vem o lead (clique filtra), perfil, localidades, meses e celular.
import { BASE, eq, ls, ok, openApp, patchTable, setupAdmin, spec } from './lib.mjs';

const norm = (s) => s.replace(/\s/g, ' ');

export default async function ({ browser }) {
  const s = spec('painel-oportunidades');
  const { ctx, page } = await openApp(browser);

  await s.step(
    'setup: oportunidades conhecidas',
    async () => {
      await setupAdmin(page);
      const stages = await ls(page, 'lead_stages');
      const sources = await ls(page, 'lead_sources');
      const open = stages.filter((x) => x.kind === 'open').sort((a, b) => a.position - b.position)[0].id;
      const won = stages.find((x) => x.kind === 'won').id;
      const lost = stages.find((x) => x.kind === 'lost').id;
      const [a, b] = sources.sort((x, y) => x.position - y.position);
      const now = new Date().toISOString();
      const lead = (i, o) => ({
        id: `painel-${i}`, name: `Lead Painel ${i}`, phone: '', email: null, city: 'Campinas', state: 'SP', area_m2: null, category: null,
        project_type_id: null, source_id: a.id, referred_by: null, proposal_value: null, stage_id: open, owner_id: null, position: i,
        next_contact_date: null, expected_close_date: null, lost_reason: null, notes: null, stage_changed_at: now, closed_at: null,
        client_id: null, converted_at: null, created_by: null, created_at: now, updated_at: now, ...o,
      });
      const rows = [
        lead(1, { proposal_value: 20000, city: 'São Paulo', category: 'Residencial', area_m2: 70 }),
        lead(2, { proposal_value: 10000, city: 'sao paulo', area_m2: 200 }),
        lead(3, { stage_id: won, proposal_value: 50000, source_id: b.id, closed_at: now, category: 'Residencial' }),
        lead(4, { stage_id: won, proposal_value: 30000, source_id: b.id, closed_at: now, state: 'MG', city: 'Belo Horizonte' }),
        lead(5, { stage_id: won, proposal_value: 10000, closed_at: now }),
        lead(6, { stage_id: lost, proposal_value: 40000, closed_at: now, lost_reason: 'Preço' }),
      ];
      await patchTable(page, 'leads', 'return arg;', rows);
      s.ctx = { a: a.name, b: b.name };
    },
    page,
  );

  await s.step(
    'aba Painel: resultado, conversão e valores',
    async () => {
      await page.goto(BASE + '/oportunidades');
      await page.getByRole('tab', { name: 'Painel' }).click();
      const dash = page.locator('[data-leads-dashboard]');
      await dash.waitFor();
      const tile = (label) => dash.locator('.metric-tile').filter({ has: page.getByText(label, { exact: true }) });
      eq(norm(await tile('Oportunidades').locator('.metric-value').innerText()), '6', 'total');
      eq(await tile('Taxa de conversão').locator('.metric-value').innerText(), '75%', 'conversão (3 ganhas de 4)');
      ok((await tile('Taxa de conversão').innerText()).includes('3 ganhas de 4 decididas'), 'detalhe da conversão');
      eq(norm(await tile('Em aberto para fechar').locator('.metric-value').innerText()), 'R$ 30.000', 'em aberto');
      eq(norm(await tile('Fechados').locator('.metric-value').innerText()), 'R$ 90.000', 'fechados');
      ok(norm(await tile('Fechados').innerText()).includes('3 negócios · média R$ 30.000'), 'ticket médio');
      eq(norm(await tile('Não fechados').locator('.metric-value').innerText()), 'R$ 40.000', 'não fechados');
      // Mês atual: 6 entraram, 3 ganhas, 1 não ganha
      const key = new Date().toISOString().slice(0, 7);
      const month = norm(await dash.locator(`[data-lead-month="${key}"]`).innerText());
      ok(/6\s+3\s+1\s+75%\s+R\$ 90\.000/.test(month.replace(/\n/g, ' ')), `mês atual: ${month}`);
      eq(await dash.locator('[data-lead-month]').count(), 6, 'últimos 6 meses');
    },
    page,
  );

  await s.step(
    'perfil, localidades e motivos',
    async () => {
      const dash = page.locator('[data-leads-dashboard]');
      // "São Paulo" e "sao paulo" são a mesma cidade
      ok(/S(ã|a)o Paulo · SP\s+2/.test(norm(await dash.locator('[data-lead-city^="São Paulo"], [data-lead-city^="sao paulo"]').innerText())), 'cidade agrupada');
      ok((await dash.locator('[data-lead-states]').innerText()).includes('MG'), 'por estado');
      ok(/Residencial\s+2/.test(await dash.locator('[data-lead-categoria="Residencial"]').innerText()), 'categoria');
      await dash.locator('[data-lead-area="Até 80 m²"]').waitFor();
      await dash.getByText('Preço', { exact: true }).waitFor();
      await dash.getByRole('heading', { name: 'De onde vem o lead' }).waitFor();
    },
    page,
  );

  await s.step(
    'de onde vem: clicar na origem filtra a tela',
    async () => {
      const dash = page.locator('[data-leads-dashboard]');
      const row = dash.locator(`[data-lead-source="${s.ctx.b}"]`);
      ok(/2\s+2\s+0\s+100%\s+R\$ 80\.000/.test(norm(await row.innerText()).replace(/\n/g, ' ')), `origem: ${await row.innerText()}`);
      await row.click();
      await page.waitForFunction(() => document.querySelector('[data-leads-dashboard] .metric-value')?.textContent === '2');
      eq(await dash.locator('[data-lead-source]').count(), 1, 'só a origem escolhida');
      await page.getByRole('button', { name: 'Limpar' }).click();
      await page.waitForFunction(() => document.querySelector('[data-leads-dashboard] .metric-value')?.textContent === '6');
      // A aba escolhida fica guardada
      await page.reload();
      await page.locator('[data-leads-dashboard]').waitFor();
      await page.getByRole('tab', { name: 'Quadro' }).click();
      await page.locator('[data-lead-card]').first().waitFor();
      ok(!(await page.locator('[data-leads-dashboard]').count()), 'painel no quadro');
      await page.getByRole('tab', { name: 'Painel' }).click();
    },
    page,
  );

  await s.step(
    'celular: aba Painel e sem rolagem para o lado',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      await mp.goto(BASE + '/oportunidades');
      await mp.getByRole('tab', { name: 'Quadro' }).click();
      ok(!(await mp.locator('[data-leads-dashboard]').count()), 'painel no quadro');
      await mp.getByRole('tab', { name: 'Painel' }).click();
      await mp.locator('[data-leads-dashboard]').waitFor();
      eq(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'rolagem horizontal');
      await m.close();
    },
    page,
  );

  await ctx.close();
  return s;
}
