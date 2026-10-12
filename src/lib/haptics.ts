// Lightweight, client-safe haptic feedback. Supplements (never replaces)
// visible toasts. navigator.vibrate returning true only means the request
// was accepted -- not that the device physically vibrated (iOS Safari has
// no Vibration API at all, so this is a silent no-op there).

export type HapticPattern = "light" | "success" | "error";

export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  success: [12, 40, 18],
  error: [30, 50, 30],
};

/** Minimum gap between vibrations, so rapid taps/quantity changes don't buzz repeatedly. */
export const HAPTIC_COOLDOWN_MS = 400;

let lastFiredAt = -Infinity;

type Env = {
  navigator?: { vibrate?: (p: number | number[]) => boolean };
  matchMedia?: (q: string) => { matches: boolean };
  now?: () => number;
};

function defaultEnv(): Env {
  if (typeof window === "undefined") return {};
  return {
    navigator: window.navigator as Env["navigator"],
    matchMedia: window.matchMedia?.bind(window),
    now: () => Date.now(),
  };
}

export function isHapticsSupported(env: Env = defaultEnv()): boolean {
  return typeof env.navigator?.vibrate === "function";
}

/** Fire-and-forget. Returns whether a vibration was requested (not whether it was felt). */
export function haptic(pattern: HapticPattern, env: Env = defaultEnv()): boolean {
  try {
    if (!isHapticsSupported(env)) return false;
    if (env.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    const now = (env.now ?? Date.now)();
    if (now - lastFiredAt < HAPTIC_COOLDOWN_MS) return false;
    const accepted = env.navigator!.vibrate!(HAPTIC_PATTERNS[pattern]);
    if (accepted) lastFiredAt = now;
    return accepted === true;
  } catch {
    return false;
  }
}

/** Test helper. */
export function __resetHaptics() {
  lastFiredAt = -Infinity;
}
