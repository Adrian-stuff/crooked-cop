import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Role } from '../../shared/types';

// All game audio is synthesized here with the Web Audio API: original music loops, timer and turn
// effects, and the role-reveal stingers. Nothing is downloaded, and sound only starts after the
// first click or key press, as browsers require.

// ---------- settings (per device) ----------

export interface SoundSettings {
  music: boolean;
  effects: boolean;
  volume: number; // 0..1
}

const KEYS = { music: 'cc-music', effects: 'cc-sound', volume: 'cc-volume' } as const;

function loadSettings(): SoundSettings {
  const get = (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const vol = Number(get(KEYS.volume));
  return {
    music: get(KEYS.music) !== 'off',
    effects: get(KEYS.effects) !== 'off',
    volume: get(KEYS.volume) !== null && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.7,
  };
}

let settings = loadSettings();
const listeners = new Set<() => void>();

export function setSoundSettings(patch: Partial<SoundSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEYS.music, settings.music ? 'on' : 'off');
    localStorage.setItem(KEYS.effects, settings.effects ? 'on' : 'off');
    localStorage.setItem(KEYS.volume, String(settings.volume));
  } catch { /* settings just won't survive a reload */ }
  unlockSound();
  applyLevels();
  for (const l of listeners) l();
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => settings,
  );
}

// ---------- audio graph ----------

const MUSIC_LEVEL = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let fxBus: GainNode;
let reverb: ConvolverNode;
let noise: AudioBuffer;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  // A gentle limiter so stingers over music never clip, even at full volume.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master.connect(limiter).connect(ctx.destination);
  musicBus = ctx.createGain();
  fxBus = ctx.createGain();
  musicBus.connect(master);
  fxBus.connect(master);

  // A plate-ish reverb from decaying noise; music and stingers send into it.
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;

  applyLevels(true);
  // Music waits for the context to actually run (resume() is async, and tabs can suspend it).
  ctx.onstatechange = () => (ctx?.state === 'running' ? startScheduler() : undefined);
  return ctx;
}

function applyLevels(instant = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const set = (g: GainNode, v: number) => (instant ? g.gain.setValueAtTime(v, t) : g.gain.setTargetAtTime(v, t, 0.15));
  set(master, settings.volume);
  set(musicBus, settings.music ? MUSIC_LEVEL : 0);
  set(fxBus, settings.effects ? 1 : 0);
}

// Call from a user gesture so browsers allow sound; also starts any waiting music.
export function unlockSound() {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().then(() => { startScheduler(); removeUnlockListeners(); }, () => {});
  else { startScheduler(); if (c.state === 'running') removeUnlockListeners(); }
}

// Touch pointerdown doesn't count as an audio user activation, so also try on release/click/touchend.
// The listeners stay until the context is really running, so a rejected resume is retried.
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
function removeUnlockListeners() {
  if (typeof window === 'undefined') return;
  for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlockSound, { capture: true });
}
if (typeof window !== 'undefined') {
  for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlockSound, { capture: true });
}

// ---------- instruments ----------

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// 'D2', 'Bb3', 'C#4' -> midi
const m = (name: string) => {
  const [, n, o] = /^([A-G][#b]?)(-?\d)$/.exec(name)!;
  return NOTE[n] + (Number(o) + 1) * 12;
};

interface Out { dest: AudioNode; send?: number } // where a voice plays, and how much goes to the reverb

function route(c: AudioContext, node: AudioNode, out: Out) {
  node.connect(out.dest);
  if (out.send) {
    const s = c.createGain();
    s.gain.value = out.send;
    node.connect(s).connect(reverb);
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function tone(c: AudioContext, out: Out, t: number, freq: number, o: {
  type?: OscillatorType; gain?: number; attack?: number; hold?: number; release?: number; detune?: number;
  cutoff?: number; q?: number; glideTo?: number;
}) {
  const { type = 'sine', gain = 0.2, attack = 0.005, hold = 0, release = 0.3, detune = 0, cutoff, q = 0.7, glideTo } = o;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + attack + hold + release);
  osc.detune.value = detune;
  const g = c.createGain();
  env(g, t, gain, attack, hold, release);
  let last: AudioNode = osc;
  if (cutoff) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = q;
    osc.connect(f);
    last = f;
  }
  last.connect(g);
  route(c, g, out);
  osc.start(t);
  osc.stop(t + attack + hold + release + 0.05);
}

function burst(c: AudioContext, out: Out, t: number, o: {
  type: BiquadFilterType; freq: number; q?: number; gain: number; attack?: number; release: number; sweepTo?: number;
}) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + (o.attack ?? 0.002) + o.release);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  env(g, t, o.gain, o.attack ?? 0.002, 0, o.release);
  src.connect(f).connect(g);
  route(c, g, out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + (o.attack ?? 0.002) + o.release + 0.05);
}

