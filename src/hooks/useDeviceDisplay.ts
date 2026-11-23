import { useCallback, useEffect, useState } from 'react';

export type MobileModePreference = 'auto' | 'mobile' | 'desktop';

const MOBILE_PREF_STORAGE_KEY = 'ratao_mobile_mode_pref';

function detectTouchOrSmallScreen(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrowViewport = window.innerWidth <= 820;
  const shortLandscapePhone = window.innerHeight <= 520 && coarsePointer;
  return narrowViewport || coarsePointer || shortLandscapePhone;
}

export function useMobileMode() {
  const [preference, setPreferenceState] = useState<MobileModePreference>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const saved = window.localStorage.getItem(MOBILE_PREF_STORAGE_KEY);
      if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'auto';
  });

  const [autoDetectedMobile, setAutoDetectedMobile] = useState<boolean>(() =>
    detectTouchOrSmallScreen()
  );
  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight >= window.innerWidth : false
  );

  useEffect(() => {
    const updateViewport = () => {
      setAutoDetectedMobile(detectTouchOrSmallScreen());
      setIsPortrait(window.innerHeight >= window.innerWidth);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const setPreference = useCallback((next: MobileModePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(MOBILE_PREF_STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const mobileMode =
    preference === 'mobile' ? true : preference === 'desktop' ? false : autoDetectedMobile;

  const toggleMobileMode = useCallback(() => {
    setPreference(mobileMode ? 'desktop' : 'mobile');
  }, [mobileMode, setPreference]);

  return {
    mobileMode,
    preference,
    isPortrait,
    autoDetectedMobile,
    setPreference,
    toggleMobileMode,
  };
}

interface VendorDocument extends Document {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

interface VendorElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

function getNativeFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as VendorDocument;
  return (
    document.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.msFullscreenElement ||
    null
  );
}

export function useFullscreen() {
  const [nativeFullscreen, setNativeFullscreen] = useState<boolean>(() =>
    Boolean(getNativeFullscreenElement())
  );
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const active = Boolean(getNativeFullscreenElement());
      setNativeFullscreen(active);
      if (active) {
        setPseudoFullscreen(false);
      }
      window.dispatchEvent(new Event('resize'));
    };

    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.addEventListener('MSFullscreenChange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      document.removeEventListener('MSFullscreenChange', sync);
    };
  }, []);

  const isFullscreen = nativeFullscreen || pseudoFullscreen;

  const toggleFullscreen = useCallback(async () => {
    setFullscreenNotice(null);
    const doc = document as VendorDocument;
    const root = document.documentElement as VendorElement;

    if (getNativeFullscreenElement()) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      } catch {
        setNativeFullscreen(false);
      }
      setPseudoFullscreen(false);
      return;
    }

    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      window.dispatchEvent(new Event('resize'));
      return;
    }

    try {
      if (root.requestFullscreen) {
        await root.requestFullscreen();
        return;
      }
      if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
        return;
      }
      if (root.msRequestFullscreen) {
        await root.msRequestFullscreen();
        return;
      }
      throw new Error('Fullscreen API indisponível');
    } catch {
      // Fallback for iOS Safari / restricted embeds so the button remains useful
      setPseudoFullscreen(true);
      setFullscreenNotice(
        'Modo expandido ativado. Se o navegador bloquear tela cheia nativa, adicione à Tela Inicial.'
      );
      window.scrollTo?.(0, 1);
      window.dispatchEvent(new Event('resize'));
    }
  }, [pseudoFullscreen]);

  const clearFullscreenNotice = useCallback(() => setFullscreenNotice(null), []);

  return {
    isFullscreen,
    nativeFullscreen,
    pseudoFullscreen,
    fullscreenNotice,
    clearFullscreenNotice,
    toggleFullscreen,
  };
}
