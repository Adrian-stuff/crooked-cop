import { MAP_HEIGHT, MAP_WIDTH, STATION_BY_ID, type LabelSide, type Station } from '../../shared/map';

export const BOARD_PAD = 50; // room for labels at the map edges

// Where a station's name sits relative to its centre: dx, dy, text-anchor.
export const LABEL_OFFSET: Record<LabelSide, [number, number, 'start' | 'middle' | 'end']> = {
  n: [0, -26, 'middle'],
  s: [0, 38, 'middle'],
  e: [26, 6, 'start'],
  w: [-26, 6, 'end'],
  ne: [20, -22, 'start'],
  nw: [-20, -22, 'end'],
  se: [20, 34, 'start'],
  sw: [-20, 34, 'end'],
};

// Default label sizes in board units; .st-label in index.css matches these.
export const LABEL_SIZE = 15;
export const MAJOR_LABEL_SIZE = 24;

export const labelSize = (st: Station) => st.fontSize ?? (st.major ? MAJOR_LABEL_SIZE : LABEL_SIZE);

// A station's position as a percentage of the rendered board, for HTML overlays.
export function stationPercent(id: string) {
  const st = STATION_BY_ID[id];
  return { left: ((st.x + BOARD_PAD) / (MAP_WIDTH + BOARD_PAD * 2)) * 100, top: (st.y / MAP_HEIGHT) * 100 };
}