function kick(c: AudioContext, out: Out, t: number, gain = 0.8, from = 140, to = 42, len = 0.32) {
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + len * 0.6);
  const g = c.createGain();
  env(g, t, gain, 0.003, 0, len);
  osc.connect(g);
  route(c, g, out);
  osc.start(t);
  osc.stop(t + len + 0.05);
}

const snare = (c: AudioContext, out: Out, t: number, gain = 0.3) => {
  burst(c, out, t, { type: 'bandpass', freq: 1800, q: 0.6, gain, release: 0.16 });
  tone(c, out, t, 190, { type: 'triangle', gain: gain * 0.6, release: 0.08 });
};
const hat = (c: AudioContext, out: Out, t: number, gain = 0.08, open = false) =>
  burst(c, out, t, { type: 'highpass', freq: 7500, gain, release: open ? 0.22 : 0.04 });
const brush = (c: AudioContext, out: Out, t: number, gain = 0.06) =>
  burst(c, out, t, { type: 'bandpass', freq: 3200, q: 0.4, gain, attack: 0.03, release: 0.18 });

// Rhodes-like keys: sine with a quiet octave and a soft bell on top.
function keys(c: AudioContext, out: Out, t: number, notes: number[], dur: number, gain = 0.07) {
  for (const n of notes) {
    tone(c, out, t, hz(n), { gain, attack: 0.01, hold: dur * 0.3, release: dur * 0.9 });
    tone(c, out, t, hz(n + 12), { gain: gain * 0.25, attack: 0.005, release: 0.4 });
  }
}

// Upright / synth bass.
const bass = (c: AudioContext, out: Out, t: number, note: number, dur: number, gain = 0.32) =>
  tone(c, out, t, hz(note), { type: 'triangle', gain, attack: 0.008, hold: dur * 0.35, release: dur * 0.6, cutoff: 900 });

// String/brass stab: detuned saws through a lowpass.
function stab(c: AudioContext, out: Out, t: number, notes: number[], dur: number, gain = 0.05, cutoff = 1800) {
  for (const n of notes) {
    for (const det of [-9, 9]) tone(c, out, t, hz(n), { type: 'sawtooth', gain, attack: 0.01, hold: dur * 0.4, release: dur * 0.5, detune: det, cutoff });
  }
}

const vibes = (c: AudioContext, out: Out, t: number, note: number, dur: number) => {
  tone(c, out, t, hz(note), { gain: 0.06, attack: 0.004, hold: 0.05, release: dur + 0.6 });
  tone(c, out, t, hz(note) * 4, { gain: 0.012, attack: 0.002, release: 0.25 });
};

// ---------- music ----------

interface Track {
  bpm: number;
  stepsPerBeat: number; // 2 = eighths, 4 = sixteenths
  steps: number; // length of the loop in steps
  swing: number; // 0..0.5 delay of off-steps, as a fraction of a step
  play: (c: AudioContext, out: Out, step: number, t: number, stepDur: number, loop: number) => void;
}

