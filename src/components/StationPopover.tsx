import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { LINES, STATION_BY_ID, distance, linesAt, searchArea, stationLabel } from '../../shared/map';
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
  facilitator?: boolean;
  onPing?: (station: string) => void;
}

interface Choice {
  key: string;
  label: string;
  badge?: string;
  note?: string;
  kind: 'move' | 'express' | 'search' | 'arrest' | 'start';
  action: Action;
}

function getActionIcon(kind: Choice['kind']): ReactNode {
  switch (kind) {
    case 'move':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'express':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
    case 'search':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'arrest':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );
    case 'start':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor" fillOpacity="0.25" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
  }
}

// What the viewer can do at this station right now, best option first.
function choices(view: View, id: string): Choice[] {
  const me = view.players.find((p) => p.id === view.me);
  if (!me || me.status !== 'active' || view.myRole === 'spectator') return [];
  const officer = view.myRole === 'police' || view.myRole === 'traitor';
  const out: Choice[] = [];

  if (view.phase === 'setup' && !me.done && me.station !== id && canTarget(view, 'start', id)) {
    out.push({
      key: 'start',
      label: me.station ? 'Start Here Instead' : 'Select Start Station',
      badge: 'Starting Stop',
      kind: 'start',
      action: { type: 'chooseStart', station: id },
    });
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
      const stops = route.length;
      const stopText = `${stops} stop${stops > 1 ? 's' : ''}`;

      if (express) {
        out.push({
          key: 'express',
          label: 'Express Ride',
          badge: `⚡ Express · ${stopText}`,
          note: notes || undefined,
          kind: 'express',
          action: { type: 'move', path: route, express: true },
        });
      } else {
        out.push({
          key: 'move',
          label: 'Move Here',
          badge: stopText,
          note: notes || undefined,
          kind: 'move',
          action: { type: 'move', path: route, express: false },
        });
      }
    }
  }

  if (view.phase === 'police' && officer && myTurn && !me.done && !me.acted && !me.moved) {
    if (canTarget(view, 'search', id)) {
      const area = searchArea(id).length - 1;
      const sweep = STATION_BY_ID[id].interchange ? `every stop around it (${area})` : `2 stops each way on its line (${area})`;
      out.push({
        key: 'search',
        label: 'Search Area',
        badge: `🔍 Sweeps ${area + 1} stops`,
        note: `${me.station === id ? 'Sweeps' : 'Go here and sweep'} this station and ${sweep}`,
        kind: 'search',
        action: { type: 'search', station: id },
      });
    }
    if (canTarget(view, 'arrest', id) && !me.cannotArrest && view.arrestsLeft > 0) {
      out.push({
        key: 'arrest',
        label: 'Attempt Arrest',
        badge: `🚨 ${view.arrestsLeft} arrest${view.arrestsLeft > 1 ? 's' : ''} left`,
        note: 'Wrong arrest: sit out next round · within 2 stops',
        kind: 'arrest',
        action: { type: 'arrest', station: id },
      });
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
    ref.current?.querySelector<HTMLButtonElement>('button.action-card')?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open below stations near the top edge, and hug the side for stations near the edges.
  const place = `${top < 35 ? 'below' : 'above'} ${left < 18 ? 'from-left' : left > 82 ? 'from-right' : ''}`;
  const stData = STATION_BY_ID[station];

  return (
    <div
      ref={ref}
      className={`station-pop ${place}`}
      style={{ left: `${left}%`, top: `${top}%` }}
      role="dialog"
      aria-label={`${stationLabel(station)} actions`}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="station-pop-header">
        <div className="station-pop-title-group">
          <div className="station-pop-name-row">
            <strong className="station-pop-name">{stationLabel(station)}</strong>
            {stData?.interchange && (
              <span className="station-pop-chip interchange" title="Interchange station">
                Interchange
              </span>
            )}
            {isExit && (
              <span className="station-pop-chip exit" title="Exit station">
                ★ Exit
              </span>
            )}
          </div>
          <div className="pop-lines">
            {linesAt(station).map((l) => {
              const line = LINES.find((x) => x.id === l)!;
              return (
                <span
                  key={l}
                  className="pop-line-pill"
                  style={{ '--line-color': line.color } as CSSProperties}
                >
                  <i style={{ background: line.color }} />
                  {line.name}
                </span>
              );
            })}
          </div>
        </div>
        <button className="pop-close" onClick={onClose} aria-label="Close station dialog">
          ×
        </button>
      </header>

      {(artifacts > 0 || here.length > 0) && (
        <div className="pop-facts">
          {artifacts > 0 && (
            <span className="pop-fact-pill artifact" title={`${artifacts} Artifacts here`}>
              <img src="/assets/artifact.png" alt="" width={15} height={15} />
              <strong>{artifacts}</strong> Artifact{artifacts > 1 ? 's' : ''}
            </span>
          )}
          {here.map((p) => (
            <span key={p.id} className="pop-fact-pill who" title={`${p.name} is here`}>
              <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={18} />
              <span>{p.id === view.me && !facilitator ? 'You' : p.name}</span>
            </span>
          ))}
        </div>
      )}

      {options.length > 0 ? (
        <div className="pop-choices">
          {options.map((c) => (
            <button
              key={c.key}
              className={`action-card ${c.kind}`}
              onClick={() => {
                act(c.action);
                onClose();
              }}
            >
              <div className="action-card-icon">{getActionIcon(c.kind)}</div>
              <div className="action-card-content">
                <div className="action-card-header">
                  <strong className="action-card-title">{c.label}</strong>
                  {c.badge && <span className="action-card-badge">{c.badge}</span>}
                </div>
                {c.note && <small className="action-card-note">{c.note}</small>}
              </div>
              <span className="action-card-arrow">→</span>
            </button>
          ))}
          {onPing && isOfficer && view.phase !== 'lobby' && view.phase !== 'ended' && (
            <button
              className="action-card ping"
              onClick={() => {
                onPing(station);
                onClose();
              }}
            >
              <div className="action-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" fill="currentColor" fillOpacity="0.3" />
                </svg>
              </div>
              <div className="action-card-content">
                <div className="action-card-header">
                  <strong className="action-card-title">Point Out To Police</strong>
                  <span className="action-card-badge">Team Ping</span>
                </div>
                <small className="action-card-note">Alert officers you are pointing at {stationLabel(station)}</small>
              </div>
              <span className="action-card-arrow">→</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="pop-status-banner">
            <div className="pop-status-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="pop-none">{noneReason(view, station, facilitator)}</p>
          </div>
          {onPing && isOfficer && view.phase !== 'lobby' && view.phase !== 'ended' && (
            <div className="pop-choices">
              <button
                className="action-card ping"
                onClick={() => {
                  onPing(station);
                  onClose();
                }}
              >
                <div className="action-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" fill="currentColor" fillOpacity="0.3" />
                  </svg>
                </div>
                <div className="action-card-content">
                  <div className="action-card-header">
                    <strong className="action-card-title">Point Out To Police</strong>
                    <span className="action-card-badge">Team Ping</span>
                  </div>
                  <small className="action-card-note">Alert officers you are pointing at {stationLabel(station)}</small>
                </div>
                <span className="action-card-arrow">→</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function noneReason(view: View, station: string, facilitator?: boolean): string {
  const me = view.players.find((p) => p.id === view.me);
  if (facilitator && (!me || view.myRole === 'spectator')) return 'Nobody to record a move for right now.';
  if (!me || view.myRole === 'spectator' || me.status !== 'active') return facilitator ? `${me?.name} is out of play.` : 'You are watching this case.';
  if (me.done) return facilitator ? `${me.name}'s turn is done for this phase.` : 'Your turn is done for this phase.';
  const officer = view.myRole === 'police' || view.myRole === 'traitor';
  if (view.phase === 'police' && officer && view.policeTurn !== me.id) return 'Wait for your turn.';
  if (view.phase === 'police' && officer) return 'Out of reach this turn (pick within 2 stops to move/search/arrest).';
  if (view.phase === 'setup') {
    const isHeister = view.myRole === 'heister' || me.role === 'heister';
    if (me.station === station) return facilitator ? `${me.name} starts here.` : 'You start here.';
    if (isHeister && view.exits.includes(station)) return 'Heisters cannot start on an Exit Station.';
    const artifactIds = Object.keys(view.artifacts ?? {});
    if (isHeister && artifactIds.some((art) => distance(station, art) < 3)) {
      return 'Heisters must start at least 3 stations away from any Artifact.';
    }
    return facilitator ? `${me.name} starts here.` : 'You start here.';
  }
  if (view.phase === 'heister' && view.myRole === 'heister') return 'Out of reach this turn (can only move up to 2 stops).';
  return 'Nothing to do here this phase.';
}
