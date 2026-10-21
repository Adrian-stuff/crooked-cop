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

export const STATIONS: Station[] = [
  // Blue
  s('e_valenzuela', 'E. Valenzuela', 112, 160, 'n'),
  s('quirino', 'Quirino', 268, 160, 'n'),
  s('common_terminal', 'Common Terminal', 446, 158, 'n', { interchange: true, major: true }),
  s('tandang_sora_b', 'Tandang Sora', 496, 276, 'e'),
  s('quezon_ave', 'Quezon Ave.', 538, 385, 'e'),
  s('guadalupe', 'Guadalupe', 591, 518, 'e', { interchange: true, major: true }),
  s('kalayaan', 'Kalayaan', 634, 621, 'e'),
  s('camp_aguinaldo', 'Camp Aguinaldo', 679, 741, 'e'),
  s('ortigas_b', 'Ortigas', 726, 856, 'e'),
  s('anonas', 'Anonas', 785, 1013, 'se', { interchange: true, major: true }),
  // Purple loop
  s('pitx', 'PITX', 537, 175, 'n'),
  s('mia_road', 'MIA Road', 646, 198, 'n'),
  s('redemptorist', 'Redemptorist Aseana', 759, 224, 'n'),
  s('libertad', 'Libertad', 924, 266, 's'),
  s('san_fernando', 'San Fernando', 1046, 287, 'ne', { interchange: true, major: true }),
  s('united_nations', 'United Nations', 1187, 269, 's'),
  s('carriedo_p', 'Carriedo', 1331, 260, 'n'),
  s('yamaha_monumento', 'Yamaha Monumento', 1493, 245, 'e', { interchange: true, major: true }),
  s('las_pinas', 'Las Pinas', 1622, 330, 'ne'),
  s('zapote', 'Zapote', 1719, 406, 'ne'),
  s('ortigas_p', 'Ortigas', 1817, 482, 'w'),
  s('niog', 'Niog', 1746, 603, 'e'),
  s('bambang', 'Bambang', 1655, 742, 'e', { interchange: true, major: true }),
  s('antipolo', 'Antipolo Masinag', 1558, 804, 'nw'),
  s('marikina', 'Marikina-Pasig', 1447, 878, 'se'),
  s('bocaue', 'Bocaue', 1326, 955, 'e', { interchange: true, major: true }),
  s('santolan', 'Santolan', 1166, 976, 'n'),
  s('katipunan', 'Katipunan', 938, 1000, 'n'),
  s('betty_go', 'Betty Go Belmonte', 672, 1006, 'n'),
  s('gilmore', 'Gilmore', 546, 996, 'n'),
  s('j_ruiz', 'J. Ruiz', 413, 984, 'n'),
  s('v_mapa', 'V. Mapa', 271, 972, 'n'),
  s('pureza', 'Pureza', 143, 955, 's', { interchange: true, major: true }),
  s('legarda', 'Legarda', 139, 843, 'e'),
  s('senate_deped', 'Senate DepEd', 143, 724, 'w', { interchange: true, major: true }),
  s('recto', 'Recto', 139, 606, 'e'),
  s('lawton', 'Lawton', 132, 494, 'sw', { interchange: true, major: true }),
  s('tutuban', 'Tutuban Terminal', 132, 382, 'e'),
  s('divisoria', 'Divisoria', 249, 297, 'w'),
  s('pier_4', 'Pier 4', 345, 233, 'w'),
  // Red
  s('clark_airport', 'Clark Airport', 911, 67, 'e'),
  s('angeles', 'Angeles', 906, 187, 'e', { interchange: true, major: true }),
  s('apalit', 'Apalit', 1088, 394, 'e'),
  s('calumpit', 'Calumpit', 1135, 508, 'e'),
  s('malolos', 'Malolos', 1188, 618, 'e', { interchange: true, major: true }),
  s('guguinto', 'Guguinto', 1232, 734, 'e'),
  s('balagtas', 'Balagtas', 1281, 847, 'e'),
  // Lime
  s('baclaran', 'Baclaran', 806, 293, 'w'),
  s('gil_puyat', 'Gil Puyat', 737, 367, 'e'),
  s('boni', 'Boni', 667, 441, 'e'),
  s('buendia', 'Buendia', 505, 684, 'e', { interchange: true, major: true }),
  s('ayala', 'Ayala', 474, 836, 's'),
  s('magallanes', 'Magallanes', 333, 836, 's'),
  s('taft_ave', 'Taft Ave.', 254, 724, 'n'),
  s('sucat', 'Sucat', 823, 438, 'ne', { interchange: true, major: true }),
  // Orange
  s('taytay', 'Taytay', 257, 494, 'n'),
  s('east_road', 'East Road', 352, 536, 'ne'),
  s('bgc', 'BGC', 429, 612, 'ne'),
  s('san_juan', 'San Juan', 588, 785, 'sw'),
  s('cainta', 'Cainta', 674, 889, 'sw'),
  // Pink
  s('regalado', 'Regalado', 1001, 437, 'n'),
  s('mindanao', 'Mindanao', 1276, 436, 'e'),
  s('dona_carmen', 'Dona Carmen', 861, 507, 'e'),
  s('manggahan', 'Manggahan', 913, 605, 'e'),
  s('batasan', 'Batasan', 968, 700, 'e'),
  s('don_antonio', 'Don Antonio', 1052, 854, 'e'),
  s('tandang_sora_p', 'Tandang Sora', 1040, 1042, 'e'),
  s('alabang', 'Alabang', 1121, 741, 'e'),
  s('dr_santos', 'Dr. Santos', 1414, 311, 's'),
  s('tala', 'Tala', 1415, 154, 'w'),
  s('sjdm', 'San Jose del Monte', 1415, 31, 'w'),
  // Green
  s('fpj', 'Fernando Poe Jr.', 1598, 33, 'e'),
  s('balintawak', 'Balintawak', 1547, 141, 'e'),
  s('fifth_ave', '5th Ave.', 1533, 364, 'e'),
  // Unlabelled on the slide; named after the real LRT-1 stop between 5th Ave. and Abad Santos.
  s('r_papa', 'R. Papa', 1562, 459, 'e'),
  s('abad_santos', 'Abad Santos', 1591, 552, 'e'),
  s('tayuman', 'Tayuman', 1622, 648, 'e'),
  s('doroteo_jose', 'Doroteo Jose', 1683, 836, 'e'),
  s('carriedo_g', 'Carriedo', 1714, 931, 'e'),
  s('central_terminal', 'Central Terminal', 1745, 1033, 'e', { exit: true }),
];

