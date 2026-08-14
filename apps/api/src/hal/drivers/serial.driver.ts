/**
 * RS-232 / Serial COM Port Driver
 */

import { BarcodeFormat, detectBarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

export class SerialDriver implements IScannerDriver {
  readonly driverName = 'serial';
  readonly description = 'RS-232 serial port scanner (legacy industrial)';
  readonly supportedFormats = [BarcodeFormat.CODE128, BarcodeFormat.CODE39, BarcodeFormat.QR];

  parseRawInput(raw: string, deviceId?: string): ScannerInput {
    try {
      const cleaned = raw
        .replace(/[\x02\x03]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();

      return {
        rawValue: raw,
        cleaned,
        format: detectBarcodeFormat(cleaned),
        deviceId,
        scannedAt: new Date(),
      };
    } catch {
      return {
        rawValue: raw,
        cleaned: '',
        format: BarcodeFormat.UNKNOWN,
        deviceId,
        scannedAt: new Date(),
      };
    }
  }
}
