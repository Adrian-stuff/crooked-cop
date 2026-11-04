import type { Station } from '../../shared/map';
import { LABEL_OFFSET, LABEL_SIZE, MAJOR_LABEL_SIZE, labelSize } from '../game/geometry';

interface Props {
  stations: Station[];
  selected?: string | null;
  onLabelDown?: (e: React.PointerEvent, id: string) => void; // map editor: makes labels draggable
}

// Every station name in one layer, drawn after all rails and station tiles so none sit underneath.
export function StationLabels({ stations, selected, onLabelDown }: Props) {
  return (
    <g pointerEvents={onLabelDown ? undefined : 'none'}>
      {stations.map((st) => {
        const [dx, dy, anchor] = LABEL_OFFSET[st.label];
        const size = labelSize(st);
        // The offsets were tuned for the defaults; keep text clear of the tile as it grows.
        const grow = size - (st.major ? MAJOR_LABEL_SIZE : LABEL_SIZE);
        const shiftY = st.label.startsWith('s') ? grow * 0.75 : st.label === 'e' || st.label === 'w' ? grow * 0.35 : 0;
        const x = st.x + dx * (st.major ? 1.15 : 1) + (st.labelOffset?.x ?? 0);
        const y = st.y + dy + shiftY + (st.labelOffset?.y ?? 0);
        return (
          <text key={st.id} x={x} y={y} transform={st.labelAngle ? `rotate(${st.labelAngle} ${x} ${y})` : undefined}
            textAnchor={anchor} className={`st-label${st.major ? ' major' : ''}${selected === st.id ? ' sel' : ''}`}
            style={st.fontSize ? { fontSize: st.fontSize } : undefined}
            onPointerDown={onLabelDown && ((e) => onLabelDown(e, st.id))}>
            {st.name.toUpperCase()}
          </text>
        );
      })}
    </g>
  );
}
