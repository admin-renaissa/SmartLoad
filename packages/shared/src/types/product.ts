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
  description: string | null
  materialType: string | null
  specifications: Record<string, any> | null
  usageGuide: string | null
  packagingDetails: string | null
  tags: string[]
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
  variantCode: string | null
  variantName: string | null
  colourCode: string
  colourName: string
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  piecesPerBox: number | null
  barcodeValue: string
  barcodeFormat: BarcodeFormat
  qrCode: string | null
  imageUrl: string | null
  mrpPaise: number | null
  status: ProductStatus
  isActive: boolean
  isDeleted: boolean
  deletedAt?: string | null
  deletedById?: string | null
  stock?: InventoryStockSummary
  inventoryStock?: { totalBoxes: number; reservedBoxes: number } | null
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
