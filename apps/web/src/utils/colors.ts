export const variantColorMap: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  walnut: '#78350f', // Brown
  teak: '#b45309', // Wood brown
  natural: '#fef3c7', // Beige / Cream
  white: '#ffffff',
  black: '#000000',
  grey: '#6b7280',
  gray: '#6b7280',
  ivory: '#fffff0',
  oak: '#d97706', // Light brown
  cream: '#fef3c7',
  beige: '#f5f5dc',
  yellow: '#eab308',
  orange: '#f97316',
  purple: '#a855f7',
  pink: '#ec4899',
  brown: '#92400e',
};

export function getVariantColor(colourName: string | null | undefined): {
  hex: string;
  isLight: boolean;
  isUnknown: boolean;
  name: string;
} {
  const defaultRes = { hex: '#9ca3af', isLight: false, isUnknown: true, name: colourName || 'Unknown' };
  
  if (!colourName) return defaultRes;

  const normalized = colourName.trim().toLowerCase();
  
  // Try exact match first
  if (variantColorMap[normalized]) {
    const hex = variantColorMap[normalized];
    return { hex, isLight: isLightColor(hex), isUnknown: false, name: colourName.trim() };
  }

  // Try partial match (e.g., "Light Blue", "Dark Red")
  for (const [key, hex] of Object.entries(variantColorMap)) {
    if (normalized.includes(key)) {
      return { hex, isLight: isLightColor(hex), isUnknown: false, name: colourName.trim() };
    }
  }

  // Unknown color fallback
  return defaultRes;
}

function isLightColor(hex: string): boolean {
  const lightColors = ['#ffffff', '#fffff0', '#fef3c7', '#f5f5dc'];
  return lightColors.includes(hex.toLowerCase());
}
