import { BarcodeFormat, validateBarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

function stripScanFraming(raw: string): string {
  // Keyboard-wedge scanners often send a trailing Enter (\n or \r\n); trim removes it and edge spaces.
  return raw.trim();
}

/**
 * Default driver: USB/Bluetooth scanners in keyboard-wedge (HID keyboard) mode.
 * No vendor SDK required; works with consumer and industrial scanners that emulate a keyboard.
 */
export class HidKeyboardDriver implements IScannerDriver {
  readonly driverName = 'hid-keyboard';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  async init(_config: Record<string, unknown>): Promise<void> {
    // No device handle: OS presents scanner as keyboard input to the client.
  }

  parseRawInput(raw: string): ScannerInput {
    const rawValue = stripScanFraming(raw);
    const format = validateBarcodeFormat(rawValue);
    return { rawValue, format };
  }
}
