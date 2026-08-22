let lockCount = 0;

function preventScroll(e: Event) {
  const target = e.target as HTMLElement | null;
  // Allow scrolling if the target is inside a designated scrollable container
  const isScrollable = target?.closest('[data-scrollable="true"]');
  if (!isScrollable) {
    if (e.cancelable) {
      e.preventDefault();
    }
  }
}

function preventScrollKeys(e: KeyboardEvent) {
  const keys = ['ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End'];
  if (keys.includes(e.code)) {
    const target = e.target as HTMLElement | null;
    const isScrollable = target?.closest('[data-scrollable="true"]');
    if (!isScrollable) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }
}

export function lockScroll() {
  if (typeof window === 'undefined') return;
  if (lockCount === 0) {
    // We use a purely JS-based scroll lock to keep the browser scrollbar fully visible
    // and prevent layout shifts, perfectly respecting the native viewport width.
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventScrollKeys as any, { passive: false });
  }
  lockCount++;
}

export function unlockScroll() {
  if (typeof window === 'undefined') return;
  lockCount--;
  if (lockCount <= 0) {
    lockCount = 0;
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('keydown', preventScrollKeys as any);
  }
}
