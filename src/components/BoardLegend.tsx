import type { View } from '../../shared/types';
import { SPECTATOR_IDENTITY } from '../game/identity';
import { TokenIcon } from './Token';

interface Props {
  view: View;
  showNames: boolean;
  setShowNames: (on: boolean) => void;
  showTrails: boolean;
  setShowTrails: (on: boolean) => void;
}

export function BoardLegend({ view, showNames, setShowNames, showTrails, setShowTrails }: Props) {
  return (
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
  );
}
