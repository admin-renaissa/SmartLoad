import 'dotenv/config'
import { createBridgeApp, setLastPollTime } from './bridge-api.js'
import { pingTally }                         from './tally-client.js'
import { logger }                            from './logger.js'

const PORT    = Number(process.env.BRIDGE_PORT ?? 7474)
const HOST    = process.env.BRIDGE_HOST ?? '127.0.0.1'
const POLL_MS = Number(process.env.TALLY_POLL_INTERVAL_MS ?? 60_000)

function startTallyPollLoop(): void {
  if (POLL_MS <= 0) {
    logger.info('Tally poll loop disabled (TALLY_POLL_INTERVAL_MS=0)')
    return
  }

  const tick = () => {
    void (async () => {
      const ok = await pingTally()
      setLastPollTime(new Date().toISOString())
      if (!ok) {
        logger.warn(
          'Tally poll: TallyPrime not reachable',
          { url: process.env.TALLY_URL ?? 'http://localhost:9000' },
        )
      } else {
        logger.debug('Tally poll: TallyPrime is reachable')
      }
    })()
  }

  tick()
  setInterval(tick, POLL_MS)
  logger.info('Tally poll loop started', { pollIntervalMs: POLL_MS })
}

async function start(): Promise<void> {
  const app = await createBridgeApp()

  await app.listen({ port: PORT, host: HOST })

  logger.info('🌉 SmartLoad Tally Bridge started', { port: PORT, host: HOST })
  logger.info(`   Health:   http://${HOST}:${PORT}/health`)
  logger.info(`   Tally:    ${process.env.TALLY_URL ?? 'http://localhost:9000'}`)
  logger.info(`   Company:  ${process.env.TALLY_COMPANY_NAME ?? '(not set)'}`)
  logger.info(`   Godown:   ${process.env.TALLY_GODOWN ?? 'Main Warehouse'}`)

  startTallyPollLoop()
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info('Shutdown signal received — closing gracefully', { signal })
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))

start().catch((err) => {
  logger.error('Failed to start SmartLoad Tally Bridge', { err })
  process.exit(1)
})
