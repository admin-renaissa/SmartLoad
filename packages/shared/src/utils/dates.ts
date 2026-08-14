/**
 * Generate a daily-sequential document code.
 * Format: PREFIX-YYYYMMDD-XXXX  e.g. DS-20260415-0001
 */
export function generateDocCode(prefix: string, sequence: number): string {
  const now = new Date()
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('')
  return `${prefix}-${date}-${String(sequence).padStart(4, '0')}`
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function isExpired(expiresAt: Date | string): boolean {
  return new Date(expiresAt) < new Date()
}
