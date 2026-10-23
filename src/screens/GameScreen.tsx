import { useEffect, useMemo, useRef, useState } from 'react';
import type { View } from '../../shared/types';
import { stationLabel } from '../../shared/map';
import { ActionDock } from '../components/ActionDock';
import { Board } from '../components/Board';
import { BoardLegend } from '../components/BoardLegend';
import { BoardPanZoom } from '../components/BoardPanZoom';
import { Chat } from '../components/Chat';
import { Envelopes } from '../components/Envelopes';
import { ArrestCard, Log, PhaseBanner, PlayerList, RevealCard, RoleReveal, TopBar } from '../components/Panels';
import { StatusStrip } from '../components/StatusStrip';
import { StationPopover } from '../components/StationPopover';
import { seatIdentities } from '../game/identity';
import { channelKind, channelLabel, useRecentChat } from '../game/recentChat';
import { useEnvelopeHighlight } from '../game/envelopeHighlight';
import { useFullscreen } from '../game/useFullscreen';
import { unlockSound, useTurnAlert } from '../game/turnAlert';
import { marksFor, type Mode } from '../game/selection';
import type { Game } from '../net/useGame';

export function GameScreen({ game, view }: { game: Game; view: View }) {
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen(boardWrapRef);
  const [mode, setMode] = useState<Mode>(null);
  const [path, setPath] = useState<string[]>([]);
  const [showRole, setShowRole] = useState(view.phase === 'setup');
  const [showTrails, setShowTrails] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem('cc-sound') === 'on'; } catch { return false; }
  });
  const toggleSound = (on: boolean) => {
    if (on) unlockSound();
    setSound(on);
    try { localStorage.setItem('cc-sound', on ? 'on' : 'off'); } catch { /* private mode */ }
  };
  useTurnAlert(view, sound);
  // New chat pops up on the map: over the sender's pawn, or in a ticker if you can't see them.
  const recentChat = useRecentChat(game.chat, game.clockOffset);
  const onBoard = new Set(view.players.filter((p) => p.station && p.role !== 'spectator' && p.status !== 'escaped').map((p) => p.id));
  const ticker = recentChat.filter((m) => !onBoard.has(m.from)).slice(-3);
  const ids = useMemo(() => seatIdentities(view.players), [view.players]);
  const { highlight, onHighlight, swept, lastSeen } = useEnvelopeHighlight(view);

  // Teammate pings / location alerts from police chat in the last few seconds.
  const pings = useMemo(() => {
    const list: { station: string; by: string; name: string }[] = [];
    for (const m of recentChat) {
      if (m.channel !== 'police') continue;
      const match = m.text.match(/\[ping:([a-z0-9_]+)\]/);
      if (match) {
        list.push({ station: match[1], by: m.from, name: m.name });
      }
    }
    return list;
  }, [recentChat]);

  // Reset any half-built selection when the phase changes.
  useEffect(() => {
    setMode(null);
    setPath([]);
    setPicked(null);
  }, [view.phase, view.round]);

  const me = view.players.find((p) => p.id === view.me);
  const activeTarget = view.phase === 'police' && view.policeTurn
    ? view.players.find((p) => p.id === view.policeTurn)
    : me;
  const currentStation = activeTarget?.station ?? null;
  const currentTargetName = activeTarget?.name;

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
      {/* Everything needed to play fits in one screen; the players list and the log sit below it. */}
      <div className="game-fold">
        <TopBar view={view} onLeave={game.leave} sound={sound} onSound={toggleSound} />
        <main className="game">
          <div className="board-col">
            <div ref={boardWrapRef} className={`board-wrap ${fullscreen ? 'is-fullscreen' : ''}`}>
              <StatusStrip view={view} offset={game.clockOffset} ids={ids} />
              <BoardPanZoom
                activeStation={currentStation}
                activePlayerName={currentTargetName}
                controls={
                  <button
                    type="button"
                    className={`board-fs-btn ${fullscreen ? 'is-fs' : ''}`}
                    onClick={toggleFullscreen}
                    title={fullscreen ? 'Exit fullscreen map (Esc)' : 'Expand map fullscreen'}
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Expand map fullscreen'}
                  >
                    {fullscreen ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                        <span>Exit</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                        <span>Fullscreen</span>
                      </>
                    )}
                  </button>
                }
                overlay={
                  ticker.length > 0 && (
                    <div className="chat-ticker" aria-live="polite">
                      {ticker.map((m) => (
                        <div key={m.id} className={`tick ${channelKind(m.channel)}`}>
                          <span className="tick-chan">{channelLabel(m.channel)}</span>
                          <strong style={{ color: ids[m.from]?.color }}>{m.name}</strong> {m.text.replace(/\s*\[ping:[a-z0-9_]+\]/g, '')}
                        </div>
                      ))}
                    </div>
                  )
                }
              >
                <div className="board-stage">
                  <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails}
                    showNames={showNames} focus={focus} onFocus={setFocus} selected={picked} swept={swept} lastSeen={lastSeen} chat={recentChat}
                    pings={pings}
                    onPick={(id) => setPicked(mode || id === picked ? null : id)} />
                  {picked && !mode && (
                    <StationPopover view={view} station={picked} ids={ids} act={game.act} onClose={() => setPicked(null)}
                      onPing={(id) => game.say('police', `📍 Pointing at ${stationLabel(id)} [ping:${id}]`)} />
                  )}
                </div>
              </BoardPanZoom>
              <BoardLegend view={view} showNames={showNames} setShowNames={setShowNames} showTrails={showTrails} setShowTrails={setShowTrails}
                fullscreen={fullscreen} onFullscreen={toggleFullscreen}>
                <a className="legend-more" href="#case-file">Players &amp; log ↓</a>
              </BoardLegend>
            </div>
            <ActionDock key={view.phase} view={view} mode={mode} path={path} setMode={(m) => { setPicked(null); setMode(m); }} setPath={setPath} act={game.act} />
          </div>
          <aside className="side-col">
            <Envelopes view={view} ids={ids} highlight={highlight} onHighlight={onHighlight} />
            <Chat view={view} messages={game.chat} say={game.say} />
          </aside>
        </main>
      </div>
      <div className="below-board below-fold" id="case-file">
        <PlayerList view={view} ids={ids} focus={focus} setFocus={setFocus} />
        <Log view={view} />
      </div>
      <PhaseBanner view={view} />
      <RevealCard view={view} />
      <ArrestCard view={view} />
      {showRole && <RoleReveal view={view} onClose={() => setShowRole(false)} />}
    </div>
  );
}
