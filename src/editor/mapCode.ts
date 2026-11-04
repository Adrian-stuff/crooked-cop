import { EXIT_STATION, SECOND_EXIT, type Line, type Station } from '../../shared/map';

export interface MapDraft {
  stations: Station[];
  lines: Line[];
}

export type Pt = { x: number; y: number };
export type SegPoint = string | Pt;

export const MARK_START = "// @map-editor:start (everything down to @map-editor:end is rewritten by the map editor's Save)";
export const MARK_END = '// @map-editor:end';

// A single-quoted TS string literal. JSON.stringify escapes backslashes, newlines and other control
// characters, so a name can never end the literal or break the generated file.
const q = (s: string) => `'${JSON.stringify(s).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
const pt = (p: SegPoint) => (typeof p === 'string' ? q(p) : `{ x: ${p.x}, y: ${p.y} }`);

// Packs items onto lines no wider than `width`, each line prefixed by `indent`.
function wrap(items: string[], indent: string, width = 100): string {
  const rows: string[] = [];
  let row = '';
  for (const it of items) {
    if (row && indent.length + row.length + it.length + 2 > width) {
      rows.push(indent + row);
      row = '';
    }
    row += (row ? ' ' : '') + it + ',';
  }
  if (row) rows.push(indent + row);
  return rows.join('\n');
}

function stationCode(st: Station): string {
  const extra = (['interchange', 'exit', 'major'] as const).filter((k) => st[k]).map((k) => `${k}: true`);
  if (st.fontSize) extra.push(`fontSize: ${st.fontSize}`);
  if (st.labelAngle) extra.push(`labelAngle: ${st.labelAngle}`);
  if (st.labelOffset) extra.push(`labelOffset: { x: ${Math.round(st.labelOffset.x)}, y: ${Math.round(st.labelOffset.y)} }`);
  return `  s(${q(st.id)}, ${q(st.name)}, ${Math.round(st.x)}, ${Math.round(st.y)}, ${q(st.label)}${extra.length ? `, { ${extra.join(', ')} }` : ''}),`;
}

function lineCode(line: Line): string {
  const segs = line.segments.filter((seg) => seg.length > 1);
  const body = segs.length === 1
    ? `[[\n${wrap(segs[0].map(pt), '      ')}\n    ]]`
    : `[\n${segs.map((seg) => `      [\n${wrap(seg.map(pt), '        ')}\n      ],`).join('\n')}\n    ]`;
  return `  {\n    id: ${q(line.id)},\n    name: ${q(line.name)},\n    color: ${q(line.color)},\n    segments: ${body},\n  },`;
}

// The block between the markers in shared/map.ts.
export function mapCode(map: MapDraft): string {
  return [
    MARK_START,
    'export const STATIONS: Station[] = [',
    ...map.stations.map(stationCode),
    '];',
    '',
    'export const LINES: Line[] = [',
    ...map.lines.map(lineCode),
    '];',
    MARK_END,
  ].join('\n');
}

export function validate(map: MapDraft): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const st of map.stations) {
    if (!/^[a-z0-9_]+$/.test(st.id)) out.push(`Station id "${st.id}" should be lower_snake_case.`);
    if (ids.has(st.id)) out.push(`Duplicate station id "${st.id}".`);
    ids.add(st.id);
    if (!st.name.trim()) out.push(`Station "${st.id}" has no name.`);
  }
  const used = new Set<string>();
  const lineIds = new Set<string>();
  for (const line of map.lines) {
    if (lineIds.has(line.id)) out.push(`Duplicate line id "${line.id}".`);
    lineIds.add(line.id);
    if (!line.segments.some((seg) => seg.filter((p) => typeof p === 'string').length > 1))
      out.push(`${line.name} line connects no stations.`);
    line.segments.forEach((seg, i) => {
      if (seg.length === 1) out.push(`${line.name} segment ${i + 1} has a single point and will be dropped.`);
      for (const p of seg) {
        if (typeof p !== 'string') continue;
        if (!ids.has(p)) out.push(`${line.name} line references missing station "${p}".`);
        used.add(p);
      }
    });
  }
  for (const st of map.stations) if (!used.has(st.id)) out.push(`${st.name} is not on any line.`);
  for (const exit of [EXIT_STATION, SECOND_EXIT]) if (!ids.has(exit)) out.push(`Exit station "${exit}" (shared/map.ts) is missing.`);
  return out;
}

// ---------- reading a map back in ----------

// Parses the STATIONS and LINES literals from a downloaded map-data.ts, a whole shared/map.ts, or a
// JSON draft. The code is read as data by a small literal parser and never evaluated.
export function parseMapFile(text: string): MapDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = { stations: literalAfter(text, 'STATIONS'), lines: literalAfter(text, 'LINES') };
  }
  return checkDraft(raw);
}

type Tok = { t: 'p' | 's' | 'n' | 'id'; v: string };

// Lazy, so it stops at the end of the literal and never reads the code that follows it.
function lexer(src: string): () => Tok | undefined {
  let i = 0;
  return () => {
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (src.startsWith('//', i)) { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl; continue; }
      if (src.startsWith('/*', i)) { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
      if ('[]{}(),:;='.includes(c)) { i++; return { t: 'p', v: c }; }
      if (c === "'" || c === '"') {
        let v = '';
        for (i++; i < src.length && src[i] !== c; i++) {
          if (src[i] !== '\\') { v += src[i]; continue; }
          const e = src[++i];
          const hex = e === 'u' ? /^[0-9a-fA-F]{4}/.exec(src.slice(i + 1)) : e === 'x' ? /^[0-9a-fA-F]{2}/.exec(src.slice(i + 1)) : null;
          if (hex) { v += String.fromCharCode(parseInt(hex[0], 16)); i += hex[0].length; }
          else v += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' } as Record<string, string>)[e] ?? e;
        }
        if (i >= src.length) throw new Error('Unterminated string.');
        i++;
        return { t: 's', v };
      }
      const num = /^-?\d+(\.\d+)?/.exec(src.slice(i, i + 32));
      if (num) { i += num[0].length; return { t: 'n', v: num[0] }; }
      const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 64));
      if (id) { i += id[0].length; return { t: 'id', v: id[0] }; }
      throw new Error(`Unexpected character "${c}".`);
    }
    return undefined;
  };
}

// The value assigned in `export const NAME[: Type] = <value>`.
function literalAfter(src: string, name: string): unknown {
  const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=`).exec(src);
  if (!m) throw new Error(`No ${name} found. Pick a file made with Download, or shared/map.ts.`);
  const next = lexer(src.slice(m.index + m[0].length));
  let ahead: Tok | undefined | null = null; // null: not read yet
  const peek = () => (ahead === null ? (ahead = next()) : ahead);
  const take = (v?: string) => {
    const tok = peek();
    ahead = null;
    if (!tok || (v !== undefined && tok.v !== v)) throw new Error(`Expected "${v ?? 'a value'}" in ${name}.`);
    return tok;
  };
  const list = (close: string, item: () => void) => {
    while (peek()?.v !== close) {
      item();
      if (peek()?.v === ',') take(',');
      else break;
    }
    take(close);
  };
  const value = (): unknown => {
    const tok = take();
    if (tok.t === 's') return tok.v;
    if (tok.t === 'n') return Number(tok.v);
    if (tok.v === 'true' || tok.v === 'false') return tok.v === 'true';
    if (tok.v === 'undefined') return undefined;
    if (tok.v === '[') { const arr: unknown[] = []; list(']', () => arr.push(value())); return arr; }
    if (tok.v === '{') {
      const obj: Record<string, unknown> = {};
      list('}', () => { const key = take(); take(':'); obj[key.v] = value(); });
      return obj;
    }
    // The station helper in shared/map.ts: s(id, name, x, y, label, extra?)
    if (tok.v === 's' && peek()?.v === '(') {
      take('(');
      const args: unknown[] = [];
      list(')', () => args.push(value()));
      const [id, nm, x, y, label, extra] = args;
      return { id, name: nm, x, y, label, ...(extra as object | undefined) };
    }
    throw new Error(`Unexpected "${tok.v}" in ${name}.`);
  };
  return value();
}

