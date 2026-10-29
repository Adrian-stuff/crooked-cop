import { useState } from 'react';
import { LINES, lineName, stationLabel } from '../../shared/map';
import type { Envelope, ScanResult, SearchResult, TipResult, View } from '../../shared/types';
import { scanArea } from '../game/envelopeHighlight';
import { stationPercent } from '../game/geometry';
import { SPECTATOR_IDENTITY, type Identity } from '../game/identity';
import { TokenIcon } from './Token';

type Filter = 'all' | 'search' | 'traitor';

interface Props {
  view: View;
  ids: Record<string, Identity>;
  highlight: string | null; // envelope whose area is lit on the map
  onHighlight: (id: string | null, pin?: boolean) => void;
  fresh?: string[]; // envelopes just handed over: marked New and opened, the rest start closed
}

const names = (ids: string[]) => ids.map(stationLabel).join(', ');
const ago = (n: number) => (n === 0 ? 'this round' : n === 1 ? '1 round ago' : `${n} rounds ago`);

// The one-word outcome shown on a collapsed search.
function outcome(r: SearchResult): { text: string; tone: string } {
  if (r.heistersNow.length) return { text: 'Heister seen', tone: 'danger' };
  if (r.tracks.length) return { text: 'Tracks', tone: 'warn' };
  if (r.hidden.length || r.taken.length) return { text: 'Artifacts', tone: 'gold' };
  return { text: 'All clear', tone: 'clear' };
}

function SearchRows({ r }: { r: SearchResult }) {
  const empty = !r.heistersNow.length && !r.tracks.length && !r.hidden.length && !r.taken.length;
  return (
    <>
      <ul className="env-rows">
        {r.heistersNow.length > 0 && <li className="danger"><i aria-hidden="true">!</i><span><strong>Heister at {names(r.heistersNow)}</strong> right now</span></li>}
        {r.tracks.map((t) => <li key={t.station} className="warn"><i aria-hidden="true">~</i><span>Passed {stationLabel(t.station)} {ago(t.ago)}</span></li>)}
        {r.hidden.length > 0 && <li className="gold"><i aria-hidden="true">◆</i><span>Artifact hidden at {names(r.hidden)}</span></li>}
        {r.taken.map((t) => (
          <li key={`${t.station}-${t.round}`} className="gold"><i aria-hidden="true">◇</i>
            <span>Artifact taken from {stationLabel(t.station)} {t.round === 0 ? 'at the start' : `in round ${t.round}`}</span></li>
        ))}
        <li className="clear"><i aria-hidden="true">✓</i><span>{empty ? `All clear across ${r.area.length} stations` : 'Nothing else in the area'}</span></li>
      </ul>
      <p className="env-clue"><span className="env-clue-tag">Radio</span> {r.clue}</p>
    </>
  );
}

function ScanRows({ r }: { r: ScanResult }) {
  const at = r.heistersNow?.length ? names(r.heistersNow) : null;
  return (
    <ul className="env-rows">
      {r.found
        ? (
            <li className="danger">
              <i aria-hidden="true">!</i>
              <span><strong>Heister spotted on the {lineName(r.line)} line</strong>{at ? <> at <strong>{at}</strong></> : ''} right now</span>
            </li>
          )
        : <li className="clear"><i aria-hidden="true">✓</i><span>No Heister on the {lineName(r.line)} line right now</span></li>}
      {r.zones?.map((z, i) => (
        <li key={i} className="danger">
          <i aria-hidden="true">?</i>
          <span>One of <strong>{names(z)}</strong>. Guess which</span>
        </li>
      ))}
      <li><i aria-hidden="true">·</i><span>Scanned from {stationLabel(r.from)} across {r.stations.length} stations</span></li>
    </ul>
  );
}

