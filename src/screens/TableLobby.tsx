import { useState } from 'react';
import { escapeTarget, heisterCountFor, MAX_PLAYERS, MIN_PLAYERS } from '../../shared/engine';
import { exitsFor, stationLabel } from '../../shared/map';
import type { Settings, View } from '../../shared/types';
import { TokenIcon } from '../components/Token';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText } from '../game/identity';
import { checkCards, type DealtRole, type TableGame } from '../net/useTableGame';
import { TableTopBar } from './TableScreen';

const ROLE_OPTIONS: { value: DealtRole; label: string }[] = [
  { value: 'police', label: 'Officer' },
  { value: 'heister', label: 'Heister' },
  { value: 'traitor', label: 'Crooked Cop' },
];

export function TableLobby({ table, view }: { table: TableGame; view: View }) {
  const [name, setName] = useState('');
  const save = table.save!;
  const seated = view.players.filter((p) => !p.wantsSpectate);
  const ids = seatIdentities(view.players);
  const n = seated.length;
  const h = n >= MIN_PLAYERS ? heisterCountFor(view.settings, n) : 0;
  const cardProblem = save.dealRandom ? null : checkCards(save.state, save.roles);
  const canStart = n >= MIN_PLAYERS && n <= MAX_PLAYERS && !cardProblem;
  const set = (s: Partial<Settings>) => table.setSettings(s);
  const add = () => {
    if (!name.trim()) return;
    table.addPlayer(name);
    setName('');
  };

  const num = (key: keyof Settings, label: string, min: number, max: number, suffix = '') => (
    <label className="field inline">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={view.settings[key] as number}
        onChange={(e) => set({ [key]: Number(e.target.value) })} />
      {suffix && <span className="muted">{suffix}</span>}
    </label>
  );

  return (
    <div className="app lobby-screen">
      <TableTopBar table={table} />
      <main className="lobby table-lobby">
        <section className="panel lobby-main">
          <h2 className="table-title">Facilitator mode</h2>
          <p className="muted">
            For a game on the physical board. Only you use this device: you enter each player's move and the app keeps the
            timer, the dispatch log, the Artifacts and every clue, so you can read envelopes out or copy them onto cards.
          </p>

          <h3>Players at the table ({n}/{MAX_PLAYERS})</h3>
          <form className="join-row table-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Player name" aria-label="Player name"
              disabled={n >= MAX_PLAYERS} autoFocus />
            <button className="btn" disabled={!name.trim() || n >= MAX_PLAYERS}>Add</button>
          </form>
          <ul className="seat-list">
            {seated.map((p) => (
              <li key={p.id}>
                <TokenIcon role={save.dealRandom ? 'police' : save.roles[p.id] ?? 'police'} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={30} />
                <span className="pname">{p.name}</span>
                {!save.dealRandom && (
                  <select value={save.roles[p.id] ?? 'police'} aria-label={`${p.name}'s role`}
                    onChange={(e) => table.setRole(p.id, e.target.value as DealtRole)}>
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                <button className="btn ghost small" onClick={() => table.removePlayer(p.id)}>Remove</button>
              </li>
            ))}
            {!n && <li className="muted">Add everyone sitting at the table, in seat order.</li>}
          </ul>

          <fieldset className="table-deal">
            <legend>Roles</legend>
            <label className="check">
              <input type="radio" name="deal" checked={save.dealRandom} onChange={() => table.setDealRandom(true)} />
              Deal at random on this device (tell each player their role in private)
            </label>
            <label className="check">
              <input type="radio" name="deal" checked={!save.dealRandom} onChange={() => table.setDealRandom(false)} />
              Match the physical role cards
            </label>
          </fieldset>

          <div className="role-split">
            {n < MIN_PLAYERS ? `Add ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n > 1 ? 's' : ''} to start.`
              : cardProblem ?? <>
                {save.dealRandom
                  ? <>With {n} players: <strong>{h} Heister{h > 1 ? 's' : ''}</strong> and <strong>{n - h} Police</strong>, one of them the Crooked Cop.</>
                  : <>Roles as marked above.</>}{' '}
                {exitsFor(n).length > 1 ? <>Exits: <strong>{exitsFor(n).map(stationLabel).join(' and ')}</strong>.</> : <>Exit: <strong>{stationLabel(exitsFor(n)[0])}</strong>.</>}
              </>}
          </div>

          <button className="btn primary big" disabled={!canStart} onClick={table.start}>Start the game</button>
        </section>

        <section className="panel settings">
          <h3>Rules</h3>
          {num('maxRounds', 'Rounds', 1, 50)}
          {num('heisterSeconds', 'Heister Phase', 10, 600, 'sec')}
          {num('policeSeconds', 'Each officer’s turn', 10, 600, 'sec')}
          {num('infoSeconds', 'Information Phase', 10, 600, 'sec')}
          {num('setupSeconds', 'Setup', 10, 600, 'sec')}
          {num('artifactCount', 'Artifacts hidden', 1, 30)}
          <p className="hint">A Heister escapes with {escapeTarget(view.settings)} (half of the Artifacts). You can move the Artifacts to match the board during setup.</p>
          {num('searchRange', 'Search range', 0, 3, 'stops')}
          <label className="field inline">
            <span>Heisters with 6–7 players</span>
            <select value={String(view.settings.heisterCount)} disabled={!save.dealRandom}
              onChange={(e) => set({ heisterCount: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 1 | 2) })}>
              <option value="auto">2 (default)</option>
              <option value="1">1</option>
            </select>
          </label>
          <p className="hint">Timers run on this device. You can pause or add time whenever the table needs it.</p>
        </section>
      </main>
    </div>
  );
}
