import { useEffect } from 'react';
import { useGame } from './net/useGame';
import { GameScreen } from './screens/GameScreen';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';

export default function App() {
  const game = useGame();
  const { error, clearError } = game;

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  let screen;
  if (!game.view) screen = game.resuming ? <div className="splash">Reconnecting…</div> : <Home game={game} />;
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
