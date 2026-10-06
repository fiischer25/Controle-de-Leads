// Ferramentas comuns dos testes de ponta a ponta (modo demonstração, dados no navegador).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export const BASE = process.env.E2E_BASE || 'http://localhost:4173';
export const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
export const ADMIN = { name: 'Matheus Fischer', email: 'matheus@airos.com.br', password: 'segredo123' };
/** Membro dos dados de demonstração (senha padrão dos membros de exemplo). */
export const DEMO_MEMBER = { name: 'Ana Ribeiro', email: 'ana@airos.com.br', password: 'airos123' };

/** Chromium: CHROMIUM_PATH, o instalado em PLAYWRIGHT_BROWSERS_PATH ou o padrão do Playwright. */
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (dir && existsSync(dir)) {
    for (const d of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
      const exe = join(dir, d, 'chrome-linux', 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

export function launch() {
  return chromium.launch({ executablePath: chromiumPath() });
}

/** Contexto novo (navegador limpo) com a página e a coleta de erros do console. */
export async function openApp(browser, { width = 1440, height = 950, mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: 'pt-BR',
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) page.errors.push('console: ' + m.text());
  });
  return { ctx, page };
}

/** Primeiro acesso: cria o administrador com os dados de demonstração e abre o Escritório. */
export async function setupAdmin(page) {
  await page.goto(BASE);
  await page.getByText('Crie o administrador').waitFor();
  const inputs = page.locator('form input');
  await inputs.nth(0).fill(ADMIN.name);
  await inputs.nth(1).fill(ADMIN.email);
  await inputs.nth(2).fill(ADMIN.password);
  await inputs.nth(3).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await page.getByRole('heading', { name: 'Dashboard do escritório' }).waitFor({ timeout: 20000 });
}

export async function signOut(page, name = ADMIN.name) {
  await page.locator('aside').getByTitle(name).last().click();
  await page.getByText('Sair', { exact: true }).click();
  await page.getByRole('heading', { name: 'Entrar' }).waitFor();
}

export async function signIn(page, { email, password }) {
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'Entrar' }).waitFor();
  await page.waitForLoadState('networkidle');
  const li = page.locator('form input');
  // O formulário pode remontar enquanto carrega o nome do escritório: confere antes de entrar
  for (let i = 0; i < 3; i++) {
    await li.nth(0).fill(email);
    await li.nth(1).fill(password);
    await page.waitForTimeout(150);
    if ((await li.nth(0).inputValue()) === email) break;
  }
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  try {
    // O login leva ~1 s (hash da senha): só segue quando a tela de entrada sair
    await page.getByRole('heading', { name: 'Entrar', exact: true }).waitFor({ state: 'detached', timeout: 15000 });
  } catch {
    const msg = (await page.locator('[role=alert], .text-danger-fg').allTextContents()).join(' ');
    throw new Error(`não entrou como ${email}: ${msg || 'sem mensagem'} (e-mail no campo: "${await li.nth(0).inputValue()}")`);
  }
  await page.locator('nav[aria-label="Navegação principal"]').waitFor({ timeout: 20000 });
}

/** Tabela do modo demonstração (localStorage). */
export const ls = (page, table) => page.evaluate((t) => JSON.parse(localStorage.getItem('airos:v1:' + t) || '[]'), table);

/** Altera uma tabela do modo demonstração; recarregue a página depois. */
export const patchTable = (page, table, fnSource, arg) =>
  page.evaluate(
    ([t, src, a]) => {
      const k = 'airos:v1:' + t;
      const rows = JSON.parse(localStorage.getItem(k) || '[]');
      const fn = new Function('rows', 'arg', src);
      localStorage.setItem(k, JSON.stringify(fn(rows, a) ?? rows));
    },
    [table, fnSource, arg],
  );

export function eq(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
  }
}

export function ok(cond, what) {
  if (!cond) throw new Error(what);
}

export async function navLabels(page) {
  const links = page.locator('nav[aria-label="Navegação principal"] a');
  await links.first().waitFor();
  return links.evaluateAll((els) => els.map((e) => e.getAttribute('title')));
}

/** Abre a oportunidade e clica em "Ganhou" na gaveta. Devolve o modal "Oportunidade ganha". */
export async function openWon(page, leadName) {
  await page.goto(BASE + '/oportunidades');
  await page.locator('[data-lead-card]', { hasText: leadName }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ganhou', exact: true }).click();
  const d = page.getByRole('dialog', { name: /Oportunidade ganha/ });
  await d.waitFor();
  return d;
}

/** Preenche os campos obrigatórios do cliente no "Virar cliente" (por rótulo). */
export async function fillClient(dialog, c) {
  const set = async (label, v) => {
    if (v !== undefined) await dialog.getByLabel(label, { exact: false }).first().fill(v);
  };
  await set('Nome completo', c.name);
  await set('CPF / CNPJ', c.document);
  await set('E-mail', c.email);
  await set('Telefone', c.phone);
  await set('CEP', c.cep);
  await set('Rua', c.street);
  await set('Número', c.number);
  await set('Bairro', c.neighborhood);
  await set('Cidade', c.city);
}

/** Segunda etapa do "Virar cliente": escolhe o responsável e converte. */
export async function finishConvert(page, dialog) {
  await dialog.getByRole('button', { name: 'Continuar para o projeto' }).click();
  await dialog.getByText(/^Selecione/).first().click();
  await page.getByRole('option', { name: new RegExp(ADMIN.name.split(' ')[0]) }).first().click();
  await dialog.getByRole('button', { name: 'Converter e criar projeto' }).click();
  await page.waitForURL(/projetos\//);
}

/**
 * Executor de uma especificação: cada passo é independente; o primeiro erro do passo é
 * registrado e os demais passos continuam. Erros de JavaScript da página também falham o passo.
 */
export function spec(name) {
  const results = [];
  return {
    name,
    results,
    async step(title, fn, page) {
      const before = page?.errors?.length ?? 0;
      const t0 = Date.now();
      try {
        await fn();
        const errs = page?.errors?.slice(before) ?? [];
        if (errs.length) throw new Error('erro na página: ' + errs.join(' | '));
        results.push({ title, ok: true, ms: Date.now() - t0 });
        console.log(`  ✓ ${title}`);
      } catch (e) {
        results.push({ title, ok: false, error: e.message.split('\n')[0] });
        console.log(`  ✗ ${title}\n      ${e.message.split('\n')[0]}`);
        if (page && process.env.E2E_SHOTS) {
          await page.screenshot({ path: `${process.env.E2E_SHOTS}/fail-${name}-${title.replace(/\W+/g, '_')}.png` }).catch(() => {});
        }
      }
    },
  };
}
