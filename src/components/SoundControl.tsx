import { useEffect, useRef, useState } from 'react';
import { setSoundSettings, useSoundSettings } from '../game/sound';

// A small speaker button on every screen: music and effects switches, and a volume slider.
// Settings are per device, so the table display can play music while the cops device stays quiet.
export function SoundControl() {
  const { music, effects, volume } = useSoundSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const muted = (!music && !effects) || volume === 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="sound-ctl" ref={ref}>
      {open && (
        <div className="sound-pop" role="dialog" aria-label="Sound settings">
          <label><input type="checkbox" checked={music} onChange={(e) => setSoundSettings({ music: e.target.checked })} /> Music</label>
          <label><input type="checkbox" checked={effects} onChange={(e) => setSoundSettings({ effects: e.target.checked })} /> Sound effects</label>
          <label className="sound-vol">Volume
            <input type="range" min={0} max={100} value={Math.round(volume * 100)}
              onChange={(e) => setSoundSettings({ volume: +e.target.value / 100 })} />
          </label>
        </div>
      )}
      <button type="button" className="sound-btn" aria-expanded={open} aria-label="Sound settings" title="Sound settings"
        onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
          {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
        </svg>
      </button>
    </div>
  );
}
