import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function buildEnvelope(requestXML: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>SmartLoad</ID>
  </HEADER>
  <BODY>
    ${requestXML}
  </BODY>
</ENVELOPE>`;
}

function logToFile(type: string, payload: string, response?: string) {
  try {
    const logDir = './logs';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(logDir, `tally-${date}.log`);
    const entry = `[${new Date().toISOString()}] ${type}\nREQUEST: ${payload}\nRESPONSE: ${response || 'N/A'}\n---\n`;
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch {
    // ignore log errors
  }
}

export async function sendXML(xmlBody: string): Promise<Record<string, unknown>> {
  const envelope = buildEnvelope(xmlBody);

  logToFile('SEND', envelope);

  const response = await axios.post(TALLY_URL, envelope, {
    headers: { 'Content-Type': 'application/xml' },
    timeout: 15000,
  });

  logToFile('RECV', '', response.data as string);

  const parsed = parser.parse(response.data as string) as Record<string, unknown>;
  return parsed;
}

export async function pingTally(): Promise<boolean> {
  try {
    const xml = '<EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA>';
    await sendXML(xml);
    return true;
  } catch {
    return false;
  }
}
