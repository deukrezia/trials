import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const url = `http://127.0.0.1:${port}`;
let opened = false;
function openBrowser() {
  if (opened) return;
  opened = true;
  // Invoked only by the user-facing launcher, never by npm start or the tests.
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/d', '/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => console.log(`Open ${url} in your browser.`));
  } else console.log(`Open ${url} in your browser.`);
}
// Reuse an already-running copy of this editor without terminating other processes.
try {
  const response = await fetch(`${url}/package.json`, { signal: AbortSignal.timeout(1000) });
  if (response.ok && (await response.json()).name === 'trials-battlemap-maker') { console.log(`Trials is already running at ${url}`); openBrowser(); }
  else throw new Error('No editor running');
} catch {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, windowsHide: true, stdio: ['inherit', 'pipe', 'inherit'] });
  child.stdout.on('data', data => { process.stdout.write(data); if (data.toString().includes('Trials:')) openBrowser(); });
  child.on('exit', code => { process.exitCode = code || 0; });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  process.on('SIGINT', () => { child.kill(); });
}
