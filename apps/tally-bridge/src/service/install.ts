import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Windows Service installer for SmartLoad Tally Bridge.
 *
 * Run AFTER building: `node dist/service/install.js`
 * Requires: Administrator privileges on Windows
 *
 * After installation:
 *   Service name: SmartLoadTallyBridge
 *   Auto-starts on Windows boot
 *   Logs visible in Windows Event Viewer under Applications
 *   Manageable via: Services → SmartLoadTallyBridge
 *
 * To uninstall: `node dist/service/uninstall.js`
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Service } = require('node-windows') as { Service: new (opts: Record<string, unknown>) => NodeWindowsService }

interface NodeWindowsService {
  on(event: string, cb: (...args: unknown[]) => void): void
  install(): void
  start(): void
}

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const scriptPath = path.join(__dirname, '..', 'index.js')

const svc = new Service({
  name:        'SmartLoadTallyBridge',
  description: 'SmartLoad Tally Bridge — connects TallyPrime to SmartLoad cloud dispatch system',
  script:      scriptPath,
  env: [
    { name: 'BRIDGE_PORT',              value: process.env.BRIDGE_PORT              ?? '7474' },
    { name: 'BRIDGE_HOST',              value: process.env.BRIDGE_HOST              ?? '127.0.0.1' },
    { name: 'TALLY_BRIDGE_SECRET',      value: process.env.TALLY_BRIDGE_SECRET      ?? '' },
    { name: 'TALLY_URL',                value: process.env.TALLY_URL                ?? 'http://localhost:9000' },
    { name: 'TALLY_HTTP_TIMEOUT_MS',    value: process.env.TALLY_HTTP_TIMEOUT_MS    ?? '15000' },
    { name: 'TALLY_COMPANY_NAME',       value: process.env.TALLY_COMPANY_NAME       ?? '' },
    { name: 'TALLY_GODOWN',             value: process.env.TALLY_GODOWN             ?? 'Main Warehouse' },
    { name: 'TALLY_DEFAULT_VENDOR_LEDGER', value: process.env.TALLY_DEFAULT_VENDOR_LEDGER ?? '' },
    { name: 'TALLY_POLL_INTERVAL_MS',   value: process.env.TALLY_POLL_INTERVAL_MS   ?? '60000' },
    { name: 'TALLY_BRIDGE_LOG_DIR',     value: process.env.TALLY_BRIDGE_LOG_DIR     ?? './logs' },
    { name: 'LOG_LEVEL',                value: process.env.LOG_LEVEL                ?? 'info' },
    { name: 'NODE_ENV',                 value: 'production' },
  ],
  maxRestarts:  3,
  restartDelay: 10_000,  // 10 seconds between restarts
  wait:         1,
  grow:         0.25,
})

svc.on('install', () => {
  console.log('✅ SmartLoad Tally Bridge Windows Service installed successfully')
  console.log('   Starting service...')
  svc.start()
})

svc.on('alreadyinstalled', () => {
  console.log('ℹ️  Service already installed.')
  console.log('   Run uninstall.js first if you want to reinstall with new settings.')
})

svc.on('start', () => {
  console.log('🚀 SmartLoad Tally Bridge service started')
  console.log(`   Running on port ${process.env.BRIDGE_PORT ?? 7474}`)
})

svc.on('error', (err: unknown) => {
  console.error('❌ Service installation failed:', err)
})

console.log('Installing SmartLoad Tally Bridge as Windows Service...')
console.log(`   Script: ${scriptPath}`)
svc.install()