const SIDES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown): v is Pt => !!v && typeof v === 'object' && isNum((v as Pt).x) && isNum((v as Pt).y);

// Keeps only fields the map knows about, so a hand-edited file can't smuggle in anything else.
export function checkDraft(raw: unknown): MapDraft {
  const { stations, lines } = (raw ?? {}) as { stations?: unknown; lines?: unknown };
  if (!Array.isArray(stations) || !Array.isArray(lines)) throw new Error('The file has no stations and lines.');
  const outStations = stations.map((st: Record<string, unknown>, i): Station => {
    if (typeof st?.id !== 'string' || typeof st.name !== 'string' || !isNum(st.x) || !isNum(st.y) || !SIDES.includes(st.label as string))
      throw new Error(`Station ${i + 1} is malformed.`);
    return {
      id: st.id, name: st.name, x: st.x, y: st.y, label: st.label as Station['label'],
      ...(st.interchange === true && { interchange: true }),
      ...(st.exit === true && { exit: true }),
      ...(st.major === true && { major: true }),
      ...(isNum(st.fontSize) && st.fontSize > 0 && { fontSize: st.fontSize }),
      ...(isPt(st.labelOffset) && { labelOffset: { x: st.labelOffset.x, y: st.labelOffset.y } }),
      ...(isNum(st.labelAngle) && st.labelAngle !== 0 && { labelAngle: st.labelAngle }),
    };
  });
  const outLines = lines.map((l: Record<string, unknown>, i): Line => {
    if (typeof l?.id !== 'string' || typeof l.name !== 'string' || typeof l.color !== 'string' || !Array.isArray(l.segments))
      throw new Error(`Line ${i + 1} is malformed.`);
    const segments = l.segments.map((seg: unknown) => {
      if (!Array.isArray(seg)) throw new Error(`${l.name} line has a malformed segment.`);
      return seg.map((p: unknown): SegPoint => {
        if (typeof p === 'string') return p;
        if (isPt(p)) return { x: p.x, y: p.y };
        throw new Error(`${l.name} line has a malformed point.`);
      });
    });
    return { id: l.id, name: l.name, color: l.color, segments };
  });
  return { stations: outStations, lines: outLines };
}
