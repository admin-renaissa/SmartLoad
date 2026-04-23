import type { ProductVariant } from './product.js';
import type { POLineItem } from './order.js';

export enum SessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum ScanResult {
  SUCCESS = 'SUCCESS',
  WRONG_PRODUCT = 'WRONG_PRODUCT',
  WRONG_COLOUR = 'WRONG_COLOUR',
  EXCESS_QUANTITY = 'EXCESS_QUANTITY',
  UNKNOWN_BARCODE = 'UNKNOWN_BARCODE',
}

export interface DispatchSession {
  id: string;
  sessionCode: string;
  poId: string;
  vehicleId: string;
  supervisorId: string;
  operatorId?: string | null;
  status: SessionStatus;
  openedAt: string;
  closedAt?: string | null;
  totalBoxesExpected: number;
  totalBoxesScanned: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanEvent {
  id: string;
  sessionId: string;
  operatorId: string;
  scannedBarcode: string;
  resolvedVariantId?: string | null;
  result: ScanResult;
  errorReason?: string | null;
  deviceId?: string | null;
  scannedAt: string;
}

export interface ScanProcessResult {
  result: ScanResult;
  variant?: ProductVariant;
  lineItem?: POLineItem;
  sessionProgress: {
    scanned: number;
    expected: number;
    percent: number;
  };
  alertLevel: 'success' | 'warning' | 'error';
  alertMessage: string;
}

export interface ScannerInput {
  rawValue: string;
  format: string;
  deviceId?: string;
}
