import { sendXML, parseTallyXml } from '../tally-client.js'
import { logger } from '../logger.js'

export interface TallyStockItem {
  name:        string
  alias:       string | null
  parent:      string | null
  unit:        string | null
  openingQty:  number
  openingRate: number
}

/**
 * Pull all stock items from TallyPrime.
 *
 * Uses Tally's "Stock Items" report export to retrieve each item's
 * name, alias (used to match SmartLoad SKUs), parent group, unit,
 * opening quantity and rate.
 *
 * Mapping strategy:
 *   TallyPrime item name  → SmartLoad variant barcodeValue
 *   TallyPrime item alias → SmartLoad variant SKU (set via TDL)
 */
export async function pullStockItems(): Promise<TallyStockItem[]> {
  logger.info('Pulling stock items from TallyPrime')

  const xml = `<EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>Stock Items</REPORTNAME>
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
              STOCKITEM?:
                | Array<Record<string, unknown>>
                | Record<string, unknown>
            }
          }
        }
      }
    }
  }

  const rawItems =
    response?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTDATA?.TALLYMESSAGE?.STOCKITEM
  const itemsArray = rawItems
    ? Array.isArray(rawItems)
      ? rawItems
      : [rawItems]
    : []

  const parsed: TallyStockItem[] = itemsArray
    .map((item) => ({
      name:        String(item['NAME'] ?? ''),
      alias:       item['ALIAS'] ? String(item['ALIAS']) : null,
      parent:      item['PARENT'] ? String(item['PARENT']) : null,
      unit:        item['BASEUNITS'] ? String(item['BASEUNITS']) : null,
      openingQty:  Number(item['OPENINGBALANCE'] ?? 0),
      openingRate: Number(item['OPENINGRATE'] ?? 0),
    }))
    .filter((item) => item.name.length > 0)

  logger.info('Pulled stock items from TallyPrime', { count: parsed.length })
  return parsed
}
