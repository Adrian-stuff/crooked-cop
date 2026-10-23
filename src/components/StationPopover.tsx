import { useEffect, useRef } from 'react';
import { LINES, STATION_BY_ID, linesAt, searchArea, stationLabel } from '../../shared/map';
import type { Action, View } from '../../shared/types';
import { stationPercent } from '../game/geometry';
import { SPECTATOR_IDENTITY, tokenText, type Identity } from '../game/identity';
import { canTarget, pathTo } from '../game/selection';
import { TokenIcon } from './Token';

interface Props {
  view: View;
  station: string;
  ids: Record<string, Identity>;
  act: (a: Action) => void;
  onClose: () => void;
  facilitator?: boolean; // the facilitator is recording for the viewer, so name them instead of "you"
  onPing?: (station: string) => void;
}

interface Choice {
  key: string;
  label: string;
  note?: string;
  kind?: 'primary' | 'search' | 'arrest';
  action: Action;
}

// What the viewer can do at this station right now, best option first.
function choices(view: View, id: string): Choice[] {
  const me = view.players.find((p) => p.id === view.me);
  if (!me || me.status !== 'active' || view.myRole === 'spectator') return [];
  const officer = view.myRole === 'police' || view.myRole === 'traitor';
  const out: Choice[] = [];

  if (view.phase === 'setup' && !me.done && me.station !== id && canTarget(view, 'start', id)) {
    out.push({ key: 'start', label: me.station ? 'Start here instead' : 'Start here', kind: 'primary', action: { type: 'chooseStart', station: id } });
  }
  const myTurn = view.phase !== 'police' || view.policeTurn === me.id;

  const canMove = me.station && me.station !== id && !me.done
    && ((view.phase === 'heister' && view.myRole === 'heister') || (view.phase === 'police' && officer && myTurn && !me.moved && !me.acted));
  if (canMove) {
    const walk = pathTo(view, 'move', id);
    const express = walk || me.expressCooldown ? null : pathTo(view, 'express', id);
    const route = walk ?? express;
    if (route) {
      const via = route.slice(0, -1).map(stationLabel);
      const grabs = view.artifacts ? (express ? [id] : route).filter((s) => (view.artifacts?.[s] ?? 0) > 0).length : 0;
      const notes = [via.length ? `via ${via.join(', ')}` : '', grabs ? `picks up ${grabs} Artifact${grabs > 1 ? 's' : ''}` : '']
        .filter(Boolean).join(' · ');
      out.push({
        key: 'move', label: express ? 'Express here' : 'Move here', note: notes || undefined, kind: 'primary',
        action: { type: 'move', path: route, express: !!express },
      });
    }
  }

  if (view.phase === 'police' && officer && myTurn && !me.done && !me.acted && !me.moved) {
    if (canTarget(view, 'search', id)) {
      const area = searchArea(id).length - 1;
      const sweep = STATION_BY_ID[id].interchange ? `every stop around it (${area})` : `2 stops each way on its line (${area})`;
      out.push({ key: 'search', label: 'Search here', note: `${me.station === id ? 'Sweeps' : 'Go there and sweep'} this station and ${sweep}`, kind: 'search', action: { type: 'search', station: id } });
    }
    if (canTarget(view, 'arrest', id) && !me.cannotArrest && view.arrestsLeft > 0) {
      out.push({ key: 'arrest', label: 'Arrest here', note: `Wrong arrest: you sit out next round · ${view.arrestsLeft} left · within 2 stops`, kind: 'arrest', action: { type: 'arrest', station: id } });
    }
  }
  return out;
}

export function StationPopover({ view, station, ids, act, onClose, facilitator, onPing }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { left, top } = stationPercent(station);
  const options = choices(view, station);
  const here = view.players.filter((p) => p.station === station && p.role !== 'spectator' && p.status !== 'escaped');
  const artifacts = view.artifacts?.[station] ?? 0;
  const isExit = view.exits.includes(station);
  const isOfficer = view.myRole === 'police' || view.myRole === 'traitor';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('button.choice')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open below stations near the top edge, and hug the side for stations near the edges.
  const place = `${top < 35 ? 'below' : 'above'} ${left < 18 ? 'from-left' : left > 82 ? 'from-right' : ''}`;
  return (
    <div ref={ref} className={`station-pop ${place}`} style={{ left: `${left}%`, top: `${top}%` }}
      role="dialog" aria-label={`${stationLabel(station)} actions`} onClick={(e) => e.stopPropagation()}>
      <header>
        <div>
          <strong>{stationLabel(station)}</strong>
          <span className="pop-lines">
            {linesAt(station).map((l) => {
              const line = LINES.find((x) => x.id === l)!;
              return <span key={l}><i style={{ background: line.color }} />{line.name}</span>;
            })}
          </span>
        </div>
        <button className="pop-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      {(isExit || here.length > 0 || artifacts > 0) && (
        <div className="pop-facts">
          {isExit && <span className="pop-exit">Exit station</span>}
          {artifacts > 0 && <span><img src="/assets/artifact.png" alt="" width={16} height={16} /> {artifacts} Artifact{artifacts > 1 ? 's' : ''}</span>}
          {here.map((p) => (
            <span key={p.id} className="pop-who">
              <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={18} />
              {p.id === view.me && !facilitator ? 'You' : p.name}
            </span>
          ))}
        </div>
      )}
      {options.length > 0 ? (
        <div className="pop-choices">
          {options.map((c) => (
            <button key={c.key} className={`choice ${c.kind ?? ''}`} onClick={() => { act(c.action); onClose(); }}>
              <span>{c.label}</span>
              {c.note && <small>{c.note}</small>}
            </button>
          ))}
          {onPing && isOfficer && view.phase !== 'lobby' && view.phase !== 'ended' && (
            <button className="choice ping" onClick={() => { onPing(station); onClose(); }}>
              <span>📍 Notify cops: pointing here</span>
              <small>Alert other officers you are pointing at {stationLabel(station)}</small>
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="pop-none">{noneReason(view, facilitator)}</p>
          {onPing && isOfficer && view.phase !== 'lobby' && view.phase !== 'ended' && (
            <div className="pop-choices">
              <button className="choice ping" onClick={() => { onPing(station); onClose(); }}>
                <span>📍 Notify cops: pointing here</span>
                <small>Alert other officers you are pointing at {stationLabel(station)}</small>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function noneReason(view: View, facilitator?: boolean): string {
  const me = view.players.find((p) => p.id === view.me);
  if (facilitator && (!me || view.myRole === 'spectator')) return 'Nobody to record a move for right now.';
  if (!me || view.myRole === 'spectator' || me.status !== 'active') return facilitator ? `${me?.name} is out of play.` : 'You are watching this case.';
  if (me.done) return facilitator ? `${me.name}'s turn is done for this phase.` : 'Your turn is done for this phase.';
  const officer = view.myRole === 'police' || view.myRole === 'traitor';
  if (view.phase === 'police' && officer && view.policeTurn !== me.id) return 'Wait for your turn.';
  if (view.phase === 'police' && officer) return 'Out of reach this turn.';
  if (view.phase === 'setup') return facilitator ? `${me.name} starts here.` : 'You start here.';
  if (view.phase === 'heister' && view.myRole === 'heister') return 'Out of reach this turn.';
  return 'Nothing to do here this phase.';
}
