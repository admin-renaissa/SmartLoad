export enum BarcodeFormat {
  QR = 'QR',
  CODE128 = 'CODE128',
  CODE39 = 'CODE39',
  DATAMATRIX = 'DATAMATRIX',
  EAN13 = 'EAN13',
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  category?: ProductCategory;
  hsnCode?: string | null;
  unitOfMeasure: string;
  piecesPerBox: number;
  weightPerBoxKg?: number | null;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  product?: Product;
  colourCode: string;
  colourName: string;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  barcodeValue: string;
  barcodeFormat: BarcodeFormat;
  imageUrl?: string | null;
  mrp?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductQRPayload {
  sku: string;
  colourCode: string;
  colourName: string;
  length?: number;
  width?: number;
  thickness?: number;
  piecesPerBox: number;
  batch?: string;
  mfgDate?: string;
}
