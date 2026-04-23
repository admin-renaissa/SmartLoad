export enum MovementType {
  INWARD = 'INWARD',
  OUTWARD = 'OUTWARD',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export interface InventoryLedger {
  id: string;
  variantId: string;
  movementType: MovementType;
  boxes: number;
  pieces: number;
  referenceType: string;
  referenceId: string;
  notes?: string | null;
  createdById: string;
  createdAt: string;
}

export interface InventoryStock {
  id: string;
  variantId: string;
  totalBoxes: number;
  reservedBoxes: number;
  updatedAt: string;
}

export interface StockSummary {
  variantId: string;
  totalBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  totalPieces: number;
  isLowStock: boolean;
}
