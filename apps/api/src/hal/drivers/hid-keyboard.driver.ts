/**
 * HID Keyboard-Wedge Driver (DEFAULT)
 */

import { BarcodeFormat, detectBarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

export class HIDKeyboardDriver implements IScannerDriver {
  readonly driverName = 'hid-keyboard';
  readonly description = 'USB/Bluetooth keyboard-wedge scanner (default, universal)';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  parseRawInput(raw: string, deviceId?: string): ScannerInput {
    try {
      const cleaned = raw
        .replace(/^\uFEFF/, '')
        .replace(/\r?\n$/g, '')
        .replace(/\r/g, '')
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

/** Alias for older imports */
export { HIDKeyboardDriver as HidKeyboardDriver };
