import { sendXML, parseTallyXml } from '../tally-client.js';

export interface TallyParty {
  name: string;
  alias?: string;
  group?: string;
  parent?: string;
}

function escapeReportName(name: string): string {
  return name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Exports “List of Ledgers” and maps to party list (Sundry Debtors / Creditors when present).
 * Override with env `TALLY_LEDGER_REPORT` if you use a custom report.
 */
export async function pullPartiesFromTally(): Promise<TallyParty[]> {
  const reportName = escapeReportName(process.env.TALLY_LEDGER_REPORT || 'List of Ledgers');
  const xml = `<EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>${reportName}</REPORTNAME>
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
              LEDGER?:
                | Array<{ NAME?: string; ALIAS?: string; PARENT?: string; GROUP?: string }>
                | { NAME?: string; ALIAS?: string; PARENT?: string; GROUP?: string };
            };
          };
        };
      };
    };
  };

  const raw = response?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTDATA?.TALLYMESSAGE?.LEDGER;
  const list = raw ? (Array.isArray(raw) ? raw : [raw]) : [];

  return list
    .map((L) => ({
      name: (L.NAME as string) || '',
      alias: L.ALIAS as string | undefined,
      group: (L.GROUP as string) || (L.PARENT as string) || undefined,
      parent: L.PARENT as string | undefined,
    }))
    .filter((p) => p.name.length > 0);
}
