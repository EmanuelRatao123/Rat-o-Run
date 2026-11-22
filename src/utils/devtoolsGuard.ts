import { useEffect } from 'react';

/**
 * Pure double-tap detector for F8 within `windowMs` (default 1000ms).
 * Returns true only on the second press within the window, then resets.
 */
export function createF8DoubleTapDetector(windowMs = 1000) {
  let lastPressAt = 0;

  return {
    registerPress(now: number = Date.now()): boolean {
      if (lastPressAt > 0 && now - lastPressAt <= windowMs) {
        lastPressAt = 0;
        return true;
      }
      lastPressAt = now;
      return false;
    },
    reset(): void {
      lastPressAt = 0;
    },
  };
}

export interface KeyCheckInput {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Detects common browser DevTools / source inspection shortcuts without
 * interfering with normal game controls or F8 double-tap.
 */
export function isBlockedInspectionShortcut(e: KeyCheckInput): boolean {
  const code = e.code || '';
  const key = (e.key || '').toUpperCase();
  const ctrlOrMeta = Boolean(e.ctrlKey || e.metaKey);

  // Never interfere with F8 secret access or Ctrl+Shift+A
  if (code === 'F8' || key === 'F8') return false;
  if (ctrlOrMeta && e.shiftKey && (code === 'KeyA' || key === 'A')) return false;

  // F12
  if (code === 'F12' || key === 'F12') return true;

  // Ctrl+Shift+I / J / C or Cmd+Opt+I / J / C
  if ((ctrlOrMeta && e.shiftKey) || (e.metaKey && e.altKey)) {
    if (
      code === 'KeyI' ||
      code === 'KeyJ' ||
      code === 'KeyC' ||
      key === 'I' ||
      key === 'J' ||
      key === 'C'
    ) {
      return true;
    }
  }

  // Ctrl+U / Cmd+U (view source) & Ctrl+Shift+U / Cmd+Opt+U
  if (ctrlOrMeta && (code === 'KeyU' || key === 'U')) return true;

  // Ctrl+S / Cmd+S (save page)
  if (ctrlOrMeta && !e.shiftKey && (code === 'KeyS' || key === 'S')) return true;

  return false;
}

/**
 * Non-blocking protection layer against casual DevTools inspection and
 * unwanted right-click context menus inside the game interface.
 */
export function useDevToolsProtection(onAttemptDetected: (message: string) => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isBlockedInspectionShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        onAttemptDetected('Inspeção desativada na interface do jogo.');
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      onAttemptDetected('Menu de contexto desativado durante o jogo.');
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [onAttemptDetected]);
}
