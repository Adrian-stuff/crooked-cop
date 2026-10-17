import { MAP_HEIGHT, MAP_WIDTH, STATION_BY_ID } from '../../shared/map';

export const BOARD_PAD = 50; // room for labels at the map edges

// A station's position as a percentage of the rendered board, for HTML overlays.
export function stationPercent(id: string) {
  const st = STATION_BY_ID[id];
  return { left: ((st.x + BOARD_PAD) / (MAP_WIDTH + BOARD_PAD * 2)) * 100, top: (st.y / MAP_HEIGHT) * 100 };
}
