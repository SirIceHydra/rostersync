const { existsSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const backendRoot = join(__dirname, '..');
const bin = join(backendRoot, 'node_modules', 'patch-package', 'index.js');
if (!existsSync(bin)) {
  process.exit(0);
}
execFileSync(process.execPath, [bin], { cwd: backendRoot, stdio: 'inherit' });
