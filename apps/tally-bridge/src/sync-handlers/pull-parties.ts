import { sendXML, parseTallyXml } from '../tally-client.js'
import { logger } from '../logger.js'

export interface TallyParty {
  name:          string
  alias:         string | null
  group:         string | undefined
  parent:        string | undefined
  address:       string | null
  phone:         string | null
  gstin:         string | null
  openingBalance:number
  isDebit:       boolean   // true = we owe them, false = they owe us
}

function escapeReportName(name: string): string {
  return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Pull all party ledgers from TallyPrime (Sundry Debtors + Sundry Creditors).
 *
 * Exports "List of Ledgers" (configurable via TALLY_LEDGER_REPORT env var)
 * and maps each ledger to a TallyParty with name, alias, address, phone,
 * GSTIN, and opening balance.
 *
 * Used to sync SmartLoad client records with Tally parties for outstanding
 * balance visibility and reconciliation.
 */
export async function pullPartiesFromTally(): Promise<TallyParty[]> {
  const reportName = escapeReportName(
    process.env.TALLY_LEDGER_REPORT ?? 'List of Ledgers',
  )
  logger.info('Pulling parties from TallyPrime', { reportName })

  const xml = `<EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>${reportName}</REPORTNAME>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </REQUESTDESC>
  </EXPORTDATA>`

  const responseStr = await sendXML(xml)
  const response = parseTallyXml(responseStr) as {
    ENVELOPE?: {
      BODY?: {
        EXPORTDATA?: {
          REQUESTDATA?: {
            TALLYMESSAGE?: {
              LEDGER?:
                | Array<Record<string, unknown>>
                | Record<string, unknown>
            }
          }
        }
      }
    }
  }

  const raw =
    response?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTDATA?.TALLYMESSAGE?.LEDGER
  const list = raw ? (Array.isArray(raw) ? raw : [raw]) : []

  const parsed: TallyParty[] = list
    .map((l) => {
      const balance = Number(l['OPENINGBALANCE'] ?? 0)
      return {
        name:           String(l['NAME'] ?? ''),
        alias:          l['ALIAS'] ? String(l['ALIAS']) : null,
        group:          (l['GROUP'] as string) || (l['PARENT'] as string) || undefined,
        parent:         (l['PARENT'] as string) || undefined,
        address:        l['ADDRESS'] ? String(l['ADDRESS']) : null,
        phone:          l['LEDFOLIO'] ? String(l['LEDFOLIO']) : null,
        gstin:          l['PARTYGSTIN'] ? String(l['PARTYGSTIN']) : null,
        openingBalance: Math.abs(balance),
        isDebit:        balance > 0,
      }
    })
    .filter((p) => p.name.length > 0)

  logger.info('Pulled parties from TallyPrime', { count: parsed.length })
  return parsed
}
