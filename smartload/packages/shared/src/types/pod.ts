import type { PODStatus } from './enums.js'

export interface ProofOfDelivery {
  id: string
  sessionId: string
  session?: import('./dispatch.js').DispatchSession
  linkToken: string
  linkExpiresAt: string
  status: PODStatus
  receiverName: string | null
  receiverPhone: string | null
  signatureImageUrl: string | null
  acknowledgedAt: string | null
  geoLat: number | null
  geoLng: number | null
  discrepancyNotes: string | null
  podPdfUrl: string | null
  lineItems?: PODLineItem[]
  createdAt: string
  updatedAt: string
}

export interface PODLineItem {
  id: string
  podId: string
  lineItemId: string
  lineItem?: import('./order.js').POLineItem
  deliveredBoxes: number
  acknowledgedBoxes: number
  discrepancyBoxes: number
  discrepancyReason: string | null
  createdAt: string
}
