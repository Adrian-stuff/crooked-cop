import { useState } from 'react';
import type { Game } from '../net/useGame';

export function Home({ game }: { game: Game }) {
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('crooked-cop-name') ?? ''; } catch { return ''; }
  });
  const [code, setCode] = useState(initialCode);
  const remember = () => { try { localStorage.setItem('crooked-cop-name', name.trim()); } catch { /* ignore */ } };

  return (
    <main className="home">
      <div className="home-card">
        <img src="/assets/logo-crooked-cop.png" alt="" className="home-logo" width={560} height={560} />
        <h1 className="visually-hidden">The Crooked Cop</h1>
        <p className="tagline">He swore to protect. He chose to betray.</p>
        <p className="muted intro">
          A hidden-role chase for 4 to 8 players. One or two Heisters race across the rail network for Artifacts while the
          Police hunt them, and one officer is secretly feeding the thieves.
        </p>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Kysiah" autoFocus />
        </label>
        <div className="home-actions">
          <button className="btn primary big" disabled={!name.trim() || game.conn !== 'open'}
            onClick={() => { remember(); game.create(name); }}>
            Create a room
          </button>
          <div className="join-row">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} placeholder="CODE"
              aria-label="Room code" className="code-input" />
            <button className="btn big" disabled={!name.trim() || code.length !== 4 || game.conn !== 'open'}
              onClick={() => { remember(); game.join(code, name); }}>
              Join
            </button>
          </div>
        </div>
        {game.conn !== 'open' && <p className="muted small">Connecting to the server…</p>}
      </div>
      <footer className="credits">
        <span className="muted small">A game by</span>
        <img src="/assets/logo-out-of-track.png" alt="Out of Track" className="team-logo" width={480} height={427} />
        <span className="muted small">BSIT 3-8</span>
      </footer>
    </main>
  );
}
