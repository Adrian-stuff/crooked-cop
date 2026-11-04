// GENERATED from shared/map.ts by scripts/sync-function.mjs. Edit the original.
// Transit map transcribed from slide 20 of the GameDev deck (1920x1080 canvas).
// Coordinates are the station centres on that slide.

export type LabelSide = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  label: LabelSide;
  interchange?: boolean;
  exit?: boolean;
  major?: boolean; // large label on the slide
  fontSize?: number; // label size in board units; defaults to 15, or 24 when major
  labelOffset?: { x: number; y: number }; // nudges the label from its `label` side position
  labelAngle?: number; // degrees, clockwise, around the label's anchor
}

export interface Line {
  id: string;
  name: string;
  color: string;
  // Each segment is an ordered run of station ids; {x,y} entries are bend
  // points or off-map stubs and are not stations.
  segments: (string | { x: number; y: number })[][];
}

export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1080;
export const EXIT_STATION = 'central_terminal';
export const SECOND_EXIT = 'clark_airport';

// Bigger tables get a second way out: Clark Airport, at the far end of the Red line.
export function exitsFor(seats: number): string[] {
  return seats >= 7 ? [EXIT_STATION, SECOND_EXIT] : [EXIT_STATION];
}

const s = (
  id: string,
  name: string,
  x: number,
  y: number,
  label: LabelSide,
  extra: Partial<Station> = {},
): Station => ({ id, name, x, y, label, ...extra });

