import type { PublicRole } from '../../shared/types';
import { ART } from '../game/art';
import type { Identity } from '../game/identity';

// Shape says the role, colour says the person: officers wear a shield, Heisters a diamond.
const SHIELD = 'M0 -31 L25 -22 V1 C25 17 13 26 0 32 C-13 26 -25 17 -25 1 V-22 Z';
const DIAMOND = 'M0 -33 L33 0 L0 33 L-33 0 Z';

interface TokenProps {
  role: PublicRole;
  identity: Identity;
  text: string;
}

// Drawn around (0, 0), roughly 66 units across.
export function TokenShape({ role, identity, text }: TokenProps) {
  const playing = role === 'heister' || role === 'police' || role === 'traitor';
  const art = playing ? ART.token[role] : null;
  const portrait = ART.portraits[identity.seat] ?? null;
  const shape = role === 'heister' ? DIAMOND : playing ? SHIELD : null;
  // The outer frame repeats the role colour so the role reads even at a glance.
  const frame = role === 'heister' ? '#e0413f' : role === 'traitor' ? '#4fc06c' : '#0b0d11';

  return (
    <g className={`token token-${role}`}>
      {art ? (
        <>
          <circle r={31} fill={identity.color} stroke="#0b0d11" strokeWidth={4} />
          <image href={art} x={-30} y={-30} width={60} height={60} />
        </>
      ) : shape ? (
        <>
          <path d={shape} fill="none" stroke={frame} strokeWidth={12} strokeLinejoin="round" />
          <path d={shape} fill={identity.color} stroke="#fff" strokeWidth={3.5} strokeLinejoin="round" />
          {role !== 'heister' && <path d="M-18 -17 L0 -24 L18 -17" fill="none" stroke={identity.ink} strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />}
        </>
      ) : (
        <circle r={27} fill={identity.color} stroke="#fff" strokeWidth={3.5} />
      )}
      {portrait
        ? <image href={portrait} x={-20} y={-20} width={40} height={40} />
        : !art && <text y={role === 'heister' ? 8 : 9} textAnchor="middle" className="token-text" fill={identity.ink}>{text}</text>}
    </g>
  );
}

// The same token as a small inline icon for lists and chat.
export function TokenIcon({ size = 26, ...props }: TokenProps & { size?: number }) {
  return (
    <svg className="token-icon" width={size} height={size} viewBox="-40 -40 80 80" aria-hidden="true">
      <TokenShape {...props} />
    </svg>
  );
}
