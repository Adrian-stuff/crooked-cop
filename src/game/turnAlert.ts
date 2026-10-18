import { useEffect, useRef } from 'react';
import type { View } from '../../shared/types';

// Whether the game is waiting on you right now.
export function isMyMove(view: View): boolean {
  const me = view.players.find((p) => p.id === view.me);
  if (!me || me.status !== 'active' || view.myRole === 'spectator') return false;
  const officer = view.myRole === 'police' || view.myRole === 'traitor';
  switch (view.phase) {
    case 'setup': return !me.done;
    case 'heister': return view.myRole === 'heister' && !me.done;
    case 'police': return view.policeTurn === me.id;
    case 'info': return officer && !!view.accusation && view.accusation.votes[me.id] === undefined;
    default: return false;
  }
}

let audio: AudioContext | null = null;

// Call from a click so browsers allow sound later.
export function unlockSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

function chime() {
  if (!audio) return;
  try {
    const t = audio.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.25);
    }
  } catch {
    // sound is a nicety; ignore failures
  }
}

// When your move comes up: chime (if sound is on), and flash the tab title while the tab is hidden.
export function useTurnAlert(view: View, sound: boolean) {
  const mine = isMyMove(view);
  const was = useRef(mine);

  useEffect(() => {
    const started = mine && !was.current;
    was.current = mine;
    if (!started) return;
    if (sound) chime();
  }, [mine, sound]);

  useEffect(() => {
    if (!mine) return;
    const base = document.title;
    let on = false;
    const id = setInterval(() => {
      if (!document.hidden) {
        document.title = base;
        return;
      }
      on = !on;
      document.title = on ? '● Your turn! · The Crooked Cop' : base;
    }, 1000);
    return () => {
      clearInterval(id);
      document.title = base;
    };
  }, [mine]);
}
