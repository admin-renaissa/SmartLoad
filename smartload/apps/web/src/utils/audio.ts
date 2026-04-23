const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;

function createContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function playTone(frequency: number, duration: number, gain = 0.3, ctx?: AudioContext): Promise<void> {
  return new Promise((resolve) => {
    const context = ctx || createContext();
    if (!context) return resolve();

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = gain;

    oscillator.start(context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration / 1000);
    oscillator.stop(context.currentTime + duration / 1000);

    oscillator.onended = () => resolve();
  });
}

export async function playSuccessBeep(): Promise<void> {
  await playTone(880, 200);
}

export async function playErrorBeep(): Promise<void> {
  const ctx = createContext();
  if (!ctx) return;
  await playTone(220, 300, 0.5, ctx);
  await new Promise((r) => setTimeout(r, 100));
  await playTone(220, 300, 0.5, ctx);
  await new Promise((r) => setTimeout(r, 100));
  await playTone(220, 300, 0.5, ctx);
}

export async function playWarningBeep(): Promise<void> {
  const ctx = createContext();
  if (!ctx) return;
  await playTone(440, 300, 0.4, ctx);
  await new Promise((r) => setTimeout(r, 100));
  await playTone(440, 300, 0.4, ctx);
}
