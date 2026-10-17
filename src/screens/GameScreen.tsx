import { useEffect, useMemo, useState } from 'react';
import type { View } from '../../shared/types';
import { ActionDock } from '../components/ActionDock';
import { Board } from '../components/Board';
import { Chat } from '../components/Chat';
import { Envelopes, Log, PhaseBanner, PlayerList, RoleReveal, StatusStrip, TopBar } from '../components/Panels';
import { StationPopover } from '../components/StationPopover';
import { TokenIcon } from '../components/Token';
import { SPECTATOR_IDENTITY, seatIdentities } from '../game/identity';
import { marksFor, type Mode } from '../game/selection';
import type { Game } from '../net/useGame';

export function GameScreen({ game, view }: { game: Game; view: View }) {
  const [mode, setMode] = useState<Mode>(null);
  const [path, setPath] = useState<string[]>([]);
  const [showRole, setShowRole] = useState(view.phase === 'setup');
  const [showTrails, setShowTrails] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const ids = useMemo(() => seatIdentities(view.players), [view.players]);

  // Reset any half-built selection when the phase changes.
  useEffect(() => {
    setMode(null);
    setPath([]);
    setPicked(null);
  }, [view.phase, view.round]);

  useEffect(() => {
    if (view.phase === 'setup') setShowRole(true);
  }, [view.phase]);

  const marks = useMemo(() => (mode ? marksFor(view, mode, path) : {}), [view, mode, path]);

  const onStation = (id: string) => {
    if (mode === 'start') {
      game.act({ type: 'chooseStart', station: id });
      setMode(null);
    } else if (mode === 'move' || mode === 'express') {
      if (path.at(-1) === id) setPath(path.slice(0, -1));
      else if (marks[id] === 'candidate') setPath([...path, id]);
    } else if (mode === 'search') {
      game.act({ type: 'search', station: id });
      setMode(null);
    } else if (mode === 'arrest') {
      game.act({ type: 'arrest', station: id });
      setMode(null);
    }
  };

  return (
    <div className="app game-screen">
      <TopBar view={view} onLeave={game.leave} />
      <main className="game">
        <div className="board-col">
          <div className="board-wrap">
            <StatusStrip view={view} offset={game.clockOffset} ids={ids} />
            <div className="board-scroll">
              <div className="board-stage">
                <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails}
                  showNames={showNames} focus={focus} onFocus={setFocus} selected={picked}
                  onPick={(id) => setPicked(mode || id === picked ? null : id)} />
                {picked && !mode && (
                  <StationPopover view={view} station={picked} ids={ids} act={game.act} onClose={() => setPicked(null)} />
                )}
              </div>
            </div>
            <div className="legend">
              <span><i className="lg station" /> Station</span>
              <span><i className="lg interchange" /> Interchange</span>
              <span><i className="lg exit" /> Exit</span>
              <span><TokenIcon role="police" identity={SPECTATOR_IDENTITY} text="" size={18} /> Officer</span>
              <span><TokenIcon role="heister" identity={SPECTATOR_IDENTITY} text="" size={18} /> Heister</span>
              <span className="lg-note">Colour = player</span>
              {view.artifacts && <span><img src="/assets/artifact.png" alt="" width={16} height={16} /> Artifact</span>}
              <label className="check small">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Name tags
              </label>
              {view.trails && (
                <label className="check small">
                  <input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Heister trails
                </label>
              )}
            </div>
          </div>
          <ActionDock key={view.phase} view={view} mode={mode} path={path} setMode={(m) => { setPicked(null); setMode(m); }} setPath={setPath} act={game.act} />
          <div className="below-board">
            <PlayerList view={view} ids={ids} focus={focus} setFocus={setFocus} />
            <Log view={view} />
          </div>
        </div>
        <aside className="side-col">
          <Envelopes view={view} />
          <Chat view={view} messages={game.chat} say={game.say} />
        </aside>
      </main>
      <PhaseBanner view={view} />
      {showRole && <RoleReveal view={view} onClose={() => setShowRole(false)} />}
    </div>
  );
}