function TipRows({ tip, view, ids }: { tip: TipResult[]; view: View; ids: Props['ids'] }) {
  return (
    <ul className="env-rows">
      {tip.map((t) => {
        const p = view.players.find((x) => x.id === t.id);
        return (
          <li key={t.id} className={t.station ? 'danger' : 'clear'}>
            {p && <TokenIcon role="heister" identity={ids[t.id] ?? SPECTATOR_IDENTITY} text={t.label} size={20} />}
            <span><strong>{t.label}</strong> {t.station ? <>is at <strong>{stationLabel(t.station)}</strong></> : `is ${t.status}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

// A collapsed envelope's one-line summary.
function Summary({ e, ids }: { e: Envelope; ids: Props['ids'] }) {
  if (e.search) {
    const o = outcome(e.search);
    return <><span className="env-what">{stationLabel(e.search.station)}</span><span className={`env-chip ${o.tone}`}>{o.text}</span></>;
  }
  if (e.scan) {
    const at = e.scan.heistersNow?.length ? names(e.scan.heistersNow) : null; // old saves only
    return (
      <>
        <span className="env-what"><i className="line-swatch" style={{ background: LINES.find((l) => l.id === e.scan!.line)?.color }} />{lineName(e.scan.line)} line</span>
        <span className={`env-chip ${e.scan.found ? 'danger' : 'clear'}`}>{e.scan.found ? (at ? `Heister at ${at}` : 'Heister on line') : 'Line clear'}</span>
      </>
    );
  }
  if (e.tip) {
    return (
      <>
        <span className="env-what">Tip-off</span>
        <span className="env-tips">
          {e.tip.map((t) => (
            <span key={t.id} style={{ color: (ids[t.id] ?? SPECTATOR_IDENTITY).color }}>
              {t.label} {t.station ? stationLabel(t.station) : t.status}
            </span>
          ))}
        </span>
      </>
    );
  }
  return <span className="env-what">{e.title}</span>;
}

// Your latest search this round, opened on the map right above the station you searched.
export function MapEnvelope({ view, onClose }: { view: View; onClose: (id: string) => void }) {
  const e = view.envelopes.filter((x) => x.to === view.me && x.search && x.round === view.round).at(-1);
  if (!e || !e.search) return null;
  const { left, top } = stationPercent(e.search.station);
  const place = `${top < 45 ? 'below' : 'above'} ${left < 18 ? 'from-left' : left > 82 ? 'from-right' : ''}`;
  const { text, tone } = outcome(e.search);
  return (
    <div key={e.id} className={`map-env ${place}`} style={{ left: `${left}%`, top: `${top}%` }}
      role="dialog" aria-label={`Search result for ${stationLabel(e.search.station)}`} onClick={(ev) => ev.stopPropagation()}>
      <header>
        <span className="env-round">R{e.round}</span>
        <strong>Search: {stationLabel(e.search.station)}</strong>
        <span className={`env-chip ${tone}`}>{text}</span>
        <button className="map-env-close" onClick={() => onClose(e.id)} aria-label="Close search result">×</button>
      </header>
      <div className="env-body"><SearchRows r={e.search} /></div>
    </div>
  );
}

export function Envelopes({ view, ids, highlight, onHighlight, fresh }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (view.phase === 'lobby') return null;

  const all = [...view.envelopes].reverse();
  const hasTips = all.some((e) => e.kind === 'traitor' || e.kind === 'sabotage');
  // Ultimate scans sit with the searches, Sabotage notes with the tip-offs.
  const list = all.filter((e) => filter === 'all' || e.kind === filter || (filter === 'search' && e.kind === 'ultimate')
    || (filter === 'traitor' && e.kind === 'sabotage'));
  const to = (e: Envelope) => (view.godView ? view.players.find((p) => p.id === e.to)?.name : null);

  return (
    <section className="panel envelopes">
      <div className="env-head">
        <h3>{view.godView ? 'All envelopes' : 'Your envelopes'}</h3>
        {all.length > 0 && <span className="muted small">{all.length}</span>}
        {hasTips && (
          <div className="env-filter" role="tablist" aria-label="Filter envelopes">
            {(['all', 'search', 'traitor'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'search' ? 'Searches' : 'Tip-offs'}
              </button>
            ))}
          </div>
        )}
      </div>
      {all.length === 0 && <p className="muted">Search a station to receive a sealed envelope. Its contents are private to you.</p>}
      <div className="env-list">
        {list.map((e, i) => {
          const isNew = fresh ? fresh.includes(e.id) : i === 0;
          const isOpen = open[e.id] ?? (fresh ? isNew : i === 0 && filter === 'all');
          const toggle = () => setOpen((o) => ({ ...o, [e.id]: !isOpen }));
          return (
            <article key={e.id} className={`envelope ${e.kind} ${isOpen ? 'open' : 'closed'} ${isNew ? 'newest' : ''}`}>
              <header>
                <button className="env-toggle" onClick={toggle} aria-expanded={isOpen}>
                  <span className="env-round">R{e.round}</span>
                  {fresh?.includes(e.id) && <span className="env-new">New</span>}
                  {isOpen ? <span className="env-what">{e.search ? stationLabel(e.search.station) : e.scan ? `Ultimate: ${lineName(e.scan.line)} line` : e.tip ? 'Crooked tip-off' : e.title}</span>
                    : <Summary e={e} ids={ids} />}
                  {to(e) && <span className="env-to">· {to(e)}</span>}
                  <span className="env-caret" aria-hidden="true" />
                </button>
                {isOpen && (e.search || e.scan) && (
                  <button className={`env-area ${highlight === e.id ? 'on' : ''}`} title={e.scan ? (e.scan.found ? 'Show where the Heister could be' : 'Show the scanned line on the map') : 'Show the swept stations on the map'}
                    onMouseEnter={() => onHighlight(e.id)} onMouseLeave={() => onHighlight(null)}
                    onFocus={() => onHighlight(e.id)} onBlur={() => onHighlight(null)}
                    onClick={() => onHighlight(e.id, true)}>
                    {(e.search?.area ?? scanArea(e.scan!)).length} stations
                  </button>
                )}
              </header>
              {isOpen && (
                <div className="env-body">
                  {e.search ? <SearchRows r={e.search} />
                    : e.scan ? <ScanRows r={e.scan} />
                    : e.tip ? <TipRows tip={e.tip} view={view} ids={ids} />
                      : <ul className="env-lines">{e.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
