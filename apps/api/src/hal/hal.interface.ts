import type { BarcodeFormat } from '@smartload/shared';

/** Normalised output from any scanner driver */
export interface ScannerInput {
  rawValue: string;
  cleaned: string;
  format: BarcodeFormat;
  deviceId?: string;
  scannedAt: Date;
}

/** Every scanner driver must implement this interface */
export interface IScannerDriver {
  readonly driverName: string;
  readonly supportedFormats: BarcodeFormat[];
  readonly description: string;

  init?(config?: Record<string, unknown>): Promise<void>;
  destroy?(): Promise<void>;

  /** Must NEVER throw — return a best-effort result even for malformed input. */
  parseRawInput(raw: string, deviceId?: string): ScannerInput;
}
