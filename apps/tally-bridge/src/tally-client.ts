import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

const LOG_DIR = process.env.TALLY_BRIDGE_LOG_DIR || path.join(process.cwd(), 'logs');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

/**
 * Append one request/response pair to a file that rolls by calendar day (YYYY-MM-DD).
 */
function logRequestResponseDaily(requestXml: string, responseXml: string): void {
  ensureLogDir();
  const date = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOG_DIR, `tally-http-${date}.log`);
  const entry = `[${new Date().toISOString()}]\n--- REQUEST ---\n${requestXml}\n--- RESPONSE ---\n${responseXml}\n========\n\n`;
  try {
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch {
    /* ignore disk errors */
  }
}

export type TallyRequestKind = 'Export' | 'Import';

/**
 * Wraps inner Tally request XML in the standard ENVELOPE used by TallyPrime HTTP API.
 * Use **Import** for voucher writes (e.g. stock journal, purchase); **Export** for reports.
 */
export function buildEnvelope(requestXML: string, tallyRequest: TallyRequestKind = 'Export'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>${tallyRequest}</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>SmartLoad</ID>
  </HEADER>
  <BODY>
    ${requestXML}
  </BODY>
</ENVELOPE>`;
}

/**
 * Parse Tally response XML (after sendXML) into a plain object for handlers.
 */
export function parseTallyXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

/**
 * POST raw request body to Tally HTTP endpoint, return response **body as string**.
 * Response is validated as XML via fast-xml-parser; request/response are logged to a daily file.
 */
export async function sendXML(xmlBody: string, kind: TallyRequestKind = 'Export'): Promise<string> {
  const envelope = buildEnvelope(xmlBody, kind);

  const response = await axios.post<string>(TALLY_URL, envelope, {
    headers: { 'Content-Type': 'application/xml' },
    timeout: Number(process.env.TALLY_HTTP_TIMEOUT_MS) || 15000,
    responseType: 'text',
    transformResponse: [(data) => data],
  });

  const body = typeof response.data === 'string' ? response.data : String(response.data);

  try {
    parser.parse(body);
  } catch (e) {
    console.warn('[tally-client] Response is not valid XML:', e);
  }

  logRequestResponseDaily(envelope, body);
  return body;
}

export async function pingTally(): Promise<boolean> {
  try {
    const xml =
      '<EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA>';
    await sendXML(xml);
    return true;
  } catch {
    return false;
  }
}
