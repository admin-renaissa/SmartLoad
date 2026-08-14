import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Windows Service uninstaller for SmartLoad Tally Bridge.
 *
 * Run as Administrator: `node dist/service/uninstall.js`
 *
 * This will stop and remove the SmartLoadTallyBridge Windows Service.
 * The application files are NOT deleted — only the service registration.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Service } = require('node-windows') as { Service: new (opts: Record<string, unknown>) => NodeWindowsService }

interface NodeWindowsService {
  on(event: string, cb: (...args: unknown[]) => void): void
  uninstall(): void
}

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const svc = new Service({
  name:   'SmartLoadTallyBridge',
  script: path.join(__dirname, '..', 'index.js'),
})

svc.on('uninstall', () => {
  console.log('✅ SmartLoad Tally Bridge Windows Service uninstalled successfully')
})

svc.on('error', (err: unknown) => {
  console.error('❌ Service uninstallation failed:', err)
})

console.log('Uninstalling SmartLoad Tally Bridge Windows Service...')
svc.uninstall()
