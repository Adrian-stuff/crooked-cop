import { useState } from 'react';
import { heisterCountFor, MAX_PLAYERS, MIN_PLAYERS } from '../../shared/engine';
import { exitsFor, stationLabel } from '../../shared/map';
import type { Settings, View } from '../../shared/types';
import { RulesSettings } from '../components/RulesSettings';
import { TokenIcon } from '../components/Token';
import { SPECTATOR_IDENTITY, seatIdentities, tokenText } from '../game/identity';
import { checkCards, type DealtRole, type TableGame } from '../net/useTableGame';
import type { FacilitatorLink } from '../net/tableLink';
import { DevicesPanel, TableTopBar } from './TableScreen';

const ROLE_OPTIONS: { value: DealtRole; label: string }[] = [
  { value: 'police', label: 'Officer' },
  { value: 'heister', label: 'Heister' },
  { value: 'traitor', label: 'Crooked Cop' },
];

export function TableLobby({ table, view, link }: { table: TableGame; view: View; link: FacilitatorLink }) {
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
          <RulesSettings
            settings={view.settings}
            onChange={set}
            isHost={true}
            showDMs={false}
            heisterCountDisabled={!save.dealRandom}
            heisterCountNote={
              !save.dealRandom
                ? 'Role counts are determined by physical role cards selected above.'
                : undefined
            }
            extraFooter={
              <div className="rules-facilitator-notes">
                <p className="hint">
                  <strong>Facilitator Note:</strong> Timers run on this device. You can pause or add time whenever the table needs it.
                </p>
                <p className="hint">
                  Artifacts can be adjusted on the digital map to match the physical board during setup.
                </p>
              </div>
            }
          />
        </section>

        <DevicesPanel table={table} link={link} />
      </main>
    </div>
  );
}