export const LINES: Line[] = [
  {
    id: 'blue',
    name: 'Blue',
    color: '#13b5ec',
    segments: [[
      'e_valenzuela', 'quirino', 'common_terminal', 'tandang_sora_b', 'quezon_ave', 'guadalupe',
      'kalayaan', 'camp_aguinaldo', 'ortigas_b', 'anonas', { x: 818, y: 1080 },
    ]],
  },
  {
    id: 'purple',
    name: 'Purple',
    color: '#9b4fe0',
    segments: [[
      'common_terminal', 'pitx', 'mia_road', 'redemptorist', 'libertad', 'san_fernando',
      'united_nations', 'carriedo_p', 'yamaha_monumento', 'las_pinas', 'zapote', 'ortigas_p',
      'niog', 'bambang', 'antipolo', 'marikina', 'bocaue', 'santolan', 'katipunan', 'anonas',
      'betty_go', 'gilmore', 'j_ruiz', 'v_mapa', 'pureza', 'legarda', 'senate_deped', 'recto',
      'lawton', 'tutuban', 'divisoria', 'pier_4', 'common_terminal',
    ]],
  },
  {
    id: 'red',
    name: 'Red',
    color: '#ff3b55',
    segments: [[
      { x: 911, y: 0 }, 'clark_airport', 'angeles', 'san_fernando', 'apalit', 'calumpit', 'malolos',
      'guguinto', 'balagtas', 'bocaue', { x: 1382, y: 1080 },
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
      ['gil_puyat', 'sucat'],
    ],
  },
  {
    id: 'orange',
    name: 'Orange',
    color: '#ff6a1a',
    segments: [[
      'lawton', 'taytay', { x: 312, y: 494 }, 'east_road', 'bgc', 'buendia', 'san_juan', 'cainta', 'anonas',
    ]],
  },
  {
    id: 'pink',
    name: 'Pink',
    color: '#ff3eb5',
    segments: [
      [
        { x: 1415, y: 0 }, 'sjdm', 'tala', 'dr_santos', 'mindanao', 'malolos', 'alabang', 'don_antonio',
        'tandang_sora_p', { x: 1036, y: 1080 },
      ],
      ['sucat', 'regalado', 'mindanao'],
      ['sucat', 'dona_carmen', 'manggahan', 'batasan', 'don_antonio'],
    ],
  },
  {
    id: 'green',
    name: 'Green',
    color: '#2bea1f',
    segments: [[
      { x: 1622, y: 0 }, 'fpj', 'balintawak', 'yamaha_monumento', 'fifth_ave', 'r_papa', 'abad_santos',
      'tayuman', 'bambang', 'doroteo_jose', 'carriedo_g', 'central_terminal', { x: 1772, y: 1080 },
    ]],
  },
];

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
