import { BarcodeFormat } from '../types/enums.js'
import type { ProductQRPayload } from '../types/product.js'

/**
 * Attempts to parse a raw scanned string as a SmartLoad QR payload JSON.
 */
export function parseQRPayload(raw: string): ProductQRPayload | null {
  try {
    const cleaned = raw.trim().replace(/\r?\n/g, '')
    const parsed = JSON.parse(cleaned) as Partial<ProductQRPayload>
    if (!parsed.sku || !parsed.variantId || !parsed.colourCode) return null
    return parsed as ProductQRPayload
  } catch {
    return null
  }
}

/**
 * Heuristically detect barcode format from a raw scan string.
 */
export function detectBarcodeFormat(raw: string): BarcodeFormat {
  const s = raw.trim()
  if (s.startsWith('{') && s.endsWith('}')) return BarcodeFormat.QR
  if (/^\d{13}$/.test(s)) return BarcodeFormat.EAN13
  if (/^[A-Z0-9\-. $/+%]+$/.test(s) && s.length <= 43) return BarcodeFormat.CODE39
  if (s.length <= 20 && /[a-z]/.test(s)) return BarcodeFormat.DATAMATRIX
  return BarcodeFormat.CODE128
}

/** @deprecated use detectBarcodeFormat */
export const validateBarcodeFormat = detectBarcodeFormat

/**
 * Build a simple CODE128-style key from product dimensions (dev / fallback).
 */
export function generateBarcodeValue(
  sku: string,
  colourCode: string,
  lengthMm?: number,
  widthMm?: number,
  thicknessMm?: number
): string {
  const parts = [sku, colourCode]
  if (lengthMm) parts.push(`L${lengthMm}`)
  if (widthMm) parts.push(`W${widthMm}`)
  if (thicknessMm) parts.push(`T${thicknessMm}`)
  return parts.join('-').toUpperCase().replace(/\s+/g, '-')
}
