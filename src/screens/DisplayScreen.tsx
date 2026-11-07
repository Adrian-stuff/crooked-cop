import { useMemo } from 'react';
import { escapeTarget } from '../../shared/engine';
import { stationLabel } from '../../shared/map';
import type { View } from '../../shared/types';
import { RoundRecap } from '../components/ActionDock';
import { RoundTrack } from '../components/StatusStrip';
import { phaseSeconds } from '../game/phaseSeconds';
import { Board } from '../components/Board';
import { ElapsedChip } from '../components/GameClock';
import { Log, PhaseBanner, PlayerList, RevealCard, useCountdown } from '../components/Panels';
import { seatIdentities } from '../game/identity';
import { useTableDevice } from '../net/tableLink';
import '../table.css';
import { useMusic, useTimeWarning } from '../game/sound';

const PHASE_NAME: Record<string, string> = {
  lobby: 'Getting ready', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// What the room should be doing right now, in one line.
function nowLine(v: View): string {
  const up = v.players.find((p) => p.id === v.policeTurn);
  switch (v.phase) {
    case 'lobby': return 'The facilitator is seating players.';
    case 'setup': return 'Everyone picks a starting station with the facilitator.';
    case 'heister': return 'Heisters, tell the facilitator your move. Police, plan your next move.';
    case 'police': return up ? `${up.name}, pick your action on the cops device.` : 'Officers take their turns.';
    case 'info': return v.accusation ? 'Officers are voting on the Crooked Cop.' : 'Compare notes. Any officer may call a vote.';
    case 'ended': return v.endReason ?? '';
  }
}

export function DisplayScreen({ code }: { code: string }) {
  const { sync, offset, online, facilitator } = useTableDevice(code, 'display');
  const v = sync?.display;
  const secs = useCountdown(v?.deadline ?? null, offset);
  const ids = useMemo(() => seatIdentities(v?.players ?? []), [v?.players]);
  // The table display is the shared speaker in facilitator mode.
  useMusic(!v ? null : v.phase === 'lobby' || v.phase === 'ended' ? 'lobby' : 'game', v?.phase === 'info');
  useTimeWarning(v?.phase ?? 'lobby', secs, sync?.paused != null);

  if (!v) {
    return (
      <div className="splash device-wait">
        <div>Table display · {code}</div>
        <p className="muted">{online ? "Waiting for the facilitator's device…" : 'Connecting…'}</p>
      </div>
    );
  }

  const paused = sync.paused;
  const shown = paused !== null ? clock(Math.ceil(paused / 1000)) : secs === null ? '' : clock(secs);
  const seated = { ...v, players: v.players.filter((p) => p.role !== 'spectator') };
  const total = phaseSeconds(v);
  const leftSecs = paused !== null ? Math.ceil(paused / 1000) : secs;
  const left = leftSecs !== null && total ? Math.min(1, leftSecs / total) : null;
  const urgent = paused === null && secs !== null && secs <= 10;
  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});

  return (
    <div className={`display-screen phase-bg-${v.phase}`}>
      <header className="display-head">
        <div className="display-phase">
          <span className="pt-round">{v.phase === 'setup' ? `Setup · ${v.settings.maxRounds} rounds` : 'Facilitator mode'}</span>
          <strong>{v.phase === 'ended' ? (v.winner === 'heisters' ? 'The Heisters got away' : 'Case closed') : PHASE_NAME[v.phase]}</strong>
          <span className="display-now">{nowLine(v)}</span>
          {v.phase !== 'lobby' && v.phase !== 'setup' && <div className="display-rounds"><RoundTrack view={v} /></div>}
        </div>
        {v.phase !== 'ended' && v.phase !== 'lobby' && (
          <div className={`display-clock ${paused !== null ? 'paused' : urgent ? 'urgent' : ''}`}>
            {shown || '—'}
            {total > 0 && <span className="display-total">of {clock(total)}</span>}
            {left !== null && <span className="timer-bar display-timer-bar"><i style={{ width: `${left * 100}%` }} className={urgent ? 'urgent' : ''} /></span>}
            {paused !== null && <small>Paused</small>}
          </div>
        )}
        <div className="display-facts">
          {v.phase !== 'lobby' && v.phase !== 'setup' && (
            <span className="chip gold">
              <img src="/assets/icons/artifact.png" alt="" width={18} height={18} />
              {v.announcedTaken} of {v.settings.artifactCount} taken · escape needs {escapeTarget(v.settings)}
            </span>
          )}
          {v.phase !== 'lobby' && <ElapsedChip view={v} offset={offset} />}
          {v.phase !== 'lobby' && <span className="chip">Exit{v.exits.length > 1 ? 's' : ''}: {v.exits.map(stationLabel).join(', ')}</span>}
          {v.exitMustClear.map((ex) => <span key={ex} className="chip danger">Clear {stationLabel(ex)} this round</span>)}
          <button className="btn ghost small" onClick={fullscreen}>Full screen</button>
        </div>
      </header>
      {(!online || !facilitator) && (
        <div className="device-banner">{online ? "The facilitator's device is offline. The game picks up when it's back." : 'Reconnecting…'}</div>
      )}
      <main className="display-main">
        <div className="display-board">
          <Board view={v} showTrails={!!v.trails} showNames />
        </div>
        <aside className="display-side">
          {(v.phase === 'info' || (v.phase === 'police' && v.roundActions.length > 0)) && (
            <section className="panel display-recap"><RoundRecap view={v} /></section>
          )}
          {v.phase === 'ended' && (
            <section className={`panel display-verdict ${v.winner}`}>
              <h2>{v.winner === 'heisters' ? 'Heisters win' : 'Police win'}</h2>
              <p>{v.endReason}</p>
            </section>
          )}
          <PlayerList view={seated} ids={ids} focus={null} setFocus={() => {}} />
          <Log view={v} />
        </aside>
      </main>
      <PhaseBanner view={v} />
      <RevealCard view={v} />
    </div>
  );
}
