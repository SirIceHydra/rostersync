import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const ms = Number(process.argv[2]);
const npmScript = process.argv[3];
if (!npmScript || !Number.isFinite(ms) || ms < 0) {
  console.error('Usage: node scripts/wait-and-run.mjs <delayMs> <npm-script-name>');
  process.exit(1);
}

await delay(ms);
const child = spawn('npm', ['run', npmScript], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
