import { useState } from 'react';
import { EXIT_STATION, stationLabel } from '../../shared/map';
import type { Action, View } from '../../shared/types';
import type { Mode } from '../game/selection';

interface Props {
  view: View;
  mode: Mode;
  path: string[];
  setMode: (m: Mode) => void;
  setPath: (p: string[]) => void;
  act: (a: Action) => void;
}

const isOfficer = (role: string) => role === 'police' || role === 'traitor';

export function ActionPanel({ view, mode, path, setMode, setPath, act }: Props) {
  const me = view.players.find((p) => p.id === view.me);
  const [accuseTarget, setAccuseTarget] = useState('');
  if (!me) return null;
  const officer = isOfficer(view.myRole);
  const active = me.status === 'active';

  const pathControls = (
    <div className="path-box">
      <div className="path-line">
        <span className="muted">Route:</span>{' '}
        {path.length ? path.map(stationLabel).join(' → ') : <em className="muted">click highlighted stations on the map</em>}
      </div>
      <div className="row">
        <button className="btn primary" disabled={!path.length}
          onClick={() => { act({ type: 'move', path, express: mode === 'express' }); setPath([]); setMode(null); }}>
          Confirm {mode === 'express' ? 'Express' : 'move'}
        </button>
        <button className="btn ghost" onClick={() => { setPath([]); setMode(null); }}>Cancel</button>
      </div>
    </div>
  );

  const moveButtons = (
    <div className="row">
      <button className={`btn ${mode === 'move' ? 'selected' : ''}`} onClick={() => { setPath([]); setMode('move'); }}>
        Move 1–2
      </button>
      <button className={`btn express ${mode === 'express' ? 'selected' : ''}`} onClick={() => { setPath([]); setMode('express'); }}>
        <img src="/assets/card-express.png" alt="" className="btn-card" /> Express (up to 4, one line)
      </button>
    </div>
  );

  // ----- Lobby is handled elsewhere -----
  if (view.phase === 'ended') {
    return (
      <section className="panel action-panel">
        <h2 className={`verdict ${view.winner}`}>{view.winner === 'heisters' ? 'The Heisters got away' : 'The Police closed the case'}</h2>
        <p>{view.endReason}</p>
        {me.isHost || !view.players.find((p) => p.isHost)?.connected ? (
          <button className="btn primary" onClick={() => act({ type: 'rematch' })}>Back to lobby for a rematch</button>
        ) : <p className="muted">Waiting for the host to start a rematch.</p>}
      </section>
    );
  }

  if (view.myRole === 'spectator') {
    return (
      <section className="panel action-panel">
        <h2>{view.godView ? 'Facilitator view' : 'Spectating'}</h2>
        <p className="muted">
          {view.godView
            ? 'You can see every Heister, every Artifact and the Crooked Cop. Keep it to yourself.'
            : 'You see what the public board shows. Hidden positions are revealed at the end.'}
        </p>
      </section>
    );
  }

  if (!active) {
    const msg = me.status === 'arrested' ? 'You were arrested. Watch the rest of the case unfold.'
      : me.status === 'exposed' ? 'You were exposed as the Crooked Cop and removed from the force.'
        : 'You escaped!';
    return <section className="panel action-panel"><h2>Out of play</h2><p>{msg}</p></section>;
  }

  if (view.phase === 'setup') {
    return (
      <section className="panel action-panel">
        <h2>Choose your starting station</h2>
        {me.station ? (
          <p>You start at <strong>{stationLabel(me.station)}</strong>. Waiting for the others…</p>
        ) : (
          <>
            <p>{view.myRole === 'heister'
              ? 'Pick secretly. Only your partner and the facilitator will know. Gold coins mark the hidden Artifacts.'
              : 'Your pick is public. Spread out to cover the network.'}</p>
            <button className={`btn ${mode === 'start' ? 'selected' : 'primary'}`} onClick={() => setMode('start')}>
              {mode === 'start' ? 'Now click any station on the map' : 'Pick on the map'}
            </button>
          </>
        )}
      </section>
    );
  }

  if (view.phase === 'heister') {
    if (view.myRole !== 'heister') {
      return (
        <section className="panel action-panel">
          <h2>Heister Phase</h2>
          <p className="muted">The Heisters are moving in secret. Plan your next move in Police chat.</p>
        </section>
      );
    }
    return (
      <section className="panel action-panel">
        <h2>Your move, {me.label}</h2>
        {me.done ? <p>Move locked in. Waiting for your partner…</p> : (
          <>
            <p className="muted">Passing through or stopping on an Artifact station picks it up. Express only picks up at its last stop.</p>
            {mode === 'move' || mode === 'express' ? pathControls : moveButtons}
            <button className="btn ghost" onClick={() => act({ type: 'endTurn' })}>Stay put this round</button>
          </>
        )}
        <p className="carry">Carrying <strong>{me.carried ?? 0}</strong> of {view.settings.artifactsToEscape} needed to escape through {stationLabel(EXIT_STATION)}.</p>
      </section>
    );
  }

  if (view.phase === 'police') {
    if (!officer) {
      return (
        <section className="panel action-panel">
          <h2>Police Phase</h2>
          <p className="muted">Officers are moving, searching and arresting. Watch the board.</p>
        </section>
      );
    }
    if (me.done) {
      return (
        <section className="panel action-panel">
          <h2>Police Phase</h2>
          <p>{me.skipsPolice ? 'You sit out this phase (wrong arrest last round).' : 'Your turn is done. Waiting for the other officers…'}</p>
        </section>
      );
    }
    return (
      <section className="panel action-panel">
        <h2>Your turn, Officer</h2>
        <ol className="steps">
          <li className={me.moved ? 'done' : ''}>
            <strong>Move</strong> <span className="muted">(optional)</span>
            {!me.moved && (mode === 'move' || mode === 'express' ? pathControls : moveButtons)}
          </li>
          <li className={me.acted ? 'done' : ''}>
            <strong>Search or Arrest</strong>
            {!me.acted && (
              <div className="row">
                <button className={`btn search ${mode === 'search' ? 'selected' : ''}`} onClick={() => { setPath([]); setMode('search'); }}>
                  Search
                </button>
                <button className={`btn arrest ${mode === 'arrest' ? 'selected' : ''}`}
                  disabled={me.cannotArrest || view.arrestsLeft <= 0}
                  onClick={() => { setPath([]); setMode('arrest'); }}>
                  <img src="/assets/card-arrest.png" alt="" className="btn-card" /> Arrest ({view.arrestsLeft} left for the team)
                </button>
              </div>
            )}
            {mode === 'search' && <p className="hint">Click a blue-ringed station to search it.</p>}
            {mode === 'arrest' && <p className="hint">Click a red-ringed station. A wrong arrest costs you next round's Police Phase.</p>}
            {me.cannotArrest && <p className="hint">You were wrongly accused: no arrests for you this round.</p>}
          </li>
        </ol>
        <button className="btn ghost" onClick={() => { setMode(null); act({ type: 'endTurn' }); }}>End my turn</button>
        {view.exitMustClear && <p className="hint warn">Exit rule: no officer may end this round on {stationLabel(EXIT_STATION)}.</p>}
      </section>
    );
  }

  // Information phase
  const acc = view.accusation;
  const officers = view.players.filter((p) => isOfficer(p.role) && p.status === 'active');
  const target = acc && view.players.find((p) => p.id === acc.target);
  const yes = acc ? Object.values(acc.votes).filter(Boolean).length : 0;
  const no = acc ? Object.values(acc.votes).filter((v) => !v).length : 0;
  return (
    <section className="panel action-panel">
      <h2>Information Phase</h2>
      <p className="muted">Compare envelopes in chat. The round ends when everyone is done or the timer runs out.</p>
      {acc && target && (
        <div className="vote-box">
          <p><strong>{view.players.find((p) => p.id === acc.by)?.name}</strong> accuses <strong>{target.name}</strong>.</p>
          <p className="muted">Yes {yes} · No {no} · majority of {officers.length} officers needed</p>
          {officer && (
            <div className="row">
              <button className={`btn arrest ${acc.votes[me.id] === true ? 'selected' : ''}`} onClick={() => act({ type: 'vote', yes: true })}>Guilty</button>
              <button className={`btn ${acc.votes[me.id] === false ? 'selected' : ''}`} onClick={() => act({ type: 'vote', yes: false })}>Not guilty</button>
            </div>
          )}
        </div>
      )}
      {officer && !acc && !view.accusationUsed && (
        <div className="row">
          <select value={accuseTarget} onChange={(e) => setAccuseTarget(e.target.value)} aria-label="Officer to accuse">
            <option value="">Accuse an officer…</option>
            {officers.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn arrest" disabled={!accuseTarget}
            onClick={() => { act({ type: 'accuse', target: accuseTarget }); setAccuseTarget(''); }}>
            Call the vote
          </button>
        </div>
      )}
      {view.accusationUsed && !acc && <p className="muted">This round's accusation has been used.</p>}
      <button className="btn primary" disabled={me.done} onClick={() => act({ type: 'ready' })}>
        {me.done ? 'Waiting for the others…' : "I'm done talking"}
      </button>
    </section>
  );
}
