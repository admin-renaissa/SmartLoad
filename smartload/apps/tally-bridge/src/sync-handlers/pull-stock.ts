import { sendXML, parseTallyXml } from '../tally-client.js';

export interface TallyStockItem {
  tallyName: string;
  tallyAlias?: string;
  openingQty?: number;
  unit?: string;
}

export async function pullStockItems(): Promise<TallyStockItem[]> {
  const xml = `<EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>Stock Items</REPORTNAME>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </REQUESTDESC>
  </EXPORTDATA>`;

  const responseStr = await sendXML(xml);
  const response = parseTallyXml(responseStr) as {
    ENVELOPE?: {
      BODY?: {
        EXPORTDATA?: {
          REQUESTDATA?: {
            TALLYMESSAGE?: {
              STOCKITEM?:
                | Array<{ NAME: string; ALIAS?: string; OPENINGBALANCE?: string; BASEUNITS?: string }>
                | { NAME: string; ALIAS?: string; OPENINGBALANCE?: string; BASEUNITS?: string };
            };
          };
        };
      };
    };
  };

  const rawItems = response?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTDATA?.TALLYMESSAGE?.STOCKITEM;
  const itemsArray = rawItems ? (Array.isArray(rawItems) ? rawItems : [rawItems]) : [];

  return itemsArray.map((item) => ({
    tallyName: item.NAME as string,
    tallyAlias: item.ALIAS as string | undefined,
    openingQty: item.OPENINGBALANCE ? parseFloat(String(item.OPENINGBALANCE)) : undefined,
    unit: item.BASEUNITS as string | undefined,
  }));
}
