import type { SessionStatus, ScanResult } from './enums.js'

export interface DispatchSession {
  id: string
  sessionCode: string
  poId: string
  purchaseOrder?: import('./order.js').PurchaseOrder
  vehicleId: string
  vehicle?: import('./vehicle.js').Vehicle
  supervisorId: string
  supervisor?: import('./user.js').User
  operatorId: string | null
  operator?: import('./user.js').User | null
  status: SessionStatus
  openedAt: string
  closedAt: string | null
  totalBoxesExpected: number
  totalBoxesScanned: number
  notes: string | null
  isPartialDispatch: boolean
  partialReason: string | null
  inventoryDeducted: boolean
  tallySynced: boolean
  podCreated: boolean
  scanEvents?: ScanEvent[]
  createdAt: string
  updatedAt: string
}

export interface ScanEvent {
  id: string
  sessionId: string
  operatorId: string
  operator?: import('./user.js').User
  scannedBarcode: string
  resolvedVariantId: string | null
  resolvedVariant?: import('./product.js').ProductVariant | null
  result: ScanResult
  errorReason: string | null
  deviceId: string | null
  scannedAt: string
}

export interface LineItemProgress {
  lineItemId: string
  variantId: string
  productName: string
  colourName: string
  orderedBoxes: number
  loadedBoxes: number
  isComplete: boolean
}

export interface ScanProcessResult {
  result: ScanResult
  alertLevel: 'success' | 'warning' | 'error' | 'info'
  alertMessage: string
  variant: import('./product.js').ProductVariant | null
  lineItem: import('./order.js').POLineItem | null
  sessionProgress: {
    scanned: number
    expected: number
    percentComplete: number
    lineItems: LineItemProgress[]
  }
  scanEvent: { id: string; scannedAt: string }
}

export interface ScannerInput {
  rawValue: string
  format: import('./enums.js').BarcodeFormat
  deviceId?: string
}
