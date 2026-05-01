/**
 * Windows-only: install SmartLoad Tally Bridge as a local service (node-windows).
 * Run from the apps/tally-bridge directory after `pnpm run build`.
 *
 *   node install-service.cjs
 *   node install-service.cjs --uninstall
 */
// @ts-nocheck
const path = require('node:path');
const fs = require('node:fs');

if (process.platform !== 'win32') {
  console.error('install-service.cjs is only for Windows. On Linux/macOS, run: node dist/index.js or use a systemd unit.');
  process.exit(0);
}

let Service;
try {
  Service = require('node-windows').Service;
} catch {
  console.error('Missing dependency. Run: pnpm add -D node-windows');
  process.exit(1);
}

const root = __dirname;
const scriptPath = path.join(root, 'dist', 'index.js');
if (!fs.existsSync(scriptPath)) {
  console.error(`Build not found: ${scriptPath}\nRun: pnpm run build`);
  process.exit(1);
}

const svc = new Service({
  name: 'SmartLoadTallyBridge',
  description: 'Bridges SmartLoad cloud to TallyPrime (localhost HTTP for cloud callbacks).',
  script: path.resolve(scriptPath),
  nodeOptions: ['--enable-source-maps'],
  workingDirectory: root,
  env: [
    { name: 'TALLY_URL', value: process.env.TALLY_URL || 'http://localhost:9000' },
    { name: 'BRIDGE_PORT', value: process.env.BRIDGE_PORT || '7474' },
  ],
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});
svc.on('start', () => console.log('SmartLoadTallyBridge started.'));
svc.on('uninstall', () => console.log('Service removed.'));

if (process.argv.includes('--uninstall')) {
  svc.uninstall();
} else {
  svc.install();
}
