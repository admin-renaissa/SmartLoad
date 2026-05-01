import type { Html5QrcodeResult } from 'html5-qrcode';

/**
 * Payload consumed by API {@link CameraDriver} when deviceId is `camera`
 * or JSON `{ "value": string }` is detected.
 */
export function encodeCameraScanPayload(decodedText: string, scanResult: Html5QrcodeResult): string {
  const fmt = scanResult.result.format?.formatName?.trim();
  return JSON.stringify({
    value: decodedText.trim(),
    ...(fmt ? { format: fmt } : {}),
  });
}
