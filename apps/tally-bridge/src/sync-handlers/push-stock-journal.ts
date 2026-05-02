import { sendXML, parseTallyXml } from '../tally-client.js'
import { logger } from '../logger.js'

export interface StockJournalItem {
  itemName:    string
  quantity:    number
  unit:        string
  godownName?: string
}

export interface PushStockJournalDto {
  sessionCode: string
  poNumber:    string
  clientName:  string
  date:        string
  items:       StockJournalItem[]
  godownName?: string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Push a Stock Journal (outward dispatch) voucher to TallyPrime.
 *
 * Creates a Stock Journal recording the outward movement of goods from
 * the warehouse godown on the dispatch session close date.
 *
 * Narration includes session code, PO number and client name for
 * easy reconciliation in TallyPrime.
 *
 * Returns the Tally-assigned voucher ID (LASTID) on success.
 */
export async function pushStockJournal(dto: PushStockJournalDto): Promise<{ voucherId?: string }> {
  const godown = dto.godownName ?? process.env.TALLY_GODOWN ?? 'Main Warehouse'
  const dateFormatted = new Date(dto.date).toISOString().slice(0, 10).replace(/-/g, '')

  logger.info(
    'Pushing stock journal to TallyPrime',
    { sessionCode: dto.sessionCode, itemCount: dto.items.length, godown },
  )

  const itemsXML = dto.items
    .map(
      (item) => `
    <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
      <ISDELIVERED>No</ISDELIVERED>
      <ISDESTINATIONGODOWN>No</ISDESTINATIONGODOWN>
      <ACTUALQTY>${item.quantity} ${escapeXml(item.unit)}</ACTUALQTY>
      <BILLEDQTY>${item.quantity} ${escapeXml(item.unit)}</BILLEDQTY>
      <GODOWNNAME>${escapeXml(item.godownName ?? godown)}</GODOWNNAME>
    </ALLINVENTORYENTRIES.LIST>`,
    )
    .join('\n')

  const xml = `<TALLYMESSAGE>
    <VOUCHER VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Journal Voucher View">
      <DATE>${dateFormatted}</DATE>
      <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
      <ISINVOICE>No</ISINVOICE>
      <PERSISTEDVIEW>Journal Voucher View</PERSISTEDVIEW>
      <NARRATION>SmartLoad Dispatch: ${escapeXml(dto.sessionCode)} | PO: ${escapeXml(dto.poNumber)} | Client: ${escapeXml(dto.clientName)}</NARRATION>
      ${itemsXML}
    </VOUCHER>
  </TALLYMESSAGE>`

  const responseStr = await sendXML(xml, 'Import')
  const response    = parseTallyXml(responseStr) as Record<string, unknown>
  const env         = response['ENVELOPE'] as Record<string, unknown> | undefined
  const body        = (env?.['BODY'] as Record<string, unknown> | undefined)?.['IMPORTDATA'] as
    | Record<string, unknown>
    | undefined
  const importResult = (body?.['IMPORTRESULT'] as { LASTID?: string } | undefined) ?? undefined
  const voucherId    = importResult?.LASTID

  logger.info(
    'Stock journal pushed to TallyPrime successfully',
    { sessionCode: dto.sessionCode, voucherId },
  )
  return { voucherId: voucherId as string | undefined }
}
