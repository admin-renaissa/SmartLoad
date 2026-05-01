import { useEffect, useRef } from 'react';
import type { Html5QrcodeResult } from 'html5-qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { encodeCameraScanPayload } from '../../utils/cameraScanPayload.ts';

interface CameraModalProps {
  /** Raw barcode string for API (JSON when camera driver expects structured payload). */
  onScan: (payloadForApi: string) => void;
  onClose: () => void;
}

export function CameraModal({ onScan, onClose }: CameraModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    mountedRef.current = true;
    const scanner = new Html5Qrcode('camera-reader');
    scannerRef.current = scanner;

    const onDecoded = (decodedText: string, result: Html5QrcodeResult) => {
      if (!mountedRef.current) return;
      const payload = encodeCameraScanPayload(decodedText, result);
      void scanner
        .stop()
        .then(() => onScanRef.current(payload))
        .catch(() => onScanRef.current(payload));
    };

    scanner
      .start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, onDecoded, () => {})
      .catch((err) => {
        console.error('Camera start failed:', err);
      });

    return () => {
      mountedRef.current = false;
      void scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
      <div className="text-white text-sm mb-4 uppercase tracking-widest">Camera Scanner</div>
      <div id="camera-reader" className="rounded-2xl overflow-hidden w-[300px] h-[300px]" />
      <button
        type="button"
        onClick={onClose}
        className="mt-6 text-white/70 hover:text-white text-sm px-6 py-2 border border-white/20 rounded-full"
      >
        Cancel
      </button>
    </div>
  );
}
