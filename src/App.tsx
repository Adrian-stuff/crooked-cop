import { useCallback, useEffect, useState } from 'react';
import { useGame } from './net/useGame';
import { USE_SUPABASE } from './net/config';
import { useSupabaseGame } from './net/useSupabaseGame';
import { DEV_IMPERSONATE, DevImpersonate } from './components/DevImpersonate';
import { hasTableGame } from './net/useTableGame';
import { GameScreen } from './screens/GameScreen';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { CopsScreen } from './screens/CopsScreen';
import { DisplayScreen } from './screens/DisplayScreen';
import { TableApp } from './screens/TableScreen';

const useBackend = USE_SUPABASE ? useSupabaseGame : useGame;

// A link like ?display=CODE or ?cops=CODE opens a device that follows a facilitator-mode game.
const params = new URLSearchParams(location.search);
const deviceCode = (key: string) => params.get(key)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

// Facilitator mode runs on this device; it only goes online if the facilitator connects other devices.
export default function App() {
  const [table, setTable] = useState(hasTableGame);
  const exitTable = useCallback(() => setTable(false), []);
  const display = deviceCode('display');
  const cops = deviceCode('cops');
  if (display) return <DisplayScreen code={display} />;
  if (cops) return <CopsScreen code={cops} />;
  return table ? <TableApp onExit={exitTable} /> : <OnlineApp onTable={() => setTable(true)} />;
}

function OnlineApp({ onTable }: { onTable: () => void }) {
  const game = useBackend();
  const { error, clearError } = game;

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  let screen;
  if (!game.view) screen = game.resuming ? <div className="splash">Reconnecting…</div> : <Home game={game} onTable={onTable} />;
  else if (game.view.phase === 'lobby') screen = <Lobby game={game} view={game.view} />;
  else screen = <GameScreen key={game.view.me} game={game} view={game.view} />; // fresh screen state per seat (dev switching)

  return (
    <>
      {screen}
      {game.conn === 'closed' && game.view && <div className="conn-banner">Connection lost. Reconnecting…</div>}
      {error && <div className="toast" role="alert" onClick={clearError}>{error}</div>}
      {DEV_IMPERSONATE && <DevImpersonate me={game.view?.me} onSwitch={game.switchSession} />}
    </>
  );
}
