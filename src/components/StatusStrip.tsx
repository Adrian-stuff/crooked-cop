import { AFK_TURN_SECONDS, escapeTarget } from '../../shared/engine';
import { stationLabel } from '../../shared/map';
import type { PublicPlayer, View } from '../../shared/types';
import { SPECTATOR_IDENTITY, tokenText, type Identity } from '../game/identity';
import { actsThisPhase } from '../game/selection';
import { useCountdown } from './Panels';
import { TokenIcon } from './Token';

const PHASE_NAME: Record<string, string> = {
  lobby: 'Lobby', setup: 'Setup', heister: 'Heister Phase', police: 'Police Phase', info: 'Information Phase', ended: 'Case closed',
};

const isOfficer = (role: string) => role === 'police' || role === 'traitor';
const ordinal = (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

// How long the current timer started at, for the progress bar.
function phaseSeconds(view: View): number {
  const s = view.settings;
  switch (view.phase) {
    case 'setup': return s.setupSeconds;
    case 'heister': return s.heisterSeconds;
    case 'police': {
      const cur = view.players.find((p) => p.id === view.policeTurn);
      return cur && (cur.afk || !cur.connected) ? Math.min(AFK_TURN_SECONDS, s.policeSeconds) : s.policeSeconds;
    }
    case 'info': return view.accusation ? Math.max(s.infoSeconds, 20) : s.infoSeconds;
    default: return 0;
  }
}

function Queue({ view, ids, waiting }: { view: View; ids: Record<string, Identity>; waiting: PublicPlayer[] }) {
  if (!waiting.length) return view.phase === 'ended' ? null : <span className="queue muted">Everyone is done</span>;
  let label: string;
  if (view.phase === 'police') {
    const pos = waiting.findIndex((p) => p.id === view.me);
    const now = waiting[0];
    label = pos === 0 ? 'Your turn' : `Now ${now.name}${pos === 1 ? " · you're next" : pos > 1 ? ` · you're ${ordinal(pos + 1)}` : ''}`;
  } else {
    const mine = waiting.some((p) => p.id === view.me);
    label = mine ? 'Your move ·' : view.phase === 'setup' ? 'Not locked in' : 'Waiting on';
  }
  return (
    <span className="queue">
      <span className={label.startsWith('Your') ? 'queue-me' : 'muted'}>{label}</span>
      {waiting.map((p) => (
        <span key={p.id} title={p.afk ? `${p.name} (AFK)` : p.name}
          className={`waiting-token ${p.afk || !p.connected ? 'afk' : ''} ${p.id === view.me ? 'me' : ''} ${view.phase === 'police' ? (p.id === view.policeTurn ? 'current' : 'queued') : ''}`}>
          <TokenIcon role={p.role} identity={ids[p.id] ?? SPECTATOR_IDENTITY} text={tokenText(p)} size={22} />
        </span>
      ))}
    </span>
  );
}

function RoundTrack({ view }: { view: View }) {
  const max = view.settings.maxRounds;
  const round = Math.max(view.round, 0);
  return (
    <div className="round-track" aria-label={`Round ${round} of ${max}`} title={`Round ${round} of ${max}`}>
      <span className="round-label">Round <strong key={round} className="pop">{round}</strong>/{max}</span>
      <span className="pips">
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          return <i key={n} className={`${n < round ? 'past' : n === round ? 'now' : ''} ${n > max - 3 ? 'late' : ''}`} />;
        })}
      </span>
    </div>
  );
}

// Escape progress: public totals for everyone, plus exact carries for the Heister team.
function EscapeMeter({ view }: { view: View }) {
  const need = escapeTarget(view.settings);
  const heisters = view.players.filter((p) => p.role === 'heister');
  const known = heisters.filter((p) => p.carried !== null);
  return (
    <span className="chip gold" title="Artifacts taken, as announced after each Heister Phase">
      <img src="/assets/artifact.png" alt="" width={16} height={16} />
      {known.length
        ? known.map((p) => `${p.label} ${p.carried}`).join(' · ') + ` of ${need} needed`
        : <>Taken <strong key={view.announcedTaken} className="pop">{view.announcedTaken}</strong> of {view.settings.artifactCount} · escape needs {need}</>}
      {view.takenThisRound > 0 && <span className="chip-delta">+{view.takenThisRound}</span>}
    </span>
  );
}

