import { useEffect, useMemo, useState } from 'react';
import type { View } from '../../shared/types';
import { ActionPanel } from '../components/ActionPanel';
import { Board } from '../components/Board';
import { Chat } from '../components/Chat';
import { Envelopes, Log, PlayerList, RoleReveal, TopBar } from '../components/Panels';
import { marksFor, type Mode } from '../game/selection';
import type { Game } from '../net/useGame';

export function GameScreen({ game, view }: { game: Game; view: View }) {
  const [mode, setMode] = useState<Mode>(null);
  const [path, setPath] = useState<string[]>([]);
  const [showRole, setShowRole] = useState(view.phase === 'setup');
  const [showTrails, setShowTrails] = useState(true);

  // Reset any half-built selection when the phase changes.
  useEffect(() => {
    setMode(null);
    setPath([]);
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
      <TopBar view={view} offset={game.clockOffset} onLeave={game.leave} />
      <main className="game">
        <div className="board-col">
          <div className="board-wrap">
            <div className="board-scroll">
              <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails} />
            </div>
            <div className="legend">
              <span><i className="lg station" /> Station</span>
              <span><i className="lg interchange" /> Interchange</span>
              <span><i className="lg exit" /> Exit</span>
              <span><i className="lg cop" /> Officer</span>
              <span><i className="lg heister" /> Heister</span>
              {view.artifacts && <span><img src="/assets/artifact.png" alt="" width={16} height={16} /> Artifact</span>}
              {view.trails && (
                <label className="check small">
                  <input type="checkbox" checked={showTrails} onChange={(e) => setShowTrails(e.target.checked)} /> Heister trails
                </label>
              )}
            </div>
          </div>
          <div className="below-board">
            <PlayerList view={view} />
            <Log view={view} />
          </div>
        </div>
        <aside className="side-col">
          <ActionPanel view={view} mode={mode} path={path} setMode={setMode} setPath={setPath} act={game.act} />
          <Envelopes view={view} />
          <Chat view={view} messages={game.chat} say={game.say} />
        </aside>
      </main>
      {showRole && <RoleReveal view={view} onClose={() => setShowRole(false)} />}
    </div>
  );
}
