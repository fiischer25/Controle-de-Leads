// Números nunca cortados: infla os valores do modo demonstração (×1000) e, em 4 larguras de
// tela, procura em todas as páginas valores cortados com "…", textos com números vazando do
// cartão e páginas que rolam para o lado. Textos longos (nomes) podem ser cortados; números não.
import { BASE, ls, openApp, setupAdmin, spec } from './lib.mjs';

const SIZES = [
  [1440, 950],
  [1024, 800],
  [768, 1000],
  [390, 844],
];

/** Varre a página atual e devolve os problemas encontrados. */
export const scan = (page) =>
  page.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const numeric = (t) => /R\$|%/.test(t) || /^[\d\s.,:/hmin+−-]+$/.test(t);
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!/\d/.test(own)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const clipped = el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis');
      if (clipped && numeric(own)) out.push(`cortado: "${own.slice(0, 40)}"`);
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX === 'auto' || acs.overflowX === 'scroll') break; // rolagem de propósito (quadro, cronograma)
        if (acs.overflowX !== 'visible' || a.classList.contains('metric-tile') || a.classList.contains('panel')) {
          const ar = a.getBoundingClientRect();
          if (r.right > ar.right + 1 || r.left < ar.left - 1) out.push(`vaza do cartão: "${own.slice(0, 40)}"`);
          break;
        }
      }
    }
    if (document.documentElement.scrollWidth > vw + 1) out.push(`página rola para o lado (${document.documentElement.scrollWidth}px > ${vw}px)`);
    return [...new Set(out)];
  });

export default async function ({ browser }) {
  const s = spec('numeros');
  const { ctx, page } = await openApp(browser);
  let pages = [];

  await s.step('setup com valores ×1000', async () => {
    await setupAdmin(page);
    await page.evaluate(() => {
      const upd = (t, fn) => {
        const k = 'airos:v1:' + t;
        localStorage.setItem(k, JSON.stringify(JSON.parse(localStorage.getItem(k) || '[]').map(fn)));
      };
      const big = (v) => (v == null ? v : Math.round(v * 1000 * 100 + 99) / 100);
      upd('finance_entries', (e) => ({ ...e, amount: big(e.amount) }));
      upd('finance_accounts', (a) => ({ ...a, opening_balance: big(a.opening_balance ?? 0) }));
      upd('leads', (l) => ({
        ...l,
        proposal_value: big(l.proposal_value),
        payment_plan: l.payment_plan ? { ...l.payment_plan, total: big(l.payment_plan.total), rows: l.payment_plan.rows.map((r) => ({ ...r, value: big(r.value), amount: big(r.amount) })) } : l.payment_plan,
      }));
    });
    const p = (await ls(page, 'projects'))[0];
    const c = (await ls(page, 'clients'))[0];
    pages = [
      '/', '/meu-painel', '/projetos', `/projetos/${p.id}`, `/projetos/${p.id}?aba=financeiro`, '/tarefas', '/tarefas?aba=atencao',
      '/oportunidades', '/clientes', `/clientes/${c.id}`, '/financeiro', '/financeiro?aba=lancamentos', '/financeiro?aba=contas',
      '/financeiro?aba=rentabilidade', '/financeiro?aba=categorias', '/financeiro/relatorio', '/relatorios', '/equipe',
    ];
  }, page);

  for (const [w, h] of SIZES) {
    await s.step(
      `nenhum número cortado em ${w}px`,
      async () => {
        await page.setViewportSize({ width: w, height: h });
        const problems = [];
        for (const path of pages) {
          await page.goto(BASE + path);
          await page.locator('h1').first().waitFor();
          await page.waitForTimeout(500);
          for (const p of await scan(page)) problems.push(`${path} → ${p}`);
        }
        if (problems.length) throw new Error(`${problems.length} problema(s): ${problems.slice(0, 6).join(' ; ')}`);
      },
      page,
    );
  }

  await ctx.close();
  return s;
}
