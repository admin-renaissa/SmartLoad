import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, AlertTriangle, Scan } from 'lucide-react';
import toast from 'react-hot-toast';
import { useScanSession } from '../../hooks/useScanSession.ts';
import { useBarcodeCapture } from '../../hooks/useBarcodeCapture.ts';
import {
  countQueuedForSession,
  enqueueOfflineScan,
  flushQueuedScansForSession,
} from '../../hooks/useOfflineScanQueue.ts';
import { offlineBannerText } from '../../i18n/messages.ts';
import { CameraModal } from './CameraModal.tsx';
import api from '../../lib/axios.ts';
import type { ScanProcessResult } from '@smartload/shared';

export default function ActiveScanPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [recentScans, setRecentScans] = useState<Array<{ barcode: string; result: string; time: Date }>>([]);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  const refreshQueueCount = useCallback(async () => {
    const n = await countQueuedForSession(sessionId);
    setOfflineQueueCount(n);
  }, [sessionId]);

  const postScan = useCallback(
    async (raw: string, deviceId?: string) => {
      const r = await api.post(`/sessions/${sessionId}/scan`, {
        rawBarcode: raw,
        deviceId,
      });
      return r.data.data as ScanProcessResult;
    },
    [sessionId],
  );

  useEffect(() => {
    void refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    const onOnline = async () => {
      const flushed = await flushQueuedScansForSession(sessionId, postScan);
      if (flushed > 0) toast.success(`Replayed ${flushed} offline scan(s)`);
      await refreshQueueCount();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sessionId, postScan, refreshQueueCount]);

  const { scanState, submitScan, isConnected } = useScanSession({
    sessionId,
    onComplete: () => navigate(`/scan/${sessionId}/complete`),
  });

  const { data: sessionMeta } = useQuery({
    queryKey: ['session-header', sessionId],
    queryFn: async () => {
      const r = await api.get(`/sessions/${sessionId}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!sessionId,
    refetchInterval: 5000,
  });

  const vehicle = sessionMeta?.vehicle as Record<string, unknown> | undefined;

  const submitRestFallback = async (raw: string, deviceId?: string) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueOfflineScan({ sessionId, rawBarcode: raw, deviceId, ts: Date.now() });
      await refreshQueueCount();
      const n = await countQueuedForSession(sessionId);
      setRecentScans((prev) => {
        const [first, ...rest] = prev;
        if (!first) return prev;
        return [{ ...first, result: 'OFFLINE_QUEUED' }, ...rest];
      });
      toast(offlineBannerText(n));
      return;
    }
    try {
      const payload = await postScan(raw, deviceId);
      setRecentScans((prev) => {
        const [first, ...rest] = prev;
        if (!first) return prev;
        return [{ ...first, result: payload.result }, ...rest];
      });
    } catch {
      await enqueueOfflineScan({ sessionId, rawBarcode: raw, deviceId, ts: Date.now() });
      await refreshQueueCount();
      setRecentScans((prev) => {
        const [first, ...rest] = prev;
        if (!first) return prev;
        return [{ ...first, result: 'OFFLINE_QUEUED' }, ...rest];
      });
      toast.error('Network issue — scan saved to retry when you are online.');
    }
  };

  const handleSubmitScan = (raw: string, deviceId?: string) => {
    if (isConnected) submitScan(raw, deviceId);
    else void submitRestFallback(raw, deviceId);
  };

  const { inputRef } = useBarcodeCapture(
    (value, source) => {
      handleSubmitScan(value, source === 'scanner' ? 'hid-keyboard' : 'manual');
      setRecentScans((prev) => [
        { barcode: value.slice(0, 30), result: 'processing', time: new Date() },
        ...prev.slice(0, 2),
      ]);
    },
    { enabled: !showCamera && !showManualEntry },
  );

  useEffect(() => {
    if (
      scanState.status === 'success' ||
      scanState.status === 'error' ||
      scanState.status === 'warning'
    ) {
      const code = scanState.result.result;
      setRecentScans((prev) => {
        if (prev.length === 0) return prev;
        const [first, ...rest] = prev;
        if (first?.result !== 'processing') return prev;
        return [{ ...first, result: code }, ...rest];
      });
    }
  }, [scanState]);

  const uiStatus =
    scanState.status === 'success'
      ? 'success'
      : scanState.status === 'error'
        ? 'error'
        : scanState.status === 'warning'
          ? 'warning'
          : scanState.status === 'disconnected'
            ? 'disconnected'
            : scanState.status === 'closed'
              ? 'closed'
              : scanState.status === 'connecting'
                ? 'connecting'
                : 'idle';

  const feedbackConfig: Record<
    string,
    {
      bg: string;
      icon: React.ReactNode;
      title: string;
      sub: string;
      textColor: string;
    }
  > = {
    idle: {
      bg: 'bg-[#0F2044]',
      icon: <Scan className="w-24 h-24 text-white/40 animate-pulse" />,
      title: 'READY TO SCAN',
      sub: 'Point scanner at box barcode',
      textColor: 'text-white/60',
    },
    connecting: {
      bg: 'bg-[#0F2044]',
      icon: (
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      ),
      title: 'CONNECTING...',
      sub: 'Establishing scan session',
      textColor: 'text-white/60',
    },
    scanning: {
      bg: 'bg-[#0F2044]',
      icon: (
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      ),
      title: 'PROCESSING...',
      sub: '',
      textColor: 'text-white',
    },
    success: {
      bg: 'bg-green-500',
      icon: <CheckCircle className="w-32 h-32 text-white drop-shadow-lg" />,
      title: 'BOX ACCEPTED ✓',
      sub:
        scanState.status === 'success'
          ? scanState.result.alertMessage
          : '',
      textColor: 'text-white',
    },
    error: {
      bg: 'bg-red-600',
      icon: <XCircle className="w-32 h-32 text-white drop-shadow-lg" />,
      title: 'SCAN ERROR',
      sub:
        scanState.status === 'error'
          ? scanState.result.alertMessage
          : 'RETURN TO SHELF — Do not load',
      textColor: 'text-white',
    },
    warning: {
      bg: 'bg-amber-500',
      icon: <AlertTriangle className="w-32 h-32 text-white drop-shadow-lg" />,
      title: 'QUANTITY EXCEEDED',
      sub:
        scanState.status === 'warning'
          ? scanState.result.alertMessage
          : 'Supervisor approval required',
      textColor: 'text-white',
    },
    disconnected: {
      bg: 'bg-gray-800',
      icon: (
        <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-white" />
        </div>
      ),
      title: 'RECONNECTING...',
      sub: 'Connection lost — scans paused',
      textColor: 'text-white/70',
    },
    closed: {
      bg: 'bg-green-700',
      icon: <CheckCircle className="w-32 h-32 text-white" />,
      title: 'SESSION CLOSED',
      sub: 'All dispatches complete',
      textColor: 'text-white',
    },
  };

  const config = feedbackConfig[uiStatus] ?? feedbackConfig.idle;

  const progress: ScanProcessResult['sessionProgress'] | null =
    scanState.status === 'success' ||
    scanState.status === 'error' ||
    scanState.status === 'warning'
      ? scanState.result.sessionProgress
      : sessionMeta
        ? {
            scanned: sessionMeta.totalBoxesScanned as number,
            expected: sessionMeta.totalBoxesExpected as number,
            percentComplete: sessionMeta.totalBoxesExpected
              ? Math.round(
                  ((sessionMeta.totalBoxesScanned as number) /
                    (sessionMeta.totalBoxesExpected as number)) *
                    100,
                )
              : 0,
            lineItems: [],
          }
        : null;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden select-none">

      <input
        ref={inputRef}
        className="absolute opacity-0 w-px h-px overflow-hidden"
        aria-hidden="true"
        tabIndex={0}
      />

      <div className="flex items-center justify-between px-4 bg-[#0F2044] border-b border-white/10 h-14 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/50 text-xs uppercase tracking-widest shrink-0">Session</span>
          <span className="text-white font-mono font-bold text-sm truncate">
            {(sessionMeta?.sessionCode as string) ?? '—'}
          </span>
          <span className="text-white/30 shrink-0">|</span>
          <span className="text-white/70 text-sm truncate">
            {(vehicle?.registrationNumber as string) ?? 'Vehicle'}
          </span>
          {!isConnected && (
            <span className="text-amber-400 text-xs ml-2 shrink-0">REST fallback</span>
          )}
          {offlineQueueCount > 0 && (
            <span className="text-amber-300 text-xs ml-2 shrink-0 max-w-[200px] truncate" title={offlineBannerText(offlineQueueCount)}>
              {offlineBannerText(offlineQueueCount)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/scan')}
          className="text-white/50 hover:text-white text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          ✕ Exit
        </button>
      </div>

      <div className={`flex flex-col items-center justify-center flex-[6] transition-colors duration-300 ease-in-out ${config.bg}`}>
        <div className="mb-6 transition-all duration-200">{config.icon}</div>
        <h1 className={`text-4xl md:text-5xl font-black tracking-tight text-center px-4 ${config.textColor}`}>
          {config.title}
        </h1>
        {config.sub && (
          <p className={`mt-3 text-lg md:text-xl text-center px-6 max-w-lg ${config.textColor} opacity-80`}>
            {config.sub}
          </p>
        )}

        {scanState.status === 'success' && scanState.result.variant != null && (
          <div className="mt-4 bg-white/20 rounded-xl px-6 py-3 text-center">
            <p className="text-white font-bold text-lg">{scanState.result.variant.colourName}</p>
            <p className="text-white/80 text-sm">
              {scanState.result.lineItem?.loadedBoxes ?? 0}
              {' of '}
              {scanState.result.lineItem?.orderedBoxes ?? 0} boxes
            </p>
          </div>
        )}
      </div>

      <div className="flex-[2.5] bg-[#0F2044] border-t border-white/10 px-4 py-3 overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-white/50 text-xs uppercase tracking-widest">Progress</span>
          <span className="text-white font-bold text-lg">
            {progress
              ? `${progress.scanned} / ${progress.expected} BOXES`
              : '— / — BOXES'}
          </span>
        </div>

        <div className="w-full bg-white/10 rounded-full h-4 mb-3">
          <div
            className="h-4 rounded-full bg-green-400 transition-all duration-500"
            style={{ width: `${progress?.percentComplete ?? 0}%` }}
          />
        </div>

        <div className="space-y-1 overflow-y-auto max-h-20">
          {progress?.lineItems?.map((li) => (
            <div key={li.lineItemId} className="flex items-center gap-2 text-xs">
              <div className="w-20 truncate text-white/60">{li.productName}</div>
              <div className="flex-1 bg-white/10 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${li.isComplete ? 'bg-green-400' : 'bg-accent'}`}
                  style={{
                    width: `${li.orderedBoxes === 0 ? 0 : Math.round((li.loadedBoxes / li.orderedBoxes) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-white/50 w-12 text-right">
                {li.loadedBoxes}/{li.orderedBoxes}
              </span>
              {li.isComplete && <span className="text-green-400">✓</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="h-14 bg-[#0A1833] border-t border-white/10 flex items-center px-4 gap-3 shrink-0">
        <div className="flex-1 flex gap-2 overflow-hidden">
          {recentScans.map((s, i) => (
            <span
              key={`${s.time.getTime()}-${i}`}
              className={`text-xs px-2 py-1 rounded font-mono truncate max-w-[120px] ${
                s.result === 'SUCCESS'
                  ? 'bg-green-500/20 text-green-300'
                  :                 s.result === 'processing'
                  ? 'bg-white/10 text-white/40'
                  : s.result === 'OFFLINE_QUEUED'
                    ? 'bg-amber-600/30 text-amber-100'
                    : s.result === 'EXCESS_QUANTITY'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-red-500/20 text-red-300'
              }`}
            >
              {s.barcode}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Scan with camera"
        >
          📷
        </button>

        <button
          type="button"
          onClick={() => setShowManualEntry(true)}
          className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Manual entry"
        >
          ⌨
        </button>
      </div>

      {showManualEntry && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg text-gray-900 mb-4">Manual Barcode Entry</h3>
            <p className="text-sm text-gray-500 mb-3">Use only for damaged QR codes that cannot be scanned</p>
            <input
              autoFocus
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualBarcode.trim()) {
                  handleSubmitScan(manualBarcode.trim(), 'manual-entry');
                  setManualBarcode('');
                  setShowManualEntry(false);
                }
              }}
              placeholder="Type or paste barcode value"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowManualEntry(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (manualBarcode.trim()) {
                    handleSubmitScan(manualBarcode.trim(), 'manual-entry');
                    setManualBarcode('');
                    setShowManualEntry(false);
                  }
                }}
                className="flex-1 py-2 bg-accent text-white rounded-lg text-sm font-medium"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraModal
          onScan={(payload) => {
            handleSubmitScan(payload, 'camera');
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
