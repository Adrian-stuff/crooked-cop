import { useState, type FormEvent } from 'react';
import type { Game } from '../net/useGame';

export function Home({ game, onTable }: { game: Game; onTable: () => void }) {
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('crooked-cop-name') ?? ''; } catch { return ''; }
  });
  const [code, setCode] = useState(initialCode);
  const [joining, setJoining] = useState(initialCode.length > 0);
  const [device, setDevice] = useState('');

  const openDevice = (kind: 'display' | 'cops') => { location.search = `?${kind}=${device.trim().toUpperCase()}`; };
  const remember = () => { try { localStorage.setItem('crooked-cop-name', name.trim()); } catch { /* ignore */ } };

  const online = game.conn === 'open';
  const hasName = name.trim().length > 0;
  const canJoin = hasName && code.length === 4 && online;

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!canJoin) return;
    remember();
    game.join(code, name);
  };

  return (
    <main className="home">
      <div className="home-card">
        <img src="/assets/logo-crooked-cop.png" alt="" className="home-logo" width={560} height={560} />
        <h1 className="visually-hidden">The Crooked Cop</h1>
        <p className="tagline">He swore to protect. He chose to betray.</p>
        <p className="muted intro">4 to 8 players. Thieves steal, police chase, and one cop is a traitor.</p>

        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Kysiah" autoFocus />
        </label>

        <div className="home-actions">
          <button
            type="button"
            className="btn primary big chunky"
            disabled={!hasName || !online}
            onClick={() => { remember(); game.create(name); }}
          >
            Create a room
          </button>

          <button
            type="button"
            className="btn big chunky blue"
            aria-expanded={joining}
            onClick={() => setJoining((j) => !j)}
          >
            Join a room
          </button>

          {joining && (
            <form className="join-row" onSubmit={submitJoin}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                placeholder="Room code"
                aria-label="Room code"
                className="code-input"
                autoFocus={hasName}
              />
              <button type="submit" className="btn big chunky blue" disabled={!canJoin}>
                Join
              </button>
            </form>
          )}
          {joining && !hasName && <p className="muted small">Enter your name first.</p>}
        </div>

        {!online && <p className="muted small">Connecting to the server…</p>}

        <details className="home-how">
          <summary>How to play</summary>
          <p>
            One or two Heisters (the thieves) race across the rail network to grab Artifacts. The Police hunt them down.
            One officer is secretly helping the thieves, so nobody knows who to trust.
          </p>
        </details>

        <div className="home-table">
          <span className="muted small">Playing on the physical board?</span>
          <button type="button" className="btn ghost" onClick={onTable}>Facilitator mode</button>
          <span className="muted small">One device keeps the timer and log. Works offline.</span>
          <details className="home-device">
            <summary>Join a table device</summary>
            <p className="muted small">Type the code from the facilitator's screen.</p>
            <input value={device} onChange={(e) => setDevice(e.target.value.toUpperCase())} maxLength={6} placeholder="Device code"
              aria-label="Device code" className="code-input" />
            <div className="join-row">
              <button type="button" className="btn small" disabled={device.trim().length !== 6} onClick={() => openDevice('display')}>Table display</button>
              <button type="button" className="btn small" disabled={device.trim().length !== 6} onClick={() => openDevice('cops')}>Cops device</button>
            </div>
          </details>
        </div>
      </div>

      <footer className="credits">
        <span className="muted small">A game by</span>
        <img src="/assets/logo-out-of-track.png" alt="Out of Track" className="team-logo" width={480} height={427} />
        <span className="muted small">BSIT 3-8</span>
      </footer>
    </main>
  );
}