// "Stakeout Lounge": slow noir jazz for the lobby. Dm9 | G13 | Cmaj9 | A7b9, walking bass, brushes.
const LOUNGE_CHORDS = [['F3', 'A3', 'C4', 'E4'], ['F3', 'B3', 'E4', 'A4'], ['E3', 'G3', 'B3', 'D4'], ['C#3', 'G3', 'Bb3', 'E4']].map((ch) => ch.map(m));
const LOUNGE_WALK = [['D2', 'F2', 'A2', 'Ab2'], ['G2', 'B2', 'D3', 'Db3'], ['C3', 'B2', 'A2', 'Bb2'], ['A2', 'C#3', 'E3', 'Eb3']].map((b) => b.map(m));
const LOUNGE_TUNE: [number, number, string, number][] = [ // bar, eighth, note, length in eighths
  [0, 0, 'A4', 2], [0, 3, 'F4', 1], [0, 4, 'E4', 3], [1, 2, 'D4', 2], [1, 5, 'F4', 3],
  [2, 0, 'E4', 3], [2, 4, 'G4', 2], [3, 1, 'C#5', 2], [3, 4, 'Bb4', 2], [3, 6, 'A4', 2],
];
const LOUNGE: Track = {
  bpm: 84, stepsPerBeat: 2, steps: 32, swing: 0.33,
  play(c, out, step, t, sd, loop) {
    const bar = Math.floor(step / 8);
    const e = step % 8;
    if (e % 2 === 0) bass(c, out, t, LOUNGE_WALK[bar][e / 2], sd * 2, 0.3);
    if (e === 0) keys(c, out, t, LOUNGE_CHORDS[bar], sd * 3);
    if (e === 3) keys(c, out, t, LOUNGE_CHORDS[bar], sd, 0.045);
    if (e % 2 === 0) brush(c, out, t, 0.05);
    if (e === 2 || e === 6) hat(c, out, t, 0.05);
    if (e === 7 || e === 3) hat(c, out, t, 0.03);
    if (e === 0 && bar % 2 === 0) kick(c, out, t, 0.25, 90, 45, 0.25);
    if (loop % 2 === 1) for (const [b, at, n, len] of LOUNGE_TUNE) if (b === bar && at === e) vibes(c, { ...out, send: 0.5 }, t, m(n), sd * len);
  },
};

// "Heist in Motion": tense minor groove for play. Dm | Bb | Gm | A, pulsing bass, stabs, tight drums.
const HEIST_ROOTS = ['D2', 'Bb1', 'G1', 'A1'].map(m);
const HEIST_CHORDS = [['D4', 'F4', 'A4'], ['D4', 'F4', 'Bb4'], ['D4', 'G4', 'Bb4'], ['C#4', 'E4', 'A4']].map((ch) => ch.map(m));
const HEIST_BASS = [0, 3, 6, 8, 10, 11, 14]; // sixteenths with a bass note
const HEIST_ARP = ['A3', 'C#4', 'E4', 'G4'].map(m);
let calm = false; // Information Phase: drums out, sparse bass, long chords

const HEIST: Track = {
  bpm: 112, stepsPerBeat: 4, steps: 64, swing: 0.08,
  play(c, out, step, t, sd, loop) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = HEIST_ROOTS[bar];
    if (calm) {
      if (s === 0 || s === 8) bass(c, out, t, root + 12, sd * 6, 0.22);
      if (s === 0) stab(c, { ...out, send: 0.4 }, t, HEIST_CHORDS[bar], sd * 15, 0.022, 900);
      if (s % 4 === 2) hat(c, out, t, 0.025);
      return;
    }
    if (HEIST_BASS.includes(s)) bass(c, out, t, root + (s === 6 || s === 14 ? 24 : 12), sd * 1.6, 0.3);
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1)) kick(c, out, t, 0.7);
    if (s === 4 || s === 12) snare(c, { ...out, send: 0.15 }, t, 0.22);
    if (s % 2 === 0) hat(c, out, t, s % 4 === 2 ? 0.07 : 0.04, s === 14);
    if (s === 0 || s === 6) stab(c, { ...out, send: 0.25 }, t, HEIST_CHORDS[bar], sd * 1.5, 0.035);
    if (bar === 3 && loop % 2 === 1 && s >= 8) tone(c, { ...out, send: 0.3 }, t, hz(HEIST_ARP[s % 4] + 12), { type: 'square', gain: 0.025, release: sd * 1.2, cutoff: 2400 });
    // Starts 3 steps into the last bar and builds for 11 steps, so it is always scheduled ahead of now.
    if (bar === 3 && s === 3 && loop % 4 === 3) burst(c, { ...out, send: 0.4 }, t, { type: 'bandpass', freq: 400, sweepTo: 6000, q: 2, gain: 0.05, attack: sd * 11, release: 0.05 });
  },
};

export type MusicScene = 'lobby' | 'game' | null;
const TRACKS: Record<'lobby' | 'game', Track> = { lobby: LOUNGE, game: HEIST };

