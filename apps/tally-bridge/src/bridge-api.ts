import Fastify                              from 'fastify'
import cors                                 from '@fastify/cors'
import { z }                                from 'zod'
import { pingTally }                        from './tally-client.js'
import { pullStockItems as pullStockItemsEnriched } from './sync-handlers/pull-stock-items.js'
import { pullStockItems as pullStockItemsLegacy }   from './sync-handlers/pull-stock.js'
import { pullPartiesFromTally }             from './sync-handlers/pull-parties.js'
import { pullPurchaseOrdersFromTally }      from './sync-handlers/pull-orders.js'
import { pushStockJournal }                 from './sync-handlers/push-stock-journal.js'
import { pushGrnToTally }                   from './sync-handlers/push-grn.js'
import { logger }                           from './logger.js'

const BRIDGE_SECRET = process.env.TALLY_BRIDGE_SECRET ?? 'change-me'
let lastSyncAt: string | null = null
let lastPollAt: string | null = null

// ── Zod schemas for push endpoints ─────────────────────────────────────────

const stockJournalBodySchema = z.object({
  session: z.record(z.unknown()),
})

const grnBodySchema = z.object({
  grn: z.record(z.unknown()),
})

// ── Factory function ────────────────────────────────────────────────────────

export async function createBridgeApp() {
  const app = Fastify({ logger: false })  // use our own Winston logger

  await app.register(cors, { origin: true })

  // ── Auth middleware ─────────────────────────────────────────────────────
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health?')) return

    const auth  = request.headers.authorization
    const token = auth?.replace('Bearer ', '')

    if (!token || token !== BRIDGE_SECRET) {
      logger.warn('Unauthorized bridge request', { ip: request.ip, url: request.url })
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // ── GET /health ─────────────────────────────────────────────────────────
  app.get('/health', async () => {
    const tallyConnected = await pingTally()
    const status = {
      status:        'ok',
      tallyConnected,
      tallyUrl:      process.env.TALLY_URL ?? 'http://localhost:9000',
      tallyCompany:  process.env.TALLY_COMPANY_NAME ?? 'Not configured',
      bridgeVersion: '1.0.0',
      lastSyncAt,
      lastPollAt,
      timestamp:     new Date().toISOString(),
      uptime:        Math.floor(process.uptime()),
    }
    logger.debug('Health check', status)
    return status
  })

  // ── GET /tally-status ───────────────────────────────────────────────────
  app.get('/tally-status', async () => {
    const connected = await pingTally()
    return {
      connected,
      url:        process.env.TALLY_URL ?? 'http://localhost:9000',
      company:    process.env.TALLY_COMPANY_NAME ?? 'Not configured',
      checkedAt:  new Date().toISOString(),
    }
  })

  // ── POST /pull/stock-items ──────────────────────────────────────────────
  // Returns enriched stock items (name, alias, parent, unit, openingQty, openingRate)
  app.post('/pull/stock-items', async (_request, reply) => {
    try {
      logger.info('Bridge: pull stock-items (enriched) requested')
      const items = await pullStockItemsEnriched()
      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, data: items, count: items.length, pulledAt: lastSyncAt })
    } catch (err) {
      logger.error('Failed to pull stock items (enriched)', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  // ── POST /pull/stock-items/legacy ───────────────────────────────────────
  // Legacy format (tallyName, tallyAlias, openingQty, unit) for backward compat
  app.post('/pull/stock-items/legacy', async (_request, reply) => {
    try {
      const items = await pullStockItemsLegacy()
      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, items, count: items.length, pulledAt: lastSyncAt })
    } catch (err) {
      logger.error('Failed to pull stock items (legacy)', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  // ── POST /pull/parties ──────────────────────────────────────────────────
  app.post('/pull/parties', async (_request, reply) => {
    try {
      logger.info('Bridge: pull parties requested')
      const parties = await pullPartiesFromTally()
      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, data: parties, count: parties.length, pulledAt: lastSyncAt })
    } catch (err) {
      logger.error('Failed to pull parties', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  // ── POST /pull/orders ───────────────────────────────────────────────────
  app.post('/pull/orders', async (_request, reply) => {
    try {
      logger.info('Bridge: pull orders requested')
      const result = await pullPurchaseOrdersFromTally()
      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, ...result, pulledAt: lastSyncAt })
    } catch (err) {
      logger.error('Failed to pull orders', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  // ── POST /push/stock-journal ────────────────────────────────────────────
  app.post('/push/stock-journal', async (request, reply) => {
    try {
      const parsed = stockJournalBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.message })
      }

      const session   = parsed.data.session
      const po        = session['po'] as Record<string, unknown>
      const client    = po?.['client'] as Record<string, unknown>

      type ScanEvent = {
        resolvedVariant?: {
          product?: { name?: string; unitOfMeasure?: string }
          colourName?: string
        }
      }
      const scanEvents = (session['scanEvents'] as ScanEvent[]) ?? []

      const itemCounts = new Map<string, { count: number; unit: string }>()
      for (const event of scanEvents) {
        const key      = `${event.resolvedVariant?.product?.name ?? ''} ${event.resolvedVariant?.colourName ?? ''}`.trim()
        const existing = itemCounts.get(key)
        if (existing) existing.count++
        else itemCounts.set(key, { count: 1, unit: event.resolvedVariant?.product?.unitOfMeasure ?? 'Nos' })
      }

      const items = Array.from(itemCounts.entries()).map(([name, { count, unit }]) => ({
        itemName: name,
        quantity: count,
        unit,
      }))

      const result = await pushStockJournal({
        sessionCode: session['sessionCode'] as string,
        poNumber:    (po?.['poNumber'] as string) ?? '',
        clientName:  (client?.['name'] as string) ?? '',
        date:        (session['closedAt'] as string) ?? new Date().toISOString(),
        items,
      })

      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, voucherId: result.voucherId, ...result })
    } catch (err) {
      logger.error('Failed to push stock journal', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  // ── POST /push/grn ──────────────────────────────────────────────────────
  app.post('/push/grn', async (request, reply) => {
    try {
      const parsed = grnBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.message })
      }

      const grn          = parsed.data.grn
      const grnNumber    = (grn['grnNumber'] as string) ?? 'GRN'
      const receivedDate = (grn['receivedDate'] as string) ?? new Date().toISOString()
      const lineItemsRaw = (grn['lineItems'] as Array<Record<string, unknown>>) ?? []

      const lineItems = lineItemsRaw.map((li) => {
        const variant = li['variant'] as
          | { product?: { name?: string; unitOfMeasure?: string }; colourName?: string }
          | undefined
        const name         = [variant?.product?.name, variant?.colourName].filter(Boolean).join(' ')
        const receivedBoxes = (li['receivedBoxes'] as number) ?? 0
        const unit         = variant?.product?.unitOfMeasure ?? 'Nos'
        const rate         = (li['rate'] as number) ?? 0
        return {
          itemDescription: name || 'Item',
          quantity:        receivedBoxes,
          unit,
          rate,
        }
      })

      const result = await pushGrnToTally({ grnNumber, receivedDate, lineItems })
      lastSyncAt = new Date().toISOString()
      return reply.send({ success: true, voucherId: result.voucherId, ...result })
    } catch (err) {
      logger.error('Failed to push GRN', { err })
      return reply.code(500).send({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  })

  return app
}

/**
 * Mark last background poll time (used by /health for ops visibility).
 */
export function setLastPollTime(iso: string) {
  lastPollAt = iso
}
