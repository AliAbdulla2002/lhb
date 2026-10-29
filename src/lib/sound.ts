/**
 * Short, quiet synthesized tones. Never used as the notification mechanism itself and
 * only played after a user gesture (browsers block autoplay otherwise), so a failure to
 * play is silently ignored.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a click handler so later chimes are allowed to play. */
export function unlockAudio() {
  context();
}

export function playChime({ volume = 0.08, notes = [660, 880] }: { volume?: number; notes?: number[] } = {}) {
  const ac = context();
  if (!ac) return;
  const start = ac.currentTime;
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = start + i * 0.12;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  });
}

const PREFS = "lahab.sound";

export function readSoundPref(scope: "customer" | "staff", fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(`${PREFS}.${scope}`);
    return v === null ? fallback : v === "on";
  } catch {
    return fallback;
  }
}

export function writeSoundPref(scope: "customer" | "staff", on: boolean) {
  try {
    window.localStorage.setItem(`${PREFS}.${scope}`, on ? "on" : "off");
  } catch {
    // ignore
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported or not permitted.
  }
}
