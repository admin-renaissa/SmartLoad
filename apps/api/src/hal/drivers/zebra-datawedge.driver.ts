/**
 * Zebra DataWedge Driver
 */

import { BarcodeFormat } from '@smartload/shared';
import type { IScannerDriver, ScannerInput } from '../hal.interface.js';

const DATAWEDGE_LABEL_MAP: Record<string, BarcodeFormat> = {
  'LABEL-TYPE-QRCODE': BarcodeFormat.QR,
  'LABEL-TYPE-CODE128': BarcodeFormat.CODE128,
  'LABEL-TYPE-CODE39': BarcodeFormat.CODE39,
  'LABEL-TYPE-DATAMATRIX': BarcodeFormat.DATAMATRIX,
  'LABEL-TYPE-EAN13': BarcodeFormat.EAN13,
};

export interface DataWedgePayload {
  data: string;
  labelType?: string;
  deviceId?: string;
}

export class ZebraDataWedgeDriver implements IScannerDriver {
  readonly driverName = 'zebra-datawedge';
  readonly description = 'Zebra DataWedge HTTP output (Zebra Android mobile computers)';
  readonly supportedFormats = Object.values(BarcodeFormat) as BarcodeFormat[];

  parseRawInput(raw: string, deviceId?: string): ScannerInput {
    try {
      let payload: DataWedgePayload = { data: raw };
      try {
        payload = JSON.parse(raw) as DataWedgePayload;
      } catch {
        // plain string
      }

      const cleaned = (payload.data ?? '').trim();
      const labelType = payload.labelType ?? '';
      const format = DATAWEDGE_LABEL_MAP[labelType] ?? BarcodeFormat.UNKNOWN;

      return {
        rawValue: raw,
        cleaned,
        format,
        deviceId: payload.deviceId ?? deviceId,
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
