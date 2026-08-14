import { sendXML, parseTallyXml } from '../tally-client.js'
import { logger } from '../logger.js'

export interface GrnLineForTally {
  itemDescription: string
  quantity:        number
  unit:            string
  godownName?:     string
  /** Rate per unit in rupees. Defaults to 0 if unknown. */
  rate?:           number
}

export interface PushGrnDto {
  grnNumber:      string
  receivedDate:   string
  lineItems:      GrnLineForTally[]
  /** Ledger name in Tally for the supplier (defaults to TALLY_DEFAULT_VENDOR_LEDGER) */
  partyLedgerName?: string
  godownName?:    string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Pushes a goods-receipt as a **Purchase** inventory voucher in TallyPrime.
 *
 * Requires a valid `TALLY_DEFAULT_VENDOR_LEDGER` (or per-call `partyLedgerName`)
 * that exists as a ledger in the Tally company.
 *
 * If `rate` is provided per line item, it is used to compute the line amount
 * for proper accounting allocation.
 *
 * Returns the Tally-assigned voucher ID (LASTID) on success.
 */
export async function pushGrnToTally(dto: PushGrnDto): Promise<{ voucherId?: string }> {
  const party = dto.partyLedgerName ?? process.env.TALLY_DEFAULT_VENDOR_LEDGER
  if (!party) {
    throw new Error('Set TALLY_DEFAULT_VENDOR_LEDGER or partyLedgerName for GRN push')
  }

  const godown = dto.godownName ?? process.env.TALLY_GODOWN ?? 'Main Warehouse'
  const dateFormatted = new Date(dto.receivedDate).toISOString().slice(0, 10).replace(/-/g, '')

  logger.info(
    'Pushing GRN to TallyPrime',
    { grnNumber: dto.grnNumber, itemCount: dto.lineItems.length, party },
  )

  const itemsXML = dto.lineItems
    .map((item) => {
      const rate = item.rate ?? 0
      const amount = item.quantity * rate
      return `
    <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>${escapeXml(item.itemDescription)}</STOCKITEMNAME>
      <ISDELIVERED>No</ISDELIVERED>
      <ACTUALQTY>${item.quantity} ${escapeXml(item.unit)}</ACTUALQTY>
      <BILLEDQTY>${item.quantity} ${escapeXml(item.unit)}</BILLEDQTY>
      <RATE>${rate} /${escapeXml(item.unit)}</RATE>
      <AMOUNT>${amount}</AMOUNT>
      <GODOWNNAME>${escapeXml(item.godownName ?? godown)}</GODOWNNAME>
    </ALLINVENTORYENTRIES.LIST>`
    })
    .join('\n')

  const xml = `<TALLYMESSAGE>
    <VOUCHER VCHTYPE="Purchase" ACTION="Create" OBJVIEW="Invoice Voucher View">
      <DATE>${dateFormatted}</DATE>
      <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <PARTYNAME>${escapeXml(party)}</PARTYNAME>
      <NARRATION>SmartLoad GRN ${escapeXml(dto.grnNumber)}</NARRATION>
      ${itemsXML}
    </VOUCHER>
  </TALLYMESSAGE>`

  const responseStr = await sendXML(xml, 'Import')
  const response = parseTallyXml(responseStr) as Record<string, unknown>
  const env        = response['ENVELOPE'] as Record<string, unknown> | undefined
  const body       = (env?.['BODY'] as Record<string, unknown> | undefined)?.['IMPORTDATA'] as
    | Record<string, unknown>
    | undefined
  const importResult = (body?.['IMPORTRESULT'] as { LASTID?: string } | undefined) ?? undefined
  const voucherId    = importResult?.LASTID

  logger.info('GRN pushed to TallyPrime successfully', { grnNumber: dto.grnNumber, voucherId })
  return { voucherId: voucherId as string | undefined }
}