// @map-editor:start (everything down to @map-editor:end is rewritten by the map editor's Save)
export const STATIONS: Station[] = [
  s('e_valenzuela', 'E. Valenzuela', 112, 160, 'n', { fontSize: 18, labelOffset: { x: 3, y: -14 } }),
  s('quirino', 'Quirino', 268, 160, 'n', { fontSize: 18, labelOffset: { x: 2, y: -16 } }),
  s('common_terminal', 'Common Terminal', 446, 158, 'n', { interchange: true, major: true, fontSize: 30, labelOffset: { x: -1, y: -29 } }),
  s('tandang_sora_b', 'Tandang Sora', 496, 276, 'e', { fontSize: 18, labelOffset: { x: 1, y: 1 } }),
  s('quezon_ave', 'Quezon Ave.', 538, 385, 'e', { fontSize: 18 }),
  s('guadalupe', 'Guadalupe', 600, 510, 'e', { interchange: true, major: true, fontSize: 30, labelOffset: { x: -5, y: 9 } }),
  s('kalayaan', 'Kalayaan', 650, 610, 'e', { fontSize: 18, labelOffset: { x: -5, y: 0 } }),
  s('camp_aguinaldo', 'Camp Aguinaldo', 700, 730, 'e', { fontSize: 18, labelOffset: { x: -5, y: -1 } }),
  s('shaw_blvd', 'Shaw blvd', 740, 850, 'e', { fontSize: 18 }),
  s('anonas', 'Anonas', 800, 1010, 'se', { interchange: true, major: true, fontSize: 28, labelOffset: { x: -8, y: 2 } }),
  s('pitx', 'PITX', 537, 175, 'n', { fontSize: 18, labelOffset: { x: -3, y: -5 } }),
  s('mia_road', 'MIA Road', 640, 200, 'n', { fontSize: 18, labelOffset: { x: 0, y: -7 } }),
  s('redemptorist', 'Redemptorist Aseana', 759, 224, 'n', { fontSize: 18, labelOffset: { x: 22, y: -13 } }),
  s('libertad', 'Libertad', 920, 250, 's', { fontSize: 18 }),
  s('san_fernando', 'San Fernando', 1030, 260, 'ne', { interchange: true, major: true, fontSize: 30, labelOffset: { x: -49, y: -14 } }),
  s('united_nations', 'United Nations', 1190, 260, 's', { fontSize: 18, labelOffset: { x: 4, y: -1 } }),
  s('pedro_gil', 'Pedro Gil', 1331, 260, 'n', { fontSize: 18, labelOffset: { x: 1, y: -1 } }),
  s('yamaha_monumento', 'Yamaha Monumento', 1493, 245, 'e', { interchange: true, major: true, fontSize: 30 }),
  s('las_pinas', 'Las Pinas', 1622, 330, 'ne', { fontSize: 18, labelOffset: { x: -5, y: 9 } }),
  s('zapote', 'Zapote', 1719, 406, 'ne', { fontSize: 18, labelOffset: { x: -4, y: 10 } }),
  s('ortigas_p', 'Ortigas', 1817, 482, 'w', { fontSize: 18, labelOffset: { x: 117, y: 1 } }),
  s('niog', 'Niog', 1746, 603, 'e', { fontSize: 18 }),
  s('bambang', 'Bambang', 1650, 730, 'e', { interchange: true, major: true, fontSize: 30, labelOffset: { x: 3, y: 5 } }),
  s('antipolo', 'Antipolo Masinag', 1558, 804, 'nw', { fontSize: 18, labelOffset: { x: 37, y: -8 } }),
  s('marikina', 'Marikina-Pasig', 1460, 870, 'se', { fontSize: 18, labelOffset: { x: -18, y: -3 } }),
  s('bocaue', 'Bocaue', 1320, 940, 'e', { interchange: true, major: true, fontSize: 30, labelOffset: { x: 0, y: 16 } }),
  s('santolan', 'Santolan', 1166, 976, 'n', { fontSize: 18, labelOffset: { x: -1, y: -4 } }),
  s('katipunan', 'Katipunan', 938, 1000, 'n', { fontSize: 18, labelOffset: { x: 2, y: -2 } }),
  s('betty_go', 'Betty Go-Belmonte', 672, 1006, 'n', { fontSize: 18, labelOffset: { x: 3, y: 82 } }),
  s('gilmore', 'Gilmore', 546, 996, 'n', { fontSize: 18, labelOffset: { x: 1, y: -2 } }),
  s('j_ruiz', 'J. Ruiz', 413, 984, 'n', { fontSize: 20, labelOffset: { x: -1, y: -1 } }),
  s('v_mapa', 'V. Mapa', 271, 972, 'n', { fontSize: 18, labelOffset: { x: -2, y: 0 } }),
  s('pureza', 'Pureza', 143, 955, 's', { fontSize: 18, labelOffset: { x: 0, y: -5 } }),
  s('legarda', 'Legarda', 139, 843, 'e', { fontSize: 18, labelOffset: { x: -4, y: 0 } }),
  s('senate_deped', 'Senate DepEd', 143, 724, 'w', { interchange: true, major: true, fontSize: 25, labelOffset: { x: 48, y: -40 } }),
  s('recto', 'Recto', 139, 606, 'e', { fontSize: 18 }),
  s('lawton', 'Lawton', 132, 494, 'sw', { interchange: true, major: true, fontSize: 28, labelOffset: { x: 12, y: -76 } }),
  s('tutuban', 'Tutuban Terminal', 132, 382, 'e', { fontSize: 18, labelOffset: { x: -5, y: 9 } }),
  s('divisoria', 'Divisoria', 249, 297, 'w', { fontSize: 18, labelOffset: { x: 42, y: -37 } }),
  s('pier_4', 'Pier 4', 345, 233, 'w', { fontSize: 18, labelOffset: { x: 23, y: -30 } }),
  s('clark_airport', 'Clark Airport', 911, 67, 'e', { fontSize: 18 }),
  s('angeles', 'Angeles', 906, 187, 'e', { interchange: true, major: true, fontSize: 30, labelOffset: { x: -4, y: -20 } }),
  s('apalit', 'Apalit', 1088, 394, 'e', { fontSize: 18, labelOffset: { x: -5, y: -4 } }),
  s('calumpit', 'Calumpit', 1135, 508, 'e', { fontSize: 18, labelOffset: { x: -10, y: -7 } }),
  s('malolos', 'Malolos', 1180, 620, 'e', { interchange: true, major: true, fontSize: 30 }),
  s('guguinto', 'Guguinto', 1232, 734, 'e', { fontSize: 18, labelOffset: { x: -2, y: 0 } }),
  s('balagtas', 'Balagtas', 1281, 847, 'e', { fontSize: 18, labelOffset: { x: -2, y: -5 } }),
  s('baclaran', 'Baclaran', 806, 293, 'w', { fontSize: 18 }),
  s('gil_puyat', 'Gil Puyat', 737, 367, 'e', { fontSize: 18, labelOffset: { x: -2, y: -5 } }),
  s('boni', 'Boni', 667, 441, 'e', { fontSize: 18 }),
  s('buendia', 'Buendia', 505, 684, 'e', { interchange: true, major: true, fontSize: 25 }),
  s('ayala', 'Ayala', 474, 836, 's', { fontSize: 18 }),
  s('magallanes', 'Magallanes', 333, 836, 's', { fontSize: 18 }),
  s('taft_ave', 'Taft Ave.', 254, 724, 'n', { fontSize: 18 }),
  s('sucat', 'Sucat', 840, 440, 'ne', { interchange: true, major: true, fontSize: 30, labelOffset: { x: -30, y: -10 } }),
  s('taytay', 'Taytay', 257, 494, 'n', { fontSize: 18 }),
  s('east_road', 'East Road', 352, 536, 'ne', { fontSize: 18, labelOffset: { x: 3, y: 19 } }),
  s('bgc', 'BGC', 429, 612, 'ne', { fontSize: 20, labelOffset: { x: 0, y: 8 } }),
  s('san_juan', 'San Juan', 588, 785, 'sw', { fontSize: 18, labelOffset: { x: 27, y: -1 } }),
  s('cainta', 'Cainta', 674, 889, 'sw', { fontSize: 18, labelOffset: { x: 13, y: -9 } }),
  s('regalado', 'Regalado', 1001, 437, 'n', { fontSize: 18, labelOffset: { x: -3, y: -6 } }),
  s('mindanao', 'Mindanao', 1276, 436, 'e', { fontSize: 18, labelOffset: { x: -7, y: 3 } }),
  s('dona_carmen', 'Dona Carmen', 880, 540, 'e', { fontSize: 20 }),
  s('manggahan', 'Manggahan', 920, 630, 'e', { fontSize: 20 }),
  s('batasan', 'Batasan', 980, 730, 'e', { fontSize: 20 }),
  s('don_antonio', 'Don Antonio', 1052, 854, 'e', { fontSize: 18, labelOffset: { x: -3, y: 4 } }),
  s('tandang_sora_p', 'Tandang Sora', 1040, 1042, 'e', { fontSize: 18, labelOffset: { x: -7, y: 3 } }),
  s('alabang', 'Alabang', 1121, 741, 'e', { fontSize: 18, labelOffset: { x: -25, y: 23 } }),
  s('dr_santos', 'Dr. Santos', 1400, 330, 's', { fontSize: 18, labelOffset: { x: -62, y: -36 } }),
  s('tala', 'Tala', 1420, 170, 'w', { fontSize: 18, labelOffset: { x: 6, y: 0 } }),
  s('sjdm', 'San Jose del Monte', 1420, 70, 'w', { fontSize: 18, labelOffset: { x: 7, y: 0 } }),
  s('fpj', 'Fernando Poe Jr.', 1598, 33, 'e', { fontSize: 18 }),
  s('balintawak', 'Balintawak', 1547, 141, 'e', { fontSize: 18, labelOffset: { x: -2, y: 7 } }),
  s('fifth_ave', '5th Ave.', 1533, 364, 'e', { fontSize: 18, labelOffset: { x: -116, y: 2 } }),
  s('r_papa', 'R. Papa', 1562, 459, 'e', { fontSize: 18, labelOffset: { x: -110, y: 2 } }),
  s('abad_santos', 'Abad Santos', 1591, 552, 'e', { fontSize: 18, labelOffset: { x: -160, y: 4 } }),
  s('tayuman', 'Tayuman', 1622, 648, 'e', { fontSize: 18, labelOffset: { x: -134, y: 4 } }),
  s('doroteo_jose', 'Doroteo Jose', 1680, 820, 'e', { fontSize: 18, labelOffset: { x: -3, y: -3 } }),
  s('carriedo_g', 'Carriedo', 1710, 900, 'e', { fontSize: 18, labelOffset: { x: -5, y: 0 } }),
  s('central_terminal', 'Central Terminal', 1740, 990, 'e', { exit: true, fontSize: 18, labelOffset: { x: -7, y: -8 } }),
];