function TeamChips({ view }: { view: View }) {
  const me = view.players.find((p) => p.id === view.me);
  const officer = isOfficer(view.myRole) || view.godView;
  const chips: { key: string; text: string; tone?: string; title?: string }[] = [];
  if (officer && (view.phase === 'police' || view.phase === 'heister')) {
    chips.push({ key: 'arrests', text: `Arrests ${view.arrestsLeft}/3 left`, title: 'Team arrest attempts left this round' });
    if (view.ultimateUnlocked) chips.push({ key: 'pursuit', text: 'Pursuit', tone: 'gold', title: "Officers' Express no longer needs to recharge" });
  }
  // Stealth Mode is announced, so everyone sees it while it lasts.
  for (const h of view.players.filter((p) => p.role === 'heister' && p.stealthUntil !== null)) {
    chips.push({ key: `stealth-${h.id}`, text: `${h.label ?? 'Heister'} in Stealth to R${h.stealthUntil}`, tone: 'warn',
      title: "Searches, scans and clues can't see this Heister. Arrests still work." });
  }
  // Only the Crooked Cop (and the facilitator) can see who is jammed.
  for (const p of view.players.filter((x) => x.jammed)) {
    chips.push({ key: `jam-${p.id}`, text: `${p.id === view.me ? 'You are' : `${p.name} is`} jammed`, tone: 'danger', title: 'Sabotage: their Searches and scans show no Heisters' });
  }
  if (view.phase === 'info' && view.accusation) {
    const target = view.players.find((p) => p.id === view.accusation!.target)?.name ?? 'an officer';
    chips.push({ key: 'vote', text: `Voting on ${target}`, tone: 'danger' });
  }
  for (const ex of view.exitMustClear) chips.push({ key: `exit-${ex}`, text: `Clear ${stationLabel(ex)}`, tone: 'danger', title: 'No officer may end this round on this exit' });
  if (me?.skipsPolice) chips.push({ key: 'skip', text: 'You sit out this Police Phase', tone: 'danger' });
  if (me?.cannotArrest) chips.push({ key: 'noarrest', text: 'No arrests for you this round', tone: 'danger' });
  if (me?.expressCooldown) chips.push({ key: 'express', text: 'Express recharging', tone: 'warn' });
  return <>{chips.map((c) => <span key={c.key} className={`chip ${c.tone ?? ''}`} title={c.title}>{c.text}</span>)}</>;
}

// Sits on top of the board: phase, time left, whose move it is, how far the case has gone.
export function StatusStrip({ view, offset, ids }: { view: View; offset: number; ids: Record<string, Identity> }) {
  const secs = useCountdown(view.deadline, offset);
  const mm = secs === null ? '' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const total = phaseSeconds(view);
  const left = secs !== null && total ? Math.min(1, secs / total) : null;
  const waiting = view.players.filter((p) => actsThisPhase(view.phase, p) && !p.done);
  const me = view.players.find((p) => p.id === view.me);
  return (
    <div className="status-strip">
      <div className="strip-row">
        <span key={view.phase} className={`phase phase-${view.phase}`}>{PHASE_NAME[view.phase]}</span>
        {secs !== null && view.phase !== 'ended' && (
          <span className="timer-wrap">
            <span className={`timer ${secs <= 10 ? 'urgent' : ''}`} aria-live="off">{mm}</span>
            {left !== null && <span className="timer-bar"><i style={{ width: `${left * 100}%` }} className={secs <= 10 ? 'urgent' : ''} /></span>}
          </span>
        )}
        <Queue view={view} ids={ids} waiting={waiting} />
        {me?.afk && <span className="afk-note" role="status">You're marked AFK. Take any action to clear it.</span>}
      </div>
      {view.phase !== 'setup' && (
        <div className="strip-row second">
          <RoundTrack view={view} />
          <EscapeMeter view={view} />
          <TeamChips view={view} />
        </div>
      )}
    </div>
  );
}
