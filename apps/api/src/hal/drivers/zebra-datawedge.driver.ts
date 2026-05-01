import { BarcodeFormat, validateBarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

/**
 * Stub for Zebra DataWedge intent / HTTP delivery on Zebra mobile computers (Android).
 * For use with Zebra mobile computers running DataWedge 8.0+.
 *
 * **Configuring DataWedge to POST scans to the API**
 *
 * 1. On the device, open **DataWedge** and create or duplicate a **Profile** for your app
 *    (or use a dedicated “HTTP delivery” profile).
 * 2. Under that profile, enable the scanner **Keystroke** or **Intent** input as needed; for
 *    server-side REST ingestion, add **HTTP/REST** or **IP output** (name varies by DW version)
 *    so decoded data is sent over the network.
 * 3. Set the **URL** to your SmartLoad base URL, e.g. `https://<host>/api/v1/.../scan` (or the
 *    route your backend exposes for barcode ingestion). Use **POST** and **JSON** body if the
 *    action supports it, matching your API’s expected shape (`rawValue`, optional `format`,
 *    optional `deviceId` / session id in headers or body).
 * 4. If using **Intent** from a native Android app instead, register for DataWedge’s
 *    broadcast and forward the payload to the same API from the app; this class represents the
 *    server-side parsing of that payload once it reaches Node.
 * 5. For TLS to internal hosts, install corporate CA on the device or use a reachable hostname.
 *
 * This driver only parses the `raw` string once your integration has received the POST body
 * (or intent extras serialized to string) in the API process.
 */
export class ZebraDataWedgeDriver implements IScannerDriver {
  readonly driverName = 'zebra-datawedge';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  async init(_config: Record<string, unknown>): Promise<void> {
    // Android DataWedge runs on the device; API only receives already-delivered scan strings.
  }

  parseRawInput(raw: string): ScannerInput {
    const rawValue = raw.trim();
    const format = validateBarcodeFormat(rawValue);
    return { rawValue, format };
  }
}
