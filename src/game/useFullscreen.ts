import { useCallback, useEffect, useState, type RefObject } from 'react';

export function useFullscreen(targetRef?: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);

  const enter = useCallback(async () => {
    setFullscreen(true);
    try {
      const el = targetRef?.current;
      if (el && document.fullscreenEnabled && !document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch {
      // CSS-based fullscreen handles browsers/devices that block or lack requestFullscreen
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    setFullscreen(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore exit errors
    }
  }, []);

  const toggle = useCallback(() => {
    if (fullscreen) {
      exit();
    } else {
      enter();
    }
  }, [fullscreen, enter, exit]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      // If native fullscreen was dismissed (e.g., via ESC or swipe), sync state
      if (!document.fullscreenElement && fullscreen) {
        setFullscreen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) {
        exit();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreen, exit]);

  return { fullscreen, toggle, enter, exit };
}