export const LINES: Line[] = [
  {
    id: 'blue',
    name: 'Blue',
    color: '#13b5ec',
    segments: [[
      'e_valenzuela', 'quirino', 'common_terminal', 'tandang_sora_b', 'quezon_ave', 'guadalupe',
      'kalayaan', 'camp_aguinaldo', 'shaw_blvd', 'anonas', { x: 830, y: 1080 },
    ]],
  },
  {
    id: 'purple',
    name: 'Purple',
    color: '#9b4fe0',
    segments: [[
      'common_terminal', 'pitx', 'mia_road', 'redemptorist', 'libertad', 'san_fernando',
      'united_nations', 'pedro_gil', 'yamaha_monumento', 'las_pinas', 'zapote', 'ortigas_p', 'niog',
      'bambang', 'antipolo', 'marikina', 'bocaue', 'santolan', 'katipunan', 'anonas', 'betty_go',
      'gilmore', 'j_ruiz', 'v_mapa', 'pureza', 'legarda', 'senate_deped', 'recto', 'lawton',
      'tutuban', 'divisoria', 'pier_4', 'common_terminal',
    ]],
  },
  {
    id: 'red',
    name: 'Red',
    color: '#ff3b55',
    segments: [[
      { x: 910, y: -20 }, 'clark_airport', 'angeles', 'san_fernando', 'apalit', 'calumpit',
      'malolos', 'guguinto', 'balagtas', 'bocaue', { x: 1382, y: 1080 },
    ]],
  },
  {
    id: 'lime',
    name: 'Lime',
    color: '#c6ff1a',
    segments: [
      [
        'angeles', 'baclaran', 'gil_puyat', 'boni', 'guadalupe', { x: 522, y: 598 }, 'buendia',
        'ayala', 'magallanes', 'taft_ave', 'senate_deped',
      ],
      [
        'gil_puyat', 'sucat',
      ],
    ],
  },
  {
    id: 'orange',
    name: 'Orange',
    color: '#ff6a1a',
    segments: [[
      'lawton', 'taytay', { x: 312, y: 494 }, 'east_road', 'bgc', 'buendia', 'san_juan', 'cainta',
      'anonas',
    ]],
  },
  {
    id: 'pink',
    name: 'Pink',
    color: '#ff3eb5',
    segments: [
      [
        { x: 1415, y: 0 }, 'sjdm', 'tala', 'dr_santos', 'mindanao', 'malolos', 'alabang',
        'don_antonio', 'tandang_sora_p', { x: 1036, y: 1080 },
      ],
      [
        'sucat', 'regalado', 'mindanao',
      ],
      [
        'sucat', 'dona_carmen', 'manggahan', 'batasan', 'don_antonio',
      ],
    ],
  },
  {
    id: 'green',
    name: 'Green',
    color: '#2bea1f',
    segments: [[
      { x: 1620, y: 0 }, 'fpj', 'balintawak', 'yamaha_monumento', 'fifth_ave', 'r_papa',
      'abad_santos', 'tayuman', 'bambang', 'doroteo_jose', 'carriedo_g', 'central_terminal',
      { x: 1772, y: 1080 },
    ]],
  },
];
// @map-editor:end

