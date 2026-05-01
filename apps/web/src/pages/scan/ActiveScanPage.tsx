import { useEffect, useReducer, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Scan, WifiOff, X } from 'lucide-react';
import { ScanResult } from '@smartload/shared';
import type { ScanProcessResult } from '@smartload/shared';
import { useAuthStore } from '../../store/authStore.ts';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { playSuccessBeep, playErrorBeep, playWarningBeep } from '../../utils/audio.ts';
import api from '../../lib/axios.ts';
import { cn } from '../../utils/cn.ts';

type ScanState = 'IDLE' | 'SCANNING' | 'SUCCESS' | 'ERROR' | 'EXCESS' | 'UNKNOWN' | 'WAITING_SUPERVISOR';

interface State {
  scanState: ScanState;
  lastResult: ScanProcessResult | null;
  isConnected: boolean;
  isReconnecting: boolean;
  recentScans: Array<ScanProcessResult & { timestamp: string }>;
  barcodeBuffer: string;
}

type Action =
  | { type: 'SCAN_RESULT'; payload: ScanProcessResult }
  | { type: 'RESET_TO_IDLE' }
  | { type: 'SOCKET_CONNECTED' }
  | { type: 'SOCKET_DISCONNECTED' }
  | { type: 'SOCKET_RECONNECTING' }
  | { type: 'BUFFER_CHAR'; char: string }
  | { type: 'CLEAR_BUFFER' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SCAN_RESULT': {
      const r = action.payload.result;
      const scanState: ScanState =
        r === ScanResult.SUCCESS ? 'SUCCESS' :
        r === ScanResult.EXCESS_QUANTITY ? 'EXCESS' :
        r === ScanResult.UNKNOWN_BARCODE ? 'UNKNOWN' :
        'ERROR';

      return {
        ...state,
        scanState,
        lastResult: action.payload,
        barcodeBuffer: '',
        recentScans: [
          { ...action.payload, timestamp: new Date().toLocaleTimeString() },
          ...state.recentScans.slice(0, 2),
        ],
      };
    }
    case 'RESET_TO_IDLE':
      return { ...state, scanState: 'IDLE', barcodeBuffer: '' };
    case 'SOCKET_CONNECTED':
      return { ...state, isConnected: true, isReconnecting: false };
    case 'SOCKET_DISCONNECTED':
      return { ...state, isConnected: false };
    case 'SOCKET_RECONNECTING':
      return { ...state, isReconnecting: true };
    case 'BUFFER_CHAR':
      return { ...state, barcodeBuffer: state.barcodeBuffer + action.char };
    case 'CLEAR_BUFFER':
      return { ...state, barcodeBuffer: '' };
    default:
      return state;
  }
}

const initialState: State = {
  scanState: 'IDLE',
  lastResult: null,
  isConnected: false,
  isReconnecting: false,
  recentScans: [],
  barcodeBuffer: '',
};

