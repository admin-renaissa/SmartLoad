import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildEnvelope, parseTallyXml } from '../tally-client.js'

// ── buildEnvelope ──────────────────────────────────────────────────────────

describe('buildEnvelope', () => {
  it('wraps inner XML in a Tally Export ENVELOPE', () => {
    const inner  = '<EXPORTDATA><REQUESTDESC><REPORTNAME>Stock Items</REPORTNAME></REQUESTDESC></EXPORTDATA>'
    const result = buildEnvelope(inner, 'Export')

    expect(result).toContain('<ENVELOPE>')
    expect(result).toContain('<TALLYREQUEST>Export</TALLYREQUEST>')
    expect(result).toContain(inner)
    expect(result).toContain('</ENVELOPE>')
  })

  it('uses Export as default kind', () => {
    const result = buildEnvelope('<FOO/>')
    expect(result).toContain('<TALLYREQUEST>Export</TALLYREQUEST>')
  })

  it('wraps inner XML in a Tally Import ENVELOPE', () => {
    const inner  = '<TALLYMESSAGE><VOUCHER/></TALLYMESSAGE>'
    const result = buildEnvelope(inner, 'Import')

    expect(result).toContain('<TALLYREQUEST>Import</TALLYREQUEST>')
    expect(result).toContain(inner)
  })

  it('includes the VERSION and TYPE headers', () => {
    const result = buildEnvelope('<TEST/>')
    expect(result).toContain('<VERSION>1</VERSION>')
    expect(result).toContain('<TYPE>Data</TYPE>')
    expect(result).toContain('<ID>SmartLoad</ID>')
  })
})

// ── parseTallyXml ──────────────────────────────────────────────────────────

describe('parseTallyXml', () => {
  it('parses a simple XML string into an object', () => {
    const xml    = '<ENVELOPE><STATUS>success</STATUS></ENVELOPE>'
    const result = parseTallyXml(xml)

    expect(result).toHaveProperty('ENVELOPE')
    expect((result['ENVELOPE'] as { STATUS: string }).STATUS).toBe('success')
  })

  it('handles nested XML correctly', () => {
    const xml = `
      <ENVELOPE>
        <BODY>
          <EXPORTDATA>
            <REQUESTDATA>
              <TALLYMESSAGE>
                <STOCKITEM>
                  <NAME>PVC Sheet 4x8 3mm</NAME>
                  <BASEUNITS>BOX</BASEUNITS>
                </STOCKITEM>
              </TALLYMESSAGE>
            </REQUESTDATA>
          </EXPORTDATA>
        </BODY>
      </ENVELOPE>
    `
    const result = parseTallyXml(xml) as {
      ENVELOPE: {
        BODY: {
          EXPORTDATA: {
            REQUESTDATA: {
              TALLYMESSAGE: {
                STOCKITEM: { NAME: string; BASEUNITS: string }
              }
            }
          }
        }
      }
    }

    const item = result.ENVELOPE.BODY.EXPORTDATA.REQUESTDATA.TALLYMESSAGE.STOCKITEM
    expect(item.NAME).toBe('PVC Sheet 4x8 3mm')
    expect(item.BASEUNITS).toBe('BOX')
  })

  it('returns an empty object for empty XML', () => {
    const result = parseTallyXml('<ROOT/>')
    expect(result).toHaveProperty('ROOT')
  })

  it('handles XML with multiple stock items as array', () => {
    const xml = `
      <TALLYMESSAGE>
        <STOCKITEM><NAME>Item A</NAME></STOCKITEM>
        <STOCKITEM><NAME>Item B</NAME></STOCKITEM>
      </TALLYMESSAGE>
    `
    const result = parseTallyXml(xml) as {
      TALLYMESSAGE: { STOCKITEM: Array<{ NAME: string }> }
    }

    const items = result.TALLYMESSAGE.STOCKITEM
    expect(Array.isArray(items)).toBe(true)
    expect(items).toHaveLength(2)
    expect(items[0].NAME).toBe('Item A')
    expect(items[1].NAME).toBe('Item B')
  })
})

// ── pingTally ─────────────────────────────────────────────────────────────

describe('pingTally', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when Tally responds', async () => {
    const axios = await import('axios')
    vi.spyOn(axios.default, 'post').mockResolvedValueOnce({
      data: '<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>',
      status: 200,
    } as never)

    const { pingTally } = await import('../tally-client.js')
    const result = await pingTally()
    expect(result).toBe(true)
  })

  it('returns false when Tally is unreachable (ECONNREFUSED)', async () => {
    const axios = await import('axios')
    vi.spyOn(axios.default, 'post').mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    )

    const { pingTally } = await import('../tally-client.js')
    const result = await pingTally()
    expect(result).toBe(false)
  })

  it('returns false when Tally request times out', async () => {
    const axios = await import('axios')
    vi.spyOn(axios.default, 'post').mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    )

    const { pingTally } = await import('../tally-client.js')
    const result = await pingTally()
    expect(result).toBe(false)
  })
})
