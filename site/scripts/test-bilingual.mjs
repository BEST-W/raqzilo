import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
await mkdir('.sites-runtime', { recursive: true });
await build({ entryPoints: ['scripts/bilingual-check.tsx'], outfile: '.sites-runtime/bilingual-check.mjs', platform: 'node', format: 'esm', target: 'node22', bundle: true, packages: 'external', logLevel: 'error' });
const child = spawn(process.execPath, ['.sites-runtime/bilingual-check.mjs'], { stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
