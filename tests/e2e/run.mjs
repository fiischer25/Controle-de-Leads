// Testes de ponta a ponta: `npm run test:e2e` (todos) ou `npm run test:e2e -- financeiro contratos`.
// Compila o sistema (se não houver dist/), sobe o `vite preview` e roda cada especificação em um
// navegador limpo, no modo demonstração. Com E2E_BASE=http://... usa um servidor já no ar.
// E2E_SHOTS=pasta salva um print de cada passo que falhar.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, launch } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const filters = process.argv.slice(2);
const files = readdirSync(here)
  .filter((f) => f.endsWith('.spec.mjs'))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();

async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!process.env.E2E_BASE) {
  if (!existsSync(join(root, 'dist', 'index.html')) || process.env.E2E_BUILD) {
    console.log('Compilando…');
    const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
  if (await up(BASE)) {
    console.log(`Usando o servidor já aberto em ${BASE}`);
  } else {
    const port = new URL(BASE).port || '4173';
    server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
    for (let i = 0; i < 60 && !(await up(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await up(BASE))) {
      console.error('O servidor de testes não respondeu em ' + BASE);
      process.exit(1);
    }
  }
}

const summary = [];
const t0 = Date.now();
for (const f of files) {
  console.log(`\n▸ ${f.replace('.spec.mjs', '')}`);
  const browser = await launch();
  try {
    const mod = await import(join(here, f));
    const s = await mod.default({ browser });
    summary.push({ file: f, results: s.results });
  } catch (e) {
    console.log(`  ✗ a especificação parou: ${e.message.split('\n')[0]}`);
    summary.push({ file: f, results: [{ title: 'execução', ok: false, error: e.message }] });
  } finally {
    await browser.close();
  }
}
if (server) process.kill(-server.pid);

const all = summary.flatMap((s) => s.results.map((r) => ({ ...r, file: s.file })));
const failed = all.filter((r) => !r.ok);
console.log(`\n${all.length - failed.length} de ${all.length} passos passaram em ${Math.round((Date.now() - t0) / 1000)} s.`);
for (const r of failed) console.log(`  ✗ ${r.file.replace('.spec.mjs', '')} › ${r.title}: ${r.error}`);
process.exit(failed.length ? 1 : 0);
