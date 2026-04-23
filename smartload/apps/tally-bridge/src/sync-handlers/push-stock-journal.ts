import { sendXML } from '../tally-client.js';

export interface StockJournalItem {
  itemName: string;
  quantity: number;
  unit: string;
  godownName?: string;
}

export interface PushStockJournalDto {
  sessionCode: string;
  poNumber: string;
  clientName: string;
  date: string;
  items: StockJournalItem[];
  godownName?: string;
}

export async function pushStockJournal(dto: PushStockJournalDto): Promise<{ voucherId?: string }> {
  const godown = dto.godownName || process.env.TALLY_GODOWN || 'Main Warehouse';
  const dateFormatted = new Date(dto.date).toISOString().slice(0, 10).replace(/-/g, '');

  const itemsXML = dto.items.map((item) => `
    <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>${item.itemName}</STOCKITEMNAME>
      <ISDELIVERED>No</ISDELIVERED>
      <ISDESTINATIONGODOWN>No</ISDESTINATIONGODOWN>
      <ACTUALQTY>${item.quantity} ${item.unit}</ACTUALQTY>
      <BILLEDQTY>${item.quantity} ${item.unit}</BILLEDQTY>
      <GODOWNNAME>${item.godownName || godown}</GODOWNNAME>
    </ALLINVENTORYENTRIES.LIST>`).join('\n');

  const xml = `<TALLYMESSAGE>
    <VOUCHER VCHTYPE="Stock Journal" ACTION="Create" OBJVIEW="Journal Voucher View">
      <DATE>${dateFormatted}</DATE>
      <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
      <ISINVOICE>No</ISINVOICE>
      <PERSISTEDVIEW>Journal Voucher View</PERSISTEDVIEW>
      <NARRATION>SmartLoad Dispatch: ${dto.sessionCode} | PO: ${dto.poNumber} | Client: ${dto.clientName}</NARRATION>
      ${itemsXML}
    </VOUCHER>
  </TALLYMESSAGE>`;

  const response = await sendXML(xml);
  const voucherId = (response as { ENVELOPE?: { BODY?: { IMPORTDATA?: { IMPORTRESULT?: { LASTID?: string } } } } })
    ?.ENVELOPE?.BODY?.IMPORTDATA?.IMPORTRESULT?.LASTID;

  return { voucherId: voucherId as string | undefined };
}
