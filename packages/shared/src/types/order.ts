import type { POStatus } from './enums.js'

export interface Client {
  id: string
  clientCode: string
  name: string
  gstin: string | null
  phone: string
  email: string | null
  billingAddress: Address
  shippingAddress: Address
  contactPersonName: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
  country: string
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  clientId: string
  client?: Client
  orderDate: string
  expectedDispatchDate: string | null
  status: POStatus
  totalAmountPaise: number
  notes: string | null
  lineItems?: POLineItem[]
  sessions?: DispatchSessionSummary[]
  tallyVoucherId: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface POLineItem {
  id: string
  poId: string
  variantId: string
  variant?: import('./product.js').ProductVariant
  orderedBoxes: number
  orderedPieces: number
  ratePerBoxPaise: number
  gstPercent: number
  totalAmountPaise: number
  loadedBoxes: number
  loadedPieces: number
  createdAt: string
  updatedAt: string
}

export interface DispatchSessionSummary {
  id: string
  sessionCode: string
  vehicleId: string
  status: import('./enums.js').SessionStatus
  openedAt: string
  closedAt: string | null
}
