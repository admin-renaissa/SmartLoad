import { useEffect, useRef, useCallback } from 'react';

/**
 * Captures keyboard-wedge scanner input via a hidden focused input.
 */
export function useBarcodeCapture(
  onScan: (value: string, source: 'scanner' | 'keyboard') => void,
  options: {
    enabled: boolean;
    minLength?: number;
    maxWaitMs?: number;
  },
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef('');
  const lastCharRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { enabled, minLength = 4, maxWaitMs = 100 } = options;

  const flush = useCallback(
    (source: 'scanner' | 'keyboard') => {
      const value = bufferRef.current.trim();
      bufferRef.current = '';
      if (value.length >= minLength) {
        onScan(value, source);
      }
    },
    [onScan, minLength],
  );

  useEffect(() => {
    if (!enabled) return;
    const input = inputRef.current;
    if (!input) return;

    input.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();

      if (e.key === 'Enter') {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);

        const timeSinceLastChar = now - lastCharRef.current;
        const source = timeSinceLastChar < 50 ? 'scanner' : 'keyboard';
        flush(source);
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        lastCharRef.current = now;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => flush('scanner'), maxWaitMs);
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (enabled) input.focus();
      }, 50);
    };

    input.addEventListener('keydown', handleKeyDown);
    input.addEventListener('blur', handleBlur);

    return () => {
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('blur', handleBlur);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, flush, maxWaitMs]);

  return { inputRef };
}
