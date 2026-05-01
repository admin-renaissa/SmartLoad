/**
 * Web Audio API — programmatic sound generation.
 */

let audioCtx: AudioContext | null = null;

export function initAudio(): void {
  if (!audioCtx && typeof window !== 'undefined') {
    audioCtx =
      new (window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
  }
}

function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  gainValue = 0.4,
  delayMs = 0,
): Promise<void> {
  return new Promise((resolve) => {
    if (!audioCtx) {
      resolve();
      return;
    }

    setTimeout(() => {
      const oscillator = audioCtx!.createOscillator();
      const gainNode = audioCtx!.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx!.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioCtx!.currentTime);

      gainNode.gain.setValueAtTime(0, audioCtx!.currentTime);
      gainNode.gain.linearRampToValueAtTime(gainValue, audioCtx!.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx!.currentTime + durationMs / 1000);

      oscillator.start(audioCtx!.currentTime);
      oscillator.stop(audioCtx!.currentTime + durationMs / 1000);

      oscillator.onended = () => resolve();
    }, delayMs);
  });
}

export async function playSuccessBeep(): Promise<void> {
  await playTone(880, 180, 'sine', 0.35);
}

export async function playErrorBeep(): Promise<void> {
  await playTone(440, 250, 'square', 0.5, 0);
  await playTone(330, 250, 'square', 0.5, 350);
  await playTone(220, 350, 'square', 0.5, 700);
}

export async function playWarningBeep(): Promise<void> {
  await playTone(660, 200, 'sine', 0.4, 0);
  await playTone(660, 200, 'sine', 0.4, 300);
}

export async function playInfoBeep(): Promise<void> {
  await playTone(523, 120, 'sine', 0.25);
}

export async function playScanSound(result: string): Promise<void> {
  switch (result) {
    case 'SUCCESS':
      return playSuccessBeep();
    case 'WRONG_PRODUCT':
    case 'WRONG_COLOUR':
    case 'UNKNOWN_BARCODE':
      return playErrorBeep();
    case 'EXCESS_QUANTITY':
      return playWarningBeep();
    default:
      return playInfoBeep();
  }
}
