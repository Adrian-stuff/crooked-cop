import { useCallback, useEffect, useState } from 'react';
import { useGame } from './net/useGame';
import { USE_SUPABASE } from './net/config';
import { useSupabaseGame } from './net/useSupabaseGame';
import { hasTableGame } from './net/useTableGame';
import { GameScreen } from './screens/GameScreen';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { TableApp } from './screens/TableScreen';

const useBackend = USE_SUPABASE ? useSupabaseGame : useGame;

// Facilitator mode runs entirely on this device, so it never opens a connection.
export default function App() {
  const [table, setTable] = useState(hasTableGame);
  const exitTable = useCallback(() => setTable(false), []);
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
  else screen = <GameScreen game={game} view={game.view} />;

  return (
    <>
      {screen}
      {game.conn === 'closed' && game.view && <div className="conn-banner">Connection lost. Reconnecting…</div>}
      {error && <div className="toast" role="alert" onClick={clearError}>{error}</div>}
    </>
  );
}
