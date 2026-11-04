import { cp, mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url)), edition = process.argv[2] || 'web';
if (!['web', 'desktop'].includes(edition)) throw new Error('Choose web or desktop.');
const dist = path.resolve(root, 'dist'), output = path.resolve(dist, edition);
if (path.relative(root, output).startsWith('..') || path.dirname(output) !== dist) throw new Error('Unsafe build output.');
for (const candidate of [dist, output]) { try { if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Build output cannot be a symbolic link.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
console.log(`Building ${edition}: ${output}`);
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'src', 'assets']) await cp(path.join(root, item), path.join(output, item), { recursive: true });
const config = JSON.parse(await readFile(path.join(root, 'config/distribution.json'), 'utf8'))[edition];
if (edition === 'desktop') config.ad = { enabled: false };
await writeFile(path.join(output, 'assets/edition.json'), JSON.stringify(config, null, 2) + '\n');
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Ready: ${output}`);