// ---------- Graph helpers ----------

export interface Edge {
  a: string;
  b: string;
  line: string;
}

export const STATION_BY_ID: Record<string, Station> = Object.fromEntries(STATIONS.map((st) => [st.id, st]));

function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const line of LINES) {
    for (const seg of line.segments) {
      const ids = seg.filter((p): p is string => typeof p === 'string');
      for (let i = 0; i + 1 < ids.length; i++) edges.push({ a: ids[i], b: ids[i + 1], line: line.id });
    }
  }
  return edges;
}

export const EDGES: Edge[] = buildEdges();

// station -> list of { to, line }
export const ADJ: Record<string, { to: string; line: string }[]> = (() => {
  const adj: Record<string, { to: string; line: string }[]> = {};
  for (const st of STATIONS) adj[st.id] = [];
  for (const e of EDGES) {
    adj[e.a].push({ to: e.b, line: e.line });
    adj[e.b].push({ to: e.a, line: e.line });
  }
  return adj;
})();

export function linesAt(stationId: string): string[] {
  return [...new Set(ADJ[stationId].map((n) => n.line))];
}

export function isAdjacent(a: string, b: string, line?: string): boolean {
  return ADJ[a]?.some((n) => n.to === b && (line === undefined || n.line === line)) ?? false;
}

