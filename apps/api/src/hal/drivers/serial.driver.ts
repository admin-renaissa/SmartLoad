import { BarcodeFormat, validateBarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

function stripSerialFraming(raw: string): string {
  return raw.replace(/^\x02+/, '').replace(/\x03+$/, '').trim();
}

/**
 * RS-232 serial scanner path (placeholder). Real integration requires opening a COM port
 * (e.g. node-serialport) and streaming bytes; this stub only normalizes a raw string
 * as if it were read from a serial buffer.
 */
export class SerialScannerDriver implements IScannerDriver {
  readonly driverName = 'serial';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  async init(_config: Record<string, unknown>): Promise<void> {
    console.log('Serial driver loaded — configure COM port in settings');
  }

  parseRawInput(raw: string): ScannerInput {
    const rawValue = stripSerialFraming(raw);
    const format = validateBarcodeFormat(rawValue);
    return { rawValue, format };
  }
}
