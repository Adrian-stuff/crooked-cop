import { useEffect, useMemo, useState } from 'react';
import type { View } from '../../shared/types';
import { ActionDock } from '../components/ActionDock';
import { Board } from '../components/Board';
import { Chat } from '../components/Chat';
import { Envelopes } from '../components/Envelopes';
import { Log, PhaseBanner, PlayerList, RevealCard, RoleReveal, TopBar } from '../components/Panels';
import { StatusStrip } from '../components/StatusStrip';
import { StationPopover } from '../components/StationPopover';
import { TokenIcon } from '../components/Token';
import { SPECTATOR_IDENTITY, seatIdentities } from '../game/identity';
import { channelKind, channelLabel, useRecentChat } from '../game/recentChat';
import { unlockSound, useTurnAlert } from '../game/turnAlert';
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
  // Keep the area your Search swept lit up for the rest of the round.
  // Hovering or pinning an envelope's area chip lights that sweep up instead.
  const [hoverEnv, setHoverEnv] = useState<string | null>(null);
  const [pinnedEnv, setPinnedEnv] = useState<string | null>(null);
  const shownEnv = view.envelopes.find((e) => e.id === (hoverEnv ?? pinnedEnv));
  const areaOf = (e?: (typeof view.envelopes)[number]) => e?.search?.area ?? e?.scan?.stations;
  const swept = areaOf(shownEnv)
    ?? areaOf(view.envelopes.filter((e) => (e.kind === 'search' || e.kind === 'ultimate') && e.to === view.me && e.round === view.round).at(-1));
  // Stations where your own searches spotted a Heister in the last 3 rounds (latest per station).
  const lastSeen = useMemo(() => {
    if (view.godView) return [];
    const seen: Record<string, number> = {};
    for (const e of view.envelopes) {
      if (e.to !== view.me || !e.search || view.round - e.round > 2) continue;
      for (const s of e.search.heistersNow) seen[s] = Math.max(seen[s] ?? 0, e.round);
    }
    return Object.entries(seen).map(([station, round]) => ({ station, round }));
  }, [view.envelopes, view.me, view.round, view.godView]);
  const highlightEnv = (id: string | null, pin?: boolean) => {
    if (pin) setPinnedEnv((p) => (p === id ? null : id));
    else setHoverEnv(id);
  };

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
      <TopBar view={view} onLeave={game.leave} sound={sound} onSound={toggleSound} />
      <main className="game">
        <div className="board-col">
          <div className="board-wrap">
            <StatusStrip view={view} offset={game.clockOffset} ids={ids} />
            <div className="board-scroll">
              <div className="board-stage">
                <Board view={view} marks={marks} onStation={onStation} showTrails={showTrails && !!view.trails}
                  showNames={showNames} focus={focus} onFocus={setFocus} selected={picked} swept={swept} lastSeen={lastSeen} chat={recentChat}
                  onPick={(id) => setPicked(mode || id === picked ? null : id)} />
                {ticker.length > 0 && (
                  <div className="chat-ticker" aria-live="polite">
                    {ticker.map((m) => (
                      <div key={m.id} className={`tick ${channelKind(m.channel)}`}>
                        <span className="tick-chan">{channelLabel(m.channel)}</span>
                        <strong style={{ color: ids[m.from]?.color }}>{m.name}</strong> {m.text}
                      </div>
                    ))}
                  </div>
                )}
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
          <Envelopes view={view} ids={ids} highlight={hoverEnv ?? pinnedEnv} onHighlight={highlightEnv} />
          <Chat view={view} messages={game.chat} say={game.say} />
        </aside>
      </main>
      <PhaseBanner view={view} />
      <RevealCard view={view} />
      {showRole && <RoleReveal view={view} onClose={() => setShowRole(false)} />}
    </div>
  );
}