export function neighbours(stationId: string): string[] {
  return [...new Set(ADJ[stationId].map((n) => n.to))];
}

// How far an Express card rides.
export const EXPRESS_STOPS = 5;

// One step of an Express ride. Returns the lines the ride can be on after stepping prev -> st, or
// null if the step isn't allowed. The ride keeps to its line but may change lines at an interchange.
export function expressStep(prev: string, st: string, lines: Set<string> | null): Set<string> | null {
  const shared = new Set(ADJ[prev].filter((n) => n.to === st).map((n) => n.line));
  if (!shared.size) return null;
  if (!lines) return shared;
  const stay = new Set([...lines].filter((l) => shared.has(l)));
  if (stay.size) return stay;
  return STATION_BY_ID[prev].interchange ? shared : null;
}

// The stations a Search covers. At an interchange: every station one stop away, on any line.
// Elsewhere: up to two stops in both directions along the station's own line.
export function searchArea(station: string): string[] {
  if (STATION_BY_ID[station]?.interchange) return [station, ...neighbours(station)];
  const lines = new Set(linesAt(station));
  const seen = new Set([station]);
  let frontier = [station];
  for (let hop = 0; hop < 2; hop++) {
    const next: string[] = [];
    for (const s of frontier) {
      for (const n of ADJ[s]) {
        if (lines.has(n.line) && !seen.has(n.to)) {
          seen.add(n.to);
          next.push(n.to);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

// Every station on a line, in map order.
export function lineStations(lineId: string): string[] {
  const line = LINES.find((l) => l.id === lineId);
  if (!line) return [];
  return [...new Set(line.segments.flat().filter((p): p is string => typeof p === 'string'))];
}

// BFS hop distances from a station.
export function distancesFrom(start: string): Record<string, number> {
  const dist: Record<string, number> = { [start]: 0 };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of ADJ[cur]) {
      if (dist[n.to] === undefined) {
        dist[n.to] = dist[cur] + 1;
        queue.push(n.to);
      }
    }
  }
  return dist;
}

const DIST_CACHE: Record<string, Record<string, number>> = {};
export function distance(a: string, b: string): number {
  DIST_CACHE[a] ??= distancesFrom(a);
  return DIST_CACHE[a][b] ?? Infinity;
}

// A station name with its line(s) when the name is not unique on the map.
const NAME_COUNT: Record<string, number> = {};
for (const st of STATIONS) NAME_COUNT[st.name] = (NAME_COUNT[st.name] ?? 0) + 1;
export function stationLabel(id: string): string {
  const st = STATION_BY_ID[id];
  if (!st) return id;
  if (NAME_COUNT[st.name] === 1) return st.name;
  const lineNames = linesAt(id).map((l) => LINES.find((x) => x.id === l)!.name);
  return `${st.name} (${lineNames.join('/')})`;
}

export function lineName(id: string): string {
  return LINES.find((l) => l.id === id)?.name ?? id;
}