let scene: MusicScene = null;
let sceneGain: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;
let loop = 0;

function startScheduler() {
  if (timer || !ctx || !scene) return;
  if (ctx.state !== 'running') return; // resumes on the next gesture
  sceneGain = ctx.createGain();
  sceneGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  sceneGain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
  sceneGain.connect(musicBus);
  nextAt = ctx.currentTime + 0.1;
  step = 0;
  loop = 0;
  timer = setInterval(tickScheduler, 25);
}

function tickScheduler() {
  if (!ctx || !scene || !sceneGain) return;
  const track = TRACKS[scene];
  const sd = 60 / track.bpm / track.stepsPerBeat;
  // Skip ahead after the tab slept instead of firing a burst of old notes.
  if (nextAt < ctx.currentTime - 0.5) nextAt = ctx.currentTime + 0.05;
  while (nextAt < ctx.currentTime + 0.15) {
    const t = nextAt + (step % 2 === 1 ? track.swing * sd : 0);
    if (settings.music && settings.volume > 0) track.play(ctx, { dest: sceneGain, send: 0.2 }, step, t, sd, loop);
    nextAt += sd;
    step++;
    if (step >= track.steps) { step = 0; loop++; }
  }
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  if (ctx && sceneGain) {
    const g = sceneGain;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => g.disconnect(), 2500);
  }
  sceneGain = null;
}

let pendingStop: ReturnType<typeof setTimeout> | null = null;

function setScene(next: MusicScene) {
  if (pendingStop) { clearTimeout(pendingStop); pendingStop = null; }
  if (next === scene) return;
  stopScheduler();
  scene = next;
  startScheduler();
}

// Plays a background loop while the calling screen is shown. `quiet` thins the game track out.
export function useMusic(next: MusicScene, quiet = false) {
  useEffect(() => {
    calm = quiet;
  }, [quiet]);
  useEffect(() => {
    setScene(next);
    // Deferred so moving between screens with the same scene doesn't restart the track.
    return () => {
      if (pendingStop) clearTimeout(pendingStop);
      pendingStop = setTimeout(() => { pendingStop = null; if (scene === next) setScene(null); }, 300);
    };
  }, [next]);
}

// ---------- effects ----------

function fx(play: (c: AudioContext, out: Out, t: number) => void) {
  const c = audio();
  if (!c || c.state !== 'running' || !settings.effects) return;
  try {
    play(c, { dest: fxBus }, c.currentTime + 0.01);
  } catch { /* sound is a nicety */ }
}

export const playChime = () => fx((c, out, t) => {
  tone(c, out, t, 660, { gain: 0.18, attack: 0.02, release: 0.2 });
  tone(c, out, t + 0.14, 880, { gain: 0.18, attack: 0.02, release: 0.2 });
});

// A teammate pointing at a station: a quick rising "blip blip", louder than the turn chime.
export const playPing = () => fx((c, out, t) => {
  for (const [i, freq] of [988, 1319, 988, 1319].entries()) {
    tone(c, out, t + i * 0.09, freq, { type: 'triangle', gain: 0.25, attack: 0.01, release: 0.07 });
  }
});

// A clock tick; `urgent` for the last three seconds.
export const playTick = (urgent: boolean) => fx((c, out, t) => {
  tone(c, out, t, urgent ? 1760 : 1320, { type: 'square', gain: urgent ? 0.07 : 0.045, release: 0.035, cutoff: 5000 });
  tone(c, out, t, urgent ? 880 : 660, { gain: urgent ? 0.22 : 0.14, release: 0.07 });
  if (urgent) kick(c, out, t, 0.25, 110, 50, 0.12);
});

// Time's up: a short two-tone alarm.
export const playTimeUp = () => fx((c, out, t) => {
  for (let i = 0; i < 3; i++) {
    tone(c, { ...out, send: 0.2 }, t + i * 0.22, 880, { type: 'sawtooth', gain: 0.06, hold: 0.08, release: 0.03, cutoff: 3000 });
    tone(c, { ...out, send: 0.2 }, t + i * 0.22 + 0.11, 660, { type: 'sawtooth', gain: 0.06, hold: 0.08, release: 0.03, cutoff: 3000 });
  }
  kick(c, out, t + 0.66, 0.5, 120, 40, 0.4);
});

