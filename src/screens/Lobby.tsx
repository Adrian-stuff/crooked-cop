import { heisterCountFor, MAX_PLAYERS, MIN_PLAYERS } from '../../shared/engine';
import { EXIT_STATION, stationLabel } from '../../shared/map';
import type { Settings, View } from '../../shared/types';
import { Chat } from '../components/Chat';
import { TopBar } from '../components/Panels';
import { RulesSettings } from '../components/RulesSettings';
import { TokenIcon } from '../components/Token';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText } from '../game/identity';
import type { Game } from '../net/useGame';

export function Lobby({ game, view }: { game: Game; view: View }) {
  const me = view.players.find((p) => p.id === view.me)!;
  const ids = seatIdentities(view.players);
  const seated = view.players.filter((p) => !p.wantsSpectate);
  const n = seated.length;
  const h = n >= MIN_PLAYERS ? heisterCountFor(view.settings, n) : 0;
  const canStart = n >= MIN_PLAYERS && n <= MAX_PLAYERS;
  const link = `${location.origin}${location.pathname}?room=${view.code}`;
  const set = (s: Partial<Settings>) => game.act({ type: 'settings', settings: s });

  return (
    <div className="app lobby-screen">
      <TopBar view={view} onLeave={game.leave} />
      <main className="lobby">
        <section className="panel lobby-main">
          <div className="code-hero">
            <span className="muted">Room code</span>
            <strong>{view.code}</strong>
            <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(link)}>Copy invite link</button>
          </div>

          <details className="how-it-works" open>
          <summary>How it works</summary>
          <ol className="steps">
            <li><strong>Invite friends.</strong> Share the room code or the invite link.</li>
            <li className={canStart ? 'done' : ''}><strong>Gather players</strong> — {MIN_PLAYERS} to {MAX_PLAYERS} can play.</li>
            <li>
              {me.isHost
                ? <><strong>Start the game.</strong> Press “Deal roles &amp; start” to give everyone a secret role.</>
                : <><strong>Wait for the host.</strong> They deal everyone a secret role and start the game.</>}
            </li>
          </ol>
          </details>

          <h3>Players at the table ({n}/{MAX_PLAYERS})</h3>
          <ul className="seat-list">
            {view.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={30} />
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

          <details className="how-it-works" open>
          <summary>Secret roles</summary>
            <p><span className="tag heister">Heister</span> Grab Artifacts and escape through an exit before the rounds run out. </p>
            <p><span className="tag police">Police</span> Search stations and arrest the Heisters. </p>
            <p><span className="tag traitor">Crooked Cop</span> One officer is secretly feeding the thieves. </p>
          </details>

          <div className="role-split">
            {canStart
              ? <>With {n} players: <strong>{h} Heister{h > 1 ? 's' : ''}</strong>, <strong>{n - h} Police</strong>, and one of the Police is secretly the <strong>Crooked Cop</strong>. Roles are dealt at random.{' '}
                {view.exits.length > 1 ? <>Exit Stations: <strong>{view.exits.map(stationLabel).join(' and ')}</strong>.</> : <>Exit Station: <strong>{stationLabel(view.exits[0] ?? EXIT_STATION)}</strong>.</>}</>
              : n < MIN_PLAYERS ? `Need ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n > 1 ? 's' : ''} to start.` : 'Too many players are seated.'}
          </div>

          {me.isHost ? (
            <button className="btn primary big chunky" disabled={!canStart} onClick={() => game.act({ type: 'start' })}>Deal roles &amp; start</button>
          ) : <p className="muted">Waiting for the host to start…</p>}
        </section>

        <section className="panel settings">
          <RulesSettings
            settings={view.settings}
            onChange={set}
            isHost={me.isHost}
            showDMs={true}
          />
        </section>

        <Chat view={view} messages={game.chat} say={game.say} />
      </main>
    </div>
  );
}
