import type { ProductQRPayload } from '../types/product.js';
import { BarcodeFormat } from '../types/product.js';

export function parseQRPayload(raw: string): ProductQRPayload | null {
  try {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed) as ProductQRPayload;
      if (parsed.sku) {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function validateBarcodeFormat(code: string): BarcodeFormat {
  const trimmed = code.trim();
  if (trimmed.startsWith('{') || trimmed.length > 30) {
    return BarcodeFormat.QR;
  }
  if (/^[0-9]{13}$/.test(trimmed)) {
    return BarcodeFormat.EAN13;
  }
  if (/^[A-Z0-9\-\.\ \$\/\+\%]{1,48}$/i.test(trimmed)) {
    return BarcodeFormat.CODE39;
  }
  return BarcodeFormat.CODE128;
}

export function generateBarcodeValue(sku: string, colourCode: string, length?: number, width?: number, thickness?: number): string {
  const parts = [sku, colourCode];
  if (length) parts.push(`L${length}`);
  if (width) parts.push(`W${width}`);
  if (thickness) parts.push(`T${thickness}`);
  return parts.join('-').toUpperCase().replace(/\s+/g, '-');
}
