import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore.ts';
import { playScanSound, initAudio } from '../utils/audio.ts';
import type { ScanProcessResult } from '@smartload/shared';

type ScanState =
  | { status: 'connecting' }
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'success'; result: ScanProcessResult; clearAt: number }
  | { status: 'error'; result: ScanProcessResult; clearAt: number }
  | { status: 'warning'; result: ScanProcessResult; clearAt: number }
  | { status: 'disconnected'; reason: string }
  | { status: 'closed'; summary: Record<string, unknown> };

type ScanAction =
  | { type: 'CONNECTED' }
  | { type: 'SCAN_RESULT'; result: ScanProcessResult }
  | { type: 'CLEAR' }
  | { type: 'DISCONNECT'; reason: string }
  | { type: 'SESSION_CLOSED'; summary: Record<string, unknown> };

function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'CONNECTED':
      return { status: 'idle' };
    case 'SCAN_RESULT': {
      const { result } = action;
      const displayMs = result.alertLevel === 'error' ? 3000 : 1500;
      return {
        status:
          result.alertLevel === 'success'
            ? 'success'
            : result.alertLevel === 'warning'
              ? 'warning'
              : 'error',
        result,
        clearAt: Date.now() + displayMs,
      };
    }
    case 'CLEAR':
      return { status: 'idle' };
    case 'DISCONNECT':
      return { status: 'disconnected', reason: action.reason };
    case 'SESSION_CLOSED':
      return {
        status: 'closed',
        summary: action.summary,
      };
    default:
      return state;
  }
}

export interface UseScanSessionOptions {
  sessionId: string;
  onComplete?: () => void;
}

export function useScanSession({ sessionId, onComplete }: UseScanSessionOptions) {
  const [scanState, dispatch] = useReducer(scanReducer, { status: 'connecting' });
  const socketRef = useRef<Socket | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!sessionId || !accessToken) return;

    initAudio();

    const sockRoot = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim();
    const apiRoot = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    const explicitUrl = sockRoot
      ? `${sockRoot.replace(/\/$/, '')}/scan`
      : apiRoot
        ? `${apiRoot.replace(/\/$/, '')}/scan`
        : undefined;

    const socket = explicitUrl
      ? io(explicitUrl, {
          auth: { token: accessToken },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 10,
        })
      : io('/scan', {
          path: '/socket.io',
          auth: { token: accessToken },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 10,
        });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('session:join', { sessionId });
    });

    socket.on('session:state', () => {
      dispatch({ type: 'CONNECTED' });
    });

    socket.on('scan:result', (result: ScanProcessResult) => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);

      dispatch({ type: 'SCAN_RESULT', result });

      void playScanSound(result.result);

      const displayMs = result.alertLevel === 'error' ? 3000 : 1500;
      clearTimerRef.current = setTimeout(() => {
        dispatch({ type: 'CLEAR' });
      }, displayMs);
    });

    socket.on('session:closed', (summary: Record<string, unknown>) => {
      dispatch({ type: 'SESSION_CLOSED', summary });
      onComplete?.();
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      dispatch({ type: 'DISCONNECT', reason });
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('error', (err: { message?: string }) => {
      console.error('Scan socket error:', err?.message);
    });

    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      socket.emit('session:leave', { sessionId });
      socket.disconnect();
    };
  }, [sessionId, accessToken, onComplete]);

  const submitScan = useCallback(
    (rawBarcode: string, deviceId?: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        console.warn('Socket not connected — scan dropped');
        return;
      }
      socket.emit('scan:submit', { sessionId, rawBarcode, deviceId });
    },
    [sessionId],
  );

  const closeSession = useCallback(
    (opts: { notes?: string; forcePartial?: boolean; partialReason?: string } = {}) => {
      socketRef.current?.emit('session:close', { sessionId, ...opts });
    },
    [sessionId],
  );

  return {
    scanState,
    submitScan,
    closeSession,
    isConnected,
  };
}
