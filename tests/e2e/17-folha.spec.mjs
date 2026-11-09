// Financeiro → Folha: salário de um mês pago no dia 5 do mês seguinte (referência), lançar e pagar
// por pessoa, aviso de folha lançada sem pessoa, dia do pagamento, "ref." nos lançamentos,
// "Referente a" no cadastro (sugerido para salários e andando junto numa despesa mensal) e celular.
import { BASE, eq, ls, ok, openApp, setupAdmin, spec } from './lib.mjs';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shift = (k, n) => key(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1));
const name = (k) => MONTHS[Number(k.slice(5, 7)) - 1];

export default async function ({ browser }) {
  const s = spec('folha');
  const { ctx, page } = await openApp(browser);
  const cur = key(new Date());
  const ref = shift(cur, -1);
  const pay = `${cur}-05`;

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'aba Folha: salários do mês passado pagos no dia 5 deste mês',
    async () => {
      await page.goto(BASE + '/financeiro');
      await page.getByRole('tab', { name: 'Folha' }).click();
      await page.waitForURL(/aba=folha/);
      eq(await page.locator('[data-payroll]').getAttribute('data-payroll'), ref, 'mês de referência padrão');
      const rule = await page.locator('[data-payroll-rule]').innerText();
      ok(rule.includes(`Salários de ${name(ref)} pagos em ${pay.slice(8)}/${pay.slice(5, 7)}/${pay.slice(0, 4)}`), rule);
      ok(rule.includes(`contas de ${name(cur)}`), 'entra nas contas do mês do pagamento');
      // A demonstração já tem uma "Folha de pagamento" sem pessoa: aviso de duplicidade
      await page.locator('[data-payroll-generic]').getByText(/Folha de pagamento/).waitFor();
      ok((await page.locator('[data-payroll-status="nao_lancado"]').count()) >= 2, 'pessoas com salário cadastrado');
    },
    page,
  );

  await s.step(
    'lançar e pagar o salário de uma pessoa, depois a folha inteira',
    async () => {
      const first = page.locator('[data-payroll-status="nao_lancado"]').first();
      const who = await first.getAttribute('data-payroll-member');
      await page.getByRole('button', { name: `Lançar salário de ${who}` }).click();
      const row = page.locator(`[data-payroll-member="${who}"]`);
      await page.waitForFunction((w) => ['a_pagar', 'vencido'].includes(document.querySelector(`[data-payroll-member="${w}"]`)?.getAttribute('data-payroll-status')), who);
      const profiles = await ls(page, 'profiles');
      const memberId = profiles.find((p) => p.name === who).id;
      const cats = await ls(page, 'finance_categories');
      let e = (await ls(page, 'finance_entries')).find((x) => x.member_id === memberId && x.reference_month === ref);
      eq([e.kind, e.due_date, e.paid_at, cats.find((c) => c.id === e.category_id)?.name], ['despesa', pay, null, 'Salários e pró-labore'], 'salário lançado');
      ok(e.description.includes(who) && e.description.includes(name(ref)), e.description);
      await page.getByRole('button', { name: `Pagar salário de ${who}` }).click();
      await row.getByText(/^Pago em/).waitFor();
      e = (await ls(page, 'finance_entries')).find((x) => x.id === e.id);
      eq(e.paid_at, pay < new Date().toISOString().slice(0, 10) ? pay : e.paid_at, 'pago na data combinada');
      // O resto da folha de uma vez
      await page.getByRole('button', { name: new RegExp(`^Lançar folha de ${name(ref)}`) }).click();
      await page.waitForFunction(() => !document.querySelector('[data-payroll-status="nao_lancado"]'));
      const tile = page.locator('.metric-tile').filter({ has: page.getByText('Falta lançar', { exact: true }) });
      ok((await tile.innerText()).replace(/\s/g, ' ').includes('R$ 0,00'), 'falta lançar');
      const launched = (await ls(page, 'finance_entries')).filter((x) => x.reference_month === ref && x.member_id);
      eq(new Set(launched.map((x) => x.member_id)).size, launched.length, 'um salário por pessoa');
    },
    page,
  );

  await s.step(
    'dia do pagamento e "ref." nos lançamentos do mês do pagamento',
    async () => {
      const day = page.getByLabel('Dia do pagamento da folha');
      await day.fill('10');
      await day.press('Enter');
      await page.getByText('A folha passa a vencer no dia 10 do mês seguinte.').waitFor();
      eq((await ls(page, 'app_settings'))[0].payroll_day, 10, 'dia salvo');
      await page.locator('[data-payroll-rule]').getByText(new RegExp(`pagos em 10/${cur.slice(5, 7)}/`)).waitFor();
      await page.getByRole('tab', { name: 'Lançamentos' }).click();
      await page.locator(`[data-entry-ref="${ref}"]`).first().waitFor();
      ok((await page.locator(`[data-entry-ref="${ref}"]`).first().innerText()).startsWith('ref. '), 'etiqueta de referência');
    },
    page,
  );

  await s.step(
    '"Referente a" no cadastro: sugerido para salário e andando junto na despesa mensal',
    async () => {
      await page.getByRole('button', { name: 'Despesa', exact: true }).click();
      const d = page.getByRole('dialog');
      await d.getByPlaceholder('Ex.: Aluguel da sala').fill('Bolsa estágio');
      await d.getByLabel('Valor').fill('50000');
      await d.locator('input[type="date"]').first().fill(`${cur}-05`);
      await d.getByRole('combobox', { name: 'Categoria' }).click();
      await page.getByRole('option', { name: 'Salários e pró-labore' }).click();
      eq(await d.getByLabel('Referente a (mês)').inputValue(), ref, 'referência sugerida');
      await d.getByText(`Pago em ${name(cur)} de ${cur.slice(0, 4)}, referente a ${name(ref)} de ${ref.slice(0, 4)}.`).waitFor();
      await d.getByRole('radio', { name: 'Todo mês' }).click();
      await d.getByLabel('Número de meses').fill('3');
      await d.getByRole('button', { name: 'Lançar' }).click();
      await d.waitFor({ state: 'detached' });
      const rows = (await ls(page, 'finance_entries')).filter((x) => x.description === 'Bolsa estágio').sort((a, b) => a.due_date.localeCompare(b.due_date));
      eq(rows.map((x) => [x.due_date.slice(0, 7), x.reference_month, x.amount]), [0, 1, 2].map((i) => [shift(cur, i), shift(ref, i), 500]), 'referência anda com o vencimento');
    },
    page,
  );

  await s.step(
    'celular: aba Folha sem rolagem para o lado',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      await mp.goto(BASE + '/financeiro?aba=folha');
      await mp.locator('[data-payroll-member]').first().waitFor();
      eq(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'rolagem horizontal');
      await m.close();
    },
    page,
  );

  await ctx.close();
  return s;
}
