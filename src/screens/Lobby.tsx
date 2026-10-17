import { heisterCountFor, MAX_PLAYERS, MIN_PLAYERS } from '../../shared/engine';
import type { Settings, View } from '../../shared/types';
import { Chat } from '../components/Chat';
import { TopBar } from '../components/Panels';
import type { Game } from '../net/useGame';

export function Lobby({ game, view }: { game: Game; view: View }) {
  const me = view.players.find((p) => p.id === view.me)!;
  const seated = view.players.filter((p) => !p.wantsSpectate);
  const n = seated.length;
  const h = n >= MIN_PLAYERS ? heisterCountFor(view.settings, n) : 0;
  const canStart = n >= MIN_PLAYERS && n <= MAX_PLAYERS;
  const link = `${location.origin}${location.pathname}?room=${view.code}`;
  const set = (s: Partial<Settings>) => game.act({ type: 'settings', settings: s });

  const num = (key: keyof Settings, label: string, min: number, max: number, suffix = '') => (
    <label className="field inline">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={view.settings[key] as number} disabled={!me.isHost}
        onChange={(e) => set({ [key]: Number(e.target.value) })} />
      {suffix && <span className="muted">{suffix}</span>}
    </label>
  );

  return (
    <div className="app lobby-screen">
      <TopBar view={view} offset={game.clockOffset} onLeave={game.leave} />
      <main className="lobby">
        <section className="panel lobby-main">
          <div className="code-hero">
            <span className="muted">Room code</span>
            <strong>{view.code}</strong>
            <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(link)}>Copy invite link</button>
          </div>

          <h3>Players at the table ({n}/{MAX_PLAYERS})</h3>
          <ul className="seat-list">
            {view.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span className="pname">{p.name}{p.id === view.me && <em> (you)</em>}{p.isHost && <span className="tag gold">Host</span>}</span>
                {p.wantsSpectate && <span className="tag">{p.isHost ? 'Facilitator (sees all)' : 'Spectator'}</span>}
                {me.isHost && p.id !== me.id && <button className="btn ghost small" onClick={() => game.kick(p.id)}>Remove</button>}
              </li>
            ))}
          </ul>

          <label className="check">
            <input type="checkbox" checked={me.wantsSpectate} onChange={(e) => game.act({ type: 'spectate', on: e.target.checked })} />
            {me.isHost ? 'Sit out as facilitator (see everything, don’t play)' : 'Watch as a spectator'}
          </label>

          <div className="role-split">
            {canStart
              ? <>With {n} players: <strong>{h} Heister{h > 1 ? 's' : ''}</strong>, <strong>{n - h} Police</strong>, and one of the Police is secretly the <strong>Crooked Cop</strong>. Roles are dealt at random.</>
              : n < MIN_PLAYERS ? `Need ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n > 1 ? 's' : ''} to start.` : 'Too many players are seated.'}
          </div>

          {me.isHost ? (
            <button className="btn primary big" disabled={!canStart} onClick={() => game.act({ type: 'start' })}>Deal roles &amp; start</button>
          ) : <p className="muted">Waiting for the host to start…</p>}
        </section>

        <section className="panel settings">
          <h3>Rules {me.isHost ? '' : <span className="muted">(host sets these)</span>}</h3>
          {num('maxRounds', 'Rounds', 1, 50)}
          {num('heisterSeconds', 'Heister Phase', 10, 600, 'sec')}
          {num('policeSeconds', 'Police Phase', 10, 600, 'sec')}
          {num('infoSeconds', 'Information Phase', 10, 600, 'sec')}
          {num('setupSeconds', 'Setup', 10, 600, 'sec')}
          {num('artifactCount', 'Artifacts hidden', 1, 30)}
          {num('artifactsToEscape', 'Needed to escape', 1, 30)}
          {num('searchRange', 'Search range', 0, 3, 'stops')}
          <label className="field inline">
            <span>Heisters with 6–7 players</span>
            <select value={String(view.settings.heisterCount)} disabled={!me.isHost}
              onChange={(e) => set({ heisterCount: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 1 | 2) })}>
              <option value="auto">2 (default)</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={view.settings.allowDMs} disabled={!me.isHost} onChange={(e) => set({ allowDMs: e.target.checked })} />
            Allow direct messages
          </label>
        </section>

        <Chat view={view} messages={game.chat} say={game.say} />
      </main>
    </div>
  );
}
