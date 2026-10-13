// Financeiro → Cobrança: configurar os lembretes no WhatsApp, prévia da mensagem, próximos
// lembretes, pausar um cliente e cobrar uma parcela vencida pelo WhatsApp (com histórico).
import { BASE, eq, ls, ok, openApp, setupAdmin, spec } from './lib.mjs';

export default async function ({ browser }) {
  const s = spec('cobranca');
  const { ctx, page } = await openApp(browser);

  await s.step('setup', () => setupAdmin(page), page);

  await s.step(
    'aba Cobrança: ligar os lembretes, como pagar e prévia da mensagem',
    async () => {
      await page.goto(BASE + '/financeiro');
      await page.getByRole('tab', { name: 'Cobrança' }).click();
      await page.waitForURL(/aba=cobranca/);
      await page.getByRole('switch', { name: 'Enviar lembretes de cobrança aos clientes' }).click();
      await page.getByRole('combobox', { name: 'Dias antes do vencimento' }).click();
      await page.getByRole('option', { name: '5 dias antes' }).click();
      await page.getByLabel('Como pagar').fill('PIX (CNPJ) 12.345.678/0001-90');
      const preview = page.locator('[data-billing-preview]');
      await preview.getByText(/PIX \(CNPJ\) 12\.345\.678\/0001-90/).waitFor();
      ok(/^Olá, .+! Passando para lembrar da parcela de R\$/.test(await preview.innerText()), 'mensagem do lembrete');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await page.getByText('Lembretes de cobrança ligados.').waitFor();
      const st = (await ls(page, 'app_settings'))[0];
      eq([st.billing_enabled, st.billing_days_before, st.billing_payment_info], [true, 5, 'PIX (CNPJ) 12.345.678/0001-90'], 'configuração salva');
    },
    page,
  );

  await s.step(
    'próximos lembretes e pausar um cliente',
    async () => {
      // Parcela a receber daqui a 7 dias, de um cliente com telefone
      const clients = await ls(page, 'clients');
      const client = clients.find((c) => (c.phone ?? '').replace(/\D/g, '').length >= 10);
      const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      await page.evaluate(
        ([c, d]) => {
          const k = 'airos:v1:finance_entries';
          const rows = JSON.parse(localStorage.getItem(k));
          const now = new Date().toISOString();
          rows.push({ id: 'cob-e2e', kind: 'receita', description: 'Honorários teste · 2ª parcela', amount: 4321, due_date: d, paid_at: null, account_id: null, to_account_id: null, category_id: null, client_id: c, project_id: null, series_id: null, installment: null, installments: null, document: null, notes: null, created_by: null, created_at: now, updated_at: now });
          localStorage.setItem(k, JSON.stringify(rows));
        },
        [client.id, due],
      );
      await page.reload();
      const rows = page.locator('[data-upcoming]', { hasText: /4\.321,00/ });
      await rows.first().waitFor();
      eq(await rows.count(), 3, 'antes, no dia e depois da parcela nova');
      await rows.first().getByRole('button', { name: `Pausar lembretes de ${client.name}` }).click();
      await page.getByText('Este cliente não recebe mais lembretes automáticos.').waitFor();
      eq((await ls(page, 'clients')).find((c) => c.id === client.id).billing_reminders, false, 'cliente pausado');
      await rows.first().getByText('pausado para este cliente').waitFor();
    },
    page,
  );

  await s.step(
    'cobrar parcela vencida: abre o WhatsApp com a mensagem e registra o envio',
    async () => {
      const item = page.locator('[data-overdue-entry]').filter({ has: page.getByRole('button', { name: 'Cobrar', disabled: false }) }).first();
      await item.waitFor();
      const id = await item.getAttribute('data-overdue-entry');
      await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
      const [popup] = await Promise.all([page.waitForEvent('popup'), item.getByRole('button', { name: 'Cobrar' }).click()]);
      const url = decodeURIComponent(popup.url());
      ok(url.startsWith('https://wa.me/55'), `link do WhatsApp: ${url}`);
      ok(/venceu em \d\d\/\d\d/.test(url) && url.includes('PIX (CNPJ)'), `mensagem de cobrança: ${url}`);
      await popup.close();
      await page.locator('[data-billing-log="manual"]').getByText('Enviado à mão').waitFor();
      const log = (await ls(page, 'billing_reminder_log')).find((l) => l.entry_id === id);
      eq([log?.kind, log?.status], ['manual', 'manual'], 'envio registrado');
    },
    page,
  );

  await s.step(
    'celular: sem rolagem para o lado',
    async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      await mp.goto(BASE + '/financeiro?aba=cobranca');
      await mp.locator('[data-billing-preview]').waitFor();
      eq(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'rolagem horizontal');
      await m.close();
    },
    page,
  );

  await ctx.close();
  return s;
}