export default function ActiveScanPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuthStore();
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<Socket | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: sessionData } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/sessions/${sessionId}`);
      return res.data.data;
    },
    refetchInterval: 5000,
  });

  // Initialize WebSocket
  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/scan`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'SOCKET_CONNECTED' });
      socket.emit('session:join', { sessionId, token: accessToken });
    });

    socket.on('disconnect', () => dispatch({ type: 'SOCKET_DISCONNECTED' }));
    socket.on('connect_error', () => dispatch({ type: 'SOCKET_RECONNECTING' }));

    socket.on('scan:result', (result: ScanProcessResult) => {
      dispatch({ type: 'SCAN_RESULT', payload: result });

      if (result.result === ScanResult.SUCCESS) {
        playSuccessBeep();
        resetTimerRef.current = setTimeout(() => dispatch({ type: 'RESET_TO_IDLE' }), 1500);
      } else if (result.result === ScanResult.EXCESS_QUANTITY) {
        playWarningBeep();
      } else {
        playErrorBeep();
        resetTimerRef.current = setTimeout(() => dispatch({ type: 'RESET_TO_IDLE' }), 3000);
      }
    });

    socket.on('session:closed', () => {
      navigate(`/scan/${sessionId}/complete`);
    });

    return () => {
      socket.disconnect();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [sessionId, accessToken, navigate]);

  // HID keyboard scanner input capture
  const submitBarcode = useCallback((barcode: string) => {
    if (!barcode.trim()) return;
    dispatch({ type: 'CLEAR_BUFFER' });

    if (socketRef.current?.connected) {
      socketRef.current.emit('scan:submit', { sessionId, rawBarcode: barcode.trim() });
    } else {
      // Fallback to REST
      api.post(`/api/v1/sessions/${sessionId}/scan`, { rawBarcode: barcode.trim() })
        .then((res) => dispatch({ type: 'SCAN_RESULT', payload: res.data.data }))
        .catch(console.error);
    }
  }, [sessionId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Keep hidden input focused
      if (document.activeElement !== hiddenInputRef.current) {
        hiddenInputRef.current?.focus();
      }

      if (e.key === 'Enter') {
        submitBarcode(state.barcodeBuffer);
      } else if (e.key.length === 1) {
        dispatch({ type: 'BUFFER_CHAR', char: e.key });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.barcodeBuffer, submitBarcode]);

  // Focus hidden input on mount
  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, []);

  const scanState = state.scanState;
  const progress = state.lastResult?.sessionProgress
    ? {
        scanned: state.lastResult.sessionProgress.scanned,
        expected: state.lastResult.sessionProgress.expected,
      }
    : {
        scanned: sessionData?.totalBoxesScanned || 0,
        expected: sessionData?.totalBoxesExpected || 0,
      };

  const screenConfig = {
    IDLE: {
      bg: 'bg-primary',
      textColor: 'text-white',
      icon: <Scan className="h-24 w-24 text-white/50 animate-pulse" />,
      title: 'READY TO SCAN',
      subtitle: 'Point scanner at box barcode',
    },
    SCANNING: {
      bg: 'bg-primary',
      textColor: 'text-white',
      icon: <Scan className="h-24 w-24 text-white/70 animate-spin" />,
      title: 'PROCESSING...',
      subtitle: '',
    },
    SUCCESS: {
      bg: 'bg-green-500',
      textColor: 'text-white',
      icon: <CheckCircle className="h-28 w-28 text-white" strokeWidth={1.5} />,
      title: 'BOX ACCEPTED ✓',
      subtitle: state.lastResult?.alertMessage || '',
    },
    ERROR: {
      bg: 'bg-red-600',
      textColor: 'text-white',
      icon: <XCircle className="h-28 w-28 text-white" strokeWidth={1.5} />,
      title: 'WRONG PRODUCT',
      subtitle: 'RETURN TO SHELF — Do not load',
    },
    EXCESS: {
      bg: 'bg-amber-500',
      textColor: 'text-white',
      icon: <AlertTriangle className="h-28 w-28 text-white" strokeWidth={1.5} />,
      title: 'QUANTITY EXCEEDED',
      subtitle: 'Supervisor required to override',
    },
    UNKNOWN: {
      bg: 'bg-orange-600',
      textColor: 'text-white',
      icon: <HelpCircle className="h-28 w-28 text-white" strokeWidth={1.5} />,
      title: 'UNRECOGNISED BARCODE',
      subtitle: 'Supervisor notified',
    },
    WAITING_SUPERVISOR: {
      bg: 'bg-amber-500',
      textColor: 'text-white',
      icon: <AlertTriangle className="h-28 w-28 text-white" strokeWidth={1.5} />,
      title: 'WAITING FOR SUPERVISOR',
      subtitle: 'Supervisor override required',
    },
  };

  const config = screenConfig[scanState];

  return (
    <div className={cn('h-screen flex flex-col transition-all duration-300 no-scrollbar', config.bg)}>
      {/* Hidden barcode input */}
      <input
        ref={hiddenInputRef}
        className="opacity-0 absolute top-0 left-0 w-0 h-0"
        readOnly
        tabIndex={-1}
      />

      {/* Reconnecting banner */}
      {!state.isConnected && (
        <div className="bg-red-800 text-white text-sm py-2 px-4 flex items-center gap-2 justify-center">
          <WifiOff className="h-4 w-4" />
          {state.isReconnecting ? 'Reconnecting...' : 'Offline — scans will sync when reconnected'}
        </div>
      )}

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-white/80 text-sm font-mono font-bold">
            {sessionData?.sessionCode || 'Loading...'}
          </span>
          <span className="text-white/60 text-sm">
            {sessionData?.vehicle?.registrationNumber || '—'}
          </span>
          <span className="text-white/60 text-sm hidden sm:block">
            PO: {sessionData?.purchaseOrder?.poNumber || '—'}
          </span>
        </div>
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition"
        >
          <X className="h-4 w-4" />
          Exit
        </button>
      </div>

      {/* FEEDBACK ZONE — 60% height */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 py-8 cursor-pointer"
        onClick={() => hiddenInputRef.current?.focus()}
        style={{ minHeight: '60vh' }}
      >
        <div className="mb-6">{config.icon}</div>
        <h1 className={cn('text-4xl sm:text-5xl font-black text-center', config.textColor)}>
          {config.title}
        </h1>
        {config.subtitle && (
          <p className={cn('mt-4 text-lg sm:text-xl text-center font-medium opacity-90', config.textColor)}>
            {config.subtitle}
          </p>
        )}

        {scanState === 'SUCCESS' && state.lastResult?.variant && (
          <div className="mt-6 bg-white/20 rounded-xl px-6 py-4 text-center">
            <p className="text-white text-2xl font-bold">
              {(state.lastResult.variant as { product?: { name: string } })?.product?.name}
            </p>
            <p className="text-white/80 text-lg">
              {(state.lastResult.variant as { colourName?: string })?.colourName}
            </p>
          </div>
        )}

        {scanState === 'ERROR' && state.lastResult && (
          <div className="mt-6 bg-black/20 rounded-xl px-6 py-3 text-center">
            <p className="text-white/80 text-sm font-mono">{state.lastResult.alertMessage}</p>
          </div>
        )}

        {(scanState === 'EXCESS' || scanState === 'WAITING_SUPERVISOR') && (
          <button
            onClick={() => dispatch({ type: 'RESET_TO_IDLE' })}
            className="mt-8 bg-white/20 hover:bg-white/30 text-white font-bold py-3 px-8 rounded-xl text-lg transition"
          >
            Acknowledge & Continue
          </button>
        )}
      </div>

      {/* PROGRESS ZONE */}
      <div className="bg-black/20 px-4 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/70 text-sm font-medium">Loading Progress</span>
          <span className="text-white text-2xl font-black">
            {progress.scanned} / {progress.expected}
          </span>
        </div>
        <ProgressBar
          value={progress.scanned}
          max={progress.expected}
          showPercent={false}
          size="lg"
        />
      </div>

      {/* BOTTOM BAR — recent scans */}
      {state.recentScans.length > 0 && (
        <div className="bg-black/30 px-4 py-2 flex-shrink-0">
          <div className="flex gap-3 overflow-x-auto">
            {state.recentScans.map((scan, i) => (
              <div
                key={i}
                className={cn(
                  'flex-shrink-0 text-xs px-2 py-1 rounded',
                  scan.result === 'SUCCESS' ? 'bg-green-500/30 text-green-200' : 'bg-red-500/30 text-red-200',
                )}
              >
                {scan.result === 'SUCCESS' ? '✓' : '✗'} {scan.timestamp}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
