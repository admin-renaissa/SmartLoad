import type { BarcodeFormat, ProductStatus } from './enums.js'

export interface ProductCategory {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  categoryId: string
  category?: ProductCategory
  hsnCode: string | null
  unitOfMeasure: string
  piecesPerBox: number
  weightPerBoxKg: number | null
  minStockAlert: number
  status: ProductStatus
  isActive: boolean
  isDeleted: boolean
  deletedAt?: string | null
  deletedById?: string | null
  variants?: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface ProductVariant {
  id: string
  productId: string
  product?: Product
  colourCode: string
  colourName: string
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  barcodeValue: string
  barcodeFormat: BarcodeFormat
  imageUrl: string | null
  mrpPaise: number | null
  status: ProductStatus
  isActive: boolean
  stock?: InventoryStockSummary
  createdAt: string
  updatedAt: string
}

export interface InventoryStockSummary {
  totalBoxes: number
  reservedBoxes: number
  availableBoxes: number
  totalPieces: number
}

export interface ProductQRPayload {
  sku: string
  variantId: string
  colourCode: string
  colourName: string
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  piecesPerBox: number
  batchCode?: string
  mfgDate?: string
}
