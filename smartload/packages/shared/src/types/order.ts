import type { Client } from './client.js';
import type { ProductVariant } from './product.js';

export enum POStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  LOADING = 'LOADING',
  PARTIALLY_DISPATCHED = 'PARTIALLY_DISPATCHED',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface POLineItem {
  id: string;
  poId: string;
  variantId: string;
  variant?: ProductVariant;
  orderedBoxes: number;
  orderedPieces: number;
  ratePerBox: number;
  gstPercent: number;
  totalAmount: number;
  loadedBoxes: number;
  loadedPieces: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  clientId: string;
  client?: Client;
  orderDate: string;
  expectedDispatchDate?: string | null;
  status: POStatus;
  totalAmount: number;
  notes?: string | null;
  createdById: string;
  updatedById?: string | null;
  tallyVoucherId?: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: POLineItem[];
}
