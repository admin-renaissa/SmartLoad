import type { BarcodeFormat, ScannerInput } from '@smartload/shared';

export type { ScannerInput };

export interface IScannerDriver {
  driverName: string;
  supportedFormats: BarcodeFormat[];
  init(config: Record<string, unknown>): Promise<void>;
  parseRawInput(raw: string): ScannerInput;
}