// Role reveal stingers.
let lastSting = 0;
export function playRoleSting(role: Role) {
  if (role === 'spectator') return;
  // React's dev double-mount would otherwise play it twice.
  if (performance.now() - lastSting < 800) return;
  lastSting = performance.now();
  fx((c, out, t) => {
    const g = c.createGain();
    g.gain.value = 0.6;
    g.connect(out.dest);
    STINGS[role](c, { dest: g, send: 0.3 }, t);
  });
}

const STINGS: Record<Exclude<Role, 'spectator'>, (c: AudioContext, out: Out, t: number) => void> = {
  // Heister: a sly chromatic creep, a whoosh, then a low minor hit.
  heister(c, out, t) {
    ['D4', 'F4', 'F#4', 'G4', 'G#4', 'A4'].forEach((n, i) =>
      tone(c, out, t + i * 0.13, hz(m(n)), { type: 'triangle', gain: 0.16, release: 0.12, cutoff: 2500 }));
    burst(c, out, t + 0.55, { type: 'bandpass', freq: 300, sweepTo: 5000, q: 3, gain: 0.12, attack: 0.3, release: 0.15 });
    const hit = t + 0.95;
    kick(c, out, hit, 0.9, 120, 38, 0.6);
    bass(c, out, hit, m('D2'), 1.4, 0.4);
    stab(c, out, hit, ['D4', 'F4', 'A4', 'C5'].map(m), 1.2, 0.045, 2200);
    tone(c, out, hit + 0.5, hz(m('A5')), { type: 'triangle', gain: 0.08, release: 0.9 });
  },
  // Crooked Cop: the betrayal. A deep boom, a dissonant clash and a falling slide, then a heartbeat.
  traitor(c, out, t) {
    kick(c, out, t, 1, 160, 28, 1.4);
    burst(c, out, t, { type: 'lowpass', freq: 600, sweepTo: 80, gain: 0.25, release: 1.2 });
    stab(c, out, t + 0.02, ['D3', 'G#3', 'C#4', 'D#4'].map(m), 1.6, 0.05, 1400);
    for (const det of [-12, 12]) tone(c, out, t + 0.05, 620, { type: 'sawtooth', gain: 0.05, hold: 0.2, release: 1.5, detune: det, cutoff: 2000, glideTo: 70 });
    tone(c, out, t, hz(m('D1')), { gain: 0.35, attack: 0.02, hold: 0.6, release: 1.2 });
    for (const at of [2.0, 2.28, 3.0, 3.28]) kick(c, out, t + at, at % 1 < 0.1 ? 0.55 : 0.4, 70, 35, 0.22);
  },
  // Cop: a rising brass fanfare over a snare roll, landing on a bright major chord.
  police(c, out, t) {
    for (let i = 0; i < 12; i++) snare(c, out, t + i * 0.055, 0.04 + i * 0.012);
    const brass = (at: number, notes: string[], dur: number, gain = 0.045) => stab(c, out, at, notes.map(m), dur, gain, 2600);
    brass(t + 0.2, ['G3', 'D4'], 0.14);
    brass(t + 0.38, ['C4', 'G4'], 0.14);
    brass(t + 0.56, ['E4', 'C5'], 0.14);
    brass(t + 0.74, ['C4', 'E4', 'G4', 'C5'], 1.5, 0.05);
    kick(c, out, t + 0.74, 0.8, 120, 45, 0.5);
    burst(c, out, t + 0.74, { type: 'highpass', freq: 6000, gain: 0.08, release: 1.4 });
    bass(c, out, t + 0.74, m('C2'), 1.6, 0.35);
  },
};

// Clock ticks for the last 10 seconds of a timed phase, and an alarm when it runs out.
const WARN_PHASES = new Set(['heister', 'police', 'info']);
export function useTimeWarning(phase: string, secs: number | null, paused: boolean) {
  const prev = useRef<{ phase: string; secs: number | null } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = { phase, secs };
    if (paused || secs === null || !WARN_PHASES.has(phase)) return;
    if (secs === 0) {
      // Only an actual run-down counts; joining a phase already at 0 stays silent.
      if (before && before.phase === phase && before.secs !== null && before.secs > 0) playTimeUp();
    } else if (secs <= 10) playTick(secs <= 3);
  }, [phase, secs, paused]);
}
