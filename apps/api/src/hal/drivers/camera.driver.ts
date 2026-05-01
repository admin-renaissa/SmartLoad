/**
 * Camera / Software Scanner Driver
 */

import { BarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

const HTML5QR_FORMAT_MAP: Record<string, BarcodeFormat> = {
  QR_CODE: BarcodeFormat.QR,
  CODE_128: BarcodeFormat.CODE128,
  CODE_39: BarcodeFormat.CODE39,
  DATA_MATRIX: BarcodeFormat.DATAMATRIX,
  EAN_13: BarcodeFormat.EAN13,
};

interface CameraPayload {
  value: string;
  format?: string;
}

export class CameraDriver implements IScannerDriver {
  readonly driverName = 'camera';
  readonly description = 'Browser camera scanner (html5-qrcode / ZXing)';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  parseRawInput(raw: string, deviceId?: string): ScannerInput {
    try {
      let payload: CameraPayload = { value: raw };
      try {
        payload = JSON.parse(raw) as CameraPayload;
      } catch {
        // plain string
      }

      const cleaned = payload.value.trim();
      const format = payload.format
        ? (HTML5QR_FORMAT_MAP[payload.format] ?? BarcodeFormat.UNKNOWN)
        : BarcodeFormat.QR;

      return {
        rawValue: raw,
        cleaned,
        format,
        deviceId: deviceId ?? 'camera',
        scannedAt: new Date(),
      };
    } catch {
      return {
        rawValue: raw,
        cleaned: '',
        format: BarcodeFormat.UNKNOWN,
        deviceId: deviceId ?? 'camera',
        scannedAt: new Date(),
      };
    }
  }
}
